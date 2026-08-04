import { describe, it, expect, vi, beforeEach } from "vitest";
import { runChunkedUpload, ChunkFetchError, ChunkPutError } from "../relay";

const UPLOAD_URL = "https://open-upload.tiktokapis.com/upload/abc123";
const SOURCE_URL =
  "https://loesykbqlhynbjmqxfxc.supabase.co/storage/v1/object/sign/aivideogenerated/x?token=SECRETTOKEN";

function okSourceResponse(bytes: number) {
  return new Response(new ArrayBuffer(bytes), { status: 200 });
}

/** A source that correctly honors the Range header (the well-behaved case). */
function partialSourceResponse(bytes: number) {
  return new Response(new ArrayBuffer(bytes), { status: 206 });
}

describe("runChunkedUpload", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("uploads a single-chunk job as one GET + one PUT with a matching Content-Range", async () => {
    const videoSize = 50 * 1024 * 1024;
    const fetchMock = vi.fn((url, init) => {
      if (init?.method === "PUT") return Promise.resolve(new Response(null, { status: 200 }));
      return Promise.resolve(okSourceResponse(videoSize));
    });
    vi.stubGlobal("fetch", fetchMock);

    await runChunkedUpload({
      uploadUrl: UPLOAD_URL,
      sourceUrl: SOURCE_URL,
      videoSize,
      chunkSize: videoSize,
      totalChunkCount: 1,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [sourceCallUrl, sourceCallInit] = fetchMock.mock.calls[0];
    expect(sourceCallUrl).toBe(SOURCE_URL);
    expect(sourceCallInit.headers.Range).toBe(`bytes=0-${videoSize - 1}`);

    const [putUrl, putInit] = fetchMock.mock.calls[1];
    expect(putUrl).toBe(UPLOAD_URL);
    expect(putInit.method).toBe("PUT");
    expect(putInit.headers["Content-Range"]).toBe(`bytes 0-${videoSize - 1}/${videoSize}`);
    expect(putInit.headers["Content-Length"]).toBe(String(videoSize));
    expect(putInit.headers["Content-Type"]).toBe("video/mp4");
  });

  it("uploads a multi-chunk job sequentially, one GET+PUT pair per chunk in order", async () => {
    const videoSize = 72 * 1024 * 1024; // 7 chunks: 6x10MB + 1x12MB (see chunking.test.ts)
    const chunkSize = 10 * 1024 * 1024;
    const totalChunkCount = 7;
    const calls: string[] = [];

    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        calls.push(`PUT ${(init.headers as Record<string, string>)["Content-Range"]}`);
        return Promise.resolve(new Response(null, { status: 200 }));
      }
      const range = (init?.headers as Record<string, string>)?.Range ?? "";
      calls.push(`GET ${range}`);
      const [start, end] = range.replace("bytes=", "").split("-").map(Number);
      // A well-behaved, Range-respecting source: 206 with exactly the
      // requested slice.
      return Promise.resolve(partialSourceResponse(end - start + 1));
    });
    vi.stubGlobal("fetch", fetchMock);

    await runChunkedUpload({
      uploadUrl: UPLOAD_URL,
      sourceUrl: SOURCE_URL,
      videoSize,
      chunkSize,
      totalChunkCount,
    });

    expect(fetchMock).toHaveBeenCalledTimes(14); // 7 GET + 7 PUT
    // Strictly alternating GET/PUT, in ascending chunk order -- chunks are not
    // fetched or sent concurrently.
    expect(calls).toEqual([
      "GET bytes=0-10485759",
      "PUT bytes 0-10485759/75497472",
      "GET bytes=10485760-20971519",
      "PUT bytes 10485760-20971519/75497472",
      "GET bytes=20971520-31457279",
      "PUT bytes 20971520-31457279/75497472",
      "GET bytes=31457280-41943039",
      "PUT bytes 31457280-41943039/75497472",
      "GET bytes=41943040-52428799",
      "PUT bytes 41943040-52428799/75497472",
      "GET bytes=52428800-62914559",
      "PUT bytes 52428800-62914559/75497472",
      "GET bytes=62914560-75497471",
      "PUT bytes 62914560-75497471/75497472",
    ]);
  });

  it("throws ChunkFetchError and stops (no PUT, no later chunks) when a source GET fails", async () => {
    const videoSize = 72 * 1024 * 1024;
    const fetchMock = vi.fn().mockResolvedValue(new Response("nope", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      runChunkedUpload({
        uploadUrl: UPLOAD_URL,
        sourceUrl: SOURCE_URL,
        videoSize,
        chunkSize: 10 * 1024 * 1024,
        totalChunkCount: 7,
      })
    ).rejects.toThrow(ChunkFetchError);

    // Only the first chunk's GET was attempted -- no PUT, no second chunk.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("accepts a 200 (whole-object) source response for a single-chunk job", async () => {
    const videoSize = 50 * 1024 * 1024;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => Promise.resolve(okSourceResponse(videoSize)))
      .mockImplementationOnce(() => Promise.resolve(new Response(null, { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      runChunkedUpload({
        uploadUrl: UPLOAD_URL,
        sourceUrl: SOURCE_URL,
        videoSize,
        chunkSize: videoSize,
        totalChunkCount: 1,
      })
    ).resolves.toBeUndefined();
  });

  it("accepts a 206 Partial Content source response", async () => {
    const videoSize = 50 * 1024 * 1024;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => Promise.resolve(partialSourceResponse(videoSize)))
      .mockImplementationOnce(() => Promise.resolve(new Response(null, { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      runChunkedUpload({
        uploadUrl: UPLOAD_URL,
        sourceUrl: SOURCE_URL,
        videoSize,
        chunkSize: videoSize,
        totalChunkCount: 1,
      })
    ).resolves.toBeUndefined();
  });

  it("throws ChunkFetchError and stops when a multi-chunk source ignores Range and returns 200 with the whole object (CRITICAL 2 regression case)", async () => {
    const videoSize = 72 * 1024 * 1024;
    // A Range-ignoring source: always 200 with the FULL object, regardless of
    // which chunk was requested.
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") return Promise.resolve(new Response(null, { status: 200 }));
      return Promise.resolve(okSourceResponse(videoSize));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      runChunkedUpload({
        uploadUrl: UPLOAD_URL,
        sourceUrl: SOURCE_URL,
        videoSize,
        chunkSize: 10 * 1024 * 1024,
        totalChunkCount: 7,
      })
    ).rejects.toThrow(ChunkFetchError);

    // Fails loudly on the very first chunk instead of relaying the wrong
    // (whole-object) bytes as if they were a 10MB slice.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws ChunkFetchError when the fetched byte count doesn't match the requested range, even with an acceptable status (CRITICAL 2 regression case)", async () => {
    const videoSize = 50 * 1024 * 1024;
    // Correct status (206), but a short body -- e.g. a truncated/proxy-mangled
    // response.
    const fetchMock = vi.fn().mockResolvedValue(partialSourceResponse(videoSize - 1024));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      runChunkedUpload({
        uploadUrl: UPLOAD_URL,
        sourceUrl: SOURCE_URL,
        videoSize,
        chunkSize: videoSize,
        totalChunkCount: 1,
      })
    ).rejects.toThrow(ChunkFetchError);

    // Never attempted the PUT with a Content-Length that wouldn't match the
    // actual body.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws ChunkPutError and stops when TikTok rejects a chunk", async () => {
    const videoSize = 72 * 1024 * 1024;
    let putCount = 0;
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        putCount += 1;
        return Promise.resolve(new Response("server error", { status: 500 }));
      }
      return Promise.resolve(partialSourceResponse(10 * 1024 * 1024));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      runChunkedUpload({
        uploadUrl: UPLOAD_URL,
        sourceUrl: SOURCE_URL,
        videoSize,
        chunkSize: 10 * 1024 * 1024,
        totalChunkCount: 7,
      })
    ).rejects.toThrow(ChunkPutError);

    // Failed on the first chunk's PUT -- no second chunk's GET was attempted.
    expect(putCount).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2); // 1 GET + 1 PUT
  });
});
