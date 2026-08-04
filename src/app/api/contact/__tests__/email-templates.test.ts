import { describe, it, expect } from "vitest";
import {
  formatSubmittedAtUtc,
  buildAdminNotificationEmail,
  buildUserConfirmationEmail,
} from "../email-templates";

const FIELDS = {
  name: "Jane Q Public",
  email: "jane@example.com",
  subject: "Question about pricing",
  message: "Hello,\nI have a question.",
};

describe("formatSubmittedAtUtc", () => {
  it("formats a Date as 'YYYY-MM-DD HH:MM:SS UTC' (strftime parity)", () => {
    expect(formatSubmittedAtUtc(new Date("2024-01-05T09:07:03.000Z"))).toBe(
      "2024-01-05 09:07:03 UTC"
    );
  });

  it("zero-pads single-digit date/time components", () => {
    expect(formatSubmittedAtUtc(new Date("2024-01-01T01:02:03.000Z"))).toBe(
      "2024-01-01 01:02:03 UTC"
    );
  });
});

describe("buildAdminNotificationEmail", () => {
  it("includes the Reference ID block and DB reference footer when contactId is present", () => {
    const html = buildAdminNotificationEmail(FIELDS, new Date("2024-01-05T09:07:03.000Z"), "42");

    expect(html).toContain("Reference ID:</strong> 42");
    expect(html).toContain("Database Reference: Contact ID #42");
    expect(html).not.toContain("Note: Message was not stored in database.");
  });

  it("omits the Reference ID block and shows the not-stored footer when contactId is null", () => {
    const html = buildAdminNotificationEmail(FIELDS, new Date("2024-01-05T09:07:03.000Z"), null);

    expect(html).not.toContain("Reference ID");
    expect(html).toContain("Note: Message was not stored in database.");
  });

  it("converts newlines in the message to <br> after escaping", () => {
    const html = buildAdminNotificationEmail(
      { ...FIELDS, message: "line one\nline two" },
      new Date(),
      null
    );

    expect(html).toContain("line one<br>line two");
  });

  it("HTML-escapes user-supplied fields (deliberate hardening beyond the Python source, which interpolates raw)", () => {
    const html = buildAdminNotificationEmail(
      { ...FIELDS, name: "<script>alert(1)</script>" },
      new Date(),
      null
    );

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("includes the submitted-at timestamp formatted as UTC", () => {
    const html = buildAdminNotificationEmail(FIELDS, new Date("2024-01-05T09:07:03.000Z"), null);

    expect(html).toContain("2024-01-05 09:07:03 UTC");
  });
});

describe("buildUserConfirmationEmail", () => {
  it("greets the submitter by (escaped) name and includes the subject/timestamp summary", () => {
    const html = buildUserConfirmationEmail(FIELDS, new Date("2024-01-05T09:07:03.000Z"));

    expect(html).toContain("Hi Jane Q Public,");
    expect(html).toContain("Question about pricing");
    expect(html).toContain("2024-01-05 09:07:03 UTC");
  });

  it("HTML-escapes the submitter name", () => {
    const html = buildUserConfirmationEmail({ ...FIELDS, name: "<b>bold</b>" }, new Date());

    expect(html).not.toContain("<b>bold</b>");
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
  });

  it("includes the fixed support contact addresses with their emoji prefixes (parity with contact_service.py:174-176)", () => {
    const html = buildUserConfirmationEmail(FIELDS, new Date());

    expect(html).toContain("📧 Support: info@borderxmedia.com");
    expect(html).toContain("📧 Business Inquiries: sam@borderxmedia.com");
    expect(html).toContain("🌐 Website: https://cricher.ai");
  });
});
