"use client";

import Link from "next/link";
import { ArrowLeftRight, ChevronRight, Send } from "lucide-react";
import type { CaseRecord, TransferWithMeta } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";
import { LevelBadge } from "@/components/level-badge";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function CaseTransfersPanel({
  caseItem,
  transfers,
}: {
  caseItem: CaseRecord;
  transfers: TransferWithMeta[];
}) {
  const archived = caseItem.status === "archived";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[12px] font-medium text-slate-700">
            {transfers.length} outgoing transfer
            {transfers.length === 1 ? "" : "s"}
          </p>
          <p className="text-[11px] text-slate-400">
            Cross-firm access is acceptance-gated and revocable.
          </p>
        </div>
        <Button
          size="sm"
          asChild={!archived}
          disabled={archived}
          title={archived ? "Archived cases are read-only" : undefined}
        >
          {archived ? (
            <span>
              <Send className="h-3.5 w-3.5" aria-hidden />
              New transfer
            </span>
          ) : (
            <Link href={`/transfers?compose=${caseItem.id}`}>
              <Send className="h-3.5 w-3.5" aria-hidden />
              New transfer
            </Link>
          )}
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        {transfers.length === 0 ? (
          <EmptyState
            icon={ArrowLeftRight}
            title="No transfers for this case"
            description="Send case documents to another firm through an audited, acceptance-gated transfer."
            action={
              !archived ? (
                <Button size="sm" asChild>
                  <Link href={`/transfers?compose=${caseItem.id}`}>
                    <Send className="h-3.5 w-3.5" aria-hidden />
                    Compose transfer
                  </Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Transfer</TableHead>
                <TableHead>To firm</TableHead>
                <TableHead>Documents</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Sent</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfers.map((transfer) => (
                <TableRow key={transfer.id} className="group cursor-pointer">
                  <TableCell>
                    <Link
                      href={`/transfers/${transfer.id}`}
                      className="text-[12px] font-medium text-slate-700 group-hover:text-indigo-700"
                    >
                      Transfer · {transfer.case_reference}
                    </Link>
                    <p className="mt-0.5 max-w-[220px] truncate text-[10px] text-slate-400">
                      {transfer.recipients
                        .map((recipient) => recipient.full_name)
                        .join(", ")}
                    </p>
                  </TableCell>
                  <TableCell className="text-[12px] text-slate-600">
                    {transfer.to_firm_name}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-[11px] font-medium text-slate-600">
                        {transfer.items.length}
                      </span>
                      {Array.from(
                        new Set(transfer.items.map((item) => item.security_level)),
                      ).map((level) => (
                        <LevelBadge key={level} level={level} />
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusChip status={transfer.status} />
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-[11px] text-slate-400 sm:table-cell">
                    {formatDate(transfer.sent_at ?? transfer.created_at)}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/transfers/${transfer.id}`}
                      aria-label={`Open transfer ${transfer.id}`}
                    >
                      <ChevronRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
