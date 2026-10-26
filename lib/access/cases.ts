import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CaseMember,
  CaseRecord,
  DocumentRecord,
  Profile,
} from "@/lib/types";

export interface CaseAccess {
  caseRecord: CaseRecord;
  membership: CaseMember | null;
  adminMetadata: boolean;
}

export async function loadCaseAccess(
  supabase: SupabaseClient,
  profile: Profile,
  caseId: string,
): Promise<CaseAccess | null> {
  const { data: caseRecord, error } = await supabase
    .from("cases")
    .select("*")
    .eq("id", caseId)
    .maybeSingle<CaseRecord>();

  if (error) throw new Error("Unable to load case access context.");
  if (!caseRecord) return null;

  const ownFirm = caseRecord.firm_id === profile.firm_id;
  const adminMetadata = ownFirm && profile.role === "firm_admin" && profile.is_active;

  const { data: membership, error: membershipError } = await supabase
    .from("case_members")
    .select("*")
    .eq("case_id", caseId)
    .eq("user_id", profile.id)
    .maybeSingle<CaseMember>();

  if (membershipError) {
    throw new Error("Unable to resolve case membership.");
  }

  if (!ownFirm && membership?.role !== "external") return null;
  if (!membership && !adminMetadata) return null;

  return {
    caseRecord,
    membership: membership ?? null,
    adminMetadata,
  };
}

export function canWriteToCase(access: CaseAccess) {
  return access.caseRecord.status !== "archived";
}

export interface CaseMemberWithProfile extends CaseMember {
  profile: Profile;
}

export async function loadCaseMembers(
  supabase: SupabaseClient,
  caseIds: string[],
) {
  if (caseIds.length === 0) return [] as CaseMemberWithProfile[];

  const { data, error } = await supabase
    .from("case_members")
    .select("*, profile:profiles!case_members_user_id_fkey(*)")
    .in("case_id", caseIds);

  if (error) throw new Error("Unable to load case members.");

  return (data ?? []) as CaseMemberWithProfile[];
}

export function isVisibleDocument(
  document: Pick<DocumentRecord, "firm_id" | "security_level">,
  profile: Profile,
  adminMetadata: boolean,
) {
  if (!profile.is_active) return false;
  if (document.firm_id !== profile.firm_id) return false;
  if (adminMetadata) return true;
  return document.security_level === profile.clearance_level;
}

export function isCaseMember(
  members: CaseMemberWithProfile[],
  caseId: string,
  userId: string,
) {
  return members.some(
    (member) => member.case_id === caseId && member.user_id === userId,
  );
}

export function isCaseLead(
  members: CaseMemberWithProfile[],
  caseId: string,
  userId: string,
) {
  return members.some(
    (member) =>
      member.case_id === caseId &&
      member.user_id === userId &&
      member.role === "lead",
  );
}
