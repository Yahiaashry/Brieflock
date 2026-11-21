import { appOrigin } from "@/lib/app-origin";
import { adminClient } from "@/lib/supabase/admin";
import { emailIsConfigured, sendTransactionalEmail } from "@/lib/email/transactional";
import { z } from "zod";

const noticesSchema = z.array(z.object({
  id: z.string().uuid(),
  topic: z.enum(["sent", "accepted", "rejected", "revoked", "denials"]),
  reference_id: z.string().uuid(),
  attempts: z.number(),
  email: z.string().nullable(),
}));

const subjects = {
  sent: "A new BriefLock transfer is ready for review",
  accepted: "Your BriefLock transfer was accepted",
  rejected: "Your BriefLock transfer was rejected",
  revoked: "Access to a BriefLock transfer was revoked",
  denials: "Repeated document access denials in BriefLock",
} satisfies Record<z.infer<typeof noticesSchema>[number]["topic"], string>;

export async function processWorkspaceNotices() {
  if (!emailIsConfigured()) return { delivered: 0, failed: 0 };
  const supabase = adminClient();
  const { data, error } = await supabase.rpc("claim_workspace_notices");
  if (error) throw new Error("Unable to claim notifications.");
  const notices = noticesSchema.parse(data);

  const outcomes = await Promise.allSettled(notices.map(async (notice) => {
    if (notice.email) {
      const path = notice.topic === "denials" ? "/audit" : `/transfers/${notice.reference_id}`;
      const delivery = await sendTransactionalEmail({
        to: notice.email,
        subject: subjects[notice.topic],
        text: `Sign in to BriefLock for details: ${new URL(path, appOrigin()).toString()}`,
        idempotencyKey: `workspace-notice/${notice.id}`,
      });
      if (delivery !== "sent") throw new Error("Email delivery did not complete.");
    }

    const { error: updateError } = await supabase.from("workspace_notifications")
      .update({ delivered_at: new Date().toISOString() })
      .eq("id", notice.id)
      .eq("attempts", notice.attempts);
    if (updateError) throw new Error("Could not acknowledge delivered notification.");
  }));

  const failed = outcomes.filter((outcome) => outcome.status === "rejected").length;
  return { delivered: outcomes.length - failed, failed };
}
