import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { tiktokVerificationLimiter } from "@/lib/rate-limiter";
import { isOwnedStoragePath } from "@/lib/storage/path-ownership";

// Legacy multipart proxy target — kept as a rollback lever, NOT ported (presigned
// upload-urls + the JSON path below replace it; see Task 2.3 of the infra-simplification
// plan). Same env-var resolution the pre-existing proxy used.
const PYTHON_API_BASE =
  process.env.CAMPAIGNS_API_URL || process.env.PYTHON_API_URL || "http://127.0.0.1:5000";

// Field-for-field mirror of TikTokVerificationWithPaths.file_paths
// (backend/app/main/models/tiktokverify.py: `file_paths: dict[str, Any]`) — a fully
// generic dict, no required keys at the schema level (the service layer enforces
// presence of specific keys later).
const FilePathsSchema = z.record(z.string(), z.unknown());

// Field-for-field mirror of TikTokVerificationWithPaths (backend/app/main/models/tiktokverify.py).
// Pydantic's `str` fields accept empty strings, so no `.min(1)` here — only presence
// and type are enforced, matching what FastAPI would actually reject vs. accept.
// stage_name/other_platforms use `.nullish()` (not `.optional()`) because Pydantic's
// `str | None = None` accepts an explicit JSON `null`, not just an omitted key.
const SubmissionBody = z.object({
  passport_name: z.string(),
  real_name: z.string(),
  id_type: z.string(),
  gender: z.string(),
  nationality: z.string(),
  stage_name: z.string().nullish(),
  id_number: z.string(),
  date_of_birth: z.string(),
  account_intro: z.string(),
  overseas_platform_url: z.string(),
  follower_count: z.number().int(),
  other_platforms: z.string().nullish(),
  agent_email: z.string(),
  file_paths: FilePathsSchema,
});

function readFilePath(filePaths: Record<string, unknown>, key: string): string | null {
  const value = filePaths[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

interface VerificationFilePaths {
  id_front_path: string;
  handheld_id_path: string;
  backend_ss_path: string;
  authorization_path: string;
  identity_video_path: string | null;
}

type FilePathExtraction =
  | { ok: true; paths: VerificationFilePaths }
  | { ok: false; reason: "missing"; missing: string[] }
  | { ok: false; reason: "foreign"; fields: string[] };

/**
 * Mirrors submit_verification_with_paths' file_paths remap (tiktokverify.py
 * service): frontend upload keys -> DB column names, then validates the result.
 *
 * Two validations, neither present in the Python source (both deliberate
 * improvements — see below):
 *
 * 1. Missing required (non-nullable) column -> `{ ok: false, reason: "missing" }`.
 *    Python lets this flow through to a Postgres NOT NULL violation, surfacing as
 *    an opaque 500. The only real caller (creatorportal/tiktok-verify's
 *    validateForm) always supplies all four before submission ever reaches this
 *    route, so this only changes behavior for malformed/direct API calls, where a
 *    clean 400 is strictly better.
 * 2. Any provided path whose first segment isn't the submission's own `id_number`
 *    -> `{ ok: false, reason: "foreign" }`. There is no session here (this route is
 *    intentionally public), so this is a self-consistency check, not an
 *    authentication check: nothing stops a caller from submitting someone else's
 *    id_number, but a given submission's file_paths must at least be internally
 *    consistent with the id_number on the SAME request — otherwise a caller can
 *    submit `id_number: "attacker"` with `file_paths` pointing at
 *    `"victim/id_front.png"` etc. and persist a row that references another
 *    applicant's identity documents. `isOwnedStoragePath` also rejects traversal
 *    (`..`) and encoded (`%`) segments, so a malicious id_number itself can't be
 *    used to smuggle a path outside its own folder either.
 */
function extractFilePaths(
  filePaths: Record<string, unknown>,
  idNumber: string
): FilePathExtraction {
  const idFrontPath = readFilePath(filePaths, "id_front_file");
  const handheldIdPath = readFilePath(filePaths, "handheld_id_file");
  const backendSsPath = readFilePath(filePaths, "backend_ss_file");
  const authorizationPath = readFilePath(filePaths, "signed_auth_file");
  const identityVideoPath = readFilePath(filePaths, "identity_video_file");

  if (!idFrontPath || !handheldIdPath || !backendSsPath || !authorizationPath) {
    const missing = [
      !idFrontPath && "id_front_path",
      !handheldIdPath && "handheld_id_path",
      !backendSsPath && "backend_ss_path",
      !authorizationPath && "authorization_path",
    ].filter((v): v is string => Boolean(v));
    return { ok: false, reason: "missing", missing };
  }

  const candidates: Array<[field: string, path: string | null]> = [
    ["id_front_path", idFrontPath],
    ["handheld_id_path", handheldIdPath],
    ["backend_ss_path", backendSsPath],
    ["authorization_path", authorizationPath],
    ["identity_video_path", identityVideoPath],
  ];
  const foreignFields = candidates
    .filter(([, path]) => path !== null && !isOwnedStoragePath(path, idNumber))
    .map(([field]) => field);
  if (foreignFields.length > 0) {
    return { ok: false, reason: "foreign", fields: foreignFields };
  }

  return {
    ok: true,
    paths: {
      id_front_path: idFrontPath,
      handheld_id_path: handheldIdPath,
      backend_ss_path: backendSsPath,
      authorization_path: authorizationPath,
      identity_video_path: identityVideoPath,
    },
  };
}

/** Field-for-field port of the `record` dict built in create_verification_with_paths. */
function buildVerificationRecord(
  body: z.infer<typeof SubmissionBody>,
  paths: VerificationFilePaths,
  dateOfBirth: string
) {
  return {
    passport_name: body.passport_name,
    real_name: body.real_name,
    id_type: body.id_type,
    gender: body.gender,
    nationality: body.nationality,
    stage_name: body.stage_name ?? null,
    id_number: body.id_number,
    date_of_birth: dateOfBirth,
    account_intro: body.account_intro,
    overseas_platform_url: body.overseas_platform_url,
    follower_count: body.follower_count,
    other_platforms: body.other_platforms ?? null,
    agent_email: body.agent_email,
    ...paths,
  };
}

/**
 * Field-for-field port of the date_of_birth handling in
 * TikTokVerificationService.create_verification_with_paths:
 *   dob = datetime.strptime(date_of_birth, "%m/%d/%y").date()
 *   ... dob.isoformat()
 * Replicates Python's strptime `%y` century pivot (CPython Lib/_strptime.py): two-digit
 * years 00-68 map to 2000-2068, 69-99 map to 1900-1999. Throws (mirroring Python's
 * ValueError) on a malformed or calendar-invalid date instead of silently normalizing.
 *
 * Month/day accept 1 or 2 digits — CPython's `_strptime.py` TimeRE patterns for `%m`
 * (`1[0-2]|0[1-9]|[1-9]`) and `%d` (`3[0-1]|[1-2]\d|0[1-9]|[1-9]`) both allow an
 * unpadded single digit (e.g. "5/1/98"), so a `\d{2}`-only regex here would reject
 * inputs Python accepts.
 */
function formatDateOfBirth(mmddyy: string): string {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(mmddyy);
  if (!match) {
    throw new Error(`time data '${mmddyy}' does not match format '%m/%d/%y'`);
  }
  const month = Number(match[1]);
  const day = Number(match[2]);
  const twoDigitYear = Number(match[3]);
  const year = twoDigitYear <= 68 ? 2000 + twoDigitYear : 1900 + twoDigitYear;

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) {
    throw new Error(`day is out of range for month`);
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Field-for-field port of TikTokVerificationService.check_id_exists. Mirrors its
 * swallow-and-treat-as-not-found behavior on query failure: a transient read error
 * falls through to the insert attempt rather than hard-blocking the submission, with
 * the id_number unique constraint (prisma/schema.prisma) as the real backstop.
 */
async function checkIdExists(idNumber: string): Promise<boolean> {
  try {
    const existing = await prisma.influencer_verifications.findFirst({
      where: { id_number: idNumber },
      select: { id: true },
    });
    return existing !== null;
  } catch (error) {
    console.error("tiktokverification: check_id_exists query failed", error);
    return false;
  }
}

/**
 * Field-for-field port of the insert + response tail of
 * create_verification_with_paths: writes the row, then echoes the same record back
 * as `data` (not a re-read of the inserted row) — identical to what Python does.
 */
async function saveVerification(
  record: ReturnType<typeof buildVerificationRecord>
): Promise<NextResponse> {
  try {
    await prisma.influencer_verifications.create({ data: record });
    return NextResponse.json({
      success: true,
      message: "Verification submitted successfully",
      data: record,
    });
  } catch (error) {
    console.error("tiktokverification: failed to save verification", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { detail: `Failed to save verification data: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * Native JSON path: assets were already uploaded direct-to-storage via
 * POST /api/tiktokverification/upload-urls, so this only writes the
 * influencer_verifications row. Field-for-field port of tiktokverify.py's
 * `submit_verification_with_paths` route + `create_verification_with_paths` service
 * method. Response shape matches Python's TikTokVerificationResponse exactly.
 *
 * This endpoint is intentionally public/unauthenticated (same category as
 * /api/contact per the infra-simplification plan's Global Constraints — the Python
 * route never required a session either). Zod validation + IP rate limiting stand in
 * for the session guard other ported mutating routes get — note the rate limit is a
 * best-effort per-instance throttle (in-memory, per Netlify function container), not
 * a global cap; see the caveat on `tiktokVerificationLimiter` in rate-limiter.ts.
 */
async function handleJsonSubmission(request: NextRequest): Promise<NextResponse> {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  if (tiktokVerificationLimiter.isRateLimited(`tiktok-verify:${ip}`)) {
    return NextResponse.json(
      { detail: "Too many submissions. Please try again later." },
      { status: 429 }
    );
  }

  const parsed = SubmissionBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ detail: "Invalid input" }, { status: 400 });
  }
  const body = parsed.data;

  const extraction = extractFilePaths(body.file_paths, body.id_number);
  if (!extraction.ok) {
    const detail =
      extraction.reason === "missing"
        ? `Missing required file path(s): ${extraction.missing.join(", ")}`
        : `File path(s) do not belong to id_number ${body.id_number}: ${extraction.fields.join(", ")}`;
    return NextResponse.json({ detail }, { status: 400 });
  }
  const { paths } = extraction;

  if (await checkIdExists(body.id_number)) {
    return NextResponse.json(
      { detail: `ID number ${body.id_number} already exists` },
      { status: 400 }
    );
  }

  let dateOfBirth: string;
  try {
    dateOfBirth = formatDateOfBirth(body.date_of_birth);
  } catch (error) {
    console.error("tiktokverification: date_of_birth parse failed", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { detail: `Failed to save verification data: ${message}` },
      { status: 500 }
    );
  }

  const record = buildVerificationRecord(body, paths, dateOfBirth);
  return saveVerification(record);
}

/**
 * Legacy multipart path: transitional proxy to FastAPI's `upload_verification`
 * endpoint, kept as a rollback lever. NOT ported — presigned upload-urls +
 * handleJsonSubmission above replace it (Task 2.3). Behavior unchanged from the
 * pre-existing proxy.
 */
async function handleMultipartSubmission(request: NextRequest): Promise<NextResponse> {
  const formData = await request.formData();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(`${PYTHON_API_BASE}/tiktokverification/verification`, {
      method: "POST",
      body: formData,
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    clearTimeout(timeoutId);

    const responseText = await response.text();

    if (!response.ok) {
      let errorDetail = "Failed to submit verification";
      try {
        if (responseText.trim().startsWith("{") || responseText.trim().startsWith("[")) {
          const errorData = JSON.parse(responseText);
          errorDetail = errorData.detail || errorData.message || errorDetail;
        } else if (responseText.includes("<html>") || responseText.includes("<!DOCTYPE")) {
          errorDetail = `Server error: ${response.status} - HTML response received (likely infrastructure error)`;
        } else {
          errorDetail = responseText.substring(0, 200) || errorDetail;
        }
      } catch {
        errorDetail = `Server error: ${response.status} - ${responseText.substring(0, 100)}`;
      }

      return NextResponse.json(
        { success: false, detail: errorDetail, status: response.status },
        { status: response.status >= 500 ? 500 : response.status }
      );
    }

    try {
      return NextResponse.json(JSON.parse(responseText));
    } catch {
      return NextResponse.json({
        success: true,
        message: responseText || "Verification submitted successfully",
      });
    }
  } catch (fetchError) {
    clearTimeout(timeoutId);

    let errorMessage = "Error connecting to API";
    if (fetchError instanceof Error) {
      if (fetchError.name === "AbortError") {
        errorMessage = "Request timeout - please try again";
      } else if (fetchError.message.includes("ECONNREFUSED")) {
        errorMessage = "API service is not available";
      } else {
        errorMessage = fetchError.message;
      }
    }

    return NextResponse.json(
      { success: false, detail: errorMessage, error_type: "connection_error" },
      { status: 503 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return await handleJsonSubmission(request);
    }
    return await handleMultipartSubmission(request);
  } catch (error) {
    console.error("tiktokverification route error:", error);
    return NextResponse.json(
      {
        success: false,
        detail: error instanceof Error ? error.message : "Internal server error",
        error_type: "internal_error",
      },
      { status: 500 }
    );
  }
}
