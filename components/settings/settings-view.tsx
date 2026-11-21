"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  KeyRound,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Timer,
} from "lucide-react";
import type { Firm, Profile } from "@/lib/types";
import { formatDate, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { updateFirmSettingsAction } from "@/app/(app)/settings/actions";
import { PageHeader } from "@/components/page-header";
import { LevelBadge } from "@/components/level-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";

const roleLabels = {
  firm_admin: "Firm administrator",
  security: "Security personnel",
  lawyer: "Lawyer",
  paralegal: "Paralegal",
} as const;

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-5 border-b border-slate-100 py-3.5 last:border-b-0 last:pb-0 first:pt-0">
      <div>
        <p className="text-[12px] font-medium text-slate-800">{label}</p>
        <p className="mt-0.5 max-w-lg text-[10px] leading-4 text-slate-400">
          {description}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30 disabled:opacity-50",
          checked ? "bg-indigo-600" : "bg-slate-200",
        )}
      >
        <span
          className={cn(
            "absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-0",
          )}
        />
      </button>
    </div>
  );
}

export function SettingsView({
  firm,
  user,
}: {
  firm: Firm;
  user: Profile;
}) {
  const [name, setName] = React.useState(firm.name);
  const [retention, setRetention] = React.useState(
    String(firm.settings.retention_days),
  );
  const [watermarkL1, setWatermarkL1] = React.useState(
    firm.settings.watermark_l1,
  );
  const [l3ViewOnly, setL3ViewOnly] = React.useState(
    firm.settings.l3_view_only_default,
  );
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  React.useEffect(() => {
    setName(firm.name);
    setRetention(String(firm.settings.retention_days));
    setWatermarkL1(firm.settings.watermark_l1);
    setL3ViewOnly(firm.settings.l3_view_only_default);
    setError(null);
  }, [firm]);

  const dirty =
    name.trim() !== firm.name ||
    retention !== String(firm.settings.retention_days) ||
    watermarkL1 !== firm.settings.watermark_l1 ||
    l3ViewOnly !== firm.settings.l3_view_only_default;

  function reset() {
    setName(firm.name);
    setRetention(String(firm.settings.retention_days));
    setWatermarkL1(firm.settings.watermark_l1);
    setL3ViewOnly(firm.settings.l3_view_only_default);
    setError(null);
  }

  async function save() {
    const days = Number(retention);
    if (!name.trim()) {
      setError("A firm name is required.");
      return;
    }
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      setError("Retention must be a whole number between 1 and 3650 days.");
      return;
    }
    setPending(true);
    setError(null);
    const result = await updateFirmSettingsAction({
      name: name.trim(),
      retention_days: days,
      watermark_l1: watermarkL1,
      l3_view_only_default: l3ViewOnly,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "Settings could not be saved.");
      return;
    }
    toast({
      title: "Firm settings saved",
      description: "Changes are recorded in the audit trail.",
      variant: "success",
    });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Firm settings"
        description="Security defaults, retention and workspace identity for your firm."
        actions={
          <>
            {dirty && (
              <Button
                variant="ghost"
                size="sm"
                onClick={reset}
                disabled={pending}
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                Reset
              </Button>
            )}
            <Button onClick={save} disabled={!dirty || pending}>
              {pending && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              )}
              Save changes
            </Button>
          </>
        }
      />

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[11px] text-rose-700">
          {error}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-slate-400" aria-hidden />
              <p className="text-[13px] font-semibold text-slate-800">
                Firm profile
              </p>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
              <div className="space-y-1.5">
                <Label htmlFor="firm-name">Firm name</Label>
                <Input
                  id="firm-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={120}
                />
                <p className="text-[10px] text-slate-400">
                  Shown in the workspace sidebar and on transfer records.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Plan</Label>
                <div className="flex h-9 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-[12px] capitalize text-slate-600">
                  {firm.plan}
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[10px] text-slate-400">
              <span className="font-mono">Firm ID {firm.id}</span>
              <span>Created {formatDate(firm.created_at)}</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-slate-400" aria-hidden />
              <p className="text-[13px] font-semibold text-slate-800">
                Security defaults
              </p>
            </div>
            <div className="mt-4">
              <ToggleRow
                label="Watermark L1 documents"
                description="L2 and L3 views are always watermarked. Enable this to add the viewer name and UTC issue time to L1 views as well."
                checked={watermarkL1}
                onChange={setWatermarkL1}
                disabled={pending}
              />
              <ToggleRow
                label="New cases default to view-only L3 downloads"
                description="Case creators can change this per case. Existing cases keep their current download policy."
                checked={l3ViewOnly}
                onChange={setL3ViewOnly}
                disabled={pending}
              />
            </div>
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] leading-4 text-slate-500">
              Exact-match clearance is enforced by the server on every request
              and cannot be relaxed by firm settings. Lowering clearance does not
              widen document visibility.
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-slate-400" aria-hidden />
              <p className="text-[13px] font-semibold text-slate-800">
                Retention
              </p>
            </div>
            <div className="mt-4 max-w-xs space-y-1.5">
              <Label htmlFor="retention-days">Default retention (days)</Label>
              <Input
                id="retention-days"
                type="number"
                min={1}
                max={3650}
                value={retention}
                onChange={(event) => setRetention(event.target.value)}
              />
              <p className="text-[10px] leading-4 text-slate-400">
                Applied to new cases unless a case sets its own retention.
                Documents in cases under legal hold are skipped by retention
                sweeps.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-slate-400" aria-hidden />
              <p className="text-[13px] font-semibold text-slate-800">
                Your access
              </p>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-[11px] font-semibold text-white">
                {initials(user.full_name)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[12px] font-medium text-slate-800">
                  {user.full_name}
                </p>
                <p className="truncate text-[10px] text-slate-400">
                  {user.email}
                </p>
              </div>
            </div>
            <dl className="mt-4 space-y-2.5 text-[11px]">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-400">Firm role</dt>
                <dd className="text-slate-700">{roleLabels[user.role]}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-400">Clearance</dt>
                <dd>
                  <LevelBadge level={user.clearance_level} showName />
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-[10px] leading-4 text-slate-400">
              Role and clearance are managed by firm administrators on the
              Members page.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              Compliance
            </p>
            <ul className="mt-3 space-y-2.5 text-[10px] leading-4 text-slate-500">
              <li className="flex gap-2">
                <ShieldCheck
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500"
                  aria-hidden
                />
                Audit hash chain verified daily at 03:00 UTC.
              </li>
              <li className="flex gap-2">
                <ShieldCheck
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500"
                  aria-hidden
                />
                Signed URLs expire after 60 seconds and are issued only after an
                audit entry is written.
              </li>
              <li className="flex gap-2">
                <ShieldCheck
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500"
                  aria-hidden
                />
                Settings changes are append-only and attributed to your account.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
