import type { Metadata } from "next";
import { AccessDeniedInterstitial } from "@/components/access-denied-interstitial";
import { AuditView } from "@/components/audit/audit-view";
import { requireServerProfile } from "@/lib/auth/server";
import { serverApi } from "@/lib/api/server";
import type { AuditEvent, CaseRecord, Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditPage() {
  const { profile } = await requireServerProfile();
  if (profile.role !== "security") {
    return (
      <AccessDeniedInterstitial
        code="AUDIT_RESTRICTED"
        backHref="/cases"
        backLabel="Back to cases"
      />
    );
  }

  const eventResult = await serverApi<{
    data: AuditEvent[];
    cases: Pick<CaseRecord, "id" | "title" | "case_reference">[];
  }>("/audit?limit=100");

  const actors = new Map<string, Pick<Profile, "id" | "full_name">>();
  for (const event of eventResult.data) {
    if (event.actor_user_id && !actors.has(event.actor_user_id)) {
      const named = event as AuditEvent & { actor_name?: string | null };
      actors.set(event.actor_user_id, {
        id: event.actor_user_id,
        full_name: named.actor_name ?? "Unknown member",
      });
    }
  }

  return (
    <AuditView
      events={eventResult.data}
      actors={[...actors.values()]}
      cases={eventResult.cases}
    />
  );
}
