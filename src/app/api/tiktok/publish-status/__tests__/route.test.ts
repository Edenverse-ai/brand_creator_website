import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth";
import { POST } from "../route";

const TIKTOK_STATUS_URL = "https://open.tiktokapis.com/v2/post/publish/status/fetch/";
const SECRET_ACCESS_TOKEN = "SECRET_ACCESS_TOKEN_xyz789";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/tiktok/publish-status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/tiktok/publish-status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 401 when there is no session", async () => {
    (getServerSession as any).mockResolvedValue(null);

    const res = await POST(jsonRequest({ access_token: "t", publish_ids: ["p1"] }) as never);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 on an invalid body", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });

    const res = await POST(jsonRequest({ publish_ids: ["p1"] }) as never); // missing access_token

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid input" });
  });

  it("returns 400 when publish_ids is empty", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });

    const res = await POST(jsonRequest({ access_token: "t", publish_ids: [] }) as never);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "No publish_ids provided" });
  });

  it("partial failure: returns ok+payload for one id and a fixed error for the other, without aborting either", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });

    const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
      expect(String(url)).toBe(TIKTOK_STATUS_URL);
      const body = JSON.parse((init!.body as string) ?? "{}");
      if (body.publish_id === "pub-ok") {
        return new Response(JSON.stringify({ data: { status: "PUBLISH_COMPLETE" } }), {
          status: 200,
        });
      }
      return new Response(
        JSON.stringify({ error: { message: "not found: pub-bad detail leak" } }),
        {
          status: 404,
        }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(
      jsonRequest({
        access_token: SECRET_ACCESS_TOKEN,
        publish_ids: ["pub-ok", "pub-bad"],
      }) as never
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual(
      expect.arrayContaining([
        { publish_id: "pub-ok", status: "ok", payload: { data: { status: "PUBLISH_COMPLETE" } } },
        { publish_id: "pub-bad", status: "error", error: "TikTok publish status fetch failed" },
      ])
    );
    expect(body.results).toHaveLength(2);
    // The upstream error text must never be echoed to the caller.
    expect(JSON.stringify(body)).not.toContain("detail leak");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never logs the access token", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ error: "denied" }), { status: 403 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await POST(jsonRequest({ access_token: SECRET_ACCESS_TOKEN, publish_ids: ["pub-1"] }) as never);

    const allLoggedText = JSON.stringify([...errorSpy.mock.calls, ...logSpy.mock.calls]);
    expect(allLoggedText).not.toContain(SECRET_ACCESS_TOKEN);

    errorSpy.mockRestore();
    logSpy.mockRestore();
  });
});
