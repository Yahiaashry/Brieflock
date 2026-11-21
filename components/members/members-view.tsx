"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Clock,
  Loader2,
  Mail,
  MoreHorizontal,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import type {
  ClearanceLevel,
  Invite,
  Profile,
  Role,
} from "@/lib/types";
import { formatDate, formatRelative, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  changeClearanceAction,
  changeMemberRoleAction,
  inviteMemberAction,
  revokeInviteAction,
  setMemberActiveAction,
} from "@/app/(app)/members/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { LevelBadge } from "@/components/level-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";

const roleLabels: Record<Role, string> = {
  firm_admin: "Firm administrator",
  security: "Security personnel",
  lawyer: "Lawyer",
  paralegal: "Paralegal",
};

const clearanceNames: Record<ClearanceLevel, string> = {
  1: "Standard",
  2: "High",
  3: "Maximum",
};

const roleBadgeVariant: Record<Role, "indigo" | "neutral"> = {
  firm_admin: "indigo",
  security: "indigo",
  lawyer: "neutral",
  paralegal: "neutral",
};

export function MembersView({
  members,
  invites,
  caseCounts,
  user,
}: {
  members: Profile[];
  invites: Invite[];
  caseCounts: Record<string, number>;
  user: Profile;
}) {
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [inviteUrl, setInviteUrl] = React.useState<string | null>(null);
  const [manageTarget, setManageTarget] = React.useState<Profile | null>(null);
  const [activeTarget, setActiveTarget] = React.useState<{
    profile: Profile;
    active: boolean;
  } | null>(null);
  const [revokeTarget, setRevokeTarget] = React.useState<Invite | null>(null);
  const [email, setEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<Role>("lawyer");
  const [inviteClearance, setInviteClearance] =
    React.useState<ClearanceLevel>(2);
  const [manageRole, setManageRole] = React.useState<Role>("lawyer");
  const [manageClearance, setManageClearance] =
    React.useState<ClearanceLevel>(1);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  const activeMembers = members.filter((profile) => profile.is_active);
  const admins = activeMembers.filter(
    (profile) => profile.role === "firm_admin",
  );

  React.useEffect(() => {
    if (!inviteOpen) {
      setEmail("");
      setInviteRole("lawyer");
      setInviteClearance(2);
      setInviteUrl(null);
      setError(null);
    }
  }, [inviteOpen]);

  React.useEffect(() => {
    if (manageTarget) {
      setManageRole(manageTarget.role);
      setManageClearance(manageTarget.clearance_level);
      setError(null);
    }
  }, [manageTarget]);

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await inviteMemberAction({
      email,
      role: inviteRole,
      clearance_level: inviteClearance,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "The invitation could not be sent.");
      return;
    }
    if (result.inviteUrl) {
      setInviteUrl(result.inviteUrl);
      router.refresh();
      return;
    }
    setInviteOpen(false);
    toast({
      title: "Invitation sent",
      description: `${email} can join with the assigned role and clearance. Invites expire in 7 days.`,
      variant: "success",
    });
    router.refresh();
  }

  async function saveMember(event: React.FormEvent) {
    event.preventDefault();
    if (!manageTarget) return;
    setPending(true);
    setError(null);
    const roleChanged = manageRole !== manageTarget.role;
    const clearanceChanged =
      manageClearance !== manageTarget.clearance_level;
    if (!roleChanged && !clearanceChanged) {
      setManageTarget(null);
      setPending(false);
      return;
    }
    if (roleChanged) {
      const result = await changeMemberRoleAction(manageTarget.id, manageRole);
      if (!result.ok) {
        setPending(false);
        setError(result.error ?? "The role could not be changed.");
        return;
      }
    }
    if (clearanceChanged) {
      const result = await changeClearanceAction(
        manageTarget.id,
        manageClearance,
      );
      if (!result.ok) {
        setPending(false);
        setError(result.error ?? "The clearance could not be changed.");
        return;
      }
    }
    setPending(false);
    setManageTarget(null);
    toast({
      title: "Member updated",
      description: "Role and clearance changes are recorded in the audit trail.",
      variant: "success",
    });
    router.refresh();
  }

  async function setActive() {
    if (!activeTarget) return;
    const result = await setMemberActiveAction(
      activeTarget.profile.id,
      activeTarget.active,
    );
    if (!result.ok) {
      toast({
        title: "Member not updated",
        description: result.error,
        variant: "error",
      });
      return;
    }
    toast({
      title: activeTarget.active ? "Member reactivated" : "Member deactivated",
      description: activeTarget.active
        ? "They can sign in again at their assigned clearance."
        : "Their firm access was severed immediately and audited.",
      variant: "success",
    });
    setActiveTarget(null);
    router.refresh();
  }

  async function revokeInvite() {
    if (!revokeTarget) return;
    const result = await revokeInviteAction(revokeTarget.id);
    if (!result.ok) {
      toast({
        title: "Invite not revoked",
        description: result.error,
        variant: "error",
      });
      return;
    }
    toast({
      title: "Invitation revoked",
      description: "The invite link is no longer valid.",
      variant: "success",
    });
    setRevokeTarget(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Members"
        description="Manage firm membership, roles and clearance. Changes apply immediately and are audited."
        actions={
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-4 w-4" aria-hidden />
            Invite member
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Active members
          </p>
          <p className="mt-1.5 text-[22px] font-semibold tracking-tight text-slate-900">
            {activeMembers.length}
          </p>
          <p className="text-[10px] text-slate-400">
            {members.length - activeMembers.length} deactivated
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Administrators
          </p>
          <p className="mt-1.5 text-[22px] font-semibold tracking-tight text-slate-900">
            {admins.length}
          </p>
          <p className="text-[10px] text-slate-400">
            Keep at least one active admin
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Pending invites
          </p>
          <p className="mt-1.5 text-[22px] font-semibold tracking-tight text-slate-900">
            {invites.length}
          </p>
          <p className="text-[10px] text-slate-400">Expire after seven days</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[30%]">Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Clearance</TableHead>
              <TableHead className="hidden sm:table-cell">Cases</TableHead>
              <TableHead className="hidden md:table-cell">Last active</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((profile) => (
              <TableRow
                key={profile.id}
                className={cn(!profile.is_active && "opacity-60")}
              >
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">
                      {initials(profile.full_name)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-medium text-slate-800">
                        {profile.full_name}
                        {profile.id === user.id && (
                          <span className="ml-1.5 text-[10px] font-normal text-slate-400">
                            (you)
                          </span>
                        )}
                      </p>
                      <p className="truncate text-[10px] text-slate-400">
                        {profile.email}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={roleBadgeVariant[profile.role]}>
                    {roleLabels[profile.role]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <LevelBadge level={profile.clearance_level} showName />
                </TableCell>
                <TableCell className="hidden text-[11px] text-slate-500 sm:table-cell">
                  {caseCounts[profile.id] ?? 0}
                </TableCell>
                <TableCell className="hidden whitespace-nowrap text-[11px] text-slate-400 md:table-cell">
                  {formatRelative(profile.last_seen_at)}
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        profile.is_active ? "bg-emerald-500" : "bg-rose-400",
                      )}
                    />
                    {profile.is_active ? "Active" : "Deactivated"}
                  </span>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Actions for ${profile.full_name}`}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>Firm membership</DropdownMenuLabel>
                      <DropdownMenuItem onSelect={() => setManageTarget(profile)}>
                        <ShieldCheck className="h-4 w-4" />
                        Manage role &amp; clearance
                      </DropdownMenuItem>
                      {profile.id !== user.id && (
                        <>
                          <DropdownMenuSeparator />
                          {profile.is_active ? (
                            <DropdownMenuItem
                              className="text-rose-600 focus:bg-rose-50 focus:text-rose-700 [&_svg]:text-rose-500"
                              onSelect={() =>
                                setActiveTarget({ profile, active: false })
                              }
                            >
                              Deactivate member
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onSelect={() =>
                                setActiveTarget({ profile, active: true })
                              }
                            >
                              Reactivate member
                            </DropdownMenuItem>
                          )}
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <p className="text-[13px] font-semibold text-slate-800">
              Pending invitations
            </p>
            <p className="text-[10px] text-slate-400">
              Invitations expire automatically after seven days.
            </p>
          </div>
          <Mail className="h-4 w-4 text-slate-300" aria-hidden />
        </div>
        {invites.length === 0 ? (
          <div className="flex items-center gap-2.5 px-4 py-6 text-[11px] text-slate-400">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            No pending invitations.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {invites.map((invite) => {
              const expired = new Date(invite.expires_at).getTime() < Date.now();
              return (
                <li
                  key={invite.id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-medium text-slate-700">
                      {invite.email}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-400">
                      <span>{roleLabels[invite.role]}</span>
                      <span>·</span>
                      <span>Clearance L{invite.clearance_level}</span>
                      <span>·</span>
                      <span className={expired ? "text-rose-500" : undefined}>
                        {expired ? "Expired" : "Expires"}{" "}
                        {formatDate(invite.expires_at)}
                      </span>
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 self-start text-[11px] text-rose-600 hover:bg-rose-50 hover:text-rose-700 sm:self-auto"
                    onClick={() => setRevokeTarget(invite)}
                  >
                    Revoke
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[10px] leading-5 text-slate-500 shadow-xs">
        <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-500" aria-hidden />
        Role and clearance changes take effect on the member&apos;s next request.
        Case access still requires membership, and documents remain visible only
        at an exact clearance match.
      </div>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invite a firm member</DialogTitle>
            <DialogDescription>
              The invitation expires after seven days. The recipient joins with
              the role and clearance you assign.
            </DialogDescription>
          </DialogHeader>
          {inviteUrl ? (
            <div className="space-y-4">
              <p className="text-sm text-muted">The invitation is ready. Copy this link and share it privately with the intended recipient.</p>
              <Input aria-label="Invitation link" value={inviteUrl} readOnly onFocus={(event) => event.currentTarget.select()} />
              <DialogFooter>
                <Button variant="secondary" onClick={() => setInviteOpen(false)}>Done</Button>
                <Button onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(inviteUrl);
                    toast({ title: "Invitation link copied", variant: "success" });
                  } catch {
                    toast({ title: "Select and copy the invitation link", variant: "error" });
                  }
                }}>Copy invitation link</Button>
              </DialogFooter>
            </div>
          ) : (
          <form onSubmit={invite} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email address</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@firm.com"
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="invite-role">Role</Label>
                <Select
                  id="invite-role"
                  value={inviteRole}
                  onChange={(event) =>
                    setInviteRole(event.target.value as Role)
                  }
                >
                  <option value="lawyer">Lawyer</option>
                  <option value="paralegal">Paralegal</option>
                  <option value="firm_admin">Firm administrator</option>
                  <option value="security">Security personnel</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-clearance">Clearance</Label>
                <Select
                  id="invite-clearance"
                  value={String(inviteClearance)}
                  onChange={(event) =>
                    setInviteClearance(
                      Number(event.target.value) as ClearanceLevel,
                    )
                  }
                >
                  <option value="1">L1 · Standard</option>
                  <option value="2">L2 · High</option>
                  <option value="3">L3 · Maximum</option>
                </Select>
              </div>
            </div>
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] leading-4 text-slate-500">
              Clearance is an exact-match level: an L2 member sees L2 documents
              only — never L1 or L3 — in cases they belong to.
            </p>
            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
                {error}
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setInviteOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                )}
                Send invitation
              </Button>
            </DialogFooter>
          </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={manageTarget !== null}
        onOpenChange={(open) => {
          if (!open) setManageTarget(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage {manageTarget?.full_name}</DialogTitle>
            <DialogDescription>
              Changes apply immediately and are recorded in the audit trail.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveMember} className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
              {manageTarget?.email}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manage-role">Firm role</Label>
              <Select
                id="manage-role"
                value={manageRole}
                onChange={(event) =>
                  setManageRole(event.target.value as Role)
                }
              >
                <option value="lawyer">Lawyer</option>
                <option value="paralegal">Paralegal</option>
                <option value="firm_admin">Firm administrator</option>
                <option value="security">Security personnel</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manage-clearance">Clearance</Label>
              <Select
                id="manage-clearance"
                value={String(manageClearance)}
                onChange={(event) =>
                  setManageClearance(
                    Number(event.target.value) as ClearanceLevel,
                  )
                }
              >
                <option value="1">L1 · Standard</option>
                <option value="2">L2 · High</option>
                <option value="3">L3 · Maximum</option>
              </Select>
              <p className="text-[10px] leading-4 text-slate-400">
                {manageClearance === 3
                  ? "Maximum clearance exposes L3 material in every case this member belongs to. L3 downloads may still be view-only."
                  : `This member will see L${manageClearance} ${clearanceNames[
                      manageClearance
                    ].toLowerCase()} documents only in cases they belong to.`}
              </p>
            </div>
            {manageTarget?.id === user.id && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-800">
                You are editing your own firm role. Removing your last
                administrator role is blocked by the server.
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
                {error}
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setManageTarget(null)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                )}
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={activeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setActiveTarget(null);
        }}
        title={
          activeTarget?.active
            ? "Reactivate this member?"
            : "Deactivate this member?"
        }
        description={
          activeTarget
            ? activeTarget.active
              ? `${activeTarget.profile.full_name} regains firm access at clearance L${activeTarget.profile.clearance_level}.`
              : `${activeTarget.profile.full_name} loses firm access immediately. Active sessions and signed URLs stop working.`
            : ""
        }
        confirmLabel={activeTarget?.active ? "Reactivate" : "Deactivate"}
        destructive={!activeTarget?.active}
        onConfirm={setActive}
      />

      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
        title="Revoke this invitation?"
        description={
          revokeTarget
            ? `${revokeTarget.email} will no longer be able to use this invitation.`
            : ""
        }
        confirmLabel="Revoke invite"
        destructive
        onConfirm={revokeInvite}
      />
    </div>
  );
}
