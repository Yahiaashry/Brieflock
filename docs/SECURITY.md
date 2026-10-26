# BriefLock — Security & Threat Model

> **Version 2.0 — Regenerated for the legal document exchange core idea**
> **Status:** Active. This document **fully replaces** the obsolete v1 file (the "BriefLink" self-destructing-link threat model). Nothing here describes or inherits from the v1 link shortener; v1 text must not be cited.
> **Normative sources:** `DECISIONS.md` (D2, D6–D11, P1–P8, W1, A1, S1, N1, V1; canonical rate limits §3; MVP success criteria §5) and `DOMAIN_MODEL.md` (access rule A1–A6 §3, deny enum §3.2, clearance matrix §3.3, transfer machine §5, audit enum §6, storage §7, search §8, multi-tenancy invariant §10). Conflicts resolve in favor of those files.
> **Last reviewed:** 2026-10-15

> **Terminology note:** `A1–A6` in §3 are the **access-rule checks** (DOMAIN_MODEL §3). "A1 (audit integrity)" refers to the same-ID decision in DECISIONS §2 (append-only hash chain, audit-before-signed-URL).

---

## 1. Security Architecture Overview

BriefLock secures **case PDFs** (security levels L1/L2/L3), **clearance data**, **transfer state**, and the **audit chain** for law-firm tenants. Four structural properties carry the posture:

| # | Property | Source |
|---|---|---|
| S-1 | Authenticated-only surface: no anonymous pages except login/signup/invite-accept; no public share links in MVP | P4 |
| S-2 | Single enforcement point: the access-rule engine (A1–A6) is the only code path that grants content access; UI, search, and signed-URL issuance defer to it | DOMAIN_MODEL §3 |
| S-3 | Structural tenant isolation: Postgres RLS makes cross-firm rows invisible even against engine bugs — engine = correctness, RLS = containment | DOMAIN_MODEL §10 |
| S-4 | Verifiable history: every access, denial, and admin change appends to an immutable hash-chained `audit_events` table — the chain, not DRM, is the real control | A1 (audit integrity), V1 |

### 1.1 Trust boundaries

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Browser — authenticated app only (P4)                                │
│  pdf.js viewer in CSP-locked sandboxed iframe; dynamic watermark     │
│  (viewer full name + UTC timestamp; mandatory L2/L3 — W1)            │
└───────────────▲──────────────────────────────────────────────────────┘
                │ TLS (Vercel edge) · JWT Bearer · /api/v1 only
┌───────────────┴──────────────────────────────────────────────────────┐
│ Vercel Edge middleware (D2 — Vercel-only deployment)                 │
│  · JWT verification (D10 — Supabase Auth; NO custom auth endpoints)  │
│  · Rate limiting (D7 — in-memory bucket behind RateLimiter iface)    │
│  · Geo capture via request headers (D8); IP salted+hashed at ingest  │
│    before any persistence; raw IP never stored (D9)                  │
└───────────────▲──────────────────────────────────────────────────────┘
                │ service-role credentials (server-side only)
┌───────────────┴──────────────────────────────────────────────────────┐
│ API routes /api/v1 — ACCESS-RULE ENGINE (single enforcement point)   │
│  · Checks A1–A6 evaluated server-side on every content request       │
│  · Audit write (hash-chained) COMMITTED BEFORE signed URL is issued  │
│  · Uniform 403/401 — no existence oracle, no deny-reason echo        │
└──────────┬───────────────────────────────┬───────────────────────────┘
           │ signed URLs (TTL ≤ 60 s)      │ SQL
┌──────────▼──────────────────┐   ┌────────▼──────────────────────────┐
│ Supabase Storage            │   │ Supabase Postgres                 │
│  private bucket, NO public  │   │  RLS on every table (§10)         │
│  path {firm}/{case}/{doc}/  │   │  audit_events: INSERT service-    │
│      {filename}             │   │   role only; NO UPDATE/DELETE     │
│  quarantine-until-scanned   │   │  pg_cron sweeps + verify (D6)     │
└─────────────────────────────┘   └───────────────────────────────────┘
        ▲                                   ▲
        │ emails (transactional only)       │ auth (email/password + magic link)
┌───────┴───────────┐            ┌──────────┴──────────────────────────┐
│ Email provider    │            │ Supabase Auth (D10)                 │
└───────────────────┘            └─────────────────────────────────────┘
```

### 1.2 Component security responsibilities

| Component | Security responsibility | Key controls |
|---|---|---|
| Browser / viewer | Render watermarked PDFs without content leaking outside the session | CSP, sandboxed iframe, no third-party scripts (T4, T5) |
| Edge middleware | Reject unauthenticated/unrated traffic before app logic | D7 rate limits, JWT verify, D9 IP hashing |
| Access-rule engine | Grant/deny content access; emit audit rows **first** | A1–A6, deny enum §3.2, audit-before-URL (A1) |
| Supabase Storage | Hold immutable PDFs; never serve without engine-issued signed URL | Private bucket, path policy, TTL ≤ 60 s (T5, T12) |
| Postgres + RLS | Make cross-firm rows structurally invisible | §10 invariant, policy matrix (§4), RLS test suite |
| Audit log | Tamper-evident record of everything | Append-only, hash chain, verify cron (T6) |
| Transfers | Move documents across firms only with acceptance | State machine §5, designated recipients, revoke (T2, T3) |
| Auth | Identify users; support de-identification | D10 managed flows, `is_active` re-check (A1) |
| Cron jobs (D6) | Cleanup/retention/verify without human triggers | `CRON_SECRET`, least-privilege service role, legal-hold aware |

---

## 2. STRIDE Threat Model

Per component, mapped to BriefLock assets: **PDF content**, **audit chain**, **clearance data**, **transfer state**.

| Component | Assets at risk | STRIDE threats | Primary mitigations |
|---|---|---|---|
| Browser / viewer | PDF content | **S:** session hijack renders victim's files · **T:** DOM tamper strips watermark · **R:** — · **I:** screen capture of view; blob re-fetch via DevTools · **D:** — · **E:** XSS → same-origin API calls | W1 watermark + audit attribution; CSP + sandboxed iframe; no third-party scripts (T4, T5) |
| Edge middleware | All | **S:** stolen/replayed JWTs · **T:** header injection into logs · **R:** forged request attribution · **I:** geo/IP header spoofing skews D8/D9 data · **D:** layer-7 floods · **E:** auth bypass via misverified JWT | D10 managed auth; D9 salt+hash at ingest; D7 limits (T8, T9, T11) |
| Access-rule engine | PDF content, clearance data | **S:** impersonation past A1 · **T:** check-order manipulation · **R:** unlogged access · **I:** existence oracle via differential errors · **D:** expensive per-request queries · **E:** logic bug granting non-diagonal access | A1–A6 single path; audit-before-URL; uniform 403 (§3, T1) |
| Supabase Storage | PDF content | **S:** signed-URL theft/replay · **T:** object overwrite (violates V1) · **R:** — · **I:** public bucket misconfig; path guessing · **D:** 100 MB × N upload floods · **E:** service-key client leak | Private bucket; immutable objects; TTL ≤ 60 s; D11 upload gate (T5, T7, T12) |
| Postgres + RLS | All | **S:** — · **T:** row tampering via privileged SQL · **R:** — · **I:** cross-firm visibility; count/search leaks · **D:** connection exhaustion · **E:** RLS policy gap / `service_role` misuse | §10 invariant + §4 policy matrix; RLS test suite = release blocker |
| `audit_events` | Audit chain | **S:** event written under wrong actor · **T:** UPDATE/DELETE, chain rewrite · **R:** denying real actions (mitigated by chain) · **I:** over-broad SELECT (other firms' events) · **D:** table bloat (retained indefinitely) · **E:** grant creep | Append-only grants; hash chain + 64-zero genesis; verify cron; P7-scoped reads (T6, T10) |
| Transfers | Transfer state, PDF content | **S:** accept by non-designated user · **T:** status flipped outside machine · **R:** sender denies having sent · **I:** recipient-list leakage · **D:** transfer spam · **E:** self-grant of `external` membership | §5 machine; immutable `recipient_user_ids`; audited transitions; revoke (T2, T3) |
| Supabase Auth | Sessions, clearance data | **S:** credential stuffing; magic-link interception · **T:** email-change hijack · **R:** — · **I:** account enumeration · **D:** auth endpoint floods · **E:** role/clearance self-service (blocked) | D10 no custom endpoints; uniform magic-link response; admin-only clearance writes, audited (T9, T10) |
| Cron jobs (D6) | Retention, chain integrity | **S:** unauthorized triggering · **T:** retention deleting under legal hold · **R:** — · **I:** — · **D:** runaway sweeps · **E:** — | `CRON_SECRET`; `legal_hold` check in job; SLO monitoring (T6, §7) |
| Email notifications | Transfer state | **S:** spoofed sender · **T:** — · **R:** — · **I:** case names in email bodies · **D:** mail bombing · **E:** — | Transactional-only mail (§9 DOMAIN_MODEL); minimal payloads; SPF/DKIM (T2) |

---

## 3. Access-Control Deep Dive

### 3.1 Rule checks A1–A6 — implementation notes

All checks are evaluated **server-side** on every content request; the UI never gates anything the engine does not re-verify.

| Check | Deny reason(s) | Implementation notes |
|---|---|---|
| A1 Authenticated & active | `UNAUTHENTICATED` · `DEACTIVATED` | Supabase Auth JWT verified at edge (D10 — no custom auth endpoints; JWT Bearer for API). `profiles.is_active` re-checked server-side per request, so deactivation denies at the next request, not at token expiry. Missing/invalid token → 401 before any document lookup. |
| A2 Firm or accepted transfer | `FIRM_MISMATCH` | `profile.firm_id = document.firm_id` OR profile id ∈ `transfers.recipient_user_ids` of a transfer with status `accepted` carrying this document (via `transfer_items`). Draft/sent/rejected/cancelled/revoked transfers confer **nothing**. |
| A3 Case membership | `NOT_CASE_MEMBER` | Active `case_members` row for `(document.case_id, profile.id)`; roles `lead`/`member` (own firm) or `external` (transfer-admitted). Removal (`member.removed`, transfer revoke) takes effect on the next request — no long-lived cached grants. |
| A4 Exact clearance | `CLEARANCE_MISMATCH` | `profile.clearance_level = document.security_level` as **integer equality — never `>=`**. One clearance per user (P6); compartments are not a hierarchy (§3.2). |
| A5 Scan gate | `UNSCANNED` · `INFECTED` | `scan_status = 'clean'` is the **only** granting value; `pending` and `error` block fail-closed (`UNSCANNED`); `infected` blocks (`INFECTED`). Status transitions happen only in the scan pipeline (service role). |
| A6 Archive gate | `CASE_ARCHIVED` | Archived cases accept no new activity (uploads, transfers, membership edits); reading remains allowed; L3 downloads are additionally gated by §3.1 of DOMAIN_MODEL (`DOWNLOAD_BLOCKED_L3`). |

**Firm-admin exception (P7):** admins read metadata and audit trails of their firm's cases; they receive content **only** when A1–A5 pass for them personally. There is no admin backdoor.

### 3.2 Diagonal-only clearance matrix (the core invariant)

| User ↓ \ Document → | L1 | L2 | L3 |
|---|---|---|---|
| **L1** | ✅ view+download | ❌ `CLEARANCE_MISMATCH` | ❌ `CLEARANCE_MISMATCH` |
| **L2** | ❌ `CLEARANCE_MISMATCH` | ✅ view+download (watermark) | ❌ `CLEARANCE_MISMATCH` |
| **L3** | ❌ `CLEARANCE_MISMATCH` | ❌ `CLEARANCE_MISMATCH` | ✅ view+download (watermark; per-case view-only flag, P5) |

**Why hierarchy fails here.** Clearance denotes the **compartment of matter types** a lawyer is admitted to — not seniority:

- An L3 (war crimes) clearance confers no right to an L2 (murder) file; an L2 lawyer has no business in an unrelated L1 file either — need-to-know is per-compartment.
- A `>=` rule would let any L3 lawyer read **every** sensitive file firm-wide, so one leaked L3 credential or one curious insider exposes the entire archive instead of one compartment.
- Exact match caps the blast radius of any credential leak or insider action at one diagonal cell; P1 records the future hierarchical toggle as noted-not-built.

**Off-diagonal conformance tests** — all six pairs must hold; each denial is logged with `deny_reason = CLEARANCE_MISMATCH`:

| User → Document | Expected external result | Expected audit row |
|---|---|---|
| L1 → L2 | uniform 403 | `document.access_denied`, result `deny`, `CLEARANCE_MISMATCH` |
| L1 → L3 | uniform 403 | same |
| L2 → L1 | uniform 403 | same |
| L2 → L3 | uniform 403 | same |
| L3 → L1 | uniform 403 | same |
| L3 → L2 | uniform 403 | same |

### 3.3 Canonical deny enum & generic-403 leak discipline

Canonical enum (DOMAIN_MODEL §3.2) — the **only** values that may appear in `audit_events.deny_reason`:

`UNAUTHENTICATED` · `DEACTIVATED` · `FIRM_MISMATCH` · `NOT_CASE_MEMBER` · `CLEARANCE_MISMATCH` · `UNSCANNED` · `INFECTED` · `CASE_ARCHIVED` · `DOWNLOAD_BLOCKED_L3`

**Two-channel principle.** The precise reason goes to the audit log; the client gets a uniform, information-free response:

| Channel | Content |
|---|---|
| Internal (`audit_events`) | `result='deny'`, exact `deny_reason`, actor, `ip_hash`, country/city, truncated UA, `details` |
| External (HTTP) | 401 for unauthenticated; otherwise a uniform `403` with a fixed generic body ("Not available") for **all** content denials **and for nonexistent document IDs** — no reason codes, no indication of which check failed, no existence oracle |

**Leak-discipline rules:**

1. **No existence oracle** — lookups filter in-query (DOMAIN_MODEL §8); the response for "does not exist" is byte-identical to "exists but denied", with comparable latency (no early returns that leak which check failed). A probe of an invisible/nonexistent ID is audited with `deny_reason = null` plus an internal `details` flag — the enum stays pure.
2. **Search & counts** — titles, counts, and the existence of inaccessible items are never returned (§8); filtering happens in the query, not after.
3. **Every denial is audited** — no silent drops; denials are security signals.
4. **Deny-spike alert** — ≥5 denials on the same profile within 15 min → alert to the firm admin (probe indicator, T1).

**Canonical rate limits** (DECISIONS §3 — enforced behind the `RateLimiter` interface, D7):

| Endpoint class | Limit | Key | On exceed |
|---|---|---|---|
| Auth (login / magic-link request) | 10/min | IP | 429 + `Retry-After` |
| Upload (`POST /documents`) | 30/min | user | 429 + `Retry-After` |
| Content (`GET /documents/:id/content`) | 60/min | user | 429 + `Retry-After` |
| All other `/api/v1/*` | 100/min | user | 429 + `Retry-After` |

---

## 4. Multi-Tenancy (RLS)

### 4.1 The invariant

Every table carries `firm_id` (or resolves to one via a parent). RLS must make cross-firm rows **structurally invisible** — including through search, counts, and error messages (DOMAIN_MODEL §10). The automated RLS test suite proving this invariant is a **release blocker** (DECISIONS §5: "Zero cross-firm data leakage").

### 4.2 Per-table policy matrix

| Table | SELECT | INSERT | UPDATE | DELETE | Notes |
|---|---|---|---|---|---|
| `firms` | own firm's row | service role (signup) | own `firm_admin` | none | `deactivated_at` blocks firm-wide logins |
| `profiles` | own firm's rows (id, full_name, role, clearance_level) | service role (invite) | self: non-privileged fields; `firm_admin`: `role` / `clearance_level` / `is_active` (audited) | none (deactivate only) | Clearance writes admin-only (P6); changes audited (`clearance.changed`) |
| `cases` | own firm; **external members**: only cases with an active membership row | own-firm members | own-firm lead/admin; `legal_hold` admin-only | none (archive instead) | `case_reference` unique per firm |
| `case_members` | rows for own-firm users + own memberships | own-firm members (own firm) / service role (transfer accept, idempotent) | lead/admin | lead/admin | `external` role enters only via transfer accept |
| `documents` | own firm + cases where caller is an active member — **metadata only**; content always via the engine | own-firm members (scan fields: service role) | level change only — uploader **raise**, firm admin **lower with reason** (both audited, P2) | none (V1 immutability; replacement = new upload) | `storage_path` server-generated (T12) |
| `transfers` | from_firm or to_firm rows | owning-firm case member | state-machine transitions only (trigger-guarded, §5 DOMAIN_MODEL) | none | `recipient_user_ids` designated at send, immutable |
| `transfer_items` | via parent `transfers` policy | service role / owning-firm sender | none | none | |
| `audit_events` | `firm_admin`: own firm's events; lawyer/paralegal: none (least privilege — tighten, don't loosen) | **service role only** | **no policy exists for any role** | **no policy exists for any role** | Append-only per A1 (audit integrity); NDJSON export for cold archive |
| `storage.objects` (bucket policy) | engine-issued signed URLs only; user-JWT direct object access denied | via upload endpoint (service role) | none | retention sweep (service role, legal-hold aware) | Path prefix `{firm_id}/%` enforced |

Design rules: RLS is **containment**, the engine is **correctness** — neither substitutes for the other. Every new table ships with policies **and** RLS-suite probes in the same PR. No `service_role` use outside server functions.

### 4.3 RLS test suite spec (release blocker)

Seeded fixture: 3 firms × 3 clearance levels each, plus cross-firm transfers in every state (draft / sent / accepted / rejected / cancelled / revoked). Every probe runs **as an authenticated user JWT** — never service role:

| # | Probe class | Assertion |
|---|---|---|
| R-1 | Direct storage access | User-JWT GET of another firm's object path → denied |
| R-2 | API by known UUID | Other firm's case/document/transfer IDs → uniform 403/404, body identical to "not found" |
| R-3 | Search | Terms from another firm's titles/case references → zero rows; no counts or totals leaked |
| R-4 | Aggregates & pagination | List endpoints, counts, page totals expose no cross-firm rows or totals |
| R-5 | Error messages | Constraint/validation errors contain no other-firm identifiers |
| R-6 | Transfer lifecycle | Pre-accept: invisible; accepted: visible per full rule; after revoke: invisible again on next request |
| R-7 | Deactivated user | `is_active = false` → nothing accessible |
| R-8 | Admin scope (P7) | Firm admin sees own-firm metadata + audit only — no content, no other firm |

**Gate:** any single leak = release blocker. Suite runs in CI on every migration touching tables or policies.

---

## 5. Threat Catalog & Mitigations

| ID | Threat | Vector | Mitigation | Refs |
|---|---|---|---|---|
| T1 | Clearance probing / enumeration | Scripted requests across document IDs/levels hunting for existence oracles, timing differentials, or count leaks | Uniform 403 + no existence oracle (§3.3); in-query filtering; rate limits cap probe speed; every denial audited → deny-spike alert (≥5/15 min) to firm admin | §3.3, D7, §3.2 |
| T2 | Transfer abuse — acceptance by non-designated recipient | Any to-firm user hitting the accept endpoint | Accept/reject permitted **only** to profiles in `recipient_user_ids` (designated at send, immutable); `to_firm ≠ from_firm`; sender must be owning-firm case member; all transitions audited with `transfer_id`; notification email gives both firms visibility | §5, §9 |
| T3 | Revoked transfer still accessible | Recipient keeps using old membership/URLs after revoke | Engine re-evaluates A2/A3 **per request**; revoke (owning-firm admin) removes future access — `external` memberships removed so RLS re-hides rows; outstanding signed URLs die within TTL ≤ 60 s; past access remains fully audited | §5, §3.1 |
| T4 | Watermark bypass | Screenshot, photo, print, copy/paste, re-typing | **Deterrence, not DRM.** W1 overlay (viewer full name + UTC timestamp, mandatory L2/L3) provides attribution; the real control is the immutable audit trail, plus the P5 per-case view-only flag and firm disciplinary/DPA consequences. No technical prevention is promised — screenshot/print disclosure is handled as a disclosure incident (§8.3 discipline) | W1, P5, §8 |
| T5 | Signed-URL leakage / replay | URL shared, logged in referrers/proxies, reused after TTL | TTL ≤ 60 s; issued **only after** the `document.viewed` / `document.downloaded` audit row is committed (audit-before-URL, A1); `Cache-Control: private, no-store` — no CDN caching; URL scoped to one storage object; viewer in sandboxed iframe | A1, §7 |
| T6 | Audit tampering | Privileged UPDATE/DELETE, chain rewrite, partial restore | Append-only: **no UPDATE/DELETE policies exist for any role**; INSERT = service role only; chain `entry_hash = SHA256(prev_hash ‖ canonical_json(all non-hash fields))`, genesis `prev_hash` = 64 zeros; pg_cron verify job (D6) recomputes the chain and alerts on mismatch; mismatch handled per §8.1 — **never restore blindly** | A1, D6, §8.1 |
| T7 | Malware via PDF | Crafted PDF with embedded JS/OpenAction/launcher; malicious upload | **Quarantine-until-scanned**: `scan_status != 'clean'` blocks all access (A5); D11 in-function validation — magic bytes (`%PDF-`), size ≤ 100 MB, embedded-JS/structure heuristics inside the upload function; **never** third-party scanning APIs (client legal files never leave the platform); ClamAV container = fast-follow, the only sanctioned future non-Vercel infra; infected → `INFECTED` deny + `document.scan_failed` audit + admin alert | D11, A5 |
| T8 | Rate-limit abuse / DoS | Credential stuffing, upload floods, expensive content requests | D7 canonical limits (§3.3) with 429 + `Retry-After`; in-memory per-instance token bucket behind the `RateLimiter` interface; Upstash Redis drop-in path when multi-instance consistency is needed; upload cap 100 MB (schema check) | D7, §3.3 |
| T9 | Auth attacks | Credential stuffing, magic-link phishing, enumeration of registered emails | D10: **no custom auth endpoints** — attack surface limited to managed Supabase Auth flows; magic-link request responds uniformly whether or not the account exists (no enumeration); `auth.login_failed` audited; 10/min/IP auth rate limit; deactivated profiles denied by A1 at every request; MFA = recommended fast-follow | D10, A1, §3.3 |
| T10 | Insider risk | Curious firm admin or staff; self-promotion of clearance | P7: admins see metadata + audit logs only, **never content** without passing A1–A5 themselves; no admin backdoor in code or SQL; `clearance.changed`, `member.*`, `document.level_raised/lowered` audited with actor; one clearance per user (P6); lowering a level requires admin + reason (P2) | P7, P6, P2, §6 |
| T11 | IP / geo privacy violation | Persisting raw IPs; third-party enrichment of client legal access patterns | D9: raw IPs **never** persisted — salted SHA-256 at ingest (`ip_hash`), salt in server env; country (city when available) from D8 Vercel geo headers — no third-party GeoIP vendor; UA truncated to 200 chars; no client legal data leaves the platform for enrichment | D9, D8 |
| T12 | SSRF / RLS circumvention via storage paths | User-controlled path prefixes; server-side URL fetching; direct storage API access | `storage_path` is server-generated `{firm_id}/{case_id}/{document_id}/{filename}` — the client supplies only the file; no server-side URL-fetch feature exists (nothing for SSRF to target); direct object access requires engine-issued signed URLs; bucket policies enforce the firm prefix | §7, §4.2 |
| T13 | Secrets mismanagement | Service-role key in client bundle; salt / `CRON_SECRET` in repo; stale keys | Server-only secrets via Vercel encrypted env vars; client receives only the public anon key (RLS and engine still apply); rotation table (§7); build-time lint gate fails on secret-shaped strings in the client bundle; no secrets in `audit_events.details` | §7 |

---

## 6. Security Test Matrix

### 6.1 Unit — deny reasons

| Stimulus | Expected `deny_reason` (audit) | External response |
|---|---|---|
| No/invalid JWT | `UNAUTHENTICATED` | 401 |
| `is_active = false` | `DEACTIVATED` | uniform 403 |
| Other firm, no transfer | `FIRM_MISMATCH` | uniform 403 |
| Same firm, not on case | `NOT_CASE_MEMBER` | uniform 403 |
| Any off-diagonal clearance pair | `CLEARANCE_MISMATCH` | uniform 403 |
| `scan_status = pending` or `error` | `UNSCANNED` | uniform 403 |
| `scan_status = infected` | `INFECTED` | uniform 403 |
| Archived case, new activity | `CASE_ARCHIVED` | uniform 403 |
| L3 download, `allow_l3_download = false` | `DOWNLOAD_BLOCKED_L3` | uniform 403 (view still allowed, watermarked) |
| Nonexistent / invisible document ID | `null` + internal not-visible `details` flag | uniform 403 identical to denied ID |

### 6.2 Integration — RLS suite

Spec in §4.3; **release blocker**; runs on every migration touching tables or policies.

### 6.3 E2E

| Suite | Coverage |
|---|---|
| 3×3 clearance matrix | All 9 cells: 3 diagonal allows (watermark present on L2/L3 views; L3 view-only case blocks download) + 6 off-diagonal denials, each with an audit row |
| Transfer revocation | send → accept (designated recipient becomes `external` member; access under full rule) · reject · cancel · revoke → access gone on next request · non-designated user cannot accept · sender notified |
| Audit integrity | Chain verifies over seeded events; direct DB tamper of one row (test-only) → verify job flags mismatch and alerts |
| Scan gate | `pending` / `error` / `infected` all block; `clean` allows; upload → first L1 view < 60 s including scan gate (DECISIONS §5) |

### 6.4 CI gates

| Gate | Suite | Failure action |
|---|---|---|
| **RLS suite** | §4.3 | **RELEASE BLOCKER** |
| **Clearance-matrix E2E** | §6.3 | **RELEASE BLOCKER** |
| **Audit-chain verify** | §6.3 + §8.1 runbook | **RELEASE BLOCKER** |
| Scan gate | §6.3 | Must-fix |
| Deny-reason unit matrix | §6.1 | Must-fix |
| Deny-spike alert test | §3.3 | Must-fix |
| Audit-before-signed-URL ordering test | A1 | Must-fix |
| Secret-in-client-bundle lint | §7 / T13 | Must-fix |

---

## 7. Secrets & Key Management

| Env var / key | Scope & consumer | Rotation | Blast radius if leaked |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Server functions only — bypasses RLS, inserts audit rows | Supabase dashboard + redeploy; immediately on suspicion | **Critical**: full data access, RLS bypass, audit writes — treat as breach (§8.4) |
| `IP_HASH_SALT` | Server ingest path (D9) | Quarterly + on compromise; affects only future hashes | Low-direct: SHA-256 is one-way; a leak enables offline brute-force of low-entropy IPs → rotate and shorten `ip_hash` retention |
| `CRON_SECRET` | Vercel cron endpoints (D6) | Scheduled + on compromise; update Vercel config | Triggering sweeps (signed-URL cleanup, retention, verify) — could force deletions |
| Email API key (transactional provider) | Server email send (§9 DOMAIN_MODEL) | Vendor rotation | Phishing from the platform domain |
| Supabase JWT signing keys | Supabase-managed (D10) | Supabase-managed; prefer asymmetric keys with JWKS verification | Session forgery if mismanaged |
| `NEXT_PUBLIC_*` anon key | Client bootstrap | Public by design | None beyond RLS/engine — by design |

Rules: no secret ever in the client bundle or repo (lint gate, T13); no secrets in audit `details`; quarterly rotation plus immediate rotation on any §8.4 event; Vercel encrypted env vars only.

---

## 8. Incident Response

### 8.0 Detection hooks

| Signal | Source | Route |
|---|---|---|
| Chain-mismatch flag | Verify cron job (T6) | Ops on-call |
| Deny-spike (≥5 denials / profile / 15 min) | `audit_events` monitor (§3.2) | Firm admin email |
| `document.scan_failed` | Scan pipeline | Firm admin + ops |
| Auth-failure spike | `auth.login_failed` rate | Ops |
| Revoked-user access attempt | `deny_reason` on removed member | Firm admin |

### 8.1 Audit chain mismatch

1. **Contain:** snapshot current `audit_events` + NDJSON export immediately; freeze deploys touching the audit writer.
2. **Locate:** binary-search the chain to the first divergent entry.
3. **Do NOT restore blindly** — restoring an older backup erases genuine post-backup events and creates a second, false truth; the chain is evidence.
4. **Diagnose:** writer bug in canonical JSON vs. malicious write vs. partial restore — different remedies.
5. **Malicious write:** treat as breach — preserve evidence, involve counsel, assess §8.2 notification duties.
6. **Recover:** document a formal re-genesis event (new anchor, signed note in the incident record); never silently rewrite history.
7. **Lessons:** regression test for the canonical-JSON writer; paging test for the verify-job alert.

### 8.2 Cross-firm leak report

1. **Contain:** identify case/document/transfer; revoke the transfer and remove `external` memberships; confirm via R-2/R-6 probes that rows are invisible; force re-auth of affected users.
2. **Eradicate:** root-cause (engine bypass, RLS gap, admin error, signed-URL replay); patch; add a regression probe to the §4.3 suite.
3. **Notify:** firm admins (controllers); assess GDPR Art. 33 processor duty — BriefLock notifies the controller without undue delay; the controller notifies the authority.
4. **Record:** system audit events for all containment actions; incident postmortem.

### 8.3 Infected-document exposure (incl. watermark/screenshot disclosure handling)

1. **Contain:** set `scan_status = 'infected'` → A5 blocks all access at the next request; audit; notify firm admin.
2. **Eradicate:** delete the object only after firm confirmation, with a chain-noted record; firm-side endpoint-cleanup guidance.
3. **Lessons:** review D11 heuristic coverage; prioritize the ClamAV fast-follow; any exposure that happened pre-scan-flag is handled at §8.2 severity. Screenshot/print leaks of watermarked views (T4) follow the same contain → attribute (watermark) → notify-firm → postmortem pattern.

### 8.4 Credential compromise

| Compromised | Containment | Follow-up |
|---|---|---|
| User account | Deactivate profile (A1 denies at next request); revoke sessions via Supabase admin; review the actor's audit trail in the window; re-invite | Check for privilege changes (`clearance.changed`, `member.role_changed`); rotate credentials |
| Service-role key | Rotate immediately (§7); redeploy | Review `audit_events` for anomalous inserts; assess chain integrity (§8.1) |
| `CRON_SECRET` | Rotate + update Vercel config | Review cron invocation logs for unauthorized runs |

### 8.5 Severity ladder

| SEV | Example | Response target |
|---|---|---|
| 1 | Cross-firm leak; malicious chain mismatch | Immediate; §8.1 / §8.2 |
| 2 | Infected exposure; service-key leak | Same day |
| 3 | User credential compromise; confirmed probing | 24 h |
| 4 | Anomalous but contained signals | Weekly triage |

---

## 9. Compliance Mapping

| Area | Requirement | BriefLock implementation | Status |
|---|---|---|---|
| GDPR role split | BriefLock = **processor**; firms = controllers | P8; DPA template; instructions accepted only from firm admins | Built |
| Art. 5 integrity & confidentiality | Protect personal data | RLS (§10), access-rule engine, TLS, Supabase encryption at rest | Built |
| Art. 32 security of processing | Appropriate technical measures | This document; pseudonymization via `ip_hash` (D9); hash-chained audit; scan gate | Built |
| Art. 33 breach notification | Processor notifies controller without undue delay | §8.2 procedure | Built (process) |
| Art. 30 records of processing | Maintain records | `audit_events` + NDJSON export for cold archive | Built |
| Right to erasure | Delete on controller request | Firm-requested document deletion; profile **anonymization** (names/emails stripped) — audit hash-chain entries retained in pseudonymous form because chain integrity requires non-deletion; stated in the DPA | Built |
| Retention & legal hold | Deletion exceptions honored | `firms.settings` retention days + `cases.legal_hold` overrides deletion; pg_cron retention sweep (D6) skips held cases | Built |
| Client confidentiality (bar obligations) | Protect client information; need-to-know | Exact-match compartments (§3.2), watermarks (W1), full audit trail, no third-party file access (D11) | Built |
| SOC 2 | Post-MVP roadmap (P8) | CC6 logical access ← A1–A6 + RLS · CC7 system monitoring ← verify job + alerts · CC8 change management ← CI gates (§6.4) | Roadmap |

---

## 10. Security Checklist (Ship Gates)

- [ ] RLS suite green — **release blocker** (§4.3)
- [ ] 3×3 clearance-matrix E2E green — **release blocker** (§6.3)
- [ ] Audit-chain verify job green + alert wired — **release blocker** (§8.1)
- [ ] Audit-before-signed-URL ordering test green (A1)
- [ ] Scan gate blocks `pending` / `error` / `infected`; only `clean` grants (A5)
- [ ] Signed URLs: TTL ≤ 60 s, `Cache-Control: private, no-store`, no CDN caching (T5)
- [ ] Uniform-403 discipline verified: nonexistent-ID response identical to denied-ID response (§3.3)
- [ ] Deny enum exhaustive — no ad-hoc deny reasons in code (§3.3)
- [ ] Rate limits per DECISIONS §3 wired; 429 + `Retry-After` (D7)
- [ ] Cron endpoints behind `CRON_SECRET`; retention sweep respects `legal_hold` (D6)
- [ ] No secrets in the client bundle (build gate — T13)
- [ ] Raw IPs absent from every table and log; only `ip_hash` (D9)
- [ ] Watermark mandatory on L2/L3 views; per-case L3 view-only flag tested (W1, P5)
- [ ] Deny-spike alert (≥5/15 min) delivered to the firm admin (§3.2)
- [ ] No UPDATE/DELETE grants on `audit_events` — verified by test (A1)
- [ ] Transfer transitions trigger-guarded; non-designated accept impossible (§5)
- [ ] Deactivation denies at next request (A1); sessions revocable
- [ ] DPA template + retention + legal-hold flags wired (P8)
- [ ] Incident runbooks (§8) linked from the ops dashboard

---

*End of SECURITY.md v2.0. Normative authority: `DECISIONS.md` + `DOMAIN_MODEL.md`; conflicts resolve in their favor.*
