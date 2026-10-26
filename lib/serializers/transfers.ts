import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CaseRecord,
  DocumentRecord,
  Firm,
  Profile,
  Transfer,
  TransferWithMeta,
} from "@/lib/types";

interface TransferItemRow {
  transfer_id: string;
  document_id: string;
  document: DocumentRecord | null;
}

export async function serializeTransfers(
  supabase: SupabaseClient,
  transfers: Transfer[],
): Promise<TransferWithMeta[]> {
  if (transfers.length === 0) return [];

  const caseIds = [...new Set(transfers.map((transfer) => transfer.case_id))];
  const firmIds = [
    ...new Set(
      transfers.flatMap((transfer) => [
        transfer.from_firm_id,
        transfer.to_firm_id,
      ]),
    ),
  ];
  const transferIds = transfers.map((transfer) => transfer.id);
  const recipientIds = [
    ...new Set(transfers.flatMap((transfer) => transfer.recipient_user_ids)),
  ];
  const creatorIds = [...new Set(transfers.map((transfer) => transfer.created_by))];
  const profileIds = [...new Set([...recipientIds, ...creatorIds])];

  const [casesResult, firmsResult, itemsResult, profilesResult] =
    await Promise.all([
      supabase.from("cases").select("*").in("id", caseIds),
      supabase.from("firms").select("*").in("id", firmIds),
      supabase
        .from("transfer_items")
        .select("transfer_id, document_id, document:documents(*)")
        .in("transfer_id", transferIds),
      profileIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : supabase.from("profiles").select("*").in("id", profileIds),
    ]);

  if (casesResult.error || firmsResult.error || itemsResult.error) {
    throw new Error("Unable to load transfer details.");
  }
  if (profilesResult.error) {
    throw new Error("Unable to load transfer profiles.");
  }

  const cases = new Map(
    ((casesResult.data ?? []) as CaseRecord[]).map((item) => [item.id, item]),
  );
  const firms = new Map(
    ((firmsResult.data ?? []) as Firm[]).map((item) => [item.id, item]),
  );
  const profiles = new Map(
    ((profilesResult.data ?? []) as Profile[]).map((item) => [item.id, item]),
  );

  const itemsByTransfer = new Map<string, DocumentRecord[]>();
  for (const item of (itemsResult.data ?? []) as unknown as TransferItemRow[]) {
    if (!item.document) continue;
    const list = itemsByTransfer.get(item.transfer_id) ?? [];
    list.push(item.document);
    itemsByTransfer.set(item.transfer_id, list);
  }

  return transfers.map((transfer) => {
    const caseRecord = cases.get(transfer.case_id);
    const fromFirm = firms.get(transfer.from_firm_id);
    const toFirm = firms.get(transfer.to_firm_id);
    const transferRecipients = transfer.recipient_user_ids
      .map((id) => profiles.get(id))
      .filter((profile): profile is Profile => Boolean(profile));

    return {
      ...transfer,
      case_title: caseRecord?.title ?? "Unknown case",
      case_reference: caseRecord?.case_reference ?? "",
      from_firm_name: fromFirm?.name ?? "Unknown firm",
      to_firm_name: toFirm?.name ?? "Unknown firm",
      created_by_name: profiles.get(transfer.created_by)?.full_name ?? "Unknown member",
      from_firm: fromFirm ?? null,
      to_firm: toFirm ?? null,
      items: itemsByTransfer.get(transfer.id) ?? [],
      recipients: transferRecipients,
    } as TransferWithMeta;
  });
}