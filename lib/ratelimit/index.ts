import { ApiError } from "@/lib/errors";

export type RateClass = "auth" | "upload" | "content" | "standard";

const LIMITS: Record<RateClass, number> = {
  auth: 10,
  upload: 30,
  content: 60,
  standard: 100,
};

const WINDOW_MS = 60_000;

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
}

const globalBuckets = globalThis as typeof globalThis & {
  __brieflockRateBuckets?: Map<string, Bucket>;
};

function buckets() {
  if (!globalBuckets.__brieflockRateBuckets) {
    globalBuckets.__brieflockRateBuckets = new Map();
  }
  return globalBuckets.__brieflockRateBuckets;
}

export interface RateLimiter {
  check(key: string, rateClass: RateClass): RateLimitResult;
}

export class InMemoryTokenBucket implements RateLimiter {
  check(key: string, rateClass: RateClass): RateLimitResult {
    const capacity = LIMITS[rateClass];
    const now = Date.now();
    const storageKey = `${rateClass}:${key}`;
    const bucket = buckets().get(storageKey) ?? {
      tokens: capacity,
      updatedAt: now,
    };

    const refill = ((now - bucket.updatedAt) / WINDOW_MS) * capacity;
    bucket.tokens = Math.min(capacity, bucket.tokens + refill);
    bucket.updatedAt = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      buckets().set(storageKey, bucket);
      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        retryAfter: 0,
      };
    }

    buckets().set(storageKey, bucket);
    const secondsUntilToken = Math.ceil(
      ((1 - bucket.tokens) / capacity) * (WINDOW_MS / 1000),
    );

    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, secondsUntilToken),
    };
  }
}

export const rateLimiter: RateLimiter = new InMemoryTokenBucket();

export function enforceRateLimit(key: string, rateClass: RateClass) {
  const result = rateLimiter.check(key, rateClass);
  if (!result.allowed) {
    throw ApiError.rateLimited(result.retryAfter);
  }
  return result;
}

export function resetRateLimiterForTests() {
  buckets().clear();
}
