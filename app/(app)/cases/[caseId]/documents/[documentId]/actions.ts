"use server";

import { serverApi, ApiClientError } from "@/lib/api/server";

interface ContentAuthorization {
  signed_url: string;
}

export async function requestDownloadAction(
  documentId: string,
): Promise<{ ok: true; url: string } | { ok: false; code: string }> {
  try {
    const result = await serverApi<ContentAuthorization>(
      `/documents/${documentId}/content?disposition=download`,
    );
    return { ok: true, url: result.signed_url };
  } catch (error) {
    return {
      ok: false,
      code: error instanceof ApiClientError ? error.code : "INTERNAL",
    };
  }
}