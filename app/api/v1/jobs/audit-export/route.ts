import { z } from "zod";
import { apiRoute, jsonResponse } from "@/lib/errors";
import { requireCronSecret } from "@/lib/jobs/auth";
import { adminClient } from "@/lib/supabase/admin";
import type { AuditEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BATCHES = process.env.BRIEFLOCK_RUNTIME === "cloudflare" ? 6 : 20;
const batchSchema = z.object({
  after_seq: z.int().min(0),
  through_seq: z.int().positive(),
  row_count: z.int().min(1).max(500),
});

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    requireCronSecret(request);
    const supabase = adminClient();
    let archived = 0;

    for (let batchNumber = 0; batchNumber < MAX_BATCHES; batchNumber++) {
      const { data, error } = await supabase.rpc("claim_audit_archive_batch").maybeSingle();
      if (error) throw new Error("Unable to claim an audit archive batch.");
      if (data === null) return jsonResponse({ status: "ok", archived, batch_limit_reached: false }, request);

      const batch = batchSchema.parse(data);
      const { data: rows, error: readError } = await supabase
        .from("audit_events")
        .select("*")
        .gt("chain_seq", batch.after_seq)
        .lte("chain_seq", batch.through_seq)
        .order("chain_seq")
        .returns<AuditEvent[]>();
      if (readError || rows?.length !== batch.row_count) {
        throw new Error("Unable to read all events in the audit archive batch.");
      }

      const key = `chain/${rows[0].chain_seq}-${batch.through_seq}.ndjson`;
      const body = Buffer.from(rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
      const archive = supabase.storage.from("brieflock-audit-archive");
      const { error: uploadError } = await archive.upload(key, body, {
        contentType: "application/x-ndjson",
        upsert: false,
      });
      if (uploadError) {
        const { data: existing, error: readBackError } = await archive.download(key);
        if (readBackError || !existing || !body.equals(Buffer.from(await existing.arrayBuffer()))) {
          throw new Error("Unable to store or verify the audit archive batch.");
        }
      }

      const { data: finished, error: finishError } = await supabase.rpc(
        "finish_audit_archive_batch", { batch_end: batch.through_seq },
      );
      if (finishError || finished !== true) throw new Error("Unable to record the audit archive checkpoint.");
      archived += rows.length;
    }

    return jsonResponse({ status: "ok", archived, batch_limit_reached: true }, request);
  });
}

export const POST = GET;
