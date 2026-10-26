import { authenticate, requireActiveProfile } from "@/lib/auth";
import { apiRoute, jsonResponse } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/ratelimit";
import type { Profile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    const auth = await authenticate(request);
    const profile = requireActiveProfile(auth);
    enforceRateLimit(`user:${profile.id}`, "standard");

    const { data, error } = await auth.supabase
      .from("profiles")
      .select("*")
      .eq("firm_id", profile.firm_id)
      .order("full_name", { ascending: true })
      .returns<Profile[]>();

    if (error) throw new Error("Unable to load firm members.");

    const isAdmin = profile.role === "firm_admin";
    return jsonResponse(
      {
        data: (data ?? []).map((member) =>
          isAdmin
            ? member
            : {
                id: member.id,
                full_name: member.full_name,
                role: member.role,
              },
        ),
        page: { next_cursor: null },
      },
      request,
    );
  });
}
