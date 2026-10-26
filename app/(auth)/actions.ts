"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { writeAudit } from "@/lib/audit";
import { hashIp } from "@/lib/geo";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { serverApi } from "@/lib/api/server";
import type { Invite, Profile } from "@/lib/types";

export interface AuthState {
  error?: string;
  message?: string;
}

interface InvitePreviewRow extends Invite {
  firm: { name: string } | null;
}

function safeNext(value: FormDataEntryValue | null) {
  const next = String(value ?? "/cases");
  return next.startsWith("/") && !next.startsWith("//") ? next : "/cases";
}

async function auditLoginFailure(email: string) {
  try {
    const incoming = await headers();
    const forwarded = incoming.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() ?? "127.0.0.1";
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

export async function signInAction(
  _previous: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const mode = String(formData.get("mode") ?? "password");

  if (!email || !email.includes("@")) {
    return { error: "Enter a valid email address." };
  }

  const supabase = await createServerSupabaseClient();

  if (mode === "magic") {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/cases`,
      },
    });
    if (error) return { error: "Unable to send a sign-in link." };
    return {
      message: `A sign-in link is on its way to ${email}. It expires in 15 minutes.`,
    };
  }

  if (!password) return { error: "Enter your password." };

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    await auditLoginFailure(email);
    return { error: "Email or password is incorrect." };
  }

  const profile = await profileFor(data.user.id);
  if (!profile) redirect("/firm-setup");
  if (!profile.is_active) {
    await supabase.auth.signOut();
    return { error: "This account has been deactivated by your firm admin." };
  }

  redirect(safeNext(formData.get("next")));
}

export async function signUpAction(
  _previous: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (fullName.length < 2) return { error: "Enter your full name." };
  if (!email || !email.includes("@")) {
    return { error: "Enter a valid email address." };
  }
  if (password.length < 8) {
    return { error: "Choose a password of at least 8 characters." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });

  if (error) return { error: error.message };
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
  if (password.length < 8) {
    return { error: "Choose a password of at least 8 characters." };
  }

  const preview = await getInvitePreview(token);
  if (!preview) return { error: "This invitation is no longer valid." };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email: preview.email,
    password,
    options: { data: { full_name: fullName } },
  });

  if (error) return { error: error.message };
  if (data.user && data.user.identities?.length === 0) {
    return { error: "An account already exists for this email. Sign in instead." };
  }
  if (!data.session) {
    return {
      message: `Check ${preview.email} to confirm your account, then open the invitation link again.`,
    };
  }

  try {
    await serverApi(
      "/invites/accept",
      {
        method: "POST",
        body: JSON.stringify({ invite_token: token, full_name: fullName }),
      },
      data.session.access_token,
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