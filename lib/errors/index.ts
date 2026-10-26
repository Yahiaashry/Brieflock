import { ZodError } from "zod";

export type ApiErrorCode =
  | "VALIDATION_FAILED"
  | "UNAUTHENTICATED"
  | "ACCESS_DENIED"
  | "DOWNLOAD_BLOCKED_L3"
  | "CASE_ARCHIVED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "INTERNAL";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly retryAfter?: number;
  readonly details?: unknown;

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    options: { retryAfter?: number; details?: unknown } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryAfter = options.retryAfter;
    this.details = options.details;
  }

  static unauthenticated() {
    return new ApiError(401, "UNAUTHENTICATED", "Authentication required.");
  }

  static accessDenied() {
    return new ApiError(403, "ACCESS_DENIED", "Request denied.");
  }

  static forbidden() {
    return new ApiError(403, "FORBIDDEN", "You are not permitted to do that.");
  }

  static notFound() {
    return new ApiError(404, "NOT_FOUND", "Not found.");
  }

  static caseArchived() {
    return new ApiError(
      403,
      "CASE_ARCHIVED",
      "This case is archived and cannot be changed.",
    );
  }

  static payloadTooLarge() {
    return new ApiError(
      413,
      "PAYLOAD_TOO_LARGE",
      "The uploaded file exceeds the allowed size.",
    );
  }

  static conflict(message = "The requested change conflicts with the current state.") {
    return new ApiError(409, "CONFLICT", message);
  }

  static validation(message = "Request validation failed.", details?: unknown) {
    return new ApiError(422, "VALIDATION_FAILED", message, { details });
  }

  static rateLimited(retryAfter: number) {
    return new ApiError(429, "RATE_LIMITED", "Too many requests.", {
      retryAfter,
    });
  }

  static downloadBlockedL3() {
    return new ApiError(
      403,
      "DOWNLOAD_BLOCKED_L3",
      "Download is disabled for this case.",
    );
  }
}

export function correlationId(request: Request) {
  return request.headers.get("x-request-id") ?? `req_${crypto.randomUUID()}`;
}

export function jsonResponse(
  body: unknown,
  request: Request,
  init: ResponseInit = {},
) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Request-Id", correlationId(request));
  return Response.json(body, { ...init, headers });
}

export function errorResponse(error: unknown, request: Request) {
  const requestId = correlationId(request);

  if (error instanceof ZodError) {
    return Response.json(
      {
        error: {
          code: "VALIDATION_FAILED",
          message: "Request validation failed.",
          correlation_id: requestId,
          details: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      },
      {
        status: 422,
        headers: {
          "Cache-Control": "private, no-store",
          "X-Request-Id": requestId,
        },
      },
    );
  }

  if (error instanceof ApiError) {
    const headers = new Headers({
      "Cache-Control": "private, no-store",
      "X-Request-Id": requestId,
    });
    if (error.retryAfter !== undefined) {
      headers.set("Retry-After", String(error.retryAfter));
    }

    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          correlation_id: requestId,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      },
      { status: error.status, headers },
    );
  }

  console.error(`[${requestId}] unhandled API error`, error);

  return Response.json(
    {
      error: {
        code: "INTERNAL",
        message: "An unexpected error occurred.",
        correlation_id: requestId,
      },
    },
    {
      status: 500,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Request-Id": requestId,
      },
    },
  );
}

export async function apiRoute(
  request: Request,
  handler: () => Promise<Response>,
) {
  try {
    return await handler();
  } catch (error) {
    return errorResponse(error, request);
  }
}
