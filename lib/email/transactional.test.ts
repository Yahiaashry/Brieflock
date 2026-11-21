import { afterEach, describe, expect, it, vi } from "vitest";
import { createTransport } from "nodemailer";
import { emailIsConfigured, sendTransactionalEmail } from "./transactional";

const sendMail = vi.hoisted(() => vi.fn());
vi.mock("nodemailer", () => ({ createTransport: vi.fn(() => ({ sendMail })) }));

const note = {
  to: "recipient@example.test",
  subject: "Test invitation",
  text: "Sign in to view your invitation.",
  idempotencyKey: "test-invitation",
};

describe("transactional email", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("sends through the configured SMTP sender when Resend is absent", async () => {
    vi.stubEnv("RESEND_API_KEY", undefined);
    vi.stubEnv("BRIEFLOCK_EMAIL_FROM", "sender@example.test");
    vi.stubEnv("BRIEFLOCK_SMTP_HOST", "smtp.example.test");
    vi.stubEnv("BRIEFLOCK_SMTP_PORT", "465");
    vi.stubEnv("BRIEFLOCK_SMTP_USER", "sender@example.test");
    vi.stubEnv("BRIEFLOCK_SMTP_PASSWORD", "test-password");
    sendMail.mockResolvedValue({ accepted: [note.to] });

    expect(emailIsConfigured()).toBe(true);
    expect(await sendTransactionalEmail(note)).toBe("sent");
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: "smtp.example.test", port: 465, secure: true,
    }));
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: note.to }));
  });

  it("reports missing mail configuration without opening a connection", async () => {
    vi.stubEnv("RESEND_API_KEY", undefined);
    vi.stubEnv("BRIEFLOCK_EMAIL_FROM", undefined);
    expect(emailIsConfigured()).toBe(false);
    expect(await sendTransactionalEmail(note)).toBe("unconfigured");
    expect(createTransport).not.toHaveBeenCalled();
  });
});
