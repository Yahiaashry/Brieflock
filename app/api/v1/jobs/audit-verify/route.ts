import { verifyAuditChain } from "@/lib/audit";
import { apiRoute, jsonResponse } from "@/lib/errors";
import { requireCronSecret } from "@/lib/jobs/auth";
import { adminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    requireCronSecret(request);

    const result = await verifyAuditChain(adminClient());
    return jsonResponse(
      {
        status: result.ok ? "ok" : "failed",
        checked: result.checked,
        first_failure: result.first_failure,
        time: new Date().toISOString(),
      },
      request,
      { status: result.ok ? 200 : 500 },
    );
  });
}

export async function POST(request: Request) {
  return GET(request);
}
