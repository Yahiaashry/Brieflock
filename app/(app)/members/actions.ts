"use server";

import { revalidatePath } from "next/cache";
import { serverApi, ApiClientError } from "@/lib/api/server";
import type { ClearanceLevel, Role } from "@/lib/types";

export interface MemberActionResult {
  ok: boolean;
  error?: string;
}

function revalidateMemberSurfaces() {
  revalidatePath("/members");
  revalidatePath("/audit");
}

function failure(error: unknown): MemberActionResult {
  return {
    ok: false,
    error:
      error instanceof ApiClientError
        ? error.message
        : "The request could not be completed.",
  };
}

export async function inviteMemberAction(input: {
  email: string;
  role: Role;
  clearance_level: ClearanceLevel;
}): Promise<MemberActionResult> {
  try {
    await serverApi("/firms/invites", {
      method: "POST",
      body: JSON.stringify(input),
    });
    revalidateMemberSurfaces();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function changeMemberRoleAction(
  userId: string,
  role: Role,
): Promise<MemberActionResult> {
  try {
    await serverApi(`/firms/members/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
    revalidateMemberSurfaces();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function changeClearanceAction(
  userId: string,
  clearanceLevel: ClearanceLevel,
): Promise<MemberActionResult> {
  try {
    await serverApi(`/firms/members/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ clearance_level: clearanceLevel }),
    });
    revalidateMemberSurfaces();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function setMemberActiveAction(
  userId: string,
  active: boolean,
): Promise<MemberActionResult> {
  try {
    await serverApi(`/firms/members/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: active }),
    });
    revalidateMemberSurfaces();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function revokeInviteAction(
  inviteId: string,
): Promise<MemberActionResult> {
  try {
    await serverApi(`/firms/invites/${inviteId}`, { method: "DELETE" });
    revalidateMemberSurfaces();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}