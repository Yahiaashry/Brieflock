import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { signInDestination } from "@/lib/auth/redirect";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  const flowId = params.get("sb_flow_id");
  const next = signInDestination(params.get("next"));
  const login = new URLSearchParams({ link: "invalid" });
  if (params.has("next")) login.set("next", next);

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined,
    );
    if (!error) redirect(next);
    if (error.name === "AuthPKCECodeVerifierMissingError") login.set("link", "browser");
  }

  redirect(`/login?${login}`);
}
