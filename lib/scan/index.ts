import { createHash } from "node:crypto";

export type ScanVerdict = "clean" | "infected" | "error";

export interface ScanResult {
  status: ScanVerdict;
  method: "magic-bytes-mvp";
  sha256: string;
  findings: string[];
}

const PDF_MAGIC = Buffer.from("%PDF-", "ascii");
const PDF_EOF = Buffer.from("%%EOF", "ascii");
const ACTIVE_CONTENT_MARKERS = [
  "/JavaScript",
  "/JS",
  "/OpenAction",
  "/Launch",
  "/EmbeddedFile",
  "/RichMedia",
].map((marker) => ({ marker, bytes: Buffer.from(marker, "ascii") }));

export function scanPdf(buffer: Buffer): ScanResult {
  const sha256 = createHash("sha256").update(buffer).digest("hex");

  if (buffer.length < 8 || !buffer.subarray(0, 5).equals(PDF_MAGIC)) {
    return {
      status: "error",
      method: "magic-bytes-mvp",
      sha256,
      findings: ["missing_pdf_header"],
    };
  }

  const tail = buffer.subarray(Math.max(0, buffer.length - 2048));
  if (!tail.includes(PDF_EOF)) {
    return {
      status: "error",
      method: "magic-bytes-mvp",
      sha256,
      findings: ["missing_pdf_eof"],
    };
  }

  const findings = ACTIVE_CONTENT_MARKERS
    .filter(({ bytes }) => buffer.includes(bytes))
    .map(({ marker }) => marker);

  return {
    status: findings.length > 0 ? "infected" : "clean",
    method: "magic-bytes-mvp",
    sha256,
    findings,
  };
}
