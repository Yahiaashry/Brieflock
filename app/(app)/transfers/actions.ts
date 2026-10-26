"use server";

import { revalidatePath } from "next/cache";
import { serverApi, ApiClientError } from "@/lib/api/server";
import type { TransferWithMeta } from "@/lib/types";

export interface TransferActionResult {
  ok: boolean;
  error?: string;
  id?: string;
}

function failure(error: unknown): TransferActionResult {
  return {
    ok: false,
    error:
      error instanceof ApiClientError
        ? error.message
        : "The request could not be completed.",
  };
}

export async function createTransferAction(input: {
  case_id: string;
  to_firm_id: string;
  recipient_user_ids: string[];
  document_ids: string[];
  message: string | null;
}): Promise<TransferActionResult> {
  try {
    const transfer = await serverApi<TransferWithMeta>("/transfers", {
      method: "POST",
      body: JSON.stringify(input),
    });
    revalidatePath("/transfers");
    revalidatePath(`/cases/${input.case_id}`);
    return { ok: true, id: transfer.id };
  } catch (error) {
    return failure(error);
  }
}

export async function updateTransferAction(
  transferId: string,
  patch: {
    recipient_user_ids?: string[];
    document_ids?: string[];
    message?: string | null;
  },
): Promise<TransferActionResult> {
  try {
    const transfer = await serverApi<TransferWithMeta>(
      `/transfers/${transferId}`,
      { method: "PATCH", body: JSON.stringify(patch) },
    );
    revalidatePath("/transfers");
    revalidatePath(`/transfers/${transferId}`);
    return { ok: true, id: transfer.id };
  } catch (error) {
    return failure(error);
  }
}

export async function transitionTransferAction(
  transferId: string,
  transition: "send" | "accept" | "reject" | "cancel" | "revoke",
): Promise<TransferActionResult> {
  try {
    const transfer = await serverApi<TransferWithMeta>(
      `/transfers/${transferId}/${transition}`,
      { method: "POST" },
    );
    revalidatePath("/transfers");
    revalidatePath(`/transfers/${transferId}`);
    revalidatePath("/cases");
    revalidatePath(`/cases/${transfer.case_id}`);
    return { ok: true, id: transfer.id };
  } catch (error) {
    return failure(error);
  }
}