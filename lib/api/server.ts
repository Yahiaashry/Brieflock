import { cache } from "react";
import { getServerAuth } from "@/lib/auth/server";
import { appOrigin } from "@/lib/app-origin";
import { internalFetch } from "@/lib/api/internal-fetch";

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

async function performServerApi<T>(
  path: string,
  init: RequestInit,
  token: string,
): Promise<T> {
  const url = new URL(`/api/v1${path}`, appOrigin());

  const requestHeaders = new Headers(init.headers);
  requestHeaders.set("Authorization", `Bearer ${token}`);
  if (init.body && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }

  const response = await internalFetch(url, {
    ...init,
    headers: requestHeaders,
    cache: "no-store",
    redirect: "error",
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

/**
 * GETs are deduplicated per server request by React. This removes the repeated
 * HTTP/auth work when a layout, page and generateMetadata need the same object.
 */
const cachedGet = cache(async (path: string, token: string) =>
  performServerApi<unknown>(path, { method: "GET" }, token),
);

export async function serverApi<T>(
  path: string,
  init: RequestInit = {},
  accessToken?: string,
): Promise<T> {
  const token = accessToken ?? (await getServerAuth()).accessToken;

  if (!token) {
    throw new ApiClientError(401, "UNAUTHENTICATED", "Authentication required.");
  }

  const method = (init.method ?? "GET").toUpperCase();
  if (method === "GET" && init.body == null && init.headers == null) {
    return cachedGet(path, token) as Promise<T>;
  }

  return performServerApi<T>(path, init, token);
}
