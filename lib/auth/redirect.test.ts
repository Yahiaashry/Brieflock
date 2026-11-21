import { describe, expect, it } from "vitest";
import { signInDestination } from "./redirect";

describe("sign-in destinations", () => {
  it("keeps a protected page's filter and preserves firm invitation links", () => {
    expect(signInDestination("/cases?tab=documents")).toBe("/cases?tab=documents");
    expect(signInDestination("/invite/accept?token=test")).toBe("/invite/accept?token=test");
  });

  it("avoids sign-in loops and cross-origin redirects", () => {
    expect(signInDestination("/login/?next=/cases")).toBe("/cases");
    expect(signInDestination("/auth/callback")).toBe("/cases");
    expect(signInDestination("//external.example")).toBe("/cases");
  });
});
