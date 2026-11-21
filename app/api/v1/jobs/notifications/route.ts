import { processWorkspaceNotices } from "@/lib/email/outbox";
import { apiRoute, jsonResponse } from "@/lib/errors";
import { requireCronSecret } from "@/lib/jobs/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    requireCronSecret(request);
    const result = await processWorkspaceNotices();
    return jsonResponse(result, request, { status: result.failed ? 500 : 200 });
  });
}
