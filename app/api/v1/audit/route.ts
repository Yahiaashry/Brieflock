import { authenticate, requireActiveProfile } from "@/lib/auth";
import { ApiError, apiRoute, jsonResponse } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/ratelimit";
import type { AuditEvent, Profile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    const auth = await authenticate(request);
    const profile = requireActiveProfile(auth);
    if (profile.role !== "security") throw ApiError.forbidden();
    enforceRateLimit(`user:${profile.id}`, "standard");

    const params = new URL(request.url).searchParams;
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(params.get("limit") ?? "50", 10) || 50),
    );

    for (const key of [
      "case_id",
      "document_id",
      "transfer_id",
      "actor_user_id",
    ]) {
      const value = params.get(key);
      if (value && !UUID_RE.test(value)) {
        throw ApiError.validation(`${key} must be a UUID.`);
      }
    }

    const result = params.get("result");
    if (result && !["allow", "deny", "info"].includes(result)) {
      throw ApiError.validation("Invalid result filter.");
    }

    let query = auth.supabase
      .from("audit_events")
      .select("*")
      .eq("firm_id", profile.firm_id)
      .order("occurred_at", { ascending: false })
      .limit(limit);

    for (const key of [
      "case_id",
      "document_id",
      "transfer_id",
      "actor_user_id",
      "action",
      "result",
      "deny_reason",
    ]) {
      const value = params.get(key);
      if (value) query = query.eq(key, value);
    }

    const from = params.get("from");
    const to = params.get("to");
    if (from) query = query.gte("occurred_at", from);
    if (to) query = query.lte("occurred_at", to);

    const { data, error } = await query.returns<AuditEvent[]>();
    if (error) throw new Error("Unable to load audit events.");

    const caseIds = [...new Set((data ?? []).flatMap((event) => event.case_id ? [event.case_id] : []))];
    const { data: cases, error: casesError } = caseIds.length === 0
      ? { data: [], error: null }
      : await auth.supabase.from("cases").select("id, title, case_reference").in("id", caseIds);
    if (casesError) throw new Error("Unable to load audit case labels.");

    const actorIds = [
      ...new Set(
        (data ?? [])
          .map((event) => event.actor_user_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const { data: actors, error: actorsError } =
      actorIds.length === 0
        ? { data: [], error: null }
        : await auth.supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", actorIds);

    if (actorsError) throw new Error("Unable to load audit actors.");

    const actorNames = new Map(
      ((actors ?? []) as Pick<Profile, "id" | "full_name">[]).map((actor) => [
        actor.id,
        actor.full_name,
      ]),
    );

    return jsonResponse(
      {
        data: (data ?? []).map((event) => ({
          ...event,
          actor_name: event.actor_user_id
            ? actorNames.get(event.actor_user_id) ?? null
            : null,
        })),
        cases: cases ?? [],
        page: { next_cursor: null },
      },
      request,
    );
  });
}
