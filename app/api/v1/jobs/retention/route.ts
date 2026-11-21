import { apiRoute, jsonResponse } from "@/lib/errors";
import { z } from "zod";
import { requireCronSecret } from "@/lib/jobs/auth";
import { deleteObject } from "@/lib/storage";
import { adminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    requireCronSecret(request);
    const supabase = adminClient();
    const { data, error } = await supabase.rpc("list_document_purge_candidates");
    if (error) throw new Error("Unable to load retention candidates.");
    const candidates = z.array(z.object({ id: z.string().uuid() })).parse(data);
    const batch = process.env.BRIEFLOCK_RUNTIME === "cloudflare"
      ? candidates.slice(0, 10)
      : candidates;

    let purged = 0;
    let skipped = 0;
    let failed = 0;
    for (const document of batch) {
      try {
        const { data: path, error: claimError } = await supabase.rpc(
          "claim_document_purge", { document_key: document.id },
        );
        if (claimError) throw new Error("Unable to claim retention candidate.");
        if (path === null) {
          skipped++;
          continue;
        }
        if (typeof path !== "string") throw new Error("Invalid storage path.");

        await deleteObject(supabase, path);
        const { data: finished, error: finalizeError } = await supabase.rpc(
          "finish_document_purge", { document_key: document.id },
        );
        if (finalizeError) throw new Error("Unable to finalize the retention purge.");
        if (finished === true) purged++;
      } catch {
        failed++;
        console.error("Retention purge will be retried", { documentId: document.id });
      }
    }

    return jsonResponse({
      status: failed === 0 ? "ok" : "partial",
      purged, skipped, failed,
      time: new Date().toISOString(),
    }, request, { status: failed ? 500 : 200 });
  });
}

export const POST = GET;
