import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./utils";

describe("safeRedirectPath", () => {
  it("keeps same-origin absolute paths, including query and hash", () => {
    expect(safeRedirectPath("/cases?tab=open#recent")).toBe(
      "/cases?tab=open#recent",
    );
  });

  it("falls back when the value is missing or not a path", () => {
    expect(safeRedirectPath(null)).toBe("/cases");
    expect(safeRedirectPath("https://evil.example/cases")).toBe("/cases");
    expect(safeRedirectPath("cases")).toBe("/cases");
  });

  it("rejects protocol-relative and backslash forms", () => {
    expect(safeRedirectPath("//evil.example")).toBe("/cases");
    expect(safeRedirectPath("/\\evil.example")).toBe("/cases");
    expect(safeRedirectPath("/\tevil.example")).toBe("/cases");
  });

  it("rejects paths that normalise into a protocol-relative URL", () => {
    expect(safeRedirectPath("/..//evil.example")).toBe("/cases");
    expect(safeRedirectPath("/foo/..//evil.example")).toBe("/cases");
  });
});
