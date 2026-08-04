import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/tiktok/signed-source", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tiktok/signed-source")>(
    "@/lib/tiktok/signed-source"
  );
  return { ...actual, resolveSignedVideoUrl: vi.fn() };
});

import { getServerSession } from "next-auth";
import { resolveSignedVideoUrl } from "@/lib/tiktok/signed-source";
import { POST } from "../route";

const TIKTOK_INIT_URL = "https://open.tiktokapis.com/v2/post/publish/video/init/";
const SECRET_ACCESS_TOKEN = "SECRET_ACCESS_TOKEN_xyz789";

// The relay's URL allowlist (relay-url-guard.ts, post-review CRITICAL 1 fix)
// only accepts sourceUrl on this exact configured host -- every FILE_UPLOAD
// happy-path test below resolves through it, matching what
// resolveSignedVideoUrl ACTUALLY returns in production.
const SUPABASE_HOST = "loesykbqlhynbjmqxfxc.supabase.co";
const SIGNED_URL_SECRET = `https://${SUPABASE_HOST}/storage/v1/object/sign/aivideogenerated/vid.mp4?token=SUPER_SECRET_SIGNED_TOKEN`;

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/tiktok/publish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Routes fetch() calls to canned responses by URL/method, matching what the
 * route's dependency chain (fetchVideoSize -> initFileUpload -> dispatchBackgroundUpload)
 * actually issues. */
function buildFetchMock(opts: {
  sourceUrl: string;
  sourceSize?: number;
  sourceUnavailable?: boolean;
  initStatus?: number;
  initBody?: unknown;
  dispatchStatus?: number;
}) {
  const {
    sourceUrl,
    sourceSize = 10 * 1024 * 1024,
    sourceUnavailable = false,
    initStatus = 200,
    initBody = {
      data: { upload_url: "https://open-upload.tiktokapis.com/upload/abc", publish_id: "pub-1" },
    },
    dispatchStatus = 202,
  } = opts;

  return vi.fn(async (url: unknown, init?: RequestInit) => {
    const href = String(url);

    if (href === sourceUrl && init?.method === "HEAD") {
      if (sourceUnavailable) return new Response(null, { status: 404 });
      return new Response(null, { status: 200, headers: { "content-length": String(sourceSize) } });
    }

    if (href === TIKTOK_INIT_URL) {
      return new Response(JSON.stringify(initBody), { status: initStatus });
    }

    if (href.includes("tiktok-publish-background")) {
      return new Response("ok", { status: dispatchStatus });
    }

    throw new Error(`Unhandled fetch in test: ${init?.method ?? "GET"} ${href}`);
  });
}

describe("POST /api/tiktok/publish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    process.env.NEXTAUTH_SECRET = "test-nextauth-secret";
    process.env.SUPABASE_URL = `https://${SUPABASE_HOST}`;
    delete process.env.TIKTOK_PULL_FROM_URL_ENABLED;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TIKTOK_PULL_FROM_URL_ENABLED;
  });

  it("returns 401 when there is no session", async () => {
    (getServerSession as any).mockResolvedValue(null);

    const res = await POST(jsonRequest({ access_token: "t", videos: [] }) as never);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 on an invalid body (empty videos array)", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });

    const res = await POST(jsonRequest({ access_token: "t", videos: [] }) as never);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid input" });
  });

  it("returns 400 when the body is not valid JSON", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });
    const req = new Request("http://localhost/api/tiktok/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });

    const res = await POST(req as never);

    expect(res.status).toBe(400);
  });

  it("init success: returns 202 with an ok/publish_id envelope and dispatches the background relay", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });
    (resolveSignedVideoUrl as any).mockResolvedValue(SIGNED_URL_SECRET);
    const fetchMock = buildFetchMock({ sourceUrl: SIGNED_URL_SECRET });
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(
      jsonRequest({
        access_token: SECRET_ACCESS_TOKEN,
        videos: [
          { id: "vid-1", video_path: "user-1/task-1/output.mp4", privacy_level: "SELF_ONLY" },
        ],
      }) as never
    );

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({
      results: [{ id: "vid-1", status: "ok", publish_id: "pub-1" }],
    });

    // init call carried the resolved video size / a single chunk (10MB video, well
    // under the 64MB single-chunk cap).
    const initCall = fetchMock.mock.calls.find(([u]) => String(u) === TIKTOK_INIT_URL);
    expect(initCall).toBeTruthy();
    const initBody = JSON.parse((initCall![1] as RequestInit).body as string);
    expect(initBody.source_info).toEqual({
      source: "FILE_UPLOAD",
      video_size: 10 * 1024 * 1024,
      chunk_size: 10 * 1024 * 1024,
      total_chunk_count: 1,
    });

    // Background relay was dispatched.
    const dispatchCall = fetchMock.mock.calls.find(([u]) =>
      String(u).includes("tiktok-publish-background")
    );
    expect(dispatchCall).toBeTruthy();
  });

  it("init failure: isolates the failure to that video's result (fixed message, no raw TikTok payload echoed)", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });
    (resolveSignedVideoUrl as any).mockResolvedValue(SIGNED_URL_SECRET);
    const fetchMock = buildFetchMock({
      sourceUrl: SIGNED_URL_SECRET,
      initStatus: 400,
      initBody: { error: { code: "invalid_param", message: "bad privacy_level for this account" } },
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(
      jsonRequest({
        access_token: SECRET_ACCESS_TOKEN,
        videos: [
          { id: "vid-1", video_path: "user-1/task-1/output.mp4", privacy_level: "SELF_ONLY" },
        ],
      }) as never
    );

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.results).toEqual([{ id: "vid-1", status: "error", error: "TikTok init failed" }]);
    // The raw upstream error text must never be echoed to the caller.
    expect(JSON.stringify(body)).not.toContain("bad privacy_level for this account");
  });

  it("per-video error isolation: one bad video does not abort a good one in the same request", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });
    (resolveSignedVideoUrl as any).mockResolvedValue(SIGNED_URL_SECRET);
    const fetchMock = buildFetchMock({ sourceUrl: SIGNED_URL_SECRET });
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(
      jsonRequest({
        access_token: SECRET_ACCESS_TOKEN,
        videos: [
          { id: "good-1", video_path: "user-1/task-1/good.mp4", privacy_level: "SELF_ONLY" },
          { id: "bad-1", privacy_level: "SELF_ONLY" }, // no video_url or video_path
        ],
      }) as never
    );

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.results).toEqual(
      expect.arrayContaining([
        { id: "good-1", status: "ok", publish_id: "pub-1" },
        { id: "bad-1", status: "error", error: "Missing video_url or video_path" },
      ])
    );
    expect(body.results).toHaveLength(2);
    // The good video was still fully processed (init was called for it).
    expect(fetchMock.mock.calls.some(([u]) => String(u) === TIKTOK_INIT_URL)).toBe(true);
  });

  it("returns a per-video error when privacy_level is missing, without calling TikTok", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(
      jsonRequest({
        access_token: SECRET_ACCESS_TOKEN,
        videos: [{ id: "vid-1", video_path: "user-1/task-1/x.mp4" }],
      }) as never
    );

    const body = await res.json();
    expect(body.results).toEqual([
      { id: "vid-1", status: "error", error: "Missing privacy_level for TikTok upload" },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves video_path via a signed Supabase URL when video_url is absent", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });
    (resolveSignedVideoUrl as any).mockResolvedValue(SIGNED_URL_SECRET);
    const fetchMock = buildFetchMock({ sourceUrl: SIGNED_URL_SECRET });
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(
      jsonRequest({
        access_token: SECRET_ACCESS_TOKEN,
        videos: [
          { id: "vid-1", video_path: "user-1/task-1/output.mp4", privacy_level: "SELF_ONLY" },
        ],
      }) as never
    );

    const body = await res.json();
    expect(resolveSignedVideoUrl).toHaveBeenCalledWith("user-1/task-1/output.mp4");
    expect(body.results).toEqual([{ id: "vid-1", status: "ok", publish_id: "pub-1" }]);
  });

  it("isolates a background-dispatch failure (missing NEXTAUTH_SECRET) to that video's result", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });
    (resolveSignedVideoUrl as any).mockResolvedValue(SIGNED_URL_SECRET);
    delete process.env.NEXTAUTH_SECRET;
    const fetchMock = buildFetchMock({ sourceUrl: SIGNED_URL_SECRET });
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(
      jsonRequest({
        access_token: SECRET_ACCESS_TOKEN,
        videos: [
          { id: "vid-1", video_path: "user-1/task-1/output.mp4", privacy_level: "SELF_ONLY" },
        ],
      }) as never
    );

    const body = await res.json();
    expect(body.results).toEqual([
      { id: "vid-1", status: "error", error: "Failed to start video upload" },
    ]);
    // TikTok init still happened -- only the dispatch step failed.
    expect(fetchMock.mock.calls.some(([u]) => String(u) === TIKTOK_INIT_URL)).toBe(true);
    // The background function itself was never reached.
    expect(
      fetchMock.mock.calls.some(([u]) => String(u).includes("tiktok-publish-background"))
    ).toBe(false);
  });

  it("never logs the access token or a signed source URL, on success or failure", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });
    (resolveSignedVideoUrl as any).mockResolvedValue(SIGNED_URL_SECRET);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
      const href = String(url);
      if (href === SIGNED_URL_SECRET && init?.method === "HEAD") {
        return new Response(null, { status: 200, headers: { "content-length": "1048576" } });
      }
      if (href === TIKTOK_INIT_URL) {
        // Fails, to force a console.error call in the code path that resolved a
        // signed URL -- the most sensitive combination.
        return new Response(JSON.stringify({ error: "denied" }), { status: 403 });
      }
      throw new Error(`Unhandled fetch in test: ${href}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await POST(
      jsonRequest({
        access_token: SECRET_ACCESS_TOKEN,
        videos: [
          { id: "vid-1", video_path: "user-1/task-1/output.mp4", privacy_level: "SELF_ONLY" },
        ],
      }) as never
    );

    const allLoggedText = JSON.stringify([...errorSpy.mock.calls, ...logSpy.mock.calls]);
    expect(allLoggedText).not.toContain(SECRET_ACCESS_TOKEN);
    expect(allLoggedText).not.toContain(SIGNED_URL_SECRET);
    expect(allLoggedText).not.toContain("SUPER_SECRET_SIGNED_TOKEN");

    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  describe("post-review: SSRF guards on caller-supplied video_url", () => {
    it("rejects an internal-target video_url before any network call is made (IMPORTANT 4)", async () => {
      (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const res = await POST(
        jsonRequest({
          access_token: SECRET_ACCESS_TOKEN,
          videos: [
            {
              id: "vid-1",
              video_url: "https://169.254.169.254/latest/meta-data/",
              privacy_level: "SELF_ONLY",
            },
          ],
        }) as never
      );

      const body = await res.json();
      expect(body.results).toEqual([
        { id: "vid-1", status: "error", error: "video_url is not allowed" },
      ]);
      // No reachability oracle: the route never even attempted to reach it.
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects a legitimate-looking but non-Supabase video_url for the FILE_UPLOAD strategy specifically, before any network call", async () => {
      (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const res = await POST(
        jsonRequest({
          access_token: SECRET_ACCESS_TOKEN,
          videos: [
            {
              id: "vid-1",
              video_url: "https://some-cdn.example.com/video.mp4",
              privacy_level: "SELF_ONLY",
            },
          ],
        }) as never
      );

      const body = await res.json();
      expect(body.results).toEqual([
        {
          id: "vid-1",
          status: "error",
          error:
            "video source must be hosted on this app's own storage; external URLs are not supported for direct upload",
        },
      ]);
      // Rejected before fetchVideoSize/init -- no TikTok init call, no size probe.
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("post-review: accepts the live client's camelCase field names (IMPORTANT 3)", () => {
    it("processes a camelCase body (videoPath/privacyLevel) identically to snake_case, not as a bogus 'missing privacy_level' error", async () => {
      (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });
      (resolveSignedVideoUrl as any).mockResolvedValue(SIGNED_URL_SECRET);
      const fetchMock = buildFetchMock({ sourceUrl: SIGNED_URL_SECRET });
      vi.stubGlobal("fetch", fetchMock);

      const res = await POST(
        jsonRequest({
          access_token: SECRET_ACCESS_TOKEN,
          videos: [
            {
              id: "vid-1",
              videoPath: "user-1/task-1/output.mp4",
              privacyLevel: "SELF_ONLY",
              brandContent: true,
              brandOrganic: false,
              disableComment: false,
              disableDuet: true,
              disableStitch: true,
            },
          ],
        }) as never
      );

      const body = await res.json();
      expect(body.results).toEqual([{ id: "vid-1", status: "ok", publish_id: "pub-1" }]);
      expect(resolveSignedVideoUrl).toHaveBeenCalledWith("user-1/task-1/output.mp4");

      const initCall = fetchMock.mock.calls.find(([u]) => String(u) === TIKTOK_INIT_URL);
      const initBody = JSON.parse((initCall![1] as RequestInit).body as string);
      expect(initBody.post_info).toMatchObject({
        privacy_level: "SELF_ONLY",
        brand_content_toggle: true,
        brand_organic_toggle: false,
        disable_comment: false,
        disable_duet: true,
        disable_stitch: true,
      });
    });
  });

  describe("TIKTOK_PULL_FROM_URL_ENABLED=true (inert by default -- Part B)", () => {
    it("uses source=PULL_FROM_URL and skips the relay entirely for a caller-supplied video_url", async () => {
      (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });
      process.env.TIKTOK_PULL_FROM_URL_ENABLED = "true";
      const videoUrl = "https://cricher.ai/media/object/sign/aivideogenerated/x?token=t";
      const fetchMock = vi.fn(async (url: unknown, _init?: RequestInit) => {
        if (String(url) === TIKTOK_INIT_URL) {
          return new Response(JSON.stringify({ data: { publish_id: "pub-pull-1" } }), {
            status: 200,
          });
        }
        throw new Error(`Unhandled fetch in test: ${String(url)}`);
      });
      vi.stubGlobal("fetch", fetchMock);

      const res = await POST(
        jsonRequest({
          access_token: SECRET_ACCESS_TOKEN,
          videos: [{ id: "vid-1", video_url: videoUrl, privacy_level: "SELF_ONLY" }],
        }) as never
      );

      expect(res.status).toBe(202);
      expect(await res.json()).toEqual({
        results: [{ id: "vid-1", status: "ok", publish_id: "pub-pull-1" }],
      });

      // Exactly one fetch call: the init itself. No size probe (HEAD), no
      // background-function dispatch -- TikTok fetches the video, we don't.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, initInit] = fetchMock.mock.calls[0];
      const initBody = JSON.parse((initInit as RequestInit).body as string);
      expect(initBody.source_info).toEqual({ source: "PULL_FROM_URL", video_url: videoUrl });
    });

    it("rewrites a video_path-derived signed URL onto the verified /media prefix before calling TikTok", async () => {
      (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });
      process.env.TIKTOK_PULL_FROM_URL_ENABLED = "true";
      const signedUrl = `https://${SUPABASE_HOST}/storage/v1/object/sign/aivideogenerated/x.mp4?token=abc`;
      (resolveSignedVideoUrl as any).mockResolvedValue(signedUrl);

      const fetchMock = vi.fn(async (url: unknown, _init?: RequestInit) => {
        if (String(url) === TIKTOK_INIT_URL) {
          return new Response(JSON.stringify({ data: { publish_id: "pub-pull-2" } }), {
            status: 200,
          });
        }
        throw new Error(`Unhandled fetch in test: ${String(url)}`);
      });
      vi.stubGlobal("fetch", fetchMock);

      const res = await POST(
        jsonRequest({
          access_token: SECRET_ACCESS_TOKEN,
          videos: [
            { id: "vid-1", video_path: "user-1/task-1/output.mp4", privacy_level: "SELF_ONLY" },
          ],
        }) as never
      );

      const body = await res.json();
      expect(body.results).toEqual([{ id: "vid-1", status: "ok", publish_id: "pub-pull-2" }]);

      const [, initInit] = fetchMock.mock.calls[0];
      const initBody = JSON.parse((initInit as RequestInit).body as string);
      expect(initBody.source_info).toEqual({
        source: "PULL_FROM_URL",
        video_url: "https://cricher.ai/media/object/sign/aivideogenerated/x.mp4?token=abc",
      });
    });
  });
});
