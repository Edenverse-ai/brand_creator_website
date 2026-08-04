import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { contactFormLimiter } from "@/lib/rate-limiter";
import { buildAdminNotificationEmail, buildUserConfirmationEmail } from "./email-templates";

// backend/app/main/services/contact_service.py ContactService class constants.
const ADMIN_EMAIL = "sam@borderxai.com";

// Ground-truth checked (both .env and Netlify production, 2026-08-05):
// SMTP_USER=info@borderxmedia.com. Python's admin send omits from_email, so it falls
// back to `formataddr(("Brand Creator Platform", settings.SMTP_USER))`
// (contact_service.py:35) — i.e. this exact string. The user-confirmation send passes
// SUPPORT_EMAIL explicitly (a separate class constant that independently happens to
// equal the same address today). Kept as two named constants rather than one shared
// one: they're two different Python sources of truth that currently coincide, and
// collapsing them would silently couple a future SMTP_USER rotation to SUPPORT_EMAIL
// (or vice versa) even if only one of the two actually changes.
const ADMIN_EMAIL_FROM = '"Brand Creator Platform" <info@borderxmedia.com>';
const SUPPORT_EMAIL_FROM = '"Brand Creator Platform" <info@borderxmedia.com>';

interface ContactFields {
  name: string;
  email: string;
  subject: string;
  message: string;
}

// Field-for-field mirror of ContactFormData (backend/app/main/models/contact.py).
// Python's model has no explicit min-length on name/subject/message (plain `str`,
// accepts ""), but the porting reference's own recommended zod equivalent tightens
// these to `.min(1)` — a deliberate, defensible improvement (blank-spam prevention),
// not a byte-for-byte requirement, since request validation shape is not part of the
// frozen contract (only the response is — see the porting reference's §0.7).
const ContactFormSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  subject: z.string().min(1),
  message: z.string().min(1),
  timestamp: z.string().nullish(),
});

/**
 * Field-for-field port of the `if not contact_data.timestamp: contact_data.timestamp
 * = datetime.now()` line in ContactService.submit_contact_form. An unparseable string
 * also falls back to "now" rather than 400ing — contact submission is explicitly the
 * lenient/never-hard-fail posture (porting reference §0.6), and timestamp is
 * server-trusted metadata, not user-facing data worth rejecting a whole submission over.
 */
function resolveTimestamp(value: string | null | undefined): Date {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

/**
 * Field-for-field port of ContactService.store_contact_message. Mirrors its
 * swallow-and-return-null behavior on any failure (missing Supabase client in Python
 * -> a Prisma/DB error here) — the caller treats a null return as "not stored" and
 * still completes the request successfully (porting reference §0.6: contact form DB
 * failures are non-fatal by design, unlike the "strict" domains).
 */
async function storeContactMessage(fields: ContactFields, createdAt: Date): Promise<string | null> {
  try {
    const created = await prisma.contact.create({
      data: {
        name: fields.name,
        email: fields.email,
        subject: fields.subject,
        message: fields.message,
        created_at: createdAt,
      },
      select: { id: true },
    });
    // Contact.id is Int @id @default(autoincrement()) — Python does `str(contact_id)`
    // before returning it; a raw Prisma number here would break the frozen
    // string-typed `contact_id` response field.
    return String(created.id);
  } catch (error) {
    // Never forward error.message: PrismaClientValidationError/KnownRequestError
    // messages embed the full attempted `data` object (name, email, subject,
    // message) — exactly the PII this route must not log or echo. Only the error's
    // class name / Prisma error code identify the failure.
    const code =
      error && typeof error === "object" && "code" in error
        ? (error as { code: unknown }).code
        : undefined;
    console.error("contact: failed to store contact message", {
      name: error instanceof Error ? error.name : typeof error,
      ...(code === undefined ? {} : { code }),
    });
    return null;
  }
}

/**
 * Field-for-field port of the two send_email calls in
 * ContactService.submit_contact_form. Both are non-fatal on failure — logged only,
 * never surfaced to the caller (ContactResponse has no email-status field in Python
 * either) — matching the lenient posture in porting reference §0.6.
 */
async function sendContactNotifications(
  fields: ContactFields,
  submittedAt: Date,
  storedContactId: string | null
): Promise<void> {
  const adminHtml = buildAdminNotificationEmail(fields, submittedAt, storedContactId);
  const adminResult = await sendEmail({
    to: ADMIN_EMAIL,
    subject: `New Contact Form: ${fields.subject}`,
    html: adminHtml,
    from: ADMIN_EMAIL_FROM,
  });
  if (!adminResult.ok) {
    console.error("contact: failed to send admin notification email", {
      error: adminResult.error,
    });
  }

  const userHtml = buildUserConfirmationEmail(fields, submittedAt);
  const userResult = await sendEmail({
    to: fields.email,
    subject: "Thank you for contacting Brand Creator Platform",
    html: userHtml,
    from: SUPPORT_EMAIL_FROM,
  });
  if (!userResult.ok) {
    console.error("contact: failed to send user confirmation email", {
      error: userResult.error,
    });
  }
}

/**
 * Native port of POST /contact/submit (backend/app/main/routes/contact.py +
 * ContactService.submit_contact_form). This is the only live-called verb on this
 * route (porting reference §2.7) — GET/PUT/PATCH below remain untouched proxies/stubs;
 * see the phase report for why they're zero-caller deletion candidates instead.
 *
 * Intentionally public/unauthenticated, matching Python (no auth anywhere in
 * contact.py/contact_service.py). Zod validation + IP rate limiting stand in for the
 * session guard other ported mutating routes get, per the infra-simplification plan's
 * Global Constraints.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (contactFormLimiter.isRateLimited(`contact:${ip}`)) {
      return NextResponse.json(
        { success: false, message: "Too many submissions. Please try again later." },
        { status: 429 }
      );
    }

    const parsed = ContactFormSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, message: "Invalid input" }, { status: 400 });
    }

    const fields: ContactFields = {
      name: parsed.data.name,
      email: parsed.data.email,
      subject: parsed.data.subject,
      message: parsed.data.message,
    };
    const submittedAt = resolveTimestamp(parsed.data.timestamp);

    const storedContactId = await storeContactMessage(fields, submittedAt);
    const storedInDatabase = storedContactId !== null;

    await sendContactNotifications(fields, submittedAt, storedContactId);

    // Synthetic fallback mirrors Python's f"contact-{int(timestamp.timestamp())}".
    const contactId = storedContactId ?? `contact-${Math.floor(submittedAt.getTime() / 1000)}`;

    return NextResponse.json({
      success: true,
      message: "Thank you for your message! We'll get back to you soon.",
      contact_id: contactId,
      stored_in_database: storedInDatabase,
    });
  } catch (error) {
    console.error("contact: unexpected error", error instanceof Error ? error.name : typeof error);
    return NextResponse.json(
      { success: false, message: "Failed to submit contact form. Please try again later." },
      { status: 500 }
    );
  }
}

// --- Everything below is unchanged from the pre-Phase-4a proxy implementation. ---
// GET/PUT/PATCH on this route have zero live callers (porting reference §1.2/§2.1/§2.7:
// GET is a hardcoded stub that doesn't even proxy to Python; PUT test-email and PATCH
// get-messages proxy to dead-caller Python endpoints). Per this phase's scope, only the
// live POST path above is ported to native Prisma/email logic — these three are left
// exactly as they were, flagged as deletion candidates in the phase report rather than
// silently rewritten or removed.

export async function GET() {
  // Return contact form schema or info
  return NextResponse.json({
    message: "Contact API is available",
    methods: ["POST", "PUT"],
    endpoint: "/api/contact",
    fields: ["name", "email", "subject", "message"],
    features: [
      "Email notifications",
      "Admin alerts",
      "User confirmations",
      "Database storage",
      "Status tracking",
    ],
  });
}

// Add test endpoint for email configuration
export async function PUT(_request: NextRequest) {
  try {
    console.log("Testing email configuration...");

    const apiUrl = process.env.CAMPAIGNS_API_URL || "http://localhost:5000";
    const response = await fetch(`${apiUrl}/contact/test-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const responseData = await response.json();
    console.log("Email test result:", responseData);

    return NextResponse.json(responseData);
  } catch (error: any) {
    console.error("Error testing email configuration:", error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Failed to test email configuration",
      },
      { status: 500 }
    );
  }
}

// Add endpoint to get contact messages (admin only)
export async function PATCH(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    if (action === "get-messages") {
      const apiUrl = process.env.CAMPAIGNS_API_URL || "http://localhost:5000";
      const status = url.searchParams.get("status");
      const limit = url.searchParams.get("limit") || "50";
      const offset = url.searchParams.get("offset") || "0";

      const queryParams = new URLSearchParams({
        limit,
        offset,
        ...(status && { status }),
      });

      const response = await fetch(`${apiUrl}/contact/messages?${queryParams}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const responseData = await response.json();
      return NextResponse.json(responseData);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("Error in contact admin operations:", error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Failed to perform admin operation",
      },
      { status: 500 }
    );
  }
}
