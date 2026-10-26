import type { Metadata } from "next";
import { AccessDeniedInterstitial } from "@/components/access-denied-interstitial";
import { SettingsView } from "@/components/settings/settings-view";
import { requireServerProfile } from "@/lib/auth/server";
import { serverApi } from "@/lib/api/server";
import type { Firm } from "@/lib/types";

export const metadata: Metadata = { title: "Firm settings" };

export default async function SettingsPage() {
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

  const firm = await serverApi<Firm>("/firms/current");
  return <SettingsView firm={firm} user={profile} />;
}