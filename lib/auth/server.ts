import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/types";

export interface ServerAuth {
  user: User | null;
  profile: Profile | null;
  accessToken: string | null;
}

/**
 * React caches this per server request, so layouts, pages, metadata and server
 * actions that all need the signed-in user share one auth/profile lookup.
 */
export const getServerAuth = cache(async (): Promise<ServerAuth> => {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) return { user: null, profile: null, accessToken: null };

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { data: profile, error } = await adminClient()
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  if (error) throw new Error("Unable to load the signed-in profile.");

  return {
    user,
    profile: profile ?? null,
    accessToken: session?.access_token ?? null,
  };
});

export async function requireServerUser(): Promise<ServerAuth> {
  const auth = await getServerAuth();
  if (!auth.user) redirect("/login");
  return auth;
}

export async function requireServerProfile(): Promise<
  ServerAuth & { user: User; profile: Profile; accessToken: string }
> {
  const auth = await getServerAuth();
  if (!auth.user) redirect("/login");
  if (!auth.profile) redirect("/firm-setup");
  if (!auth.profile.is_active) redirect("/login?deactivated=1");
  if (!auth.accessToken) redirect("/login");

  return {
    ...auth,
    user: auth.user,
    profile: auth.profile,
    accessToken: auth.accessToken,
  };
}
