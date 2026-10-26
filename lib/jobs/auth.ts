import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/errors";

export function requireCronSecret(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  const token = header.startsWith(prefix) ? header.slice(prefix.length) : "";
  const expected = env().CRON_SECRET;

  const left = Buffer.from(token);
  const right = Buffer.from(expected);

  if (
    left.length !== right.length ||
    !timingSafeEqual(left, right)
  ) {
    throw ApiError.unauthenticated();
  }
}
