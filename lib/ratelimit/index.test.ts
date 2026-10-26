import { beforeEach, describe, expect, it } from "vitest";
import {
  InMemoryTokenBucket,
  resetRateLimiterForTests,
} from "./index";

describe("InMemoryTokenBucket", () => {
  beforeEach(() => {
    resetRateLimiterForTests();
  });

  it("allows the burst then rejects", () => {
    const limiter = new InMemoryTokenBucket();
    for (let i = 0; i < 10; i += 1) {
      expect(limiter.check("user:one", "auth").allowed).toBe(true);
    }
    const blocked = limiter.check("user:one", "auth");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("keeps keys independent", () => {
    const limiter = new InMemoryTokenBucket();
    expect(limiter.check("user:one", "auth").allowed).toBe(true);
    expect(limiter.check("user:two", "auth").allowed).toBe(true);
  });
});
