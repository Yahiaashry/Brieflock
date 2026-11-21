"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2 } from "lucide-react";
import { requestDownloadAction } from "@/app/(app)/cases/[caseId]/documents/[documentId]/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function DownloadDocumentButton({
  documentId,
  filename,
  blocked,
}: {
  documentId: string;
  filename: string;
  blocked: boolean;
}) {
  const [pending, setPending] = React.useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function download() {
    if (blocked) return;
    setPending(true);
    const result = await requestDownloadAction(documentId);
    setPending(false);
    if (!result.ok) {
      toast({
        title:
          result.code === "DOWNLOAD_BLOCKED_L3"
            ? "Downloads are disabled"
            : "Download denied",
        description:
          result.code === "DOWNLOAD_BLOCKED_L3"
            ? "L3 documents in this case are view-only. The attempt was audited."
            : "Your access could not be confirmed. The attempt was audited.",
        variant: "error",
      });
      router.refresh();
      return;
    }
    toast({
      title: "Download started",
      description:
        "The download event was written to the audit log before the URL was issued.",
      variant: "success",
    });
    const anchor = window.document.createElement("a");
    anchor.href = result.url;
    anchor.download = filename;
    anchor.click();
    router.refresh();
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={download}
      disabled={blocked || pending}
      title={
        blocked
          ? "L3 downloads are disabled for this case while it is view-only"
          : "Download the original PDF (audit-logged)"
      }
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      ) : (
        <Download className="h-3.5 w-3.5" aria-hidden />
      )}
      {blocked ? "View-only" : "Download"}
    </Button>
  );
}
