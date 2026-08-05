/**
 * HTML email template for the career application flow. Field-for-field port of
 * CareerService.create_user_confirmation_email (backend/app/main/services/career_service.py:61-145).
 *
 * Python defines but never uses ADMIN_EMAIL/HR_EMAIL constants (career_service.py:19-20)
 * and never calls an admin-notification builder — only one email is sent, to the
 * applicant. Do not add a second (admin) email by pattern-matching against the contact
 * flow's two-email shape; Python genuinely only sends one here.
 *
 * Only 8 of the request's 13 fields actually appear in the Python template: position,
 * positionId, submittedAt, applicantEmail, identity.passportName, identity.nationality,
 * influencer.profileUrl, influencer.followerCount. idType, idNumber, gender,
 * dateOfBirth, accountIntroduction, and otherPlatforms are collected but never rendered
 * into this email — verified against career_service.py:66-145 line by line. Not
 * expanding the template to include them: that would be new behavior, not a port.
 *
 * Deliberate divergence from the Python source (same rationale as the contact port,
 * src/app/api/contact/email-templates.ts): every user-supplied field is HTML-escaped
 * before interpolation here, whereas the Python f-string interpolates them raw. Email
 * body is not part of the frozen JSON response contract, so this is a safe,
 * security-motivated improvement rather than a behavior regression. profileUrl is
 * escaped and reused for both the `href` and the visible link text, mirroring exactly
 * how the contact port treats its `email` field's `mailto:` href.
 */

export interface CareerApplicantEmailFields {
  position: string;
  positionId: string;
  applicantEmail: string;
  submittedAt: string;
  identityInformation: {
    passportName: string;
    nationality: string;
  };
  influencerInformation: {
    profileUrl: string;
    followerCount: string;
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Port of CareerService.create_user_confirmation_email. */
export function buildCareerApplicantConfirmationEmail(fields: CareerApplicantEmailFields): string {
  const position = escapeHtml(fields.position);
  const positionId = escapeHtml(fields.positionId);
  // Raw pass-through, matching Python: application_data.submittedAt is interpolated
  // with zero parsing or reformatting (career_service.py:101) — it's free-text `str`
  // in the Pydantic model, not a validated date.
  const submittedAt = escapeHtml(fields.submittedAt);
  const applicantEmail = escapeHtml(fields.applicantEmail);
  const passportName = escapeHtml(fields.identityInformation.passportName);
  const nationality = escapeHtml(fields.identityInformation.nationality);
  const profileUrl = escapeHtml(fields.influencerInformation.profileUrl);
  const followerCount = escapeHtml(fields.influencerInformation.followerCount);
  // Intentional divergence from Python's `datetime.now().year` (local server time):
  // UTC avoids a server-timezone-dependent off-by-one around New Year's. Same
  // reasoning as the contact port's identical footer-year divergence; not part of the
  // frozen JSON response contract.
  const year = new Date().getUTCFullYear();

  return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Career Application Received - Cricher.ai</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
                .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .header { background-color: #6d28d9; color: white; padding: 20px; margin: -30px -30px 30px -30px; border-radius: 8px 8px 0 0; text-align: center; }
                .content { color: #1f2937; line-height: 1.6; }
                .highlight { background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin: 20px 0; }
                .section { margin: 20px 0; }
                .section-title { font-weight: bold; color: #6d28d9; margin-bottom: 10px; font-size: 16px; }
                .field { margin: 8px 0; }
                .field-label { font-weight: 600; color: #374151; }
                .field-value { color: #1f2937; }
                .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px; text-align: center; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1 style="margin: 0;">Application Received!</h1>
                    <p style="margin: 10px 0 0 0; opacity: 0.9;">Thank you for applying to Cricher.ai</p>
                </div>

                <div class="content">
                    <p>Dear ${passportName},</p>

                    <p>Thank you for your interest in the <strong>${position}</strong> position at Cricher.ai! We have successfully received your application.</p>

                    <div class="highlight">
                        <strong>Application Summary:</strong><br>
                        <strong>Position:</strong> ${position}<br>
                        <strong>Submitted:</strong> ${submittedAt}<br>
                        <strong>Application ID:</strong> ${positionId}
                    </div>

                    <div class="section">
                        <div class="section-title">Your Information</div>
                        <div class="field">
                            <span class="field-label">Name:</span>
                            <span class="field-value">${passportName}</span>
                        </div>
                        <div class="field">
                            <span class="field-label">Nationality:</span>
                            <span class="field-value">${nationality}</span>
                        </div>
                        <div class="field">
                            <span class="field-label">Profile URL:</span>
                            <span class="field-value"><a href="${profileUrl}">${profileUrl}</a></span>
                        </div>
                        <div class="field">
                            <span class="field-label">Follower Count:</span>
                            <span class="field-value">${followerCount}</span>
                        </div>
                    </div>

                    <p><strong>What happens next?</strong></p>
                    <ul>
                        <li>Our HR team will review your application within 10 business days</li>
                        <li>If your profile matches our requirements, we'll contact you at <strong>${applicantEmail}</strong></li>
                        <li>Selected candidates will be invited for an interview</li>
                    </ul>

                    <p>We appreciate your interest in joining our team and look forward to potentially working with you!</p>

                    <p>Best regards,<br>
                    <strong>The Cricher.ai HR Team</strong></p>
                </div>

                <div class="footer">
                    <p>© ${year} Cricher.ai. All rights reserved.</p>
                    <p>You're receiving this email because you applied for a position through our careers page.</p>
                </div>
            </div>
        </body>
        </html>
        `;
}
