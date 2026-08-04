/**
 * HTML email templates for the contact form flow. Field-for-field port of
 * ContactService.create_admin_notification_email / create_user_confirmation_email
 * (backend/app/main/services/contact_service.py:62-192).
 *
 * Deliberate divergence from the Python source: every user-supplied field (name,
 * email, subject, message) is HTML-escaped before interpolation here, whereas the
 * Python f-strings interpolate them raw. Email is not part of the frozen JSON
 * response contract (only the route's response body is), so this is a safe,
 * security-motivated improvement rather than a behavior regression — an HTML email
 * client that renders a contact submission containing `<img onerror=...>` etc. is a
 * real (if narrow) risk the original template did nothing to prevent.
 */

export interface ContactEmailFields {
  name: string;
  email: string;
  subject: string;
  message: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Mirrors Python's `contact_data.timestamp.strftime('%Y-%m-%d %H:%M:%S UTC')`. */
export function formatSubmittedAtUtc(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const y = date.getUTCFullYear();
  const mo = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());
  const h = pad(date.getUTCHours());
  const mi = pad(date.getUTCMinutes());
  const s = pad(date.getUTCSeconds());
  return `${y}-${mo}-${d} ${h}:${mi}:${s} UTC`;
}

/**
 * Port of ContactService.create_admin_notification_email. `contactId` is the raw
 * DB-write result (null when the write failed) — NOT the synthetic fallback id used
 * in the JSON response — matching Python's `stored_contact_id` argument exactly.
 */
export function buildAdminNotificationEmail(
  fields: ContactEmailFields,
  submittedAt: Date,
  contactId: string | null
): string {
  const name = escapeHtml(fields.name);
  const email = escapeHtml(fields.email);
  const subject = escapeHtml(fields.subject);
  const message = escapeHtml(fields.message).replace(/\n/g, "<br>");
  const submitted = formatSubmittedAtUtc(submittedAt);

  const referenceBlock = contactId
    ? `<div class="reference"><strong>Reference ID:</strong> ${contactId}</div>`
    : "";
  const footerReference = contactId
    ? `<p>Database Reference: Contact ID #${contactId}</p>`
    : "<p>Note: Message was not stored in database.</p>";

  return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>New Contact Form Submission</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
                .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .header { background-color: #6d28d9; color: white; padding: 20px; margin: -30px -30px 30px -30px; border-radius: 8px 8px 0 0; }
                .field { margin-bottom: 20px; }
                .label { font-weight: bold; color: #374151; margin-bottom: 5px; }
                .value { color: #1f2937; line-height: 1.5; }
                .message { background-color: #f9fafb; padding: 15px; border-left: 4px solid #6d28d9; border-radius: 4px; }
                .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px; }
                .reference { background-color: #e0e7ff; padding: 10px; border-radius: 4px; margin-bottom: 20px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1 style="margin: 0;">New Contact Form Submission</h1>
                    <p style="margin: 5px 0 0 0; opacity: 0.9;">Brand Creator Platform</p>
                </div>

                ${referenceBlock}

                <div class="field">
                    <div class="label">Name:</div>
                    <div class="value">${name}</div>
                </div>

                <div class="field">
                    <div class="label">Email:</div>
                    <div class="value"><a href="mailto:${email}">${email}</a></div>
                </div>

                <div class="field">
                    <div class="label">Subject:</div>
                    <div class="value">${subject}</div>
                </div>

                <div class="field">
                    <div class="label">Message:</div>
                    <div class="message">${message}</div>
                </div>

                <div class="field">
                    <div class="label">Submitted:</div>
                    <div class="value">${submitted}</div>
                </div>

                <div class="footer">
                    <p>This message was sent from the Brand Creator Platform contact form.</p>
                    <p>Reply directly to this email to respond to ${name}.</p>
                    ${footerReference}
                </div>
            </div>
        </body>
        </html>
        `;
}

/** Port of ContactService.create_user_confirmation_email. */
export function buildUserConfirmationEmail(fields: ContactEmailFields, submittedAt: Date): string {
  const name = escapeHtml(fields.name);
  const subject = escapeHtml(fields.subject);
  const email = escapeHtml(fields.email);
  const submitted = formatSubmittedAtUtc(submittedAt);
  const year = new Date().getUTCFullYear();

  return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Thank You for Contacting Us</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
                .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .header { background-color: #6d28d9; color: white; padding: 20px; margin: -30px -30px 30px -30px; border-radius: 8px 8px 0 0; text-align: center; }
                .content { color: #1f2937; line-height: 1.6; }
                .highlight { background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin: 20px 0; }
                .contact-info { background-color: #fef3c7; padding: 15px; border-radius: 6px; margin: 20px 0; }
                .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px; text-align: center; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1 style="margin: 0;">Thank You!</h1>
                    <p style="margin: 10px 0 0 0; opacity: 0.9;">We've received your message</p>
                </div>

                <div class="content">
                    <p>Hi ${name},</p>

                    <p>Thank you for contacting Brand Creator Platform! We've successfully received your message and appreciate you taking the time to reach out to us.</p>

                    <div class="highlight">
                        <strong>Your Message Summary:</strong><br>
                        <strong>Subject:</strong> ${subject}<br>
                        <strong>Submitted:</strong> ${submitted}
                    </div>

                    <p><strong>What happens next?</strong></p>
                    <ul>
                        <li>Our team will review your message within 24 hours</li>
                        <li>We'll respond to you at <strong>${email}</strong></li>
                        <li>For urgent matters, you can also reach us directly at the contact information below</li>
                    </ul>

                    <div class="contact-info">
                        <strong>Other ways to reach us:</strong><br>
                        Support: info@borderxmedia.com<br>
                        Business Inquiries: sam@borderxmedia.com<br>
                        Website: https://cricher.ai
                    </div>

                    <p>In the meantime, feel free to explore our platform and discover the exciting opportunities available for creators and brands!</p>

                    <p>Best regards,<br>
                    <strong>The Brand Creator Platform Team</strong></p>
                </div>

                <div class="footer">
                    <p>© ${year} Brand Creator Platform. All rights reserved.</p>
                    <p>You're receiving this email because you contacted us through our website.</p>
                </div>
            </div>
        </body>
        </html>
        `;
}
