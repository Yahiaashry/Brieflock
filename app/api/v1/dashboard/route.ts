import { authenticate, requireActiveProfile } from "@/lib/auth";
import { apiRoute, jsonResponse } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    const auth = await authenticate(request);
    const profile = requireActiveProfile(auth);
    enforceRateLimit(`user:${profile.id}`, "standard");

    const [memberships, transfers] = await Promise.all([
      auth.supabase
        .from("case_members")
        .select("case_id")
        .eq("user_id", profile.id),
      auth.supabase
        .from("transfers")
        .select("id")
        .eq("to_firm_id", profile.firm_id)
        .eq("status", "sent")
        .contains("recipient_user_ids", [profile.id]),
    ]);

    if (memberships.error || transfers.error) {
      throw new Error("Unable to load dashboard counters.");
    }

    const caseIds = (memberships.data ?? []).map((row) => row.case_id);
    const openCases = caseIds.length
      ? await auth.supabase
          .from("cases")
          .select("id", { count: "exact", head: true })
          .in("id", caseIds)
          .eq("status", "open")
      : { count: 0, error: null };

    if (openCases.error) throw new Error("Unable to load dashboard cases.");

    const documents = await auth.supabase
      .from("documents")
      .select("id, security_level, scan_status")
      .eq("firm_id", profile.firm_id)
      .eq("superseded", false);

    if (documents.error) throw new Error("Unable to load dashboard documents.");

    const visibleDocuments = (documents.data ?? []).filter(
      (document) =>
        profile.role === "firm_admin" ||
        document.security_level === profile.clearance_level,
    );

    return jsonResponse(
      {
        openCases: openCases.count ?? 0,
        visibleDocuments: visibleDocuments.length,
        pendingScans: visibleDocuments.filter(
          (document) => document.scan_status === "pending",
        ).length,
        incomingTransfers: (transfers.data ?? []).length,
      },
      request,
    );
  });
}
