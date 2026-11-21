"use server";

import { revalidatePath } from "next/cache";
import { serverApi, ApiClientError } from "@/lib/api/server";
import type {
  CaseWithMeta,
  DocumentRecord,
  SecurityLevel,
} from "@/lib/types";

export interface ActionResult {
  ok: boolean;
  error?: string;
  id?: string;
  scanStatus?: DocumentRecord["scan_status"];
  retryable?: boolean;
  upload?: {
    method: "PUT";
    url: string;
    headers: Record<string, string>;
    expires_in: number;
  };
}

function failure(error: unknown): ActionResult {
  return {
    ok: false,
    error:
      error instanceof ApiClientError
        ? error.message
        : "The request could not be completed.",
  };
}

export async function createCaseAction(input: {
  title: string;
  case_reference: string;
  default_security_level: SecurityLevel;
  retention_days: number | null;
}): Promise<ActionResult> {
  try {
    const created = await serverApi<CaseWithMeta>("/cases", {
      method: "POST",
      body: JSON.stringify(input),
    });
    revalidatePath("/cases");
    return { ok: true, id: created.id };
  } catch (error) {
    return failure(error);
  }
}

export async function updateCaseFlagsAction(
  caseId: string,
  patch: Partial<{
    status: "open" | "closed" | "archived";
    allow_l3_download: boolean;
    legal_hold: boolean;
    default_security_level: SecurityLevel;
    title: string;
    case_reference: string;
    retention_days: number | null;
  }>,
): Promise<ActionResult> {
  try {
    await serverApi<CaseWithMeta>(`/cases/${caseId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    revalidatePath(`/cases/${caseId}`);
    revalidatePath("/cases");
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function createDocumentAction(input: {
  case_id: string;
  filename: string;
  size_bytes: number;
  security_level: SecurityLevel;
  description: string | null;
}): Promise<ActionResult> {
  try {
    const created = await serverApi<{
      document: DocumentRecord;
      upload: {
        method: "PUT";
        url: string;
        headers: Record<string, string>;
        expires_in: number;
      };
    }>(`/cases/${input.case_id}/documents/upload-intent`, {
      method: "POST",
      body: JSON.stringify({
        filename: input.filename,
        size_bytes: input.size_bytes,
        security_level: input.security_level,
        description: input.description,
      }),
    });
    return { ok: true, id: created.document.id, upload: created.upload };
  } catch (error) {
    return failure(error);
  }
}

export async function completeUploadAction(
  documentId: string,
): Promise<ActionResult> {
  try {
    const completed = await serverApi<DocumentRecord>(
      `/documents/${documentId}/complete`,
      { method: "POST" },
    );
    revalidatePath(`/cases/${completed.case_id}`);
    revalidatePath("/cases");
    return { ok: true, id: completed.id, scanStatus: completed.scan_status };
  } catch (error) {
    return {
      ...failure(error),
      retryable: !(error instanceof ApiClientError) || error.status >= 500 || error.status === 429,
    };
  }
}

export async function changeLevelAction(
  documentId: string,
  securityLevel: SecurityLevel,
  reason?: string,
): Promise<ActionResult> {
  try {
    const updated = await serverApi<DocumentRecord>(
      `/documents/${documentId}/level`,
      {
        method: "PATCH",
        body: JSON.stringify({
          security_level: securityLevel,
          ...(reason ? { reason } : {}),
        }),
      },
    );
    revalidatePath(`/cases/${updated.case_id}`);
    revalidatePath(`/cases/${updated.case_id}/documents/${documentId}`);
    revalidatePath("/cases");
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function addCaseMemberAction(
  caseId: string,
  userId: string,
  role: "lead" | "member",
): Promise<ActionResult> {
  try {
    await serverApi(`/cases/${caseId}/members`, {
      method: "POST",
      body: JSON.stringify({ user_id: userId, role }),
    });
    revalidatePath(`/cases/${caseId}`);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function updateCaseMemberRoleAction(
  caseId: string,
  userId: string,
  role: "lead" | "member",
): Promise<ActionResult> {
  try {
    await serverApi(`/cases/${caseId}/members/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
    revalidatePath(`/cases/${caseId}`);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function removeCaseMemberAction(
  caseId: string,
  userId: string,
): Promise<ActionResult> {
  try {
    await serverApi(`/cases/${caseId}/members/${userId}`, {
      method: "DELETE",
    });
    revalidatePath(`/cases/${caseId}`);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
