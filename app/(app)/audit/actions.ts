"use server";

import { headers } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface AuditExportResult {
  ok: boolean;
  content?: string;
  filename?: string;
  error?: string;
}

export async function exportAuditAction(
  from?: string,
  to?: string,
): Promise<AuditExportResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { ok: false, error: "Your session has expired. Sign in again." };
  }

  const params = new URLSearchParams();
  if (from) {
    params.set("from", new Date(`${from}T00:00:00.000Z`).toISOString());
  }
  if (to) {
    params.set("to", new Date(`${to}T23:59:59.999Z`).toISOString());
  }

  const incoming = await headers();
  const protocol = incoming.get("x-forwarded-proto") ?? "http";
  const host = incoming.get("host") ?? "localhost:3000";
  const response = await fetch(
    `${protocol}://${host}/api/v1/audit/export?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    },
  );

  const text = await response.text();
  if (!response.ok) {
    let message = "The audit export could not be created.";
    try {
      message = JSON.parse(text)?.error?.message ?? message;
    } catch {
      // Keep the generic error for non-JSON failures.
    }
    return { ok: false, error: message };
  }

  const disposition = response.headers.get("content-disposition") ?? "";
  const filename =
    disposition.match(/filename="([^"]+)"/)?.[1] ??
    `brieflock-audit-${new Date().toISOString().slice(0, 10)}.ndjson`;

  return { ok: true, content: text, filename };
}
