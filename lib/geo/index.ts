import { createHash } from "node:crypto";
import { env } from "@/lib/env";

export interface RequestGeography {
  ipHash: string;
  country: string | null;
  city: string | null;
  userAgent: string | null;
}

function requestIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const candidate = forwarded?.split(",")[0]?.trim();
  if (candidate) return candidate;
  return request.headers.get("x-real-ip") ?? "127.0.0.1";
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function hashIp(ip: string, salt = env().IP_HASH_SALT) {
  return createHash("sha256").update(`${salt}${ip}`).digest("hex");
}

export function requestGeography(request: Request): RequestGeography {
  const country = request.headers.get("x-vercel-ip-country");
  const city = request.headers.get("x-vercel-ip-city");
  const userAgent = request.headers.get("user-agent");

  return {
    ipHash: hashIp(requestIp(request)),
    country: country ? country.slice(0, 8) : null,
    city: city ? safeDecode(city).slice(0, 120) : null,
    userAgent: userAgent ? userAgent.slice(0, 200) : null,
  };
}
