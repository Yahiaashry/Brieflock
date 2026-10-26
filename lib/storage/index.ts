import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

export const CASE_DOCUMENTS_BUCKET = "case-documents";

export function storagePath(input: {
  firmId: string;
  caseId: string;
  documentId: string;
  filename: string;
}) {
  return `${input.firmId}/${input.caseId}/${input.documentId}/${input.filename}`;
}

function boundedTtl(seconds = env().SIGNED_URL_TTL_SECONDS) {
  return Math.max(1, Math.min(60, Math.floor(seconds)));
}

export async function createReadUrl(
  supabase: SupabaseClient,
  input: {
    storagePath: string;
    disposition: "view" | "download";
    filename: string;
    ttlSeconds?: number;
  },
) {
  const ttl = boundedTtl(input.ttlSeconds);
  const { data, error } = await supabase.storage
    .from(CASE_DOCUMENTS_BUCKET)
    .createSignedUrl(
      input.storagePath,
      ttl,
      input.disposition === "download"
        ? { download: input.filename }
        : undefined,
    );

  if (error || !data?.signedUrl) {
    throw new Error("Unable to issue a document URL.");
  }

  return {
    signedUrl: data.signedUrl,
    expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    ttlSeconds: ttl,
  };
}

export async function createUploadUrl(
  supabase: SupabaseClient,
  path: string,
) {
  const { data, error } = await supabase.storage
    .from(CASE_DOCUMENTS_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data?.signedUrl) {
    throw new Error("Unable to issue an upload URL.");
  }

  return {
    method: "PUT" as const,
    url: data.signedUrl,
    headers: { "content-type": "application/pdf" },
    expires_in: 300,
  };
}

export async function downloadObject(
  supabase: SupabaseClient,
  path: string,
) {
  const { data, error } = await supabase.storage
    .from(CASE_DOCUMENTS_BUCKET)
    .download(path);

  if (error || !data) {
    throw new Error("Unable to read the uploaded object.");
  }

  return Buffer.from(await data.arrayBuffer());
}

export async function deleteObject(
  supabase: SupabaseClient,
  path: string,
) {
  const { error } = await supabase.storage
    .from(CASE_DOCUMENTS_BUCKET)
    .remove([path]);
  if (error) throw new Error("Unable to delete the storage object.");
}
