import { createTransport } from "nodemailer";

type Delivery = "sent" | "unconfigured" | "failed";

function smtpConfig() {
  const host = process.env.BRIEFLOCK_SMTP_HOST;
  const port = Number(process.env.BRIEFLOCK_SMTP_PORT ?? 587);
  const user = process.env.BRIEFLOCK_SMTP_USER;
  const pass = process.env.BRIEFLOCK_SMTP_PASSWORD;
  if (!host || !user || !pass || ![465, 587].includes(port)) return null;
  return {
    host, port, auth: { user, pass },
    secure: port === 465,
    requireTLS: port === 587,
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 10_000,
    disableFileAccess: true,
    disableUrlAccess: true,
  };
}

export function emailIsConfigured() {
  return Boolean(process.env.BRIEFLOCK_EMAIL_FROM && (process.env.RESEND_API_KEY || smtpConfig()));
}

export async function sendTransactionalEmail(input: {
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
}): Promise<Delivery> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.BRIEFLOCK_EMAIL_FROM;
  if (!from) return "unconfigured";

  if (!key) {
    const smtp = smtpConfig();
    if (!smtp) return "unconfigured";
    try {
      const delivery = await createTransport(smtp).sendMail({
        from,
        to: input.to,
        subject: input.subject,
        text: input.text,
      });
      return delivery.accepted.length ? "sent" : "failed";
    } catch {
      console.error("BriefLock SMTP delivery failed.");
      return "failed";
    }
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        "idempotency-key": input.idempotencyKey,
      },
      body: JSON.stringify({
        from, to: [input.to], subject: input.subject, text: input.text,
      }),
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    return response.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}
