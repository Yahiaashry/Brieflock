import { authenticate, requireActiveProfile } from "@/lib/auth";
import { apiRoute, jsonResponse } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/ratelimit";
import type { Firm, Profile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    const auth = await authenticate(request);
    const profile = requireActiveProfile(auth);
    enforceRateLimit(`user:${profile.id}`, "standard");

    const { data: firms, error } = await auth.supabase
      .from("firms")
      .select("*")
      .neq("id", profile.firm_id)
      .is("deactivated_at", null)
      .order("name", { ascending: true })
      .limit(50)
      .returns<Firm[]>();

    if (error) throw new Error("Unable to load the firm directory.");

    const firmIds = (firms ?? []).map((firm) => firm.id);
    const { data: members, error: membersError } =
      firmIds.length === 0
        ? { data: [], error: null }
        : await auth.supabase
            .from("profiles")
            .select("id, firm_id, full_name")
            .in("firm_id", firmIds)
            .eq("is_active", true)
            .order("full_name", { ascending: true });

    if (membersError) throw new Error("Unable to load directory members.");

    const membersByFirm = new Map<
      string,
      Pick<Profile, "id" | "full_name">[]
    >();
    for (const member of (members ?? []) as Pick<
      Profile,
      "id" | "firm_id" | "full_name"
    >[]) {
      const list = membersByFirm.get(member.firm_id) ?? [];
      list.push({ id: member.id, full_name: member.full_name });
      membersByFirm.set(member.firm_id, list);
    }

    return jsonResponse(
      {
        data: (firms ?? []).map((firm) => ({
          id: firm.id,
          name: firm.name,
          members: membersByFirm.get(firm.id) ?? [],
        })),
      },
      request,
    );
  });
}