import { authenticate, requireActiveProfile } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import {
  ApiError,
  apiRoute,
  correlationId,
} from "@/lib/errors";
import { enforceRateLimit } from "@/lib/ratelimit";
import type { AuditEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;
const EXPORT_LIMIT = 10_000;
const PAGE_SIZE = 500;

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    const auth = await authenticate(request);
    const profile = requireActiveProfile(auth);
    if (profile.role !== "security") throw ApiError.forbidden();
    enforceRateLimit(`user:${profile.id}`, "standard");

    const params = new URL(request.url).searchParams;
    const to = params.get("to")
      ? new Date(params.get("to")!)
      : new Date();
    const from = params.get("from")
      ? new Date(params.get("from")!)
      : new Date(to.getTime() - DAY_MS);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw ApiError.validation("from and to must be valid timestamps.");
    }
    if (from > to) throw ApiError.validation("from must be before to.");
    if (to.getTime() - from.getTime() > 90 * DAY_MS) {
      throw ApiError.validation("Audit exports are limited to 90 days.");
    }

    const events: AuditEvent[] = [];
    let before: number | undefined;

    while (events.length <= EXPORT_LIMIT) {
      let query = auth.supabase
        .from("audit_events")
        .select("*")
        .eq("firm_id", profile.firm_id)
        .gte("occurred_at", from.toISOString())
        .lte("occurred_at", to.toISOString())
        .order("chain_seq", { ascending: false })
        .limit(PAGE_SIZE);
      if (before !== undefined) query = query.lt("chain_seq", before);
      const { data, error } = await query.returns<AuditEvent[]>();
      if (error) throw new Error("Unable to export audit events.");
      if (!data?.length) break;
      events.push(...data);
      if (data.length < PAGE_SIZE) break;
      before = data[data.length - 1].chain_seq;
    }

    if (events.length > EXPORT_LIMIT) {
      throw ApiError.validation("This export exceeds 10,000 events. Choose a shorter date range.");
    }

    await writeAudit(
      auth.supabase,
      {
        actorUserId: profile.id,
        firmId: profile.firm_id,
        action: "firm.updated",
        result: "info",
        details: {
          type: "audit_export",
          from: from.toISOString(),
          to: to.toISOString(),
          count: events.length,
        },
      },
      auth.geography,
    );

    const body = events
      .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))
      .map((event) => JSON.stringify(event))
      .join("\n");

    return new Response(body ? `${body}\n` : "", {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson",
        "Content-Disposition": `attachment; filename="brieflock-audit-${from.toISOString().slice(0, 10)}.ndjson"`,
        "Cache-Control": "private, no-store",
        "X-Request-Id": correlationId(request),
      },
    });
  });
}
