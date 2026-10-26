import { adminClient } from "@/lib/supabase/admin";
import { jsonResponse } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const time = new Date().toISOString();

  try {
    const { error } = await adminClient()
      .from("firms")
      .select("id", { count: "exact", head: true })
      .limit(1);

    if (error) {
      return jsonResponse(
        { status: "error", db: "unreachable", time },
        request,
        { status: 503 },
      );
    }

    return jsonResponse({ status: "ok", db: "ok", time }, request);
  } catch {
    return jsonResponse(
      { status: "error", db: "unreachable", time },
      request,
      { status: 503 },
    );
  }
}
