import { describe, expect, it } from "vitest";
import { authEmailErrorMessage, hideUnknownAuthEmail } from "./email-errors";

describe("auth email errors", () => {
  it("reports a provider rate limit without promising delivery", () => {
    expect(authEmailErrorMessage({ code: "over_email_send_rate_limit" }))
      .toMatch(/email limit was reached/i);
    expect(authEmailErrorMessage({ status: 429 })).toMatch(/email limit was reached/i);
  });

  it("explains an unavailable link or a restricted sender", () => {
    expect(authEmailErrorMessage({ code: "otp_disabled" })).toMatch(/links are unavailable/i);
    expect(authEmailErrorMessage({ code: "email_address_not_authorized" })).toMatch(/approved addresses/i);
  });

  it("keeps unknown-account responses generic without hiding disabled-provider errors", () => {
    expect(hideUnknownAuthEmail({ code: "otp_disabled", message: "Signups not allowed for otp" })).toBe(true);
    expect(hideUnknownAuthEmail({ code: "email_provider_disabled" })).toBe(false);
  });
});
