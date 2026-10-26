"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  Loader2,
  MoreHorizontal,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import type { CaseMember, CaseRecord, Profile } from "@/lib/types";
import { formatDate, initials } from "@/lib/format";
import {
  addCaseMemberAction,
  removeCaseMemberAction,
  updateCaseMemberRoleAction,
} from "@/app/(app)/cases/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
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

type MemberWithProfile = CaseMember & { profile: Profile };

const roleLabels: Record<CaseMember["role"], string> = {
  lead: "Case lead",
  member: "Member",
  external: "External",
};

export function MembersPanel({
  caseItem,
  members,
  firmMembers,
  user,
  canManage,
}: {
  caseItem: CaseRecord;
  members: MemberWithProfile[];
  firmMembers: Profile[];
  user: Profile;
  canManage: boolean;
}) {
  const [addOpen, setAddOpen] = React.useState(false);
  const [selectedUser, setSelectedUser] = React.useState("");
  const [selectedRole, setSelectedRole] = React.useState<"lead" | "member">(
    "member",
  );
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = React.useState<MemberWithProfile | null>(
    null,
  );
  const [roleTarget, setRoleTarget] = React.useState<{
    member: MemberWithProfile;
    role: "lead" | "member";
  } | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  const archived = caseItem.status === "archived";
  const existingIds = new Set(members.map((member) => member.user_id));
  const available = firmMembers.filter(
    (profile) => !existingIds.has(profile.id),
  );

  async function addMember(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedUser) {
      setError("Choose a member to add.");
      return;
    }
    setPending(true);
    setError(null);
    const result = await addCaseMemberAction(
      caseItem.id,
      selectedUser,
      selectedRole,
    );
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "The member could not be added.");
      return;
    }
    setAddOpen(false);
    setSelectedUser("");
    toast({
      title: "Member added to case",
      description: "The change is recorded in the audit trail.",
      variant: "success",
    });
    router.refresh();
  }

  async function changeRole() {
    if (!roleTarget) return;
    const result = await updateCaseMemberRoleAction(
      caseItem.id,
      roleTarget.member.user_id,
      roleTarget.role,
    );
    if (!result.ok) {
      toast({
        title: "Role not changed",
        description: result.error,
        variant: "error",
      });
      return;
    }
    toast({
      title: "Case role updated",
      description: "The change is recorded in the audit trail.",
      variant: "success",
    });
    setRoleTarget(null);
    router.refresh();
  }

  async function removeMember() {
    if (!removeTarget) return;
    const result = await removeCaseMemberAction(
      caseItem.id,
      removeTarget.user_id,
    );
    if (!result.ok) {
      toast({
        title: "Member not removed",
        description: result.error,
        variant: "error",
      });
      return;
    }
    toast({
      title: "Member removed",
      description: "Case access was severed immediately and audited.",
      variant: "success",
    });
    setRemoveTarget(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[12px] font-medium text-slate-700">
            {members.length} member{members.length === 1 ? "" : "s"}
          </p>
          <p className="text-[11px] text-slate-400">
            External members are added only through accepted transfers.
          </p>
        </div>
        {canManage && (
          <Button
            size="sm"
            onClick={() => setAddOpen(true)}
            disabled={archived}
            title={archived ? "Archived cases are read-only" : undefined}
          >
            <UserPlus className="h-3.5 w-3.5" aria-hidden />
            Add member
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        {members.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No case members"
            description="Add members of your firm to this case before uploading documents."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[32%]">Member</TableHead>
                <TableHead>Case role</TableHead>
                <TableHead>Clearance</TableHead>
                <TableHead className="hidden md:table-cell">Added</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => {
                const external = member.role === "external";
                const profile = member.profile;
                return (
                  <TableRow key={member.user_id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">
                          {initials(profile.full_name)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-slate-800">
                            {profile.full_name}
                            {member.user_id === user.id && (
                              <span className="ml-1.5 text-[10px] font-normal text-slate-400">
                                (you)
                              </span>
                            )}
                          </p>
                          <p className="truncate text-[11px] text-slate-400">
                            {profile.email}
                            {!profile.is_active && (
                              <span className="ml-1 text-rose-500">
                                · deactivated
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant={
                            member.role === "lead"
                              ? "indigo"
                              : external
                                ? "warning"
                                : "neutral"
                          }
                        >
                          {roleLabels[member.role]}
                        </Badge>
                        {external && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                            <ArrowLeftRight className="h-3 w-3" aria-hidden />
                            via transfer
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {external ? (
                        <span className="text-[10px] text-slate-400">
                          cross-firm
                        </span>
                      ) : (
                        <LevelBadge level={profile.clearance_level} />
                      )}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-[11px] text-slate-400 md:table-cell">
                      {formatDate(member.added_at)}
                    </TableCell>
                    <TableCell>
                      {external ? (
                        <span
                          className="flex h-8 w-8 items-center justify-center text-slate-300"
                          title="External access is severed only by revoking the transfer."
                        >
                          <ShieldCheck className="h-4 w-4" aria-hidden />
                        </span>
                      ) : (
                        canManage &&
                        !archived && (
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
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuLabel>Case membership</DropdownMenuLabel>
                              {member.role !== "lead" ? (
                                <DropdownMenuItem
                                  onSelect={() =>
                                    setRoleTarget({
                                      member,
                                      role: "lead",
                                    })
                                  }
                                >
                                  Make case lead
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onSelect={() =>
                                    setRoleTarget({
                                      member,
                                      role: "member",
                                    })
                                  }
                                >
                                  Make member
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-rose-600 focus:bg-rose-50 focus:text-rose-700"
                                onSelect={() => setRemoveTarget(member)}
                              >
                                Remove from case
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] leading-5 text-slate-500">
        <ArrowLeftRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        External members reach only the documents carried by an accepted
        transfer — and only when their clearance exactly matches. Revoking the
        transfer severs future access immediately.
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add a case member</DialogTitle>
            <DialogDescription>
              Only active members of your firm can be added. External
              membership is reserved for transfers.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={addMember} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="member-select">Firm member</Label>
              <Select
                id="member-select"
                value={selectedUser}
                onChange={(event) => setSelectedUser(event.target.value)}
              >
                <option value="">Select a member…</option>
                {available.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.full_name} · {profile.email}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="member-role">Case role</Label>
              <Select
                id="member-role"
                value={selectedRole}
                onChange={(event) =>
                  setSelectedRole(event.target.value as "lead" | "member")
                }
              >
                <option value="member">Member</option>
                <option value="lead">Case lead</option>
              </Select>
            </div>
            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {error}
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setAddOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !available.length}>
                {pending && (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                )}
                Add member
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={roleTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRoleTarget(null);
        }}
        title={
          roleTarget?.role === "lead"
            ? "Make this member case lead?"
            : "Change this member's case role?"
        }
        description={
          roleTarget
            ? `${roleTarget.member.profile.full_name} will become a ${roleTarget.role}. Case leads can add members and manage the case.`
            : ""
        }
        confirmLabel="Change role"
        onConfirm={changeRole}
      />

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
        title="Remove this member from the case?"
        description={
          removeTarget
            ? `${removeTarget.profile.full_name} loses case access immediately. Past access remains in the audit log.`
            : ""
        }
        confirmLabel="Remove member"
        destructive
        onConfirm={removeMember}
      />
    </div>
  );
}
