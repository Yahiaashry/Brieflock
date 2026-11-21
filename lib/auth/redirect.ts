import { safeRedirectPath } from "@/lib/utils";

export function signInDestination(value: unknown) {
  const destination = safeRedirectPath(value);
  const pathname = destination.split(/[?#]/, 1)[0].replace(/\/+$/, "");
  if (["/login", "/signup", "/auth"].includes(pathname) || pathname.startsWith("/auth/")) {
    return "/cases";
  }
  return destination;
}
