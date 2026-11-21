import { authenticate, requireActiveProfile } from "@/lib/auth";
import { after } from "next/server";
import { processWorkspaceNotices } from "@/lib/email/outbox";
import { emailIsConfigured } from "@/lib/email/transactional";
import { ApiError, apiRoute, jsonResponse } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/ratelimit";
import { serializeTransfers } from "@/lib/serializers/transfers";
import type { Transfer } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(["send", "accept", "reject", "cancel", "revoke"]);

export async function POST(
  request: Request,
  context: { params: Promise<{ transferId: string; action: string }> },
) {
  return apiRoute(request, async () => {
    const { transferId, action } = await context.params;
    if (!UUID_RE.test(transferId) || !ACTIONS.has(action)) throw ApiError.notFound();

    const auth = await authenticate(request);
    const profile = requireActiveProfile(auth);
    enforceRateLimit(`user:${profile.id}`, "standard");

    const { data: updated, error } = await auth.supabase
      .rpc("apply_transfer_action", {
        transfer_key: transferId,
        actor_key: profile.id,
        requested_action: action,
        audit_context: auth.geography,
      })
      .single<Transfer>();

    if (error?.code === "PT404") throw ApiError.notFound();
    if (error?.code === "PT403") throw ApiError.forbidden();
    if (error?.code === "PT422") throw ApiError.caseArchived();
    if (error?.code === "PT409") throw ApiError.conflict(error.message);
    if (error?.code === "23514") throw ApiError.conflict();
    if (error || !updated) throw new Error("Unable to update the transfer.");
    if (action !== "cancel" && emailIsConfigured()) {
      after(async () => {
        try {
          await processWorkspaceNotices();
        } catch {
          console.error("Transfer notifications will be retried.");
        }
      });
    }

    const [serialized] = await serializeTransfers(auth.supabase, [updated]);
    return jsonResponse(serialized, request);
  });
}
