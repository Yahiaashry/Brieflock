import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const SAFE_REDIRECT_BASE = "https://brieflock.invalid";

/**
 * Only same-origin, absolute paths may be used as a post-login redirect.
 * Rejects protocol-relative (`//host`), backslash and control-character
 * variants that browsers can normalise into an external URL.
 */
export function safeRedirectPath(value: unknown, fallback = "/cases") {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(candidate)
  ) {
    return fallback;
  }

  try {
    const url = new URL(candidate, SAFE_REDIRECT_BASE);
    if (url.origin !== SAFE_REDIRECT_BASE || url.pathname.startsWith("//")) {
      return fallback;
    }

    // Re-resolve the final value so dot-segment normalisation cannot turn a
    // same-origin path such as `/..//host` into a protocol-relative URL.
    const result = `${url.pathname}${url.search}${url.hash}`;
    if (new URL(result, SAFE_REDIRECT_BASE).origin !== SAFE_REDIRECT_BASE) {
      return fallback;
    }
    return result;
  } catch {
    return fallback;
  }
}
