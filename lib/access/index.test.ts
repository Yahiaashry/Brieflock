import { describe, expect, it } from "vitest";
import { evaluateAccess, type AccessFacts } from "./index";

const base: AccessFacts = {
  active: true,
  sameFirm: true,
  acceptedTransferGrant: false,
  caseMember: true,
  role: "lawyer",
  clearanceLevel: 2,
  securityLevel: 2,
  scanStatus: "clean",
  caseArchived: false,
  allowL3Download: true,
};

describe("evaluateAccess", () => {
  it("denies deactivated users", () => {
    expect(evaluateAccess({ ...base, active: false }, "view")).toMatchObject({
      allow: false,
      reason: "DEACTIVATED",
    });
  });

  it("denies cross-firm access without an accepted grant", () => {
    expect(
      evaluateAccess({ ...base, sameFirm: false }, "view"),
    ).toMatchObject({ allow: false, reason: "FIRM_MISMATCH" });
  });

  it("denies non-members", () => {
    expect(
      evaluateAccess({ ...base, caseMember: false }, "view"),
    ).toMatchObject({ allow: false, reason: "NOT_CASE_MEMBER" });
  });

  it("requires exact clearance", () => {
    expect(
      evaluateAccess({ ...base, securityLevel: 3 }, "view"),
    ).toMatchObject({ allow: false, reason: "CLEARANCE_MISMATCH" });
  });

  it("allows admin metadata without membership or clearance", () => {
    expect(
      evaluateAccess(
        {
          ...base,
          role: "firm_admin",
          caseMember: false,
          clearanceLevel: 1,
          securityLevel: 3,
          scanStatus: "pending",
        },
        "metadata",
      ),
    ).toMatchObject({ allow: true, metadataOnly: true });
  });

  it("lets metadata reads skip the scan gate", () => {
    expect(
      evaluateAccess({ ...base, scanStatus: "pending" }, "metadata"),
    ).toMatchObject({ allow: true, metadataOnly: false });
  });

  it("blocks pending and infected content", () => {
    expect(
      evaluateAccess({ ...base, scanStatus: "pending" }, "view"),
    ).toMatchObject({ allow: false, reason: "UNSCANNED" });
    expect(
      evaluateAccess({ ...base, scanStatus: "infected" }, "view"),
    ).toMatchObject({ allow: false, reason: "INFECTED" });
  });

  it("blocks L3 download when disabled but allows view", () => {
    expect(
      evaluateAccess(
        {
          ...base,
          clearanceLevel: 3,
          securityLevel: 3,
          allowL3Download: false,
        },
        "download",
      ),
    ).toMatchObject({ allow: false, reason: "DOWNLOAD_BLOCKED_L3" });
    expect(
      evaluateAccess(
        {
          ...base,
          clearanceLevel: 3,
          securityLevel: 3,
          allowL3Download: false,
        },
        "view",
      ),
    ).toMatchObject({ allow: true });
  });

  it("allows an accepted transfer grant with exact clearance", () => {
    expect(
      evaluateAccess(
        {
          ...base,
          sameFirm: false,
          acceptedTransferGrant: true,
          clearanceLevel: 2,
        },
        "download",
      ),
    ).toMatchObject({ allow: true });
  });
});
