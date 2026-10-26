import type { SupabaseClient, User } from "@supabase/supabase-js";
import { ApiError } from "@/lib/errors";
import type { Profile } from "@/lib/types";
import { adminClient } from "@/lib/supabase/admin";
import {
  requestGeography,
  type RequestGeography,
} from "@/lib/geo";

export interface AuthContext {
  supabase: SupabaseClient;
  user: User;
  profile: Profile | null;
  accessToken: string;
  geography: RequestGeography;
}

function bearerToken(request: Request) {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

export async function authenticate(
  request: Request,
  options: { requireProfile?: boolean } = {},
): Promise<AuthContext> {
  const accessToken = bearerToken(request);
  if (!accessToken) throw ApiError.unauthenticated();

  const supabase = adminClient();
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) throw ApiError.unauthenticated();

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", data.user.id)
    .maybeSingle<Profile>();

  if (profileError) {
    throw new Error("Unable to load caller profile.");
  }

  if (!profile && options.requireProfile !== false) {
    throw ApiError.unauthenticated();
  }

  return {
    supabase,
    user: data.user,
    profile: profile ?? null,
    accessToken,
    geography: requestGeography(request),
  };
}

export function requireActiveProfile(auth: AuthContext): Profile {
  if (!auth.profile) throw ApiError.unauthenticated();
  if (!auth.profile.is_active) throw ApiError.accessDenied();
  return auth.profile;
}

export function requireFirmAdmin(auth: AuthContext): Profile {
  const profile = requireActiveProfile(auth);
  if (profile.role !== "firm_admin") throw ApiError.forbidden();
  return profile;
}
