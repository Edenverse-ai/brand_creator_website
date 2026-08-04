import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../logic", () => ({ generateUploadUrls: vi.fn() }));

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
  });

  it("returns 400 when id_number is missing", async () => {
    const res = await POST(
      jsonRequest({ files: [{ key: "id_front_file", extension: "png" }] }) as never
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing id_number or files array" });
    expect(generateUploadUrls).not.toHaveBeenCalled();
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
