"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Send, ShieldX, Undo2, X } from "lucide-react";
import type { Profile, TransferWithMeta } from "@/lib/types";
import { transitionTransferAction } from "@/app/(app)/transfers/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

type ActionKey = "send" | "cancel" | "revoke" | "accept" | "reject";

const actionCopy: Record<
  ActionKey,
  { title: string; description: string; confirmLabel: string; destructive: boolean }
> = {
  send: {
    title: "Send this transfer?",
    description:
      "Designated recipients will be notified. Access starts only after a recipient accepts.",
    confirmLabel: "Send transfer",
    destructive: false,
  },
  cancel: {
    title: "Withdraw this transfer?",
    description:
      "Recipients will no longer be able to accept it. This cannot be undone.",
    confirmLabel: "Cancel transfer",
    destructive: true,
  },
  revoke: {
    title: "Revoke this transfer's access?",
    description:
      "External membership created by this transfer is severed immediately for recipients without another accepted transfer. Audit history is retained.",
    confirmLabel: "Revoke access",
    destructive: true,
  },
  accept: {
    title: "Accept this transfer?",
    description:
      "Accepting adds you as an external member of this case. Only documents matching your exact clearance become visible.",
    confirmLabel: "Accept transfer",
    destructive: false,
  },
  reject: {
    title: "Reject this transfer?",
    description:
      "The sending firm is notified and no document access is granted. This cannot be undone.",
    confirmLabel: "Reject transfer",
    destructive: true,
  },
};

export function TransferActions({
  transfer,
  user,
}: {
  transfer: TransferWithMeta;
  user: Profile;
}) {
  const [action, setAction] = React.useState<ActionKey | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  const outgoing = transfer.from_firm_id === user.firm_id;
  const incoming = transfer.to_firm_id === user.firm_id;
  const designated = transfer.recipient_user_ids.includes(user.id);
  const isAdmin = user.role === "firm_admin";

  const canSend = outgoing && transfer.status === "draft";
  const canCancel = outgoing && transfer.status === "sent";
  const canRevoke = outgoing && transfer.status === "accepted" && isAdmin;
  const canRespond = incoming && designated && transfer.status === "sent";

  async function run() {
    if (!action) return;
    const result = await transitionTransferAction(transfer.id, action);
    if (!result.ok) {
      toast({
        title: "Action failed",
        description: result.error ?? "The transfer could not be updated.",
        variant: "error",
      });
      return;
    }
    const messages: Record<ActionKey, string> = {
      send: "Transfer sent",
      cancel: "Transfer withdrawn",
      revoke: "Access revoked",
      accept: "Transfer accepted",
      reject: "Transfer rejected",
    };
    toast({
      title: messages[action],
      description: "The change is recorded in the audit trail.",
      variant: action === "reject" ? "default" : "success",
    });
    setAction(null);
    router.refresh();
  }

  if (!canSend && !canCancel && !canRevoke && !canRespond) {
    if (incoming && designated && transfer.status === "sent") {
      return (
        <p className="text-[11px] text-slate-400">
          Only designated recipients can respond.
        </p>
      );
    }
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canRespond && (
        <>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAction("reject")}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Reject
          </Button>
          <Button size="sm" onClick={() => setAction("accept")}>
            <Check className="h-3.5 w-3.5" aria-hidden />
            Accept transfer
          </Button>
        </>
      )}
      {canSend && (
        <Button size="sm" onClick={() => setAction("send")}>
          <Send className="h-3.5 w-3.5" aria-hidden />
          Send transfer
        </Button>
      )}
      {canCancel && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setAction("cancel")}
        >
          <Undo2 className="h-3.5 w-3.5" aria-hidden />
          Withdraw
        </Button>
      )}
      {canRevoke && (
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setAction("revoke")}
        >
          <ShieldX className="h-3.5 w-3.5" aria-hidden />
          Revoke access
        </Button>
      )}

      <ConfirmDialog
        open={action !== null}
        onOpenChange={(open) => {
          if (!open) setAction(null);
        }}
        title={action ? actionCopy[action].title : ""}
        description={action ? actionCopy[action].description : ""}
        confirmLabel={action ? actionCopy[action].confirmLabel : "Confirm"}
        destructive={action ? actionCopy[action].destructive : false}
        onConfirm={run}
      />
    </div>
  );
}
