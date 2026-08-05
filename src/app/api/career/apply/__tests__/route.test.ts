import { describe, it, expect, vi, beforeEach } from "vitest";

const sendEmailMock = vi.fn();
vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));

const isRateLimited = vi.fn();
vi.mock("@/lib/rate-limiter", () => ({
  careerApplicationLimiter: { isRateLimited: (...args: unknown[]) => isRateLimited(...args) },
}));

import { POST, GET } from "../route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/career/apply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

const VALID_BODY = {
  position: "Senior Video Editor",
  positionId: "pos-123",
  applicantEmail: "applicant@example.com",
  submittedAt: "2024-01-15T10:30:00.000Z",
  identityInformation: {
    passportName: "Jane Q Public",
    nationality: "Canadian",
    idType: "passport",
    idNumber: "AB1234567",
    gender: "female",
    dateOfBirth: "1990-05-20",
  },
  influencerInformation: {
    accountIntroduction: "I make travel vlogs.",
    profileUrl: "https://instagram.com/janeqpublic",
    followerCount: "125000",
    otherPlatforms: "TikTok, YouTube",
  },
};

// Distinguishable PII values from VALID_BODY — used to assert nothing containing them
// ever reaches a console call or a response body.
const PII_NEEDLES = [
  "Jane Q Public",
  "AB1234567",
  "1990-05-20",
  "Canadian",
  "applicant@example.com",
];

const SUCCESS_MESSAGE = "Thank you for your application! We've sent a confirmation to your email.";
const CAREER_FROM = '"Cricher.ai Careers" <info@borderxmedia.com>';

describe("POST /api/career/apply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isRateLimited.mockReturnValue(false);
    sendEmailMock.mockResolvedValue({ ok: true });
  });

  it("returns 429 when the IP is rate limited, without sending email", async () => {
    isRateLimited.mockReturnValue(true);

    const res = await POST(jsonRequest(VALID_BODY) as never);

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      success: false,
      message: "Too many submissions. Please try again later.",
    });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("uses a career-specific rate-limit key, not shared with another route's namespace", async () => {
    await POST(jsonRequest(VALID_BODY).clone() as never);

    expect(isRateLimited).toHaveBeenCalledWith(expect.stringMatching(/^career:/));
  });

  it("returns 400 when the body fails schema validation (missing required top-level field)", async () => {
    const { position: _drop, ...withoutPosition } = VALID_BODY;

    const res = await POST(jsonRequest(withoutPosition) as never);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, message: "Invalid input" });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("returns 400 when a nested identityInformation field is missing", async () => {
    const body = deepClone(VALID_BODY);
    // @ts-expect-error deliberately deleting a required nested field for the test
    delete body.identityInformation.passportName;

    const res = await POST(jsonRequest(body) as never);

    expect(res.status).toBe(400);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("returns 400 when a nested influencerInformation field is missing", async () => {
    const body = deepClone(VALID_BODY);
    // @ts-expect-error deliberately deleting a required nested field for the test
    delete body.influencerInformation.profileUrl;

    const res = await POST(jsonRequest(body) as never);

    expect(res.status).toBe(400);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it.each(["position", "positionId", "submittedAt"] as const)(
    "returns 400 when top-level field %s is an empty string",
    async (field) => {
      const res = await POST(jsonRequest({ ...VALID_BODY, [field]: "" }) as never);

      expect(res.status).toBe(400);
      expect(sendEmailMock).not.toHaveBeenCalled();
    }
  );

  it.each(["passportName", "nationality", "idType", "idNumber", "gender", "dateOfBirth"] as const)(
    "returns 400 when identityInformation.%s is an empty string",
    async (field) => {
      const body = deepClone(VALID_BODY);
      body.identityInformation[field] = "";

      const res = await POST(jsonRequest(body) as never);

      expect(res.status).toBe(400);
      expect(sendEmailMock).not.toHaveBeenCalled();
    }
  );

  it.each(["accountIntroduction", "profileUrl", "followerCount"] as const)(
    "returns 400 when influencerInformation.%s is an empty string",
    async (field) => {
      const body = deepClone(VALID_BODY);
      body.influencerInformation[field] = "";

      const res = await POST(jsonRequest(body) as never);

      expect(res.status).toBe(400);
      expect(sendEmailMock).not.toHaveBeenCalled();
    }
  );

  it("returns 400 when applicantEmail is not a valid email address", async () => {
    const res = await POST(jsonRequest({ ...VALID_BODY, applicantEmail: "not-an-email" }) as never);

    expect(res.status).toBe(400);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the body is not valid JSON", async () => {
    const req = new Request("http://localhost/api/career/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });

    const res = await POST(req as never);

    expect(res.status).toBe(400);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("accepts a request with otherPlatforms omitted (optional field)", async () => {
    const body = deepClone(VALID_BODY);
    // @ts-expect-error deliberately omitting the optional field for the test
    delete body.influencerInformation.otherPlatforms;

    const res = await POST(jsonRequest(body) as never);

    expect(res.status).toBe(200);
  });

  it("silently ignores unknown extra fields, matching Pydantic's default (no extra='forbid')", async () => {
    const res = await POST(jsonRequest({ ...VALID_BODY, unexpectedField: "anything" }) as never);

    expect(res.status).toBe(200);
  });

  it("returns the frozen success response shape with a synthetic application_id, no stored_in_database key", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-01T12:00:00.000Z"));
    try {
      const res = await POST(jsonRequest(VALID_BODY) as never);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        success: true,
        message: SUCCESS_MESSAGE,
        application_id: `app-${VALID_BODY.positionId}-${Math.floor(
          new Date("2024-06-01T12:00:00.000Z").getTime() / 1000
        )}`,
      });
      expect(body).not.toHaveProperty("stored_in_database");
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends exactly one email, to the applicant's address, with the exact subject and from", async () => {
    await POST(jsonRequest(VALID_BODY) as never);

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: VALID_BODY.applicantEmail,
        subject: `Application Received - ${VALID_BODY.position} at Cricher.ai`,
        from: CAREER_FROM,
      })
    );
  });

  // Regression guard: Python's send_email call never passes from_email, so it always
  // falls back to formataddr(("Cricher.ai Careers", settings.SMTP_USER)). Ground-truth
  // checked in both .env and Netlify production: SMTP_USER is info@borderxmedia.com.
  // Pinning this exact string (including formataddr's quoting, triggered by the "."
  // in "Cricher.ai") so a future edit can't silently drop or alter it.
  it("sends from the same address SMTP authenticates as, matching Python's formataddr fallback exactly", async () => {
    await POST(jsonRequest(VALID_BODY) as never);

    const call = sendEmailMock.mock.calls[0][0];
    expect(call.from).toBe('"Cricher.ai Careers" <info@borderxmedia.com>');
  });

  it("labels the email's 'Application ID' with positionId, not the response's synthetic application_id (matches Python's actual field use)", async () => {
    await POST(jsonRequest(VALID_BODY) as never);

    const call = sendEmailMock.mock.calls[0][0];
    expect(call.html).toContain(`<strong>Application ID:</strong> ${VALID_BODY.positionId}`);
  });

  it("escapes HTML special characters from user-supplied fields before embedding them in the email body", async () => {
    const maliciousBody = deepClone(VALID_BODY);
    maliciousBody.identityInformation.passportName = '<script>alert("x")</script>';

    await POST(jsonRequest(maliciousBody) as never);

    const call = sendEmailMock.mock.calls[0][0];
    expect(call.html).not.toContain("<script>");
    expect(call.html).toContain("&lt;script&gt;");
  });

  it("still returns success when the confirmation email fails to send (non-fatal)", async () => {
    sendEmailMock.mockResolvedValueOnce({ ok: false, error: "smtp down" });

    const res = await POST(jsonRequest(VALID_BODY) as never);

    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it("never calls the Python backend — no fetch, regardless of CAMPAIGNS_API_URL", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const originalEnv = process.env.CAMPAIGNS_API_URL;
    process.env.CAMPAIGNS_API_URL = "http://should-not-be-used:5000";

    try {
      await POST(jsonRequest(VALID_BODY) as never);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      process.env.CAMPAIGNS_API_URL = originalEnv;
      fetchSpy.mockRestore();
    }
  });

  it("returns 500 with a fixed message on a truly unexpected error, without leaking the applicant record", async () => {
    isRateLimited.mockImplementation(() => {
      throw new Error("rate limiter exploded with sensitive info");
    });

    const res = await POST(jsonRequest(VALID_BODY) as never);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      success: false,
      message: "Failed to submit career application. Please try again later.",
    });
    expect(JSON.stringify(body)).not.toMatch(/sensitive info/);
  });

  it("returns 500 without leaking the applicant record when sendEmail throws unexpectedly", async () => {
    sendEmailMock.mockRejectedValueOnce(
      new Error(`SMTP rejected payload for ${VALID_BODY.identityInformation.passportName}`)
    );

    const res = await POST(jsonRequest(VALID_BODY) as never);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toMatch(/Jane Q Public/);
  });

  it("never logs applicant PII on a successful submission", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await POST(jsonRequest(VALID_BODY) as never);

    const allLoggedText = [...errorSpy.mock.calls, ...logSpy.mock.calls, ...warnSpy.mock.calls]
      .map((call) => JSON.stringify(call))
      .join(" ");

    for (const needle of PII_NEEDLES) {
      expect(allLoggedText).not.toContain(needle);
    }

    errorSpy.mockRestore();
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("never logs applicant PII when the email send fails", async () => {
    sendEmailMock.mockResolvedValueOnce({ ok: false, error: "smtp down" });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await POST(jsonRequest(VALID_BODY) as never);

    const allLoggedText = [...errorSpy.mock.calls, ...logSpy.mock.calls]
      .map((call) => JSON.stringify(call))
      .join(" ");

    for (const needle of PII_NEEDLES) {
      expect(allLoggedText).not.toContain(needle);
    }

    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("never includes applicant PII in any response body across success, validation-failure, or error paths", async () => {
    const responses = await Promise.all([
      POST(jsonRequest(VALID_BODY) as never),
      POST(jsonRequest({ ...VALID_BODY, position: "" }) as never),
    ]);

    for (const res of responses) {
      const text = JSON.stringify(await res.json());
      for (const needle of PII_NEEDLES) {
        expect(text).not.toContain(needle);
      }
    }
  });
});

describe("GET /api/career/apply", () => {
  it("returns an info stub that no longer claims database storage", async () => {
    const res = await GET();
    const body = await res.json();

    expect(body.methods).toEqual(["POST"]);
    expect(body.features).not.toContain("Database storage");
  });
});
