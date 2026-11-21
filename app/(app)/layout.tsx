import { AppShell } from "@/components/app-shell";
import { requireServerProfile } from "@/lib/auth/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireServerProfile();
  const supabase = await createServerSupabaseClient();
  const [incoming, firm] = await Promise.all([
    supabase.from("transfers").select("id", { count: "exact", head: true })
      .eq("to_firm_id", profile.firm_id).eq("status", "sent")
      .contains("recipient_user_ids", [profile.id]),
    supabase.from("firms").select("name").eq("id", profile.firm_id).single(),
  ]);
  if (incoming.error || firm.error || !firm.data) {
    throw new Error("Unable to load the workspace.");
  }

  return (
    <AppShell
      user={profile}
      firmName={firm.data.name}
      incomingCount={incoming.count ?? 0}
    >
      {children}
    </AppShell>
  );
}
