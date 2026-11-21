"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { writeAudit } from "@/lib/audit";
import { hashIp, requestIp } from "@/lib/geo";
import { rateLimiter } from "@/lib/ratelimit";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { serverApi } from "@/lib/api/server";
import { signInDestination } from "@/lib/auth/redirect";
import { appOrigin } from "@/lib/app-origin";
import { authEmailErrorMessage, hideUnknownAuthEmail } from "@/lib/auth/email-errors";
import { demoAccountEmail, demoSignupEnabled, isDemoAccountEmail } from "@/lib/auth/demo-account";
import type { Invite, Profile } from "@/lib/types";

export interface AuthState {
  error?: string;
  message?: string;
}

interface InvitePreviewRow extends Invite {
  firm: { name: string } | null;
}

function safeNext(value: FormDataEntryValue | null) {
  return signInDestination(value);
}

function authCallback(next: string) {
  const url = new URL("/auth/callback", appOrigin());
  url.searchParams.set("next", next);
  return url.toString();
}

async function auditLoginFailure(email: string) {
  try {
    const incoming = await headers();
    const ip = requestIp(incoming);
    const city = incoming.get("x-vercel-ip-city");
    const geography = {
      ipHash: hashIp(ip),
      country: incoming.get("x-vercel-ip-country")?.slice(0, 8) ?? null,
      city: city ? decodeURIComponent(city).slice(0, 120) : null,
      userAgent: incoming.get("user-agent")?.slice(0, 200) ?? null,
    };

    await writeAudit(
      adminClient(),
      {
        action: "auth.login_failed",
        result: "deny",
        denyReason: "UNAUTHENTICATED",
        details: {
          email_hash: createHash("sha256")
            .update(email.toLowerCase())
            .digest("hex"),
        },
      },
      geography,
    );
  } catch {
    // Authentication failures must not depend on audit availability.
  }
}

async function profileFor(userId: string) {
  const { data, error } = await adminClient()
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle<Profile>();
  if (error) throw new Error("Unable to load the signed-in profile.");
  return data;
}

async function authRateLimit() {
  const incoming = await headers();
  const ip = requestIp(incoming);
  const result = rateLimiter.check(`ip:${hashIp(ip)}`, "auth");
  if (result.allowed) return null;

  return `Too many sign-in attempts. Try again in ${result.retryAfter} second${
    result.retryAfter === 1 ? "" : "s"
  }.`;
}

export async function signInAction(
  _previous: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const limited = await authRateLimit();
  if (limited) return { error: limited };

  const identifier = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const mode = String(formData.get("mode") ?? "password");
  const email = identifier.includes("@") ? identifier :
    mode === "password" && demoSignupEnabled() ? demoAccountEmail(identifier) : null;

  if (!email || !email.includes("@")) {
    return { error: mode === "password" && demoSignupEnabled()
      ? "Enter your username or a valid email address."
      : "Enter a valid email address." };
  }
  if (mode !== "password" && isDemoAccountEmail(email)) {
    return { error: "Use your demo username and password to sign in." };
  }

  const supabase = await createServerSupabaseClient();

  if (mode === "magic") {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: authCallback(safeNext(formData.get("next"))),
        shouldCreateUser: false,
      },
    });
    if (error && !hideUnknownAuthEmail(error)) return { error: authEmailErrorMessage(error) };
    return {
      message: "If your account is eligible, check your inbox or spam folder and open the sign-in link in this browser.",
    };
  }

  if (mode === "confirm") {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: authCallback(safeNext(formData.get("next"))) },
    });
    if (error && !hideUnknownAuthEmail(error)) return { error: authEmailErrorMessage(error) };
    return {
      message: "If your account needs confirmation, check your inbox. Open the link in this browser.",
    };
  }

  if (!password) return { error: "Enter your password." };

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    await auditLoginFailure(email);
    if (error?.code === "email_not_confirmed") {
      return { error: "Confirm your email address before signing in. You can resend the confirmation below." };
    }
    return { error: "Email or password is incorrect." };
  }

  const profile = await profileFor(data.user.id);
  const next = safeNext(formData.get("next"));
  if (!profile) redirect(next.startsWith("/invite/accept?") ? next : "/firm-setup");
  if (!profile.is_active) {
    await supabase.auth.signOut();
    return { error: "This account has been deactivated by your firm admin." };
  }

  redirect(next);
}

export async function signUpAction(
  _previous: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const limited = await authRateLimit();
  if (limited) return { error: limited };
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (fullName.length < 2 || fullName.length > 100) return { error: "Enter your full name (2–100 characters)." };
  if (password.length < 8) {
    return { error: "Choose a password of at least 8 characters." };
  }

  const supabase = await createServerSupabaseClient();
  if (demoSignupEnabled()) {
    const address = demoAccountEmail(String(formData.get("username") ?? ""));
    if (!address) return { error: "Choose a username with 3–30 letters, numbers, hyphens or underscores. Start with a letter or number." };
    if (Buffer.byteLength(password, "utf8") > 72) return { error: "Choose a password of up to 72 bytes." };

    const { error: creationError } = await adminClient().auth.admin.createUser({
      email: address,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (creationError) {
      if (creationError.code === "email_exists" || creationError.code === "user_already_exists") {
        return { error: "That username is taken. Sign in or choose another one." };
      }
      return { error: "We couldn’t create your demo account. Try again in a moment." };
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email: address, password });
    if (error || !data.session) return { message: "Your account is ready. Sign in with your username and password." };
    redirect("/firm-setup");
  }

  if (!email.includes("@") || isDemoAccountEmail(email)) {
    return { error: "Enter a valid work email address." };
  }
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName }, emailRedirectTo: authCallback("/firm-setup") },
  });

  if (error) return { error: authEmailErrorMessage(error) };
  if (data.user && data.user.identities?.length === 0) {
    return { error: "An account already exists for that email. Sign in instead." };
  }

  if (!data.session) {
    return {
      message: `Check ${email} to confirm your account, then sign in to finish setup.`,
    };
  }

  redirect("/firm-setup");
}

export async function acceptInviteAction(
  _previous: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const token = String(formData.get("token") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!token) return { error: "This invitation is no longer valid." };
  if (fullName.length < 2) return { error: "Enter your full name." };
  const preview = await getInvitePreview(token);
  if (!preview) return { error: "This invitation is no longer valid." };

  const supabase = await createServerSupabaseClient();
  const { data: sessionData } = await supabase.auth.getSession();
  let session = sessionData.session;
  if (!session) {
    if (password.length < 8) return { error: "Choose a password of at least 8 characters." };
    const { data, error } = await supabase.auth.signUp({
      email: preview.email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: authCallback(`/invite/accept?token=${encodeURIComponent(token)}`),
      },
    });
    if (error) return { error: authEmailErrorMessage(error) };
    if (data.user?.identities?.length === 0) {
      return { error: "An account already exists for this email. Sign in to accept the invitation." };
    }
    if (!data.session) {
      return { message: `Check ${preview.email} to confirm your account and continue accepting the invitation.` };
    }
    session = data.session;
  }

  try {
    await serverApi(
      "/invites/accept",
      {
        method: "POST",
        body: JSON.stringify({ invite_token: token, full_name: fullName }),
      },
      session.access_token,
    );
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to accept the invitation.",
    };
  }

  redirect("/cases");
}

export async function signOutAction() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function getInvitePreview(token: string | undefined) {
  if (!token) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const { data, error } = await adminClient()
    .from("invites")
    .select("*, firm:firms!invites_firm_id_fkey(name)")
    .eq("token_hash", tokenHash)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle<InvitePreviewRow>();

  if (error || !data || !data.firm) return null;

  return {
    firm_name: data.firm.name,
    role: data.role,
    clearance_level: data.clearance_level,
    email: data.email,
  };
}
