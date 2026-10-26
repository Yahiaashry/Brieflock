import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <SearchX className="h-6 w-6" aria-hidden />
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-tight text-slate-900">
          Not found.
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          The page you requested does not exist, or it is not available to your
          account.
        </p>
        <Button asChild className="mt-6 w-full">
          <Link href="/cases">Back to cases</Link>
        </Button>
      </div>
    </div>
  );
}
