# BriefLock — Project Brief

> **Version 2.0 — Regenerated for the legal document exchange core idea**
> **Status:** Authoritative entry point for the v2.0 documentation suite.
> **Locked contract:** `DECISIONS.md` + `DOMAIN_MODEL.md` are the single source of truth and win over this brief and every other document in the suite. Any conflict is resolved in their favor — regenerate the document, not the contract.
> **Supersedes:** The v0.1 "self-destructing link shortener" brief. BriefLock is no longer a link service; it is a secure document exchange and case-file management platform for law firms.

---

## 1. Elevator Pitch

BriefLock is a **secure document exchange and case-file management platform for law firms**. Firms create legal cases, upload case PDFs tagged with a security level (L1 property theft, L2 murder, L3 war crimes), and exchange documents with other firms through **audited, acceptance-gated transfers** — replacing permanent copies floating in email. Every lawyer holds exactly one clearance level, and document content opens only on an **exact clearance match**: compartments, not a hierarchy. Every access, denial, and admin change is recorded in an immutable, hash-chained audit log ("severe telemetry"), so firms can prove who saw what, when, and why.

---

## 2. Problem Statement

Law firms move sensitive case documents — contracts, murder-case files, war-crimes evidence — by email and ad-hoc file shares. The result:

- **Permanent copies everywhere.** Every emailed PDF creates uncontrolled duplicates on mail servers, in inboxes, and on personal devices. There is no single source of truth per case, and nothing ever gets deleted.
- **No clearance control.** Anyone on the thread can open anything. Nothing distinguishes a routine property-theft file from war-crimes evidence, and there is no mechanism ensuring only appropriately cleared staff touch a document.
- **No accountability.** Firms cannot later prove who viewed, downloaded, or was refused a document — a serious gap for courts, clients, professional obligations, and GDPR/security posture.
- **Painful cross-firm exchange.** Sending documents to cooperating or opposing counsel is manual, untracked, and unrevokable; recipients keep the copies forever with no acceptance step and no audit trail.

BriefLock replaces this with firm-scoped case workspaces where content access is decided by clearance compartments, and cross-firm exchange is an audited, acceptance-gated transfer instead of an attachment.

---

## 3. Core Concept

### Security levels & clearance compartments
- Every **document** carries a `security_level`: **L1** (standard sensitivity, e.g., property theft, contracts), **L2** (high, e.g., murder case), **L3** (maximum, e.g., war crimes).
- Every **user** carries exactly one `clearance_level` (L1/L2/L3).
- Access is **compartments, not a hierarchy**: the user's clearance must **exactly equal** the document's level. An L3 lawyer cannot open an L2 PDF, and an L2 lawyer cannot open an L3 PDF.
- Picture the 3×3 matrix (clearance × security level): **only the diagonal allows access**. All six off-diagonal cells are `CLEARANCE_MISMATCH` denials, each one logged. L1×L1, L2×L2 (watermarked), L3×L3 (watermarked, per-case download gate) — nothing else.
- Clearance alone is never sufficient. Content access requires **all** of: same firm **or** accepted transfer, active case membership, exact clearance match, and a passed malware scan.

### Transfers
Cross-firm sharing happens **only** via one-way **transfers**. An owning-firm sender designates specific recipient users at the receiving firm; recipients explicitly **accept or reject**; on acceptance, recipients become external case members and gain document access — still under the full access rule, including the exact-clearance check. The owning-firm admin can revoke future access. Every transition is audited.

### Severe telemetry
Every access, every **denial** (with a canonical deny reason), and every administrative change is written to an **append-only, hash-chained audit log**: `entry_hash = SHA256(prev_hash ‖ canonical_event)`. Access events are committed **before** a signed URL is issued. No role can update or delete audit rows. The chain verifies end-to-end — this is the product's proof layer.

---

## 4. What Gets Built (MVP)

All authenticated (no unauthenticated access in MVP), all firm-scoped — per `DOMAIN_MODEL.md`:

- **Firms & tenancy** — firm as tenant root; every row firm-scoped; RLS makes cross-firm data structurally invisible, including via search, counts, and error messages (automated RLS test suite = release blocker).
- **Cases** — legal matters with title, firm-local case reference, default security level, open/closed/archived status, per-case L3 download flag, legal-hold flag, retention settings.
- **PDF upload + malware scan gate** — PDF-only, ≤ 100 MB; SHA-256 content hash; `scan_status` starts `pending`; in-function PDF structure validation (magic bytes, embedded-JS heuristics); content blocked until `clean` — unscanned/infected files are never accessible.
- **Clearance-gated watermarked viewer** — pdf.js in a CSP-locked sandboxed iframe; dynamic watermark (viewer full name + UTC timestamp) mandatory for L2/L3, optional for L1; signed URLs (TTL ≤ 60 s) issued only after the audit row commits; per-case L3 view-only mode (download denied and logged).
- **Cross-firm transfers with acceptance** — draft → sent → accepted/rejected/cancelled → revoked state machine; designated recipients only; acceptance inserts `external` case members (idempotent).
- **Immutable audit log** — append-only hash-chained `audit_events`; canonical action enum; denials logged with reason codes; repeated-denial alerts to the firm admin; NDJSON export.
- **Firm admin panel** — member/role/clearance management (admin-only, always audited); metadata + audit visibility for the firm; **no admin backdoor** to document content.
- **Clearance-aware search** — `/search` returns only documents/cases the caller can access under the access rule; titles, counts, and existence of inaccessible items are never leaked (filtering in the query, not after).
- **Notifications** — transactional email only: transfer sent/accepted/rejected, repeated-denial alerts, user invites.

---

## 5. Locked Decisions (Summary)

Canonical detail lives in [`DECISIONS.md`](DECISIONS.md) — deliberately **not** duplicated here. The file wins over any paraphrase.

| ID | One-line summary |
|----|------------------|
| D2 | Vercel-only deployment; domain TBD (`app.example.com` placeholders). |
| D6 | Supabase `pg_cron` every 1 min for sweep jobs + lazy read-time checks; `CRON_SECRET`-protected endpoints. |
| D7 | In-memory per-instance token-bucket rate limiting behind a `RateLimiter` interface (Upstash-ready); canonical limits in DECISIONS §3. |
| D8 | GeoIP from Vercel request geo headers; no third-party GeoIP vendor. |
| D9 | IPs salted+hashed (SHA-256) at ingest; raw IPs never persisted; country/city stored alongside. |
| D10 | Supabase Auth (email/password + magic link); no custom auth endpoints; JWT Bearer; roles `firm_admin`/`lawyer`/`paralegal`. |
| D11 | Malware scanning = in-function PDF structure validation + quarantine-until-scanned; ClamAV container = fast-follow (only future non-Vercel piece); never third-party scanning APIs. |
| P1 | Clearance semantics: exact-match compartments, non-hierarchical; hierarchical toggle noted, not built. |
| P2 | Case carries a default security level; uploader may raise per document; lowering requires firm admin with reason; both audited. |
| P3 | Cross-firm sharing only via one-way acceptance-gated transfers; acceptance makes recipients external case members. |
| P4 | MVP access surface: authenticated app only; anonymous pages limited to login/signup/invite-accept; share links are a fast-follow. |
| P5 | L3: watermarked view + download by default; per-case flag switches to view-only (download blocked, logged). |
| P6 | Exactly one clearance level per user (constraint defined in `DOMAIN_MODEL.md` §2.2). |
| P7 | Firm admins see metadata + audit logs only; never content without clearance + case membership; no admin backdoor. |
| P8 | Security baseline + GDPR-aligned posture (processor role, DPA template, legal hold, retention); SOC 2 post-MVP. |
| W1 | Dynamic watermark (viewer name + UTC timestamp) mandatory for L2/L3, optional for L1. |
| A1 | Audit integrity: append-only, hash-chained, service-role insert only; access events logged synchronously before signed-URL issuance; denials carry reason codes. |
| S1 | Canonical SLOs (p95): signed-URL issuance < 100 ms; API < 200 ms; dashboard initial load < 2 s; uptime 99.9%. |
| N1 | Naming contract: `document`, `security_level`, `clearance_level`, `transfer`, `audit_event`; `/api/v1` prefix; UUID path identifiers. |
| V1 | Uploaded documents immutable; replacement = new upload; case/metadata edits audited. |

---

## 6. Success Metrics (MVP)

From DECISIONS §5, plus brief-level invariants:

- **Zero cross-firm data leakage** — proven by the automated RLS test suite (**release blocker**).
- **RLS suite green** before every release.
- **100% of access events audited** — every content access *and* denial auditable within 1 s; the hash chain verifies end-to-end.
- Clearance-matrix E2E suite green (3×3 allow/deny matrix).
- Upload → first view of an L1 document < 60 s, including the scan gate.
- SLOs met per S1: signed-URL issuance < 100 ms, API < 200 ms, dashboard initial load < 2 s (p95); 99.9% uptime.

---

## 7. Document Roadmap (v2.0 Suite)

| Document | Scope | Status |
|----------|-------|--------|
| `PROJECT_BRIEF.md` | Entry point: concept, scope, roadmap (this document) | **Regenerated v2.0** |
| `PRD.md` | Product requirements | In progress (swarm) |
| `ARCHITECTURE.md` | System design | In progress (swarm) |
| `DATABASE_SCHEMA.md` | Data model & RLS | In progress (swarm) |
| `API_SPEC.md` | REST API contract | In progress (swarm) |
| `UI_UX_DESIGN.md` | Design spec | In progress (swarm) |
| `FRONTEND_ARCH.md` | Frontend blueprint | In progress (swarm) |
| `BACKEND_ARCH.md` | Backend blueprint | In progress (swarm) |
| `DEPLOYMENT.md` | DevOps & CI/CD | In progress (swarm) |
| `TESTING_STRATEGY.md` | QA plan | In progress (swarm) |
| `SECURITY.md` | Threat model & controls | In progress (swarm) |
| `ROADMAP.md` | Sprint plan & tasks | In progress (swarm) |
| `TECH_STACK.md` | Stack justification | In progress (swarm) |

Every document above must conform to `DECISIONS.md` and `DOMAIN_MODEL.md`; a document that contradicts either is wrong and gets regenerated.

---

## 8. Out of Scope (MVP)

Summary of DECISIONS §4 — not built in MVP:

Secure share links (fast-follow, repurposed v1 machinery) · SSO/SAML · e-signature · document editing/versioning · OCR · folders/tags · deadlines & calendars · billing automation (seat-based pricing designed; invoicing manual) · mobile apps · multi-firm shared case workspaces (v2) · hierarchical clearances (future toggle) · chat/comments.
