import { headers } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function serverApi<T>(
  path: string,
  init: RequestInit = {},
  accessToken?: string,
): Promise<T> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = accessToken ?? session?.access_token;

  if (!token) {
    throw new ApiClientError(401, "UNAUTHENTICATED", "Authentication required.");
  }

  const incoming = await headers();
  const protocol = incoming.get("x-forwarded-proto") ?? "http";
  const host = incoming.get("host") ?? "localhost:3000";
  const url = `${protocol}://${host}/api/v1${path}`;

  const requestHeaders = new Headers(init.headers);
  requestHeaders.set("Authorization", `Bearer ${token}`);
  if (init.body && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...init,
    headers: requestHeaders,
    cache: "no-store",
  });

  if (response.status === 204) return null as T;

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = body?.error;
    throw new ApiClientError(
      response.status,
      error?.code ?? "INTERNAL",
      error?.message ?? "Request failed.",
      error?.details,
    );
  }

  return body as T;
}
