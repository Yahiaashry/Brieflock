"use client";

import * as React from "react";
import { Loader2, RotateCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

type ViewerStatus = "loading" | "ready" | "error";

export function DocumentViewer({
  filename,
  fileUrl,
  level,
  watermark,
  className,
}: {
  filename: string;
  fileUrl: string;
  level: 1 | 2 | 3;
  watermark: { required: boolean; name: string; issued: string };
  className?: string;
}) {
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const bufferRef = React.useRef<ArrayBuffer | null>(null);
  const readyRef = React.useRef(false);
  const sentRef = React.useRef(false);
  const [status, setStatus] = React.useState<ViewerStatus>("loading");
  const [attempt, setAttempt] = React.useState(0);

  const { required, name, issued } = watermark;

  React.useEffect(() => {
    let cancelled = false;
    readyRef.current = false;
    sentRef.current = false;
    bufferRef.current = null;
    setStatus("loading");

    function send() {
      if (
        !readyRef.current ||
        !bufferRef.current ||
        sentRef.current ||
        !iframeRef.current?.contentWindow
      ) {
        return;
      }
      sentRef.current = true;
      iframeRef.current.contentWindow.postMessage(
        {
          type: "brieflock:open",
          data: bufferRef.current,
          filename,
          level,
          watermark: { required, name, issued },
        },
        "*",
      );
    }

    function onMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const type = event.data?.type;
      if (type === "brieflock:ready") {
        readyRef.current = true;
        send();
      } else if (type === "brieflock:loaded") {
        if (!cancelled) setStatus("ready");
      } else if (type === "brieflock:error") {
        if (!cancelled) setStatus("error");
      }
    }

    window.addEventListener("message", onMessage);
    const ping = window.setInterval(() => {
      if (readyRef.current) {
        window.clearInterval(ping);
        return;
      }
      iframeRef.current?.contentWindow?.postMessage(
        { type: "brieflock:ping" },
        "*",
      );
    }, 300);
    const timeout = window.setTimeout(() => {
      if (!readyRef.current && !cancelled) setStatus("error");
    }, 20000);

    fetch(fileUrl, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => {
        if (cancelled) return;
        bufferRef.current = data;
        send();
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      window.removeEventListener("message", onMessage);
      window.clearInterval(ping);
      window.clearTimeout(timeout);
      readyRef.current = false;
      sentRef.current = false;
      bufferRef.current = null;
    };
  }, [filename, fileUrl, level, required, name, issued, attempt]);

  return (
    <div className={className}>
      <div className="relative h-full w-full overflow-hidden bg-[#0b1020]">
        <iframe
          key={attempt}
          ref={iframeRef}
          src="/viewer/viewer.html"
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          title={`Secure viewer for ${filename}`}
          className="h-full w-full border-0"
        />
        {status === "loading" && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-[#0b1020]/80 px-3 py-2 text-[10px] text-slate-400 backdrop-blur-sm">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            Preparing the sandboxed viewer…
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0b1020] p-6 text-center">
            <div className="max-w-sm">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-300">
                <ShieldAlert className="h-5 w-5" aria-hidden />
              </div>
              <p className="mt-4 text-[13px] font-medium text-slate-200">
                The secure viewer could not open this document.
              </p>
              <p className="mt-1.5 text-[11px] leading-5 text-slate-400">
                No document content was released. Re-open the viewer, or contact
                your administrator if the problem persists.
              </p>
              <Button
                size="sm"
                variant="secondary"
                className="mt-4 border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700"
                onClick={() => setAttempt((value) => value + 1)}
              >
                <RotateCw className="h-3.5 w-3.5" aria-hidden />
                Re-open viewer
              </Button>
            </div>
          </div>
        )}
        <span className="sr-only" role="status" aria-live="polite">
          {status === "loading"
            ? "Opening the secure viewer"
            : status === "ready"
              ? "Secure document viewer ready"
              : "Secure viewer error"}
        </span>
      </div>
    </div>
  );
}
