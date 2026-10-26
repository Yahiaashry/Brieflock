"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Inbox, Send, ShieldCheck } from "lucide-react";
import type {
  CaseStatus,
  DocumentRecord,
  Profile,
  SecurityLevel,
  TransferWithMeta,
} from "@/lib/types";
import { formatDate } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { LevelBadge } from "@/components/level-badge";
import { StatusChip } from "@/components/status-chip";
import { TransferWizard } from "@/components/transfers/transfer-wizard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ComposerCase = {
  id: string;
  title: string;
  case_reference: string;
  default_security_level: SecurityLevel;
  status: CaseStatus;
  documents: Pick<DocumentRecord, "id" | "filename" | "size_bytes" | "security_level" | "scan_status" | "description" | "uploaded_at">[];
};

type ComposerFirm = {
  id: string;
  name: string;
  members: Pick<Profile, "id" | "full_name">[];
};

export function TransfersView({
  incoming,
  outgoing,
  cases,
  firms,
  composeCaseId,
}: {
  incoming: TransferWithMeta[];
  outgoing: TransferWithMeta[];
  cases: ComposerCase[];
  firms: ComposerFirm[];
  composeCaseId: string | null;
}) {
  const [open, setOpen] = React.useState(Boolean(composeCaseId));
  const [tab, setTab] = React.useState(
    incoming.length > 0 ? "incoming" : "outgoing",
  );
  const router = useRouter();
  const completedRef = React.useRef(false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      completedRef.current = false;
      return;
    }
    if (composeCaseId && !completedRef.current) {
      router.replace("/transfers");
    }
  }

  const hasComposableCases = cases.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transfers"
        description="Send and receive case documents across firms. Access is granted only after acceptance and is always audited."
        actions={
          <Button
            onClick={() => setOpen(true)}
            disabled={!hasComposableCases}
            title={
              hasComposableCases
                ? undefined
                : "No clean documents are available at your clearance"
            }
          >
            <Send className="h-4 w-4" aria-hidden />
            New transfer
          </Button>
        }
      />

      <Tabs defaultValue="incoming" value={tab} onValueChange={setTab}>
        <TabsList className="h-10">
          <TabsTrigger value="incoming">
            <Inbox className="h-3.5 w-3.5" aria-hidden />
            Incoming
            <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-500">
              {incoming.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="outgoing">
            <Send className="h-3.5 w-3.5" aria-hidden />
            Outgoing
            <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-500">
              {outgoing.length}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="incoming" className="mt-4">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
            {incoming.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="No incoming transfers"
                description="When another firm sends case documents to you, the transfer appears here for review and acceptance."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Transfer</TableHead>
                    <TableHead>From firm</TableHead>
                    <TableHead>Case</TableHead>
                    <TableHead>Documents</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Sent</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incoming.map((transfer) => (
                    <TableRow
                      key={transfer.id}
                      className="group cursor-pointer"
                    >
                      <TableCell>
                        <Link
                          href={`/transfers/${transfer.id}`}
                          className="text-[12px] font-medium text-slate-700 group-hover:text-indigo-700"
                        >
                          Transfer · {transfer.case_reference}
                        </Link>
                        <p className="mt-0.5 max-w-[200px] truncate text-[10px] text-slate-400">
                          {transfer.recipients
                            .map((recipient) => recipient.full_name)
                            .join(", ")}
                        </p>
                      </TableCell>
                      <TableCell className="text-[12px] text-slate-600">
                        {transfer.from_firm_name}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/transfers/${transfer.id}`}
                          className="block max-w-[200px] truncate text-[12px] text-slate-700 hover:text-indigo-700"
                        >
                          {transfer.case_title}
                        </Link>
                        <p className="font-mono text-[10px] text-slate-400">
                          {transfer.case_reference}
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] font-medium text-slate-600">
                            {transfer.items.length}
                          </span>
                          {Array.from(
                            new Set(
                              transfer.items.map(
                                (item) => item.security_level,
                              ),
                            ),
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
        </TabsContent>

        <TabsContent value="outgoing" className="mt-4">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
            {outgoing.length === 0 ? (
              <EmptyState
                icon={Send}
                title="No outgoing transfers"
                description="Send case documents to another firm with an audited, acceptance-gated transfer."
                action={
                  hasComposableCases ? (
                    <Button size="sm" onClick={() => setOpen(true)}>
                      <Send className="h-3.5 w-3.5" aria-hidden />
                      Compose transfer
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
                    <TableHead>Case</TableHead>
                    <TableHead>Documents</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Sent</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outgoing.map((transfer) => (
                    <TableRow
                      key={transfer.id}
                      className="group cursor-pointer"
                    >
                      <TableCell>
                        <Link
                          href={`/transfers/${transfer.id}`}
                          className="text-[12px] font-medium text-slate-700 group-hover:text-indigo-700"
                        >
                          Transfer · {transfer.case_reference}
                        </Link>
                        <p className="mt-0.5 max-w-[200px] truncate text-[10px] text-slate-400">
                          {transfer.recipients
                            .map((recipient) => recipient.full_name)
                            .join(", ")}
                        </p>
                      </TableCell>
                      <TableCell className="text-[12px] text-slate-600">
                        {transfer.to_firm_name}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/transfers/${transfer.id}`}
                          className="block max-w-[200px] truncate text-[12px] text-slate-700 hover:text-indigo-700"
                        >
                          {transfer.case_title}
                        </Link>
                        <p className="font-mono text-[10px] text-slate-400">
                          {transfer.case_reference}
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] font-medium text-slate-600">
                            {transfer.items.length}
                          </span>
                          {Array.from(
                            new Set(
                              transfer.items.map(
                                (item) => item.security_level,
                              ),
                            ),
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
        </TabsContent>
      </Tabs>

      <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[11px] leading-5 text-slate-500 shadow-xs">
        <ShieldCheck
          className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500"
          aria-hidden
        />
        <p>
          Transfers never grant access on their own. A designated recipient must
          accept, and then only documents matching their exact clearance become
          visible. Every send, acceptance, rejection, cancellation and
          revocation is written to the audit trail.
        </p>
      </div>

      <TransferWizard
        open={open}
        onOpenChange={handleOpenChange}
        onCompleted={() => {
          completedRef.current = true;
        }}
        cases={cases}
        firms={firms}
        initialCaseId={composeCaseId}
      />
    </div>
  );
}
