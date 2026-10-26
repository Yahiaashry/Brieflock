import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const DEMO_SESSION_COOKIE = "brieflock_demo_session";

export async function hasDemoSession() {
  const store = await cookies();
  return store.has(DEMO_SESSION_COOKIE);
}

export async function requireDemoSession(nextPath?: string) {
  const authed = await hasDemoSession();
  if (!authed) {
    const target = nextPath
      ? `/login?next=${encodeURIComponent(nextPath)}`
      : "/login";
    redirect(target);
  }
}
