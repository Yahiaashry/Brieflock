import { describe, expect, it } from "vitest";
import { scanPdf } from "./index";

const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n", "latin1");

describe("scanPdf", () => {
  it("accepts a minimal clean PDF", () => {
    const result = scanPdf(pdf);
    expect(result.status).toBe("clean");
    expect(result.sha256).toHaveLength(64);
    expect(result.findings).toEqual([]);
  });

  it("flags embedded JavaScript heuristics", () => {
    const result = scanPdf(
      Buffer.from("%PDF-1.4\n1 0 obj\n<< /JavaScript (alert(1)) >>\n%%EOF\n"),
    );
    expect(result.status).toBe("infected");
    expect(result.findings).toContain("/JavaScript");
  });

  it("rejects a missing PDF header", () => {
    expect(scanPdf(Buffer.from("not a pdf")).status).toBe("error");
  });

  it("rejects a missing EOF marker", () => {
    expect(scanPdf(Buffer.from("%PDF-1.4\n1 0 obj\n"))).toMatchObject({
      status: "error",
      findings: ["missing_pdf_eof"],
    });
  });
});
