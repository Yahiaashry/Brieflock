import type { Metadata } from "next";
import Link from "next/link";
import { MailX, ShieldAlert } from "lucide-react";
import { InviteAcceptForm } from "@/components/auth/invite-accept-form";
import { Button } from "@/components/ui/button";
import { getInvitePreview } from "@/app/(auth)/actions";

export const metadata: Metadata = { title: "Accept invitation" };

export default async function InviteAcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const preview = await getInvitePreview(params.token);

  if (!preview) {
    return (
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-xl shadow-slate-900/5">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <ShieldAlert className="h-5.5 w-5.5" aria-hidden />
        </div>
        <h1 className="mt-5 text-lg font-semibold tracking-tight text-slate-900">
          This invitation is no longer valid
        </h1>
        <p className="mt-2 text-[13px] leading-6 text-slate-500">
          It may have expired, already been used, or been revoked by your firm
          administrator. Ask them to send a new invitation.
        </p>
        <Button asChild variant="secondary" className="mt-6">
          <Link href="/login">
            <MailX className="h-4 w-4" aria-hidden />
            Go to sign in
          </Link>
        </Button>
      </div>
    );
  }

  return <InviteAcceptForm token={params.token ?? "demo"} preview={preview} />;
}
