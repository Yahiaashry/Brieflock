import type { Metadata } from "next";
import { AccessDeniedInterstitial } from "@/components/access-denied-interstitial";
import { MembersView } from "@/components/members/members-view";
import { requireServerProfile } from "@/lib/auth/server";
import { serverApi } from "@/lib/api/server";
import type { CaseWithMeta, Invite, Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage() {
  const { profile } = await requireServerProfile();
  if (profile.role !== "firm_admin") {
    return (
      <AccessDeniedInterstitial
        code="ACCESS_DENIED"
        backHref="/cases"
        backLabel="Back to cases"
      />
    );
  }

  const [membersResult, invitesResult, casesResult] = await Promise.all([
    serverApi<{ data: Profile[] }>("/firms/members"),
    serverApi<{ data: Invite[] }>("/firms/invites"),
    serverApi<{ data: CaseWithMeta[] }>("/cases?scope=firm&limit=100"),
  ]);

  const caseCounts: Record<string, number> = {};
  for (const caseItem of casesResult.data) {
    for (const member of caseItem.members) {
      caseCounts[member.user_id] = (caseCounts[member.user_id] ?? 0) + 1;
    }
  }

  return (
    <MembersView
      members={membersResult.data}
      invites={invitesResult.data}
      caseCounts={caseCounts}
      user={profile}
    />
  );
}