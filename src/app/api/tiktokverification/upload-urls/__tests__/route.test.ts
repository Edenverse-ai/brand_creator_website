import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../logic", () => ({ generateUploadUrls: vi.fn() }));

const isRateLimited = vi.fn();
vi.mock("@/lib/rate-limiter", () => ({
  tiktokVerificationLimiter: { isRateLimited: (...args: unknown[]) => isRateLimited(...args) },
}));

import { generateUploadUrls } from "../logic";
import { POST } from "../route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/tiktokverification/upload-urls", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/tiktokverification/upload-urls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isRateLimited.mockReturnValue(false);
  });

  it("returns 429 when the IP is rate limited, without generating upload URLs", async () => {
    isRateLimited.mockReturnValue(true);

    const res = await POST(
      jsonRequest({
        id_number: "TEST123",
        files: [{ key: "id_front_file", extension: "png" }],
      }) as never
    );

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "Too many submissions. Please try again later." });
    expect(generateUploadUrls).not.toHaveBeenCalled();
  });

  it("returns 400 when id_number is missing", async () => {
    const res = await POST(
      jsonRequest({ files: [{ key: "id_front_file", extension: "png" }] }) as never
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing id_number or files array" });
    expect(generateUploadUrls).not.toHaveBeenCalled();
  });

  it("returns 400 with the disallowed-characters message when id_number contains a slash", async () => {
    const res = await POST(
      jsonRequest({
        id_number: "TEST/123",
        files: [{ key: "id_front_file", extension: "png" }],
      }) as never
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "id_number contains characters that are not allowed (/, \\, %, or ..)",
    });
    expect(generateUploadUrls).not.toHaveBeenCalled();
  });

  it("returns 400 with the disallowed-characters message when id_number contains a percent sign", async () => {
    const res = await POST(
      jsonRequest({
        id_number: "TEST%123",
        files: [{ key: "id_front_file", extension: "png" }],
      }) as never
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "id_number contains characters that are not allowed (/, \\, %, or ..)",
    });
    expect(generateUploadUrls).not.toHaveBeenCalled();
  });

  it("accepts a real-world id_number with hyphen, space, and period", async () => {
    (generateUploadUrls as any).mockResolvedValue({});

    const res = await POST(
      jsonRequest({
        id_number: "AB-123 456.7",
        files: [{ key: "id_front_file", extension: "png" }],
      }) as never
    );

    expect(generateUploadUrls).toHaveBeenCalledWith("AB-123 456.7", [
      { key: "id_front_file", extension: "png" },
    ]);
    expect(res.status).toBe(200);
  });

  it("returns 400 when files is missing", async () => {
    const res = await POST(jsonRequest({ id_number: "TEST123" }) as never);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing id_number or files array" });
    expect(generateUploadUrls).not.toHaveBeenCalled();
  });

  it("returns 400 when files is not an array", async () => {
    const res = await POST(jsonRequest({ id_number: "TEST123", files: "nope" }) as never);

    expect(res.status).toBe(400);
    expect(generateUploadUrls).not.toHaveBeenCalled();
  });

  it("returns 400 when a file entry is missing a required field", async () => {
    const res = await POST(
      jsonRequest({ id_number: "TEST123", files: [{ key: "id_front_file" }] }) as never
    );

    expect(res.status).toBe(400);
    expect(generateUploadUrls).not.toHaveBeenCalled();
  });

  it("rejects an extension outside the allowlist instead of minting a signed URL for it", async () => {
    // Attack this closes: {"id_number":"VICTIM-ID","files":[{"key":"id_front_file","extension":"html"}]}
    // previously minted a signed URL to write arbitrary content into the
    // identity-document bucket, since extension was only `z.string().min(1)`.
    const res = await POST(
      jsonRequest({
        id_number: "TEST123",
        files: [{ key: "id_front_file", extension: "html" }],
      }) as never
    );

    expect(res.status).toBe(400);
    expect(generateUploadUrls).not.toHaveBeenCalled();
  });

  it("rejects an extension containing extra path segments (isOwnedStoragePath only constrains the first segment)", async () => {
    // extension: "png/a/b" would otherwise build the path
    // "TEST123/id_front.png/a/b", whose first segment ("TEST123") still matches
    // id_number and so passes isOwnedStoragePath.
    const res = await POST(
      jsonRequest({
        id_number: "TEST123",
        files: [{ key: "id_front_file", extension: "png/a/b" }],
      }) as never
    );

    expect(res.status).toBe(400);
    expect(generateUploadUrls).not.toHaveBeenCalled();
  });

  it("accepts every extension in the documented allowlist (images, pdf, video)", async () => {
    (generateUploadUrls as any).mockResolvedValue({});

    for (const extension of ["jpg", "jpeg", "png", "gif", "pdf", "mp4", "mov"]) {
      const res = await POST(
        jsonRequest({
          id_number: "TEST123",
          files: [{ key: "id_front_file", extension }],
        }) as never
      );
      expect(res.status).toBe(200);
    }
  });

  it("returns 400 with a clear message when files has more than 5 entries, without generating upload URLs", async () => {
    const files = Array.from({ length: 6 }, (_, i) => ({
      key: `key_${i}`,
      extension: "png",
    }));

    const res = await POST(jsonRequest({ id_number: "TEST123", files }) as never);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "files must contain at most 5 entries" });
    expect(generateUploadUrls).not.toHaveBeenCalled();
  });

  it("accepts exactly 5 files (the true ceiling: only 5 keys are recognized)", async () => {
    (generateUploadUrls as any).mockResolvedValue({});
    const files = Array.from({ length: 5 }, (_, i) => ({
      key: `key_${i}`,
      extension: "png",
    }));

    const res = await POST(jsonRequest({ id_number: "TEST123", files }) as never);

    expect(res.status).toBe(200);
    expect(generateUploadUrls).toHaveBeenCalledWith("TEST123", files);
  });

  it("returns 400 when the body is not valid JSON", async () => {
    const req = new Request("http://localhost/api/tiktokverification/upload-urls", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });

    const res = await POST(req as never);

    expect(res.status).toBe(400);
  });

  it("returns the Python-shaped success envelope on the happy path", async () => {
    const uploadUrls = {
      id_front_file: { upload_url: "https://x/1", file_path: "TEST123/id_front.png", token: "t1" },
      signed_auth_file: {
        upload_url: "https://x/2",
        file_path: "TEST123/authorization.pdf",
        token: "t2",
      },
    };
    (generateUploadUrls as any).mockResolvedValue(uploadUrls);

    const res = await POST(
      jsonRequest({
        id_number: "TEST123",
        files: [
          { key: "id_front_file", extension: "png" },
          { key: "signed_auth_file", extension: "pdf" },
        ],
      }) as never
    );

    expect(generateUploadUrls).toHaveBeenCalledWith("TEST123", [
      { key: "id_front_file", extension: "png" },
      { key: "signed_auth_file", extension: "pdf" },
    ]);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, upload_urls: uploadUrls });
  });

  it("returns 500 when generateUploadUrls throws", async () => {
    (generateUploadUrls as any).mockRejectedValue(new Error("boom"));

    const res = await POST(
      jsonRequest({
        id_number: "TEST123",
        files: [{ key: "id_front_file", extension: "png" }],
      }) as never
    );

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to generate upload URLs" });
  });
});
