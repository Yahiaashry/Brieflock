# BriefLock — Decisions & Contract (v2.0)

> **Status:** 🔒 LOCKED — Single source of truth for every document in this suite.
> **Rule:** Any document that contradicts this file is wrong. Regenerate the document, not the contract.
> **Supersedes:** All v1 documents (archived in `docs-v1-archive/`).

---

## 1. Core Product Definition

BriefLock is a **secure document exchange and case-file management platform for law firms**. Law firms create cases, upload case PDFs, assign each document a **security level** (L1 = standard sensitivity, e.g., property theft; L2 = high sensitivity, e.g., murder case; L3 = maximum sensitivity, e.g., war crimes), and exchange documents with other firms through **audited, acceptance-gated transfers**.

Every lawyer holds **one clearance level**. Access to a document's content requires **all** of the following simultaneously:

1. The user belongs to the owning firm **or** was granted access via an accepted transfer;
2. The user is a member of the case;
3. The user's clearance level **exactly equals** the document's security level — **compartments, not a hierarchy**: an L3 lawyer cannot open an L2 PDF, and an L2 lawyer cannot open an L3 PDF;
4. The document has passed malware scanning.

Every access, every **denied** attempt, and every administrative change is recorded in an **immutable, hash-chained audit log** ("severe telemetry"). There is no unauthenticated access to anything in MVP.

---

## 2. Locked Decisions

| ID | Decision | Detail |
|----|----------|--------|
| D2 | **Vercel-only deployment** | App runs on Vercel. Domain name: **TBD** (use `app.example.com` placeholders; never invent a brand domain). Sole infra exception: D11 scanner note. |
| D6 | **Cron** | Supabase `pg_cron` every 1 min for sweep jobs (signed-URL cleanup, retention) + lazy read-time checks as the real enforcer. Cron endpoints protected by `CRON_SECRET`. |
| D7 | **Rate limiting** | In-memory per-instance token bucket in MVP, behind a `RateLimiter` interface so Upstash Redis can slot in later. Canonical limits in §4. |
| D8 | **GeoIP** | Vercel request geo headers (`request.geo`). No third-party GeoIP vendor, no client legal data leaves the platform for enrichment. |
| D9 | **IP privacy** | IPs salted+hashed (SHA-256) at ingest; salt in server env var; raw IPs **never** persisted; store country (and city when available) alongside. |
| D10 | **Auth** | Supabase Auth: email/password + magic link. **No custom auth API endpoints.** JWT Bearer for API. Roles: `firm_admin` \| `lawyer` \| `paralegal`. One clearance per user. |
| D11 | **Malware scanning** | Vercel-only constraint ⇒ MVP = PDF structure validation (magic bytes, embedded-JS heuristics) in-function + **quarantine-until-scanned** (`scan_status != 'clean'` blocks all access). Full ClamAV container = fast-follow; documented as the only future non-Vercel infra piece. **Never** send client files to third-party scanning APIs. |
| P1 | **Clearance semantics** | Exact-match compartments (non-hierarchical). Future toggle for hierarchical (L3⊃L2⊃L1) noted, not built. |
| P2 | **Document security level** | Case carries a default level; uploader may **raise** per document (audited); **lowering requires firm admin** (audited, with reason). |
| P3 | **Cross-firm sharing** | One-way **transfers**: owning-firm sender designates recipient users → recipient accepts/rejects → on acceptance, recipients become external case members and gain document access (still subject to the full access rule). |
| P4 | **MVP access surface** | Authenticated app only. **No public share links, no anonymous pages except login/signup/invite-accept.** Secure expiring share links are a fast-follow (repurposed v1 machinery). |
| P5 | **L3 handling** | Watermarked in-browser view + download by default; a per-case flag can switch L3 to **view-only** (download blocked, attempt logged as denial). |
| P6 | **Clearance per user** | Exactly **one** clearance level per profile (`clearance_level int` in `DOMAIN_MODEL.md` §2.2). Multi-level users are out of scope for MVP. |
| P7 | **Firm admin visibility** | Admins see metadata + audit logs for their firm. **Never** document content without clearance + case membership. No admin backdoor. |
| P8 | **Compliance posture** | Security baseline + GDPR-aligned (BriefLock = processor for firms; DPA template; legal-hold flag; retention settings). SOC 2 = post-MVP. |
| W1 | **Watermarking** | In-browser PDF viewer overlays dynamic watermark: viewer full name + UTC timestamp. **Mandatory for L2 and L3**; optional for L1. |
| A1 | **Audit integrity** | `audit_events` is append-only (no UPDATE/DELETE grants at all, service-role insert only), hash-chained (`entry_hash = SHA256(prev_hash ‖ canonical_event)`), genesis `prev_hash` = 64 zeros. Content access events are written **synchronously before** the signed URL is issued. Denials are logged with reason codes. |
| S1 | **SLOs (canonical, p95)** | Signed-URL issuance < 100 ms · API < 200 ms · dashboard initial load < 2 s · uptime 99.9%. |
| N1 | **Naming contract** | `document` (never "link") · `security_level` (documents) · `clearance_level` (users) · `transfer` · `audit_event`. API prefix `/api/v1`. Health: `GET /api/v1/health`. Identifiers: documents/cases referenced by UUID in API paths; no guessable sequential IDs. |
| V1 | **Document immutability** | Uploaded documents are immutable (no editing, no in-place versioning). Replacement = upload a new document. Case and metadata edits are audited. |

---

## 3. Canonical Rate Limits (MVP)

| Endpoint class | Limit | Key | On exceed |
|---|---|---|---|
| Auth (login / magic-link request) | 10/min | IP | 429 + `Retry-After` |
| Upload (`POST /documents`) | 30/min | user | 429 + `Retry-After` |
| Content (`GET /documents/:id/content`) | 60/min | user | 429 + `Retry-After` |
| All other `/api/v1/*` | 100/min | user | 429 + `Retry-After` |

---

## 4. Out of Scope (MVP)

Secure share links · SSO/SAML · e-signature · document editing/versioning · OCR · folders/tags · deadlines & calendars · billing automation (seat-based pricing designed, invoicing manual) · mobile apps · multi-firm shared case workspaces (v2) · hierarchical clearances (future toggle) · chat/comments.

## 5. MVP Success Criteria

- **Zero** cross-firm data leakage (proven by automated RLS test suite — release blocker).
- Every content access **and** denial auditable within 1 s; hash chain verifies.
- Upload → first view of an L1 document < 60 s including scan gate.
- SLOs in §2/S1 met; clearance-matrix E2E suite green (3×3 allow/deny matrix).
