import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/lib/types";

export async function loadWorkspaceCounts(supabase: SupabaseClient, profile: Profile) {
  const { data, error } = await supabase.rpc("workspace_counts", {
    actor_key: profile.id,
  }).single<{
    open_cases: number;
    visible_documents: number;
    pending_scans: number;
    incoming_transfers: number;
  }>();

  if (error || !data) throw new Error("Unable to load workspace counters.");
  return {
    openCases: data.open_cases,
    visibleDocuments: data.visible_documents,
    pendingScans: data.pending_scans,
    incomingTransfers: data.incoming_transfers,
  };
}
