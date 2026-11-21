import { authenticate, requireActiveProfile } from "@/lib/auth";
import { apiRoute, jsonResponse } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/ratelimit";
import { loadWorkspaceCounts } from "@/lib/workspace/counts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    const auth = await authenticate(request);
    const profile = requireActiveProfile(auth);
    enforceRateLimit(`user:${profile.id}`, "standard");
    return jsonResponse(await loadWorkspaceCounts(auth.supabase, profile), request);
  });
}
