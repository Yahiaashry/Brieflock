import type { Metadata } from "next";
import { TransfersView } from "@/components/transfers/transfers-view";
import { requireServerProfile } from "@/lib/auth/server";
import { serverApi } from "@/lib/api/server";
import type {
  CaseWithMeta,
  Profile,
  TransferWithMeta,
} from "@/lib/types";

export const metadata: Metadata = { title: "Transfers" };

type SearchParams = Promise<{ compose?: string | string[] }>;

type DirectoryFirm = {
  id: string;
  name: string;
  members: Pick<Profile, "id" | "full_name">[];
};

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { profile } = await requireServerProfile();
  const { compose } = await searchParams;

  const [incomingResult, outgoingResult, casesResult, firmsResult] =
    await Promise.all([
      serverApi<{ data: TransferWithMeta[] }>(
        "/transfers?direction=incoming&limit=100",
      ),
      serverApi<{ data: TransferWithMeta[] }>(
        "/transfers?direction=outgoing&limit=100",
      ),
      serverApi<{ data: CaseWithMeta[] }>(
        `/cases?scope=${profile.role === "firm_admin" ? "firm" : "mine"}&limit=100&include=documents`,
      ),
      serverApi<{ data: DirectoryFirm[] }>("/firms/directory"),
    ]);

  const composableCases = casesResult.data
    .filter((item) => {
      if (item.status === "archived") return false;
      const membership = item.members.find(
        (member) => member.user_id === profile.id,
      );
      return Boolean(membership && membership.role !== "external");
    })
    .map((item) => ({
      id: item.id,
      title: item.title,
      case_reference: item.case_reference,
      default_security_level: item.default_security_level,
      status: item.status,
      documents: item.documents ?? [],
    }))
    .filter((item) => item.documents.length > 0);

  return (
    <TransfersView
      incoming={incomingResult.data}
      outgoing={outgoingResult.data}
      cases={composableCases}
      firms={firmsResult.data}
      composeCaseId={typeof compose === "string" ? compose : null}
    />
  );
}