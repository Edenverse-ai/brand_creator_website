import { describe, it, expect, vi, beforeEach } from "vitest";

const contactCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { contact: { create: (...args: unknown[]) => contactCreate(...args) } },
}));

const sendEmailMock = vi.fn();
vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));

const isRateLimited = vi.fn();
vi.mock("@/lib/rate-limiter", () => ({
  contactFormLimiter: { isRateLimited: (...args: unknown[]) => isRateLimited(...args) },
}));

import * as contactRoute from "../route";
import { POST } from "../route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/contact", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  name: "Jane Q Public",
  email: "jane@example.com",
  subject: "Question about pricing",
  message: "Hello,\nI have a question.",
};

const SUCCESS_MESSAGE = "Thank you for your message! We'll get back to you soon.";

describe("POST /api/contact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isRateLimited.mockReturnValue(false);
    contactCreate.mockResolvedValue({ id: 42 });
    sendEmailMock.mockResolvedValue({ ok: true });
  });

  it("returns 429 when the IP is rate limited, without touching the database or sending email", async () => {
    isRateLimited.mockReturnValue(true);

    const res = await POST(jsonRequest(VALID_BODY) as never);

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      success: false,
      message: "Too many submissions. Please try again later.",
    });
    expect(contactCreate).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the body fails schema validation", async () => {
    const { name: _drop, ...withoutName } = VALID_BODY;

    const res = await POST(jsonRequest(withoutName) as never);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, message: "Invalid input" });
    expect(contactCreate).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it.each(["name", "subject", "message"] as const)(
    "returns 400 when %s is an empty string",
    async (field) => {
      const res = await POST(jsonRequest({ ...VALID_BODY, [field]: "" }) as never);

      expect(res.status).toBe(400);
      expect(contactCreate).not.toHaveBeenCalled();
    }
  );

  it("returns 400 when email is not a valid email address", async () => {
    const res = await POST(jsonRequest({ ...VALID_BODY, email: "not-an-email" }) as never);

    expect(res.status).toBe(400);
    expect(contactCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when the body is not valid JSON", async () => {
    const req = new Request("http://localhost/api/contact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });

    const res = await POST(req as never);

    expect(res.status).toBe(400);
    expect(contactCreate).not.toHaveBeenCalled();
  });

  it("creates the Contact row with the field-for-field mapped data, using a real Date for created_at", async () => {
    const timestamp = "2024-01-15T10:30:00.000Z";

    const res = await POST(jsonRequest({ ...VALID_BODY, timestamp }) as never);

    expect(contactCreate).toHaveBeenCalledWith({
      data: {
        name: VALID_BODY.name,
        email: VALID_BODY.email,
        subject: VALID_BODY.subject,
        message: VALID_BODY.message,
        created_at: new Date(timestamp),
      },
      select: { id: true },
    });
    expect(contactCreate.mock.calls[0][0].data.created_at).toBeInstanceOf(Date);
    expect(res.status).toBe(200);
  });

  it("defaults created_at to now (a real Date) when timestamp is omitted", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-01T12:00:00.000Z"));
    try {
      await POST(jsonRequest(VALID_BODY) as never);

      expect(contactCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ created_at: new Date("2024-06-01T12:00:00.000Z") }),
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to now when timestamp is an unparseable string, rather than 400ing (lenient posture)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-01T12:00:00.000Z"));
    try {
      const res = await POST(jsonRequest({ ...VALID_BODY, timestamp: "not-a-date" }) as never);

      expect(res.status).toBe(200);
      expect(contactCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ created_at: new Date("2024-06-01T12:00:00.000Z") }),
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns the frozen success response shape with contact_id as a String, not a number", async () => {
    contactCreate.mockResolvedValue({ id: 42 });

    const res = await POST(jsonRequest(VALID_BODY) as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      message: SUCCESS_MESSAGE,
      contact_id: "42",
      stored_in_database: true,
    });
    expect(typeof body.contact_id).toBe("string");
  });

  it("sends the admin notification email to the fixed admin address with the dynamic subject", async () => {
    await POST(jsonRequest(VALID_BODY) as never);

    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "sam@borderxai.com",
        subject: `New Contact Form: ${VALID_BODY.subject}`,
      })
    );
  });

  it("sends the user confirmation email to the submitter with the literal subject and support from-address", async () => {
    await POST(jsonRequest(VALID_BODY) as never);

    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: VALID_BODY.email,
        subject: "Thank you for contacting Brand Creator Platform",
        from: '"Brand Creator Platform" <info@borderxmedia.com>',
      })
    );
  });

  // Regression guard for a post-review fix: this route's admin send used to omit
  // `from` entirely, silently falling back to sendEmail's own default
  // (rucheng@borderxai.com) instead of the address SMTP actually authenticates as.
  // Ground-truth checked in both .env and Netlify production: SMTP_USER is
  // info@borderxmedia.com, which is also what Python's admin send resolves to
  // (contact_service.py:35, from_email=None -> settings.SMTP_USER). Pinning this
  // exact string so a future edit can't silently drop the override again.
  it("sends the admin notification email from the same address SMTP authenticates as (matches Python's settings.SMTP_USER fallback)", async () => {
    await POST(jsonRequest(VALID_BODY) as never);

    const adminCall = sendEmailMock.mock.calls[0][0];
    expect(adminCall.from).toBe('"Brand Creator Platform" <info@borderxmedia.com>');
  });

  it("escapes HTML special characters from user-supplied fields before embedding them in the email body", async () => {
    const maliciousBody = {
      ...VALID_BODY,
      name: '<script>alert("x")</script>',
    };

    await POST(jsonRequest(maliciousBody) as never);

    const [adminCall, userCall] = sendEmailMock.mock.calls;
    expect(adminCall[0].html).not.toContain("<script>");
    expect(adminCall[0].html).toContain("&lt;script&gt;");
    expect(userCall[0].html).not.toContain("<script>");
  });

  it("still returns success when the admin notification email fails to send (non-fatal)", async () => {
    sendEmailMock.mockResolvedValueOnce({ ok: false, error: "smtp down" }); // admin
    sendEmailMock.mockResolvedValueOnce({ ok: true }); // user

    const res = await POST(jsonRequest(VALID_BODY) as never);

    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it("still returns success when the user confirmation email fails to send (non-fatal)", async () => {
    sendEmailMock.mockResolvedValueOnce({ ok: true }); // admin
    sendEmailMock.mockResolvedValueOnce({ ok: false, error: "smtp down" }); // user

    const res = await POST(jsonRequest(VALID_BODY) as never);

    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it("returns success:true with stored_in_database:false and a synthetic contact_id when the database write fails (lenient posture)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-01T12:00:00.000Z"));
    try {
      contactCreate.mockRejectedValue(new Error("db down"));

      const res = await POST(jsonRequest(VALID_BODY) as never);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        success: true,
        message: SUCCESS_MESSAGE,
        contact_id: `contact-${Math.floor(new Date("2024-06-01T12:00:00.000Z").getTime() / 1000)}`,
        stored_in_database: false,
      });
      // Emails are still attempted even though the DB write failed (§0.6: lenient).
      expect(sendEmailMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("never echoes the underlying database error message (which embeds the full record) to the caller or to logs", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    contactCreate.mockRejectedValue(
      new Error(
        'Invalid `prisma.contact.create()` invocation: { data: { name: "Jane Q Public", email: "jane@example.com" } }'
      )
    );

    const res = await POST(jsonRequest(VALID_BODY) as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(JSON.stringify(body)).not.toMatch(/Jane Q Public|jane@example\.com/);
    const loggedText = consoleErrorSpy.mock.calls.map((call) => JSON.stringify(call)).join(" ");
    expect(loggedText).not.toMatch(/Jane Q Public|jane@example\.com/);

    consoleErrorSpy.mockRestore();
  });

  it("omits the admin notification's Reference ID block when the database write failed", async () => {
    contactCreate.mockRejectedValue(new Error("db down"));

    await POST(jsonRequest(VALID_BODY) as never);

    const adminCall = sendEmailMock.mock.calls[0][0];
    expect(adminCall.html).toContain("Note: Message was not stored in database.");
    expect(adminCall.html).not.toContain("Reference ID");
  });

  it("includes the admin notification's Reference ID block when the database write succeeded", async () => {
    contactCreate.mockResolvedValue({ id: 99 });

    await POST(jsonRequest(VALID_BODY) as never);

    const adminCall = sendEmailMock.mock.calls[0][0];
    expect(adminCall.html).toContain("Reference ID:</strong> 99");
  });

  it("returns 500 with a fixed message on a truly unexpected error, without leaking details", async () => {
    isRateLimited.mockImplementation(() => {
      throw new Error("rate limiter exploded with sensitive info");
    });

    const res = await POST(jsonRequest(VALID_BODY) as never);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      success: false,
      message: "Failed to submit contact form. Please try again later.",
    });
    expect(JSON.stringify(body)).not.toMatch(/sensitive info/);
  });
});

describe("removed FastAPI-era verbs", () => {
  // GET was a hardcoded zero-caller stub; PUT (test-email) and PATCH (get-messages)
  // proxied to the FastAPI backend. All three were deleted in the Phase 5
  // decommission — see legacy/ARCHIVE.md. Next.js returns 405 for a verb a route
  // module does not export, so absence here is the whole contract.
  it.each(["GET", "PUT", "PATCH", "DELETE"])("no longer exports %s", (verb) => {
    expect(contactRoute).not.toHaveProperty(verb);
  });
});
