import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/lib/types";

interface TransferItemRow {
  document_id: string;
}

interface TransferRow {
  id: string;
  transfer_items: TransferItemRow[];
}

export async function acceptedTransferDocumentIds(
  supabase: SupabaseClient,
  profile: Profile,
  caseId: string,
) {
  const { data, error } = await supabase
    .from("transfers")
    .select("id, transfer_items(document_id)")
    .eq("case_id", caseId)
    .eq("status", "accepted")
    .contains("recipient_user_ids", [profile.id]);

  if (error) throw new Error("Unable to resolve accepted transfers.");

  return new Set(
    ((data ?? []) as TransferRow[]).flatMap((transfer) =>
      transfer.transfer_items.map((item) => item.document_id),
    ),
  );
}
