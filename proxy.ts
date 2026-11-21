import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = {
  name: string;
  value: string;
  options?: CookieOptions;
};

const isDev = process.env.NODE_ENV !== "production";

function supabaseConnectSources() {
  const sources = new Set([
    "'self'",
    "https://*.supabase.co",
    "wss://*.supabase.co",
  ]);

  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (configured) {
    try {
      const url = new URL(configured);
      sources.add(url.origin);
      sources.add(`wss://${url.host}`);
    } catch {
      // Invalid env values are surfaced by lib/env at request time.
    }
  }

  return [...sources].join(" ");
}

function contentSecurityPolicy(nonce: string) {
  const directives = [
    "default-src 'self'",
    isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    isDev
      ? `connect-src ${supabaseConnectSources()} ws: http:`
      : `connect-src ${supabaseConnectSources()}`,
    "frame-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];

  if (!isDev) directives.push("upgrade-insecure-requests");

  return directives.join("; ");
}

function serializedCookies(request: NextRequest) {
  const cookies = request.cookies.getAll();
  if (cookies.length === 0) return null;
  return cookies.map(({ name, value }) => `${name}=${value}`).join("; ");
}

function requestHeadersFor(
  request: NextRequest,
  nonce: string,
  csp: string,
) {
  const headers = new Headers(request.headers);
  const cookie = serializedCookies(request);
  if (cookie) headers.set("cookie", cookie);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  return headers;
}

function withCsp<T extends NextResponse>(response: T, csp: string): T {
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}

function redirectWithCookies(url: URL, source: NextResponse, csp: string) {
  const response = NextResponse.redirect(url);
  for (const cookie of source.cookies.getAll()) response.cookies.set(cookie);
  return withCsp(response, csp);
}

const protectedPrefixes = [
  "/cases",
  "/transfers",
  "/members",
  "/audit",
  "/settings",
  "/search",
  "/firm-setup",
];

export async function proxy(request: NextRequest) {
  const nonce = crypto.randomUUID();
  const csp = contentSecurityPolicy(nonce);
  const { pathname, search } = request.nextUrl;
  const canonicalOrigin = process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_ENV === "production" &&
      canonicalOrigin && (request.method === "GET" || request.method === "HEAD")) {
    const canonicalUrl = new URL(canonicalOrigin);
    if (canonicalUrl.host !== request.nextUrl.host) {
      canonicalUrl.pathname = pathname;
      canonicalUrl.search = search;
      return withCsp(NextResponse.redirect(canonicalUrl), csp);
    }
  }
  const isProtected = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  let response = NextResponse.next({
    request: { headers: requestHeadersFor(request, nonce, csp) },
  });
  if (!isProtected && pathname !== "/signup" && pathname !== "/login") {
    return withCsp(response, csp);
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({
            request: { headers: requestHeadersFor(request, nonce, csp) },
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isProtected && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname + search);
    return redirectWithCookies(loginUrl, response, csp);
  }

  if (user && pathname === "/signup") {
    return redirectWithCookies(new URL("/cases", request.url), response, csp);
  }

  return withCsp(response, csp);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|viewer|favicon.ico|robots.txt).*)",
  ],
};
