import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendEmail } from "@/lib/email";
import { careerApplicationLimiter } from "@/lib/rate-limiter";
import { buildCareerApplicantConfirmationEmail } from "./email-template";

// Ground-truth checked (.env + Netlify production, 2026-08-05): SMTP_USER is
// info@borderxmedia.com. Python's CareerService.send_email is always called without a
// from_email argument (career_service.py:212-216), so
// formataddr(("Cricher.ai Careers", from_email or settings.SMTP_USER)) always resolves
// to this exact display-name/address pair (career_service.py:34). Note the quotes:
// unlike contact's "Brand Creator Platform" (which formataddr leaves unquoted), Python's
// specialsre treats "." as a special character, and "Cricher.ai" contains one — so
// Python's own output is quoted here. Hardcoded as a literal (not re-derived from
// process.env.SMTP_USER at call time) to match the established pattern in
// src/app/api/contact/route.ts.
const CAREER_APPLICANT_FROM = '"Cricher.ai Careers" <info@borderxmedia.com>';

// Field-for-field mirror of IdentityInformation (backend/app/main/models/career.py).
// Every field is plain `str` in Pydantic with no length constraint (accepts ""). As
// with the contact port, tightening required fields to `.min(1)` here is a deliberate,
// defensible improvement (blank-spam prevention) — request validation shape is not
// part of the frozen contract (only the response is).
const IdentityInformationSchema = z.object({
  passportName: z.string().min(1),
  nationality: z.string().min(1),
  idType: z.string().min(1),
  idNumber: z.string().min(1),
  gender: z.string().min(1),
  // Free text in Python — dateOfBirth is never parsed or validated as a date
  // (models/career.py:10), so no date/format validation is added here either.
  dateOfBirth: z.string().min(1),
});

// Field-for-field mirror of InfluencerInformation. followerCount is `str` in Python
// despite the name (models/career.py:16) — no numeric coercion. otherPlatforms is
// `str | None = None` — optional and nullable.
const InfluencerInformationSchema = z.object({
  accountIntroduction: z.string().min(1),
  // Plain `str` in Python, not validated as a URL (models/career.py:15) — no `.url()`.
  profileUrl: z.string().min(1),
  followerCount: z.string().min(1),
  otherPlatforms: z.string().nullish(),
});

// Field-for-field mirror of CareerApplicationData (backend/app/main/models/career.py).
// No `extra="forbid"` on the Python model — extra fields are silently accepted and
// ignored, which is zod's default `.object()` behavior too (no `.strict()` needed).
const CareerApplicationSchema = z.object({
  position: z.string().min(1),
  positionId: z.string().min(1),
  applicantEmail: z.string().email(),
  // Free text in Python — submittedAt is never parsed or validated as a date
  // (models/career.py:24). Used raw in the email body; never converted to a Date.
  submittedAt: z.string().min(1),
  identityInformation: IdentityInformationSchema,
  influencerInformation: InfluencerInformationSchema,
});

const SUCCESS_MESSAGE = "Thank you for your application! We've sent a confirmation to your email.";

/**
 * Native port of POST /api/career/apply (backend/app/main/routes/career.py +
 * CareerService.submit_career_application). Intentionally public/unauthenticated,
 * matching Python (no auth anywhere in career.py/career_service.py) — zod validation +
 * IP rate limiting stand in for the session guard other ported mutating routes get, per
 * the infra-simplification plan's Global Constraints.
 *
 * OWNER DECISION: career applications stay email-only, no PII at rest. Python's own
 * `store_application` (career_service.py:147-192) inserts into
 * `supabase.table("CareerApplications")`, a table that has never existed in this
 * project — verified 2026-08-05 via the Supabase REST API (PGRST205) and a read-only
 * `prisma db pull` showing the live database has exactly the same 30 models as
 * prisma/schema.prisma. The insert is wrapped in a try/except that swallows the
 * resulting exception (career_service.py:190-192), so every application to date has
 * produced only an email — this port keeps that real, current behavior rather than
 * fixing the dead insert into a live one, since doing so would newly persist passport
 * name, ID number, nationality, gender, and date of birth: PII-at-rest the owner
 * explicitly declined to take on. No Prisma model, no migration, no write path exist
 * for this domain by design.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (careerApplicationLimiter.isRateLimited(`career:${ip}`)) {
      return NextResponse.json(
        { success: false, message: "Too many submissions. Please try again later." },
        { status: 429 }
      );
    }

    const parsed = CareerApplicationSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, message: "Invalid input" }, { status: 400 });
    }

    const application = parsed.data;

    const html = buildCareerApplicantConfirmationEmail(application);
    const subject = `Application Received - ${application.position} at Cricher.ai`;

    const emailResult = await sendEmail({
      to: application.applicantEmail,
      subject,
      html,
      from: CAREER_APPLICANT_FROM,
    });

    // Non-fatal on failure, same as Python (career_service.py:218-219 only logs) and
    // same as the contact port. Never log the request body here — position/positionId
    // are job-posting metadata, not applicant PII, so they're safe to include; nothing
    // from identityInformation/influencerInformation/applicantEmail is logged.
    if (!emailResult.ok) {
      console.error("career: failed to send applicant confirmation email", {
        error: emailResult.error,
        position: application.position,
        positionId: application.positionId,
      });
    }

    // Python's response application_id is the stored DB row id, falling back to
    // `f"app-{positionId}-{int(datetime.now().timestamp())}"` only when the DB write
    // failed (career_service.py:221-224). Since this port never writes to a database,
    // that fallback is now the *only* path — kept as a synthetic, non-persisted
    // correlation id (safe to log and to quote in a support email) rather than dropped
    // outright: it costs nothing to keep, matches Python's own already-dead-path
    // formula exactly, and preserves the response shape for any future caller even
    // though src/app/career/page.tsx today reads neither this nor `success`/`message`
    // on the success path (verified by grep — see the phase report).
    const applicationId = `app-${application.positionId}-${Math.floor(Date.now() / 1000)}`;

    return NextResponse.json({
      success: true,
      message: SUCCESS_MESSAGE,
      application_id: applicationId,
    });
  } catch (error) {
    console.error("career: unexpected error", error instanceof Error ? error.name : typeof error);
    return NextResponse.json(
      { success: false, message: "Failed to submit career application. Please try again later." },
      { status: 500 }
    );
  }
}

// Dead on the Python side too (GET /api/career/health is a separate, unported
// endpoint — career.py has no GET /apply at all). This stub predates the native port
// and has zero callers (verified by grep for "api/career/apply" across src/); kept as
// an info stub like the analogous dead GET on src/app/api/contact/route.ts, but with
// its `features` list corrected — it previously advertised "Database storage" and
// "Application tracking", which stopped being true the moment this route stopped
// writing to a database.
export async function GET() {
  return NextResponse.json({
    message: "Career Application API is available",
    methods: ["POST"],
    endpoint: "/api/career/apply",
    features: ["Email confirmation"],
  });
}
