import { writeAudit } from "@/lib/audit";
import { apiRoute, jsonResponse } from "@/lib/errors";
import { requireCronSecret } from "@/lib/jobs/auth";
import { deleteObject } from "@/lib/storage";
import { adminClient } from "@/lib/supabase/admin";
import type { CaseRecord, DocumentRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return apiRoute(request, async () => {
    requireCronSecret(request);
    const supabase = adminClient();

    const { data: documents, error } = await supabase
      .from("documents")
      .select("*")
      .not("retention_marked_at", "is", null)
      .is("purged_at", null)
      .limit(500)
      .returns<DocumentRecord[]>();

    if (error) throw new Error("Unable to load retention candidates.");

    const caseIds = [...new Set((documents ?? []).map((doc) => doc.case_id))];
    const { data: cases, error: casesError } =
      caseIds.length === 0
        ? { data: [], error: null }
        : await supabase
            .from("cases")
            .select("*")
            .in("id", caseIds)
            .returns<CaseRecord[]>();

    if (casesError) throw new Error("Unable to load retention cases.");

    const legalHoldCases = new Set(
      (cases ?? [])
        .filter((caseRecord) => caseRecord.legal_hold)
        .map((caseRecord) => caseRecord.id),
    );

    let purged = 0;
    let skipped = 0;
    const failures: Array<{ document_id: string; error: string }> = [];

    for (const document of documents ?? []) {
      if (legalHoldCases.has(document.case_id)) {
        skipped += 1;
        continue;
      }

      try {
        await deleteObject(supabase, document.storage_path);
        const { error: updateError } = await supabase
          .from("documents")
          .update({
            superseded: true,
            purged_at: new Date().toISOString(),
          })
          .eq("id", document.id);

        if (updateError) throw new Error(updateError.message);

        await writeAudit(
          supabase,
          {
            actorUserId: null,
            firmId: document.firm_id,
            caseId: document.case_id,
            documentId: document.id,
            action: "document.purged",
            result: "info",
            details: {
              reason: "retention",
              retention_marked_at: document.retention_marked_at,
            },
          },
          {
            ipHash: "cron",
            country: null,
            city: null,
            userAgent: "brieflock-retention",
          },
        );

        purged += 1;
      } catch (error) {
        failures.push({
          document_id: document.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return jsonResponse(
      {
        status: failures.length === 0 ? "ok" : "partial",
        purged,
        skipped_legal_hold: skipped,
        failures,
        time: new Date().toISOString(),
      },
      request,
    );
  });
}
