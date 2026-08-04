import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const influencerVerificationsCreate = vi.fn();
const influencerVerificationsFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    influencer_verifications: {
      create: (...args: unknown[]) => influencerVerificationsCreate(...args),
      findFirst: (...args: unknown[]) => influencerVerificationsFindFirst(...args),
    },
  },
}));

const isRateLimited = vi.fn();
vi.mock("@/lib/rate-limiter", () => ({
  tiktokVerificationLimiter: { isRateLimited: (...args: unknown[]) => isRateLimited(...args) },
}));

import { POST } from "../route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/tiktokverification", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  passport_name: "Jane Q Public",
  real_name: "Jane Public",
  id_type: "passport",
  gender: "female",
  nationality: "US",
  stage_name: "JaneTok",
  id_number: "TEST123",
  date_of_birth: "05/12/98",
  account_intro: "I make videos",
  overseas_platform_url: "https://example.com/jane",
  follower_count: 12345,
  other_platforms: "Instagram",
  agent_email: "agent@bytedance.com",
  file_paths: {
    id_front_file: "TEST123/id_front.png",
    handheld_id_file: "TEST123/id_handheld.png",
    backend_ss_file: "TEST123/backend_ss.png",
    signed_auth_file: "TEST123/authorization.pdf",
    identity_video_file: "TEST123/identity_video.mp4",
  },
};

const EXPECTED_RECORD = {
  passport_name: "Jane Q Public",
  real_name: "Jane Public",
  id_type: "passport",
  gender: "female",
  nationality: "US",
  stage_name: "JaneTok",
  id_number: "TEST123",
  date_of_birth: "1998-05-12",
  account_intro: "I make videos",
  overseas_platform_url: "https://example.com/jane",
  follower_count: 12345,
  other_platforms: "Instagram",
  agent_email: "agent@bytedance.com",
  id_front_path: "TEST123/id_front.png",
  handheld_id_path: "TEST123/id_handheld.png",
  backend_ss_path: "TEST123/backend_ss.png",
  authorization_path: "TEST123/authorization.pdf",
  identity_video_path: "TEST123/identity_video.mp4",
};

describe("POST /api/tiktokverification (JSON path-based submission)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isRateLimited.mockReturnValue(false);
    influencerVerificationsFindFirst.mockResolvedValue(null);
    influencerVerificationsCreate.mockResolvedValue({ id: "row-1" });
  });

  it("returns 429 when the IP is rate limited, without touching the database", async () => {
    isRateLimited.mockReturnValue(true);

    const res = await POST(jsonRequest(VALID_BODY) as never);

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ detail: "Too many submissions. Please try again later." });
    expect(influencerVerificationsFindFirst).not.toHaveBeenCalled();
    expect(influencerVerificationsCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when the body fails schema validation", async () => {
    const { passport_name: _drop, ...withoutPassportName } = VALID_BODY;

    const res = await POST(jsonRequest(withoutPassportName) as never);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ detail: "Invalid input" });
    expect(influencerVerificationsCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when the body is not valid JSON", async () => {
    const req = new Request("http://localhost/api/tiktokverification", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });

    const res = await POST(req as never);

    expect(res.status).toBe(400);
    expect(influencerVerificationsCreate).not.toHaveBeenCalled();
  });

  it("accepts empty-string text fields (Pydantic str accepts them too)", async () => {
    const res = await POST(jsonRequest({ ...VALID_BODY, account_intro: "" }) as never);

    expect(res.status).toBe(200);
    expect(influencerVerificationsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ account_intro: "" }) })
    );
  });

  it("returns 400 listing every missing required file path", async () => {
    const res = await POST(
      jsonRequest({
        ...VALID_BODY,
        file_paths: { identity_video_file: "TEST123/identity_video.mp4" },
      }) as never
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      detail:
        "Missing required file path(s): id_front_path, handheld_id_path, backend_ss_path, authorization_path",
    });
    expect(influencerVerificationsCreate).not.toHaveBeenCalled();
  });

  it("treats an empty-string required file path the same as a missing one", async () => {
    const res = await POST(
      jsonRequest({
        ...VALID_BODY,
        file_paths: { ...VALID_BODY.file_paths, id_front_file: "" },
      }) as never
    );

    expect(res.status).toBe(400);
    expect(influencerVerificationsCreate).not.toHaveBeenCalled();
  });

  it("rejects a submission whose file_paths point at a different id_number's folder (cross-id_number attack)", async () => {
    // Attacker submits under their own id_number but points file_paths at another
    // applicant's already-uploaded documents, trying to attach a stranger's ID/video
    // to their own application.
    const res = await POST(
      jsonRequest({
        ...VALID_BODY,
        id_number: "ATTACKER-0001",
        file_paths: {
          id_front_file: "VICTIM-ID/id_front.png",
          handheld_id_file: "VICTIM-ID/id_handheld.png",
          backend_ss_file: "VICTIM-ID/backend_ss.png",
          signed_auth_file: "VICTIM-ID/authorization.pdf",
        },
      }) as never
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toBe(
      "File path(s) do not belong to id_number ATTACKER-0001: id_front_path, handheld_id_path, backend_ss_path, authorization_path"
    );
    expect(influencerVerificationsFindFirst).not.toHaveBeenCalled();
    expect(influencerVerificationsCreate).not.toHaveBeenCalled();
  });

  it("rejects a submission when only the optional identity_video path is foreign", async () => {
    const res = await POST(
      jsonRequest({
        ...VALID_BODY,
        file_paths: {
          ...VALID_BODY.file_paths,
          identity_video_file: "VICTIM-ID/identity_video.mp4",
        },
      }) as never
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toBe(
      "File path(s) do not belong to id_number TEST123: identity_video_path"
    );
    expect(influencerVerificationsCreate).not.toHaveBeenCalled();
  });

  it("accepts file paths whose first segment matches the submission's own id_number (legitimate same-id_number flow)", async () => {
    // Mirrors the real client: uploadHelper.ts mints under {id_number}/{file}, and
    // page.tsx submits with that same id_number, so this must keep working.
    const res = await POST(jsonRequest(VALID_BODY) as never);

    expect(res.status).toBe(200);
    expect(influencerVerificationsCreate).toHaveBeenCalledTimes(1);
  });

  it("defaults identity_video_path to null when the optional file is omitted", async () => {
    const { identity_video_file: _drop, ...requiredOnly } = VALID_BODY.file_paths;

    const res = await POST(jsonRequest({ ...VALID_BODY, file_paths: requiredOnly }) as never);

    expect(res.status).toBe(200);
    expect(influencerVerificationsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ identity_video_path: null }) })
    );
  });

  it("defaults stage_name and other_platforms to null when omitted", async () => {
    const { stage_name: _s, other_platforms: _o, ...rest } = VALID_BODY;

    const res = await POST(jsonRequest(rest) as never);

    expect(res.status).toBe(200);
    expect(influencerVerificationsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stage_name: null, other_platforms: null }),
      })
    );
  });

  it("accepts an explicit JSON null for stage_name and other_platforms (Pydantic `str | None` parity)", async () => {
    const res = await POST(
      jsonRequest({ ...VALID_BODY, stage_name: null, other_platforms: null }) as never
    );

    expect(res.status).toBe(200);
    expect(influencerVerificationsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stage_name: null, other_platforms: null }),
      })
    );
  });

  it("checks id_number existence and returns 400 without inserting when it already exists", async () => {
    influencerVerificationsFindFirst.mockResolvedValue({ id: "existing-row" });

    const res = await POST(jsonRequest(VALID_BODY) as never);

    expect(influencerVerificationsFindFirst).toHaveBeenCalledWith({
      where: { id_number: "TEST123" },
      select: { id: true },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ detail: "ID number TEST123 already exists" });
    expect(influencerVerificationsCreate).not.toHaveBeenCalled();
  });

  it("treats a failed existence check as not-existing and still attempts the insert (mirrors check_id_exists' swallow behavior)", async () => {
    influencerVerificationsFindFirst.mockRejectedValue(new Error("db read failed"));

    const res = await POST(jsonRequest(VALID_BODY) as never);

    expect(res.status).toBe(200);
    expect(influencerVerificationsCreate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["05/12/98", "1998-05-12"],
    ["01/01/05", "2005-01-01"],
    ["12/31/68", "2068-12-31"],
    ["01/01/69", "1969-01-01"],
  ])("parses date_of_birth %s as %s (strptime %%y century pivot)", async (input, expected) => {
    const res = await POST(jsonRequest({ ...VALID_BODY, date_of_birth: input }) as never);

    expect(res.status).toBe(200);
    expect(influencerVerificationsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ date_of_birth: expected }) })
    );
  });

  it("parses a 1-digit month/day (strptime %m/%d accept unpadded single digits too)", async () => {
    const res = await POST(jsonRequest({ ...VALID_BODY, date_of_birth: "5/1/98" }) as never);

    expect(res.status).toBe(200);
    expect(influencerVerificationsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ date_of_birth: "1998-05-01" }) })
    );
  });

  it("returns 500 when date_of_birth doesn't match mm/dd/yy", async () => {
    const res = await POST(jsonRequest({ ...VALID_BODY, date_of_birth: "1998-05-12" }) as never);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.detail).toMatch(/^Failed to save verification data:/);
    expect(influencerVerificationsCreate).not.toHaveBeenCalled();
  });

  it("returns 500 when date_of_birth is a calendar-invalid date", async () => {
    const res = await POST(jsonRequest({ ...VALID_BODY, date_of_birth: "02/30/24" }) as never);

    expect(res.status).toBe(500);
    expect(influencerVerificationsCreate).not.toHaveBeenCalled();
  });

  it("creates the influencer_verifications row with the field-for-field mapped data and returns the frozen response shape", async () => {
    const res = await POST(jsonRequest(VALID_BODY) as never);

    expect(influencerVerificationsCreate).toHaveBeenCalledWith({ data: EXPECTED_RECORD });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      message: "Verification submitted successfully",
      data: EXPECTED_RECORD,
    });
  });

  it("returns 500 when the database insert fails", async () => {
    influencerVerificationsCreate.mockRejectedValue(new Error("db down"));

    const res = await POST(jsonRequest(VALID_BODY) as never);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.detail).toBe("Failed to save verification data: db down");
  });
});

describe("POST /api/tiktokverification (legacy multipart path)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    isRateLimited.mockReturnValue(false);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("still proxies multipart requests to FastAPI unchanged", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ success: true, message: "ok" }),
    });
    global.fetch = fetchMock as never;

    const formData = new FormData();
    formData.append("passport_name", "Jane");
    const req = new Request("http://localhost/api/tiktokverification", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req as never);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/tiktokverification/verification"),
      expect.objectContaining({ method: "POST" })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, message: "ok" });
    expect(influencerVerificationsCreate).not.toHaveBeenCalled();
    expect(isRateLimited).not.toHaveBeenCalled();
  });
});
