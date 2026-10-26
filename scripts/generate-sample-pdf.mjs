import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const out = resolve("public/sample/brieflock-sample.pdf");

function escape(value) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function textBlock({ x, y, size, leading, font = "F1", color = "0.15 0.18 0.25", lines }) {
  return [
    "BT",
    `/${font} ${size} Tf`,
    `${color} rg`,
    `${x} ${y} Td`,
    `${leading} TL`,
    ...lines.map((line) => `(${escape(line)}) Tj T*`),
    "ET",
  ].join("\n");
}

function rule(y) {
  return `q 0.87 0.89 0.92 RG 0.6 w 48 ${y} m 564 ${y} l S Q`;
}

function header() {
  return [
    "q 0.07 0.09 0.16 rg 0 742 612 50 re f Q",
    textBlock({
      x: 48,
      y: 770,
      size: 15,
      leading: 0,
      font: "F2",
      color: "1 1 1",
      lines: ["BRIEFLOCK"],
    }),
    textBlock({
      x: 48,
      y: 754,
      size: 7.5,
      leading: 0,
      color: "0.74 0.78 0.88",
      lines: ["CONFIDENTIAL — ATTORNEY WORK PRODUCT — DEMO DOCUMENT"],
    }),
  ].join("\n");
}

function footer(page) {
  return [
    textBlock({
      x: 48,
      y: 32,
      size: 7.5,
      leading: 0,
      color: "0.45 0.48 0.55",
      lines: ["BriefLock demo file — synthetic data, not a real legal record."],
    }),
    textBlock({
      x: 516,
      y: 32,
      size: 7.5,
      leading: 0,
      color: "0.45 0.48 0.55",
      lines: [`Page ${page} of 3`],
    }),
    rule(48),
  ].join("\n");
}

const page1 = [
  header(),
  textBlock({
    x: 48,
    y: 690,
    size: 19,
    leading: 24,
    font: "F2",
    color: "0.06 0.09 0.16",
    lines: ["Dolan v Meridian Holdings", "Matter File — Demonstrator"],
  }),
  rule(640),
  textBlock({
    x: 48,
    y: 618,
    size: 9.5,
    leading: 15,
    lines: [
      "This synthetic document exists to demonstrate BriefLock's secure",
      "viewer, watermarking and audit flow. It contains no real client data.",
    ],
  }),
  textBlock({
    x: 48,
    y: 570,
    size: 12,
    leading: 20,
    font: "F2",
    lines: ["1. Matter overview"],
  }),
  textBlock({
    x: 56,
    y: 548,
    size: 10,
    leading: 17,
    lines: [
      "Case: Dolan v Meridian Holdings",
      "Court: High Court of Justice, King's Bench Division",
      "Claim No.: KB-2026-004182",
      "Lead partner: Eleanor Hartwell",
      "Client: Dolan Family Office Ltd",
    ],
  }),
  textBlock({
    x: 48,
    y: 450,
    size: 12,
    leading: 20,
    font: "F2",
    lines: ["2. Summary"],
  }),
  textBlock({
    x: 56,
    y: 428,
    size: 10,
    leading: 17,
    lines: [
      "The claimant seeks damages arising from an alleged breach of a",
      "facilities management agreement dated 14 February 2023.",
      "The defendant denies liability and advances a contributory",
      "negligence defence. Expert evidence on service levels is due",
      "to be exchanged before the case management conference.",
    ],
  }),
  textBlock({
    x: 48,
    y: 310,
    size: 12,
    leading: 20,
    font: "F2",
    lines: ["3. Viewer checks"],
  }),
  textBlock({
    x: 56,
    y: 288,
    size: 10,
    leading: 17,
    lines: [
      "Page navigation and zoom should work without network access.",
      "The watermark must repeat the viewer's name and issue time.",
      "No text layer is exposed; the page is rendered to a canvas.",
      "Downloads are separately authorised and recorded by BriefLock.",
    ],
  }),
  footer(1),
].join("\n");

const page2 = [
  header(),
  textBlock({
    x: 48,
    y: 690,
    size: 17,
    leading: 22,
    font: "F2",
    color: "0.06 0.09 0.16",
    lines: ["Access control notes"],
  }),
  rule(662),
  textBlock({
    x: 48,
    y: 638,
    size: 11,
    leading: 18,
    font: "F2",
    lines: ["Exact-match clearance"],
  }),
  textBlock({
    x: 56,
    y: 618,
    size: 10,
    leading: 17,
    lines: [
      "A user sees documents whose security level is exactly equal to",
      "their clearance level. Higher documents are withheld; lower",
      "documents are also withheld rather than aggregated into a",
      "broader view. The rule is applied server-side on every request.",
    ],
  }),
  textBlock({
    x: 48,
    y: 530,
    size: 11,
    leading: 18,
    font: "F2",
    lines: ["Security levels"],
  }),
  textBlock({
    x: 56,
    y: 510,
    size: 10,
    leading: 17,
    lines: [
      "L1 — Standard: general matter material, visible to L1 users.",
      "L2 — Confidential: sensitive strategy and client information.",
      "L3 — Restricted: highly sensitive material, view-only by default.",
      "",
      "L2 and L3 views always carry a mandatory watermark. L3 downloads",
      "are blocked unless the case explicitly allows them.",
    ],
  }),
  textBlock({
    x: 48,
    y: 380,
    size: 11,
    leading: 18,
    font: "F2",
    lines: ["Scan gating"],
  }),
  textBlock({
    x: 56,
    y: 360,
    size: 10,
    leading: 17,
    lines: [
      "Documents become visible only after a clean malware scan.",
      "Pending, failed and infected files never produce a signed URL.",
      "Quarantined files are retained for audit but are not deliverable.",
      "",
      "Transfers create external case membership only after the",
      "designated recipient accepts. Revocation severs future access.",
    ],
  }),
  textBlock({
    x: 48,
    y: 230,
    size: 11,
    leading: 18,
    font: "F2",
    lines: ["Denial behaviour"],
  }),
  textBlock({
    x: 56,
    y: 210,
    size: 10,
    leading: 17,
    lines: [
      "Denied requests receive a uniform response and are written to",
      "the audit trail before any content is released. Inaccessible",
      "documents are never enumerated in listings or search results.",
    ],
  }),
  footer(2),
].join("\n");

const page3 = [
  header(),
  textBlock({
    x: 48,
    y: 690,
    size: 17,
    leading: 22,
    font: "F2",
    color: "0.06 0.09 0.16",
    lines: ["Audit, watermarking and retention"],
  }),
  rule(662),
  textBlock({
    x: 48,
    y: 638,
    size: 11,
    leading: 18,
    font: "F2",
    lines: ["Audit trail"],
  }),
  textBlock({
    x: 56,
    y: 618,
    size: 10,
    leading: 17,
    lines: [
      "Every allowed view and download records an audit event before",
      "the signed URL is issued. Entries are append-only and linked by",
      "a hash chain; the chain is verified daily at 03:00 UTC.",
      "",
      "Denials record a reason code such as CLEARANCE_MISMATCH,",
      "NOT_CASE_MEMBER or DOWNLOAD_BLOCKED_L3. Audit entries include",
      "the actor, case, document, approximate location and timestamp.",
    ],
  }),
  textBlock({
    x: 48,
    y: 500,
    size: 11,
    leading: 18,
    font: "F2",
    lines: ["Watermark"],
  }),
  textBlock({
    x: 56,
    y: 480,
    size: 10,
    leading: 17,
    lines: [
      "The secure viewer overlays the viewer's full name and the UTC",
      "issue time across every page. The overlay is generated in the",
      "sandboxed viewer and must not be removable by the document.",
      "Downloaded files carry the same watermark before delivery.",
    ],
  }),
  textBlock({
    x: 48,
    y: 370,
    size: 11,
    leading: 18,
    font: "F2",
    lines: ["Retention and legal hold"],
  }),
  textBlock({
    x: 56,
    y: 350,
    size: 10,
    leading: 17,
    lines: [
      "Retention is configured per firm and may be overridden per case.",
      "Cases under legal hold are skipped by retention sweeps until the",
      "hold is released. Archived cases remain readable but block new",
      "uploads, transfers and membership changes.",
    ],
  }),
  textBlock({
    x: 48,
    y: 250,
    size: 11,
    leading: 18,
    font: "F2",
    lines: ["Handling note"],
  }),
  textBlock({
    x: 56,
    y: 230,
    size: 10,
    leading: 17,
    lines: [
      "This demonstrator is not legal advice and carries no privilege.",
      "Do not upload real client material to the demo environment.",
      "",
      "End of document.",
    ],
  }),
  footer(3),
].join("\n");

const pages = [page1, page2, page3];
const font1 = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
const font2 = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
const info =
  "<< /Title (BriefLock Demo Matter File) /Author (BriefLock) /Subject (Synthetic PDF for secure viewer testing) /Creator (BriefLock) /Producer (BriefLock) >>";

const objects = {
  1: "<< /Type /Catalog /Pages 2 0 R >>",
  2: "<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>",
  3: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 6 0 R /F2 7 0 R >> >> /Contents 8 0 R >>",
  4: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 6 0 R /F2 7 0 R >> >> /Contents 9 0 R >>",
  5: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 6 0 R /F2 7 0 R >> >> /Contents 10 0 R >>",
  6: font1,
  7: font2,
  11: info,
};
pages.forEach((stream, index) => {
  objects[8 + index] = `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
});

const chunks = [];
let offset = 0;
function push(text) {
  const buffer = Buffer.from(text, "latin1");
  chunks.push(buffer);
  offset += buffer.length;
}

push("%PDF-1.4\n% BriefLock demo document\n");
const offsets = [];
for (let index = 1; index <= 11; index += 1) {
  offsets[index] = offset;
  push(`${index} 0 obj\n${objects[index]}\nendobj\n`);
}
const xrefOffset = offset;
let xref = "xref\n0 12\n0000000000 65535 f \n";
for (let index = 1; index <= 11; index += 1) {
  xref += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
}
const trailer = `trailer\n<< /Size 12 /Root 1 0 R /Info 11 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

push(xref);
push(trailer);

mkdirSync(dirname(out), { recursive: true });
const buffer = Buffer.concat(chunks);
writeFileSync(out, buffer);
console.log(`Wrote ${out} (${buffer.length} bytes)`);
