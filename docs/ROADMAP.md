# BriefLock — Sprint Plan, Task Breakdown & Roadmap

> **Version 2.0**
> **Product:** BriefLock — secure document exchange and case-file management platform for law firms (firms/tenancy, cases, security-leveled PDFs with exact-match clearance compartments, acceptance-gated cross-firm transfers, immutable hash-chained audit, watermarked viewer, private storage).
> **Document owner:** PM (Technical Program Manager)
> **Status:** Draft v2.0 — supersedes the v1.0 link-shortener roadmap (archived in `docs-v1-archive/`)
> **Timeline:** 4-week MVP, 2 developers (~80 SP) → GA in weeks 6–8
> **Stack:** Next.js + TypeScript + Supabase (Postgres, Auth, Storage, pg_cron) + Vercel
> **Normative sources:** `DECISIONS.md` (locked contract) · `DOMAIN_MODEL.md` (locked model, Access Rule §3, Transfer State Machine §5). This plan implements them; it never amends them.

---

## 1. Executive Summary

BriefLock ships a security-first MVP in **4 weeks with 2 developers (~80 story points)**. The build order is deliberately inverted from a typical CRUD app: **tenancy + RLS first, the access-control service and audit trail second, features (transfers, search, admin) third, hardening and beta last.** The reasoning: every later feature composes with the Access Rule (`DOMAIN_MODEL.md` §3), so the rule, its RLS enforcement, and its audit instrumentation must exist and be proven before anything is layered on top.

**Success metrics (MVP, from `DECISIONS.md` §5):**
- **Zero** cross-firm data leakage — proven by an automated RLS test suite (**release blocker**).
- Every content access **and** denial auditable within 1 s; hash chain verifies.
- Upload → first view of an L1 document < 60 s including the scan gate.
- SLOs met (p95): signed-URL issuance < 100 ms · API < 200 ms · dashboard initial load < 2 s · uptime 99.9%.
- Clearance-matrix E2E suite green (3×3 allow/deny matrix — only the diagonal opens).

**Milestones:** M1 Alpha end-W2 (upload → view with clearance gating works internally) · M2 Beta end-W4 (transfers + audit live, 2–3 pilot firms) · M3 GA weeks 6–8 (billing, ClamAV, share links fast-follows).

### 1.1 Sprint overview (Gantt-style, Epics × Weeks)

| Epic / Workstream | Wk 1 | Wk 2 | Wk 3 | Wk 4 |
|---|---|---|---|---|
| E1 Tenancy & Auth (schema, RLS core, auth, invites, middleware, CI) | ████ | | | |
| E2 Cases (CRUD, membership) | █ | | █ | |
| E3 Documents & Viewer (upload pipeline, scan gate, watermarked viewer) | | ████ | | |
| E4 Access Control & Audit (assertDocumentAccess, content endpoint, chain, explorer) | | ███ | ███ | |
| E5 Transfers (state machine, accept/reject/revoke, inbox) | | | ████ | |
| E6 Admin & Governance (members, clearance changes, denial alerts) | | | ██ | |
| E7 Search & Notifications | | | █ | |
| E8 Hardening & Launch (E2E matrix, RLS suite green, SLOs, beta) | | | | ████ |

Legend: `█` ≈ one week-equivalent of effort, proportional to epic SP. E2 and E4 intentionally straddle weeks (case CRUD seeds W2's upload flow; the audit explorer lands after the chain it browses).

### 1.2 Capacity & estimation conventions

| Item | Assumption |
|---|---|
| Team | 2 developers (Dev A = security-core/backend-leaning, Dev B = RLS-tests/frontend-leaning) |
| Estimation unit | Story points; 1 SP ≈ 4 ideal hours |
| Productive capacity | ~10 SP / dev / week (~40 SP / dev over 4 weeks) |
| Planned scope | **80 SP** — W1 20 · W2 20 · W3 22 · W4 18 |
| Peak note | W3 runs at 22 SP (transfers + audit + admin + search land together); W4's lighter 18 SP is the deliberate buffer for the carry-over rule in §7.2 |

---

## 2. 4-Week Sprint Breakdown (security-first build order)

### Week 1 — Foundation & Tenancy
**Goal:** A lawyer at Firm A can be invited, sign up (email/password or magic link), sign in, and see only Firm A's cases. Firm B's rows are structurally invisible at the database level. Supabase project, full schema, core RLS, and CI are live.

| Day | Focus |
|---|---|
| 1 | Supabase project provisioning; Next.js App Router scaffold (TS strict, Tailwind); repo + **CI skeleton** (lint, typecheck, test harness, Vercel preview per PR) |
| 2–3 | **Full schema migrations** per `DOMAIN_MODEL.md` §2: `firms`, `profiles`, `cases`, `case_members`, `documents`, `transfers`, `transfer_items`, `audit_events` — constraints, UUID PKs, storage-path convention, indexes |
| 3–4 | **RLS for tenancy core**: `firms`, `profiles`, `cases`, `case_members` — cross-firm invisible by construction; policy test scaffold in CI from day one |
| 4 | **Auth**: Supabase Auth email/password + magic link (D10 — no custom auth endpoints); session handling; JWT Bearer for `/api/v1` |
| 5 | **Invite flow**: firm admin invites → transactional email → invite-accept page (one of the only anonymous pages allowed, per P4) → profile bootstrap with role + clearance; **middleware route protection**; minimal **case CRUD** (title, reference, `default_security_level`, `allow_l3_download`, `legal_hold`) so W2 has somewhere to upload |

**Exit criteria:** Signup / login / magic-link / logout / invite-accept work end-to-end; unauthenticated routes redirect; an RLS smoke test proves Firm B cannot see Firm A's cases; CI green on every PR.

### Week 2 — Documents & Access Control (the core invariant week)
**Goal:** An authorized lawyer uploads a PDF, it passes the scan gate, and only a lawyer whose clearance **exactly equals** the document's security level can view it — watermarked — with every access and denial audited before the signed URL is issued.

| Day | Focus |
|---|---|
| 1 | **Private storage bucket** (no public buckets, ever) + **upload pipeline**: `POST /api/v1/documents` — magic-bytes check, `application/pdf` only, ≤ 100 MB, SHA-256 computed, `scan_status='pending'` |
| 1–2 | **Scan gate** (D11): in-function PDF structure validation (embedded-JS heuristics) → `clean` \| `infected`; quarantine semantics — anything not `clean` blocks all access |
| 2–3 | **`assertDocumentAccess` service** implementing Access Rule A1–A6 (`DOMAIN_MODEL.md` §3) with the canonical deny-reason enum; exhaustively unit-tested (this is the most reviewed code in the repo) |
| 3 | **Append-only audit writer + hash chaining** (A1): `entry_hash = SHA256(prev_hash ‖ canonical_event)`, genesis = 64 zeros, service-role insert only, IP salted-hashed at ingest (D9) |
| 4 | **Content endpoint** `GET /api/v1/documents/:id/content`: audit-then-signed-URL (A1 — the `document.viewed` row commits **before** the ≤ 60 s signed URL is issued); L3 download gate (`DOWNLOAD_BLOCKED_L3`); leak-safe denials (existence never revealed to non-members) |
| 4–5 | **Watermarked pdf.js viewer**: CSP-locked sandboxed iframe, dynamic overlay (viewer full name + UTC timestamp), mandatory for L2/L3 (W1 decision) |
| 5 | **LevelBadge + interstitials** (scan-pending / infected / denied-with-reason); upload UI with raise-only leveling (P2 — lowering is admin-only, later); **RLS test suite started**: documents + transfers policies, first automated cross-firm invisibility tests |

**Exit criteria (M1 Alpha):** Upload → view of an L1 document < 60 s including scan gate; 3×3 clearance behavior enforced server-side (non-diagonal = `CLEARANCE_MISMATCH` denial, logged); every view/denial writes an audit row; viewer renders with watermark and no console errors.

### Week 3 — Transfers, Audit & Admin
**Goal:** Firms can exchange documents through audited, acceptance-gated transfers; admins can govern members and clearances; the audit log becomes a browsable, verifiable product surface.

| Day | Focus |
|---|---|
| 1 | **Transfer state machine** (`DOMAIN_MODEL.md` §5): `draft → sent → accepted/rejected/cancelled`, `accepted → revoked` (owning-firm admin only); recipients designated at send time; all transitions audited with `transfer_id`; **case membership management** (own-firm add/remove, `lead`/`member`, audited) |
| 1–2 | **Accept/reject/revoke**: recipient-only accept/reject; on acceptance, designated recipients inserted into `case_members` as `external` (idempotent) and gain document access **under the full Access Rule**; **transfer inbox/outbox UI** |
| 2 | **Email notifications**: `transfer.sent` → recipients, `transfer.accepted/rejected` → sender, invite (transactional only, D-model §9) |
| 3 | **Audit explorer UI**: filter by case / document / actor / result / deny reason; NDJSON export endpoint for cold archive; **hash-chain verify** (nightly pg_cron + on-demand) |
| 3–4 | **Firm admin**: member management (roles, deactivation); **clearance changes** (admin-only, audited, reason required) and document-level lowering (admin-only, audited, reason — P2); **denial alerts** (≥ 5 denials on one profile within 15 min → firm-admin email) |
| 5 | **Clearance-aware search** (`GET /api/v1/search`): filtering happens **in the query**, never post-hoc — titles, counts, and existence of inaccessible items are never leaked (D-model §8) |

**Exit criteria:** A full transfer round-trip works (send → accept → external member views a transferred L1/L2 document); rejected/revoked access is cut off; chain verify returns OK; admin sees firm metadata + audit but **no content backdoor** (P7); search returns only accessible items.

### Week 4 — Hardening & Launch
**Goal:** Prove the invariants, break them before an attacker does, and put the beta in front of 2–3 pilot firms.

| Day | Focus |
|---|---|
| 1–2 | **Full clearance-matrix E2E** (Playwright): 3×3 allow/deny matrix, both firms, including `DOWNLOAD_BLOCKED_L3`, archived-case reads, deactivated users, revoked transfers; **RLS suite driven to green — release blocker** |
| 2 | **Rate limits** per canonical table (`DECISIONS.md` §3): auth 10/min/IP, upload 30/min/user, content 60/min/user, other 100/min/user — in-memory token bucket behind a `RateLimiter` interface (D7), 429 + `Retry-After` |
| 3 | **Security headers** (CSP, HSTS, `frame-ancestors`, nosniff, referrer-policy) + **no-public-bucket audit**; pg_cron schedules + `CRON_SECRET` verification; **k6 performance tests vs SLOs** |
| 4 | **Security review against the `SECURITY.md` checklist** (RLS bypass attempts, signed-URL leakage, watermark threat model, deny-reason info leaks, rate-limit bypass); **DPA / privacy / terms stubs** live (P8 — BriefLock = processor) |
| 5 | **Production deploy** to Vercel (env vars, cron, secrets); **beta onboarding for 2–3 pilot firms** with feedback loop; sprint retrospective + post-MVP grooming |

**Exit criteria (M2 Beta):** All release criteria (§8) green, including both REQUIRED blockers; pilot firms uploading and exchanging real documents under NDA-grade handling.

---

## 3. Epics & User Stories (mapped to sprints)

### E1 — Tenancy & Auth (W1 · 18 SP)
| ID | Story | Acceptance criteria (summary) | Sprint | SP |
|----|-------|-------------------------------|--------|----|
| E1.1 | Provision Supabase + scaffold + CI skeleton | Migrations versioned; CI runs lint/typecheck/tests; preview deploy per PR | W1 | 2 |
| E1.2 | Full schema | All 8 tables per `DOMAIN_MODEL.md` §2 with constraints, UUID PKs, indexes; seed/test fixtures | W1 | 5 |
| E1.3 | RLS tenancy core | `firms`/`profiles`/`cases`/`case_members` cross-firm invisible; policy tests in CI | W1 | 4 |
| E1.4 | Auth (email/password + magic link) | Supabase Auth only, no custom auth endpoints; sessions persist; JWT Bearer on `/api/v1` | W1 | 3 |
| E1.5 | Firm invite flow | Admin invites → email → accept page (only anonymous page besides login/signup) → active profile with role + clearance | W1 | 2 |
| E1.6 | Middleware route protection | All app routes require an active session; deactivated users bounced | W1 | 2 |

### E2 — Cases (W1 + W3 · 4 SP)
| ID | Story | Acceptance criteria (summary) | Sprint | SP |
|----|-------|-------------------------------|--------|----|
| E2.1 | Case CRUD | Create/close/archive; `default_security_level`, `allow_l3_download`, `legal_hold`; all edits audited (`case.*` actions) | W1 | 2 |
| E2.2 | Case membership management | Own-firm add/remove, `lead`/`member`; `member.added`/`removed`/`role_changed` audited | W3 | 2 |

### E3 — Documents & Viewer (W2 · 9 SP)
| ID | Story | Acceptance criteria (summary) | Sprint | SP |
|----|-------|-------------------------------|--------|----|
| E3.1 | Upload pipeline + scan gate | Magic bytes + mime + ≤ 100 MB; SHA-256; `pending → clean/infected`; non-clean blocks all access; private bucket, path `{firm_id}/{case_id}/{document_id}/{filename}` | W2 | 5 |
| E3.2 | Watermarked pdf.js viewer | Sandboxed CSP iframe; overlay = viewer name + UTC; mandatory L2/L3, optional L1; no console errors | W2 | 3 |
| E3.3 | LevelBadge + interstitials | Level chip on every doc; distinct pending/infected/denied states; upload UI raises level only (P2) | W2 | 1 |

### E4 — Access Control & Audit (W2 + W3 · 15 SP)
| ID | Story | Acceptance criteria (summary) | Sprint | SP |
|----|-------|-------------------------------|--------|----|
| E4.1 | `assertDocumentAccess` service | A1–A6 checks, canonical deny reasons, fully unit-tested; single choke point for all content paths | W2 | 3 |
| E4.2 | Content endpoint (audit-then-signed-URL) | Audit row committed before signed URL (TTL ≤ 60 s); L3 download gate; leak-safe denials | W2 | 2 |
| E4.3 | Append-only audit writer + hash chain | Service-role insert only; no UPDATE/DELETE grants; `prev_hash`/`entry_hash`; IP salted-hashed (D9) | W2 | 3 |
| E4.4 | RLS for documents/transfers/audit + suite started | Content-bearing tables locked; automated cross-firm tests running in CI | W2 | 3 |
| E4.5 | Hash-chain verify | Nightly pg_cron + on-demand check; tamper = alarm | W3 | 1 |
| E4.6 | Audit explorer UI + NDJSON export | Filters (case/doc/actor/result/reason); export for cold archive; admins see own firm only (P7) | W3 | 3 |

### E5 — Transfers (W3 · 8 SP)
| ID | Story | Acceptance criteria (summary) | Sprint | SP |
|----|-------|-------------------------------|--------|----|
| E5.1 | Transfer create/send | Draft → sent; recipients from receiving firm's active profiles; `transfer.created`/`sent` audited; email out | W3 | 3 |
| E5.2 | Accept / reject / cancel / revoke | Recipient-only accept/reject; acceptance inserts `external` case members (idempotent); revoke = owning-firm admin, future access removed, past access stays audited | W3 | 3 |
| E5.3 | Transfer inbox/outbox UI | Status per state machine; actions gated by role; every action audited | W3 | 2 |

### E6 — Admin & Governance (W3 · 5 SP)
| ID | Story | Acceptance criteria (summary) | Sprint | SP |
|----|-------|-------------------------------|--------|----|
| E6.1 | Firm member management | Roles, deactivation; metadata + audit visibility only — never content without clearance (P7) | W3 | 1 |
| E6.2 | Clearance changes + level lowering | Admin-only, reason required, `clearance.changed` / `document.level_lowered` audited | W3 | 2 |
| E6.3 | Denial alerting | ≥ 5 denials / profile / 15 min → firm-admin email; visible in audit explorer | W3 | 2 |

### E7 — Search & Notifications (W3 · 3 SP)
| ID | Story | Acceptance criteria (summary) | Sprint | SP |
|----|-------|-------------------------------|--------|----|
| E7.1 | Clearance-aware search | Filtering in-query; zero leakage of titles/counts/existence; unit tests assert empty results for outsiders | W3 | 2 |
| E7.2 | Transactional email | Transfer sent/accepted/rejected + invite templates; no marketing mail | W3 | 1 |

### E8 — Hardening & Launch (W4 · 18 SP)
| ID | Story | Acceptance criteria (summary) | Sprint | SP |
|----|-------|-------------------------------|--------|----|
| E8.1 | Clearance-matrix E2E | 3×3 Playwright suite green, both firms, incl. L3 gate + revoked transfers | W4 | 3 |
| E8.2 | RLS suite green (**release blocker**) | Full cross-firm invisibility suite green in CI; no policy change without a test | W4 | 3 |
| E8.3 | Rate limits + security headers + bucket audit | Canonical limits enforced with 429 + `Retry-After`; CSP/HSTS verified; zero public buckets | W4 | 3 |
| E8.4 | k6 perf vs SLOs | Signed-URL p95 < 100 ms; API p95 < 200 ms; dashboard < 2 s | W4 | 2 |
| E8.5 | Security review vs `SECURITY.md` | Checklist walked; findings triaged; no open critical/high | W4 | 3 |
| E8.6 | DPA / privacy / terms stubs | Live pages; processor posture documented (P8) | W4 | 1 |
| E8.7 | Production deploy + beta | Env/cron/secrets configured; 2–3 pilot firms onboarded; feedback loop running | W4 | 3 |

**Sprint totals: W1 = 20 SP · W2 = 20 SP · W3 = 22 SP · W4 = 18 SP · Grand total = 80 SP**
(Epic totals: E1 18 · E2 4 · E3 9 · E4 15 · E5 8 · E6 5 · E7 3 · E8 18 = 80.)

---

## 4. Task List T1–T30 (estimates split across 2 developers)

| # | Task | Sprint | Estimate | Owner |
|---|------|--------|----------|-------|
| T1 | Supabase provisioning + Next.js scaffold + CI skeleton (lint/typecheck/test/preview deploys) | W1 | 2 SP / 8h | Dev A |
| T2 | Full schema migrations (8 tables, constraints, indexes, fixtures) | W1 | 5 SP / 20h | Dev A |
| T3 | RLS tenancy core (firms/profiles/cases/case_members) + policy-test scaffold | W1 | 4 SP / 16h | Dev B |
| T4 | Auth: email/password + magic link + session handling | W1 | 3 SP / 12h | Dev B |
| T5 | Invite flow (admin invite → email → accept page → profile bootstrap) | W1 | 2 SP / 8h | Dev B |
| T6 | Middleware route protection + app shell/navigation | W1 | 2 SP / 8h | Dev A |
| T7 | Case CRUD (default level, L3-download flag, legal hold, archive) | W1 | 2 SP / 8h | Dev A |
| T8 | Private bucket + upload pipeline (magic bytes, mime, ≤100 MB, SHA-256, scan gate, quarantine) | W2 | 5 SP / 20h | Dev A |
| T9 | `assertDocumentAccess` service (A1–A6 + deny enum) + exhaustive unit tests | W2 | 3 SP / 12h | Dev B |
| T10 | Append-only audit writer + hash chain (genesis, canonical JSON, IP hashing) | W2 | 3 SP / 12h | Dev A |
| T11 | Content endpoint: audit-then-signed-URL (TTL ≤ 60 s) + L3 download gate | W2 | 2 SP / 8h | Dev A |
| T12 | RLS documents/transfers/audit_events + RLS test suite started in CI | W2 | 3 SP / 12h | Dev B |
| T13 | Watermarked pdf.js viewer (CSP sandbox, name+UTC overlay) | W2 | 3 SP / 12h | Dev B |
| T14 | LevelBadge + pending/infected/denied interstitials + upload UI (raise-only) | W2 | 1 SP / 4h | Dev B |
| T15 | Case membership management (add/remove, lead/member, audited) | W3 | 2 SP / 8h | Dev B |
| T16 | Transfer create/send + recipient designation + audit transitions | W3 | 3 SP / 12h | Dev A |
| T17 | Accept/reject/cancel/revoke + idempotent external-member insertion | W3 | 3 SP / 12h | Dev A |
| T18 | Transfer inbox/outbox UI (state-machine-gated actions) | W3 | 2 SP / 8h | Dev B |
| T19 | Transactional email templates (transfer + invite) | W3 | 1 SP / 4h | Dev B |
| T20 | Firm admin: member management (roles, deactivation) | W3 | 1 SP / 4h | Dev B |
| T21 | Clearance change + document-level lowering (admin-only, reason, audited) | W3 | 2 SP / 8h | Dev A |
| T22 | Denial alerting (≥5/15 min → firm admin) | W3 | 2 SP / 8h | Dev A |
| T23 | Clearance-aware search (filter-in-query, leak-proof) | W3 | 2 SP / 8h | Dev B |
| T24 | Hash-chain verify (pg_cron nightly + on-demand) | W3 | 1 SP / 4h | Dev A |
| T25 | Audit explorer UI + NDJSON export | W3 | 3 SP / 12h | Dev B |
| T26 | Clearance-matrix E2E (3×3) + RLS suite driven to green (**release blocker**) | W4 | 6 SP / 24h | Dev A + Dev B |
| T27 | Rate limits (canonical table) + security headers + no-public-bucket audit | W4 | 3 SP / 12h | Dev A |
| T28 | k6 performance tests vs SLOs | W4 | 2 SP / 8h | Dev B |
| T29 | Security review vs `SECURITY.md` checklist + DPA/privacy/terms stubs | W4 | 4 SP / 16h | Dev B |
| T30 | Production deploy (env/cron/secrets) + beta onboarding (2–3 pilot firms) + retro | W4 | 3 SP / 12h | Dev A |

**Load balance:** Dev A ≈ 41 SP (security core: schema, upload, chain, transfers, deploy) · Dev B ≈ 39 SP (RLS tests, access-service pairing, viewer, admin, search, security review). T9 and T12 are deliberately cross-reviewed by both developers — the access service and its RLS counterpart must never be single-person knowledge.

---

## 5. Dependencies & Critical Path

```
T2 Schema + RLS core ──▶ T4 Auth ──▶ T8 Upload pipeline ──▶ T9 assertDocumentAccess
        │                                                   │
        └──▶ T3 RLS policies ──▶ T12 RLS suite (starts W2)   └──▶ T11 Content endpoint ──▶ T13 Viewer
                                                                     │
                                             T10 Audit chain (∥ with T8, contract-first)
                                                                     │
                        T16/T17 Transfers ──▶ T25 Audit explorer ──▶ T26 E2E matrix + RLS GREEN
                                                                     │
                                                          T27–T29 Hardening ──▶ T30 Launch
```

**Critical path:** **Schema+RLS → Auth → Upload pipeline → assertDocumentAccess → Content endpoint → Viewer → Transfers → Audit explorer → E2E/RLS-green → Launch.**
A slip in T2, T8, T9, or T11 pushes M1; a slip in T26 pushes M2 — neither is recoverable by descoping, because both **are** the product's invariants.

**What can run in parallel:**
- **W1:** Dev A (schema, T2) and Dev B (RLS + auth, T3/T4) overlap only on the policy/fixture contract — freeze the schema DDL by Day 2.
- **W2:** Audit writer (T10) parallel to upload pipeline (T8) — agree the `audit_events` insert contract first. Viewer (T13) parallel to content endpoint (T11) against fixture signed URLs.
- **W3:** Admin/governance (T20–T22) parallel to transfers (T16–T18); search (T23) parallel to audit explorer (T25). Case membership (T15) lands before transfer acceptance needs it.
- **W4:** k6 (T28) and DPA stubs (T29 part) parallel the E2E/RLS push (T26); T26 is the only all-hands item.
- **Sync points:** schema freeze (W1 D2) · deny-reason enum frozen before viewer/denial UI (W2 D2) · transfer state-machine contract before inbox UI (W3 D1) · release checklist review (W4 D4).

---

## 6. Milestones

| Milestone | Target | Definition |
|-----------|--------|------------|
| **M1 — Alpha (internal)** | End of Week 2 | Upload → view with clearance gating works internally: L1 upload-to-first-view < 60 s incl. scan gate; exact-match enforcement proven server-side; every view/denial audited before the signed URL; watermarked viewer stable |
| **M2 — Beta (pilot firms)** | End of Week 4 | Transfers + audit live: full transfer round-trip with external-member access, hash-chain verify green, RLS suite green (**release blocker**), release criteria §8 met; 2–3 pilot firms onboarded |
| **M3 — GA** | Weeks 6–8 | Billing (seat-based; invoicing manual first), **ClamAV container** fast-follow (`scan_method` upgrade — the only sanctioned non-Vercel infra piece, D11), **secure expiring share links** fast-follow (repurposed v1 machinery, P4); SOC 2 posture work begins |

---

## 7. Risks & Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|------------|--------|------------|
| R1 | **RLS regressions** — a policy edit quietly re-opens cross-firm rows | Medium | Critical | RLS suite is a **release blocker** (runs in CI on every PR); policies change only in migrations with a paired test; least-privilege roles; T26 dedicated in W4 |
| R2 | **Watermark bypass acceptance** — stakeholders expect the overlay to be unforgeable | High | Medium | Set expectations early: the watermark is a deterrent + traceability layer, not a cryptographic control; residual risk (screenshots/camera) documented; mitigations that *are* controls: TTL ≤ 60 s signed URLs, audit-before-URL, L3 view-only flag, download denial telemetry |
| R3 | **Scan-gate friction** — heuristic false positives block legitimate PDFs; pending state confuses users | Medium | Medium | Distinct pending/infected interstitials (T14); L1 upload→view < 60 s budget measured from W2; quarantine is conservative but reversible (re-scan path); full ClamAV container is the fast-follow fix |
| R4 | **Clearance misassignment UX** — exact-match compartments surprise users; an admin assigns the wrong clearance → denial storms | High | High | Invite flow shows the 3×3 matrix explainer; denial screens state the exact-match rule without leaking document existence; ≥ 5 denials / 15 min alerts the firm admin (T22); clearance changes are confirm-gated, reasoned, audited |
| R5 | **Scope creep toward v2 features** (shared workspaces, SSO, e-signature, folders) | High | High | `DECISIONS.md` §4 out-of-scope list is contractual; change requests go to a parking lot reviewed only at Friday demo; M3 backlog absorbs them (§9) |
| R6 | **Audit-chain write latency** vs the 100 ms signed-URL SLO (synchronous insert before URL) | Medium | Medium | Single-row insert benchmarked in W2 (T11 acceptance); canonical-JSON hashing precomputed; if p95 slips, batch hash inside a single transaction — the ordering guarantee (audit before URL) is never traded away |
| R7 | **Key-person risk with 2 devs** — access logic lives in one head | Medium | High | Mandatory cross-review of T9/T12 (both devs); ADR-style notes in-repo; the deny-reason enum and access matrix are documentation, not tribal knowledge |
| R8 | **Cron/secret misconfiguration** — sweep jobs unauthenticated or signed-URL cleanup failing | Low | Medium | `CRON_SECRET` verified in T27 checklist; pg_cron schedules asserted in deploy script; read-time checks remain the real enforcer (D6) |

**Risk cadence:** register reviewed at every Friday demo; new risks get an owner + mitigation before Monday.

---

## 8. Definition of Done

### 8.1 Per story
1. Implemented on a branch, PR reviewed by the other developer (T9/T12 double-reviewed).
2. Unit tests for all new logic; **every access path is test-covered** — allow *and* deny, for each access-path change (content endpoint, transfer acceptance, search, admin surfaces).
3. **An audit row exists on every path** the story touches: views, downloads, denials (with canonical `deny_reason`), and every administrative change (`clearance.changed`, `member.*`, `transfer.*`, `case.*`, `document.level_*`).
4. If the story touches RLS or a table policy: a new/updated policy test proves the cross-firm invariant still holds.
5. All tests green locally **and in CI**; preview deployment verified.
6. **No console errors in the viewer** (and no new console errors elsewhere).
7. No secrets in code; IP data only via the salted-hash helper (D9); no raw IPs persisted.
8. Acceptance criteria manually verified on preview; docs/README touched where behavior is non-obvious.

### 8.2 Per sprint
- All committed stories meet §8.1; CI green including the RLS suite (from W2 onward).
- Friday demo shows a working, audited increment; **carry-over rule:** any unfinished story is re-triaged at the demo — W4's E2E/RLS-green work (T26) is never sacrificed to absorb feature slippage.
- Retrospective held in W2 (mid-plan checkpoint) and W4; risk register updated.
- Sprint security spot-check: no public buckets, no new unauthenticated routes, headers still intact.

---

## 9. Release Criteria / Go-No-Go (M2, end of Week 4)

**REQUIRED — release blockers:**
- [ ] **RLS test suite green** — automated proof of zero cross-firm leakage (D-model §10; `DECISIONS.md` §5).
- [ ] **Clearance-matrix 3×3 E2E green** — only the diagonal opens; every non-diagonal cell produces `CLEARANCE_MISMATCH`, logged.
- [ ] **Hash-chain verify green** — genesis = 64 zeros; full chain re-verifies; `audit_events` has no UPDATE/DELETE grants for any role.

**REQUIRED — platform gates:**
- [ ] SLOs met: signed-URL p95 < 100 ms · API p95 < 200 ms · dashboard < 2 s · 99.9% uptime posture.
- [ ] Security headers verified in production (CSP, HSTS, frame-ancestors, nosniff, referrer-policy).
- [ ] **No public buckets** — private storage only; signed URLs TTL ≤ 60 s; audit-before-URL ordering confirmed.
- [ ] **DPA + privacy + terms live** (P8 processor posture).

**Should be true (fix-or-waive with sign-off):**
- [ ] Rate limits enforced per canonical table with 429 + `Retry-After`.
- [ ] Every content access and denial auditable within 1 s; denial alerts firing.
- [ ] L1 upload → first view < 60 s including scan gate.
- [ ] Transfer round-trip verified (send → accept → external access → revoke cuts future access).
- [ ] No open critical/high bugs; mediums have documented workarounds.
- [ ] `CRON_SECRET`-protected sweep endpoints verified.

**Go/No-Go:** decided by PM + tech lead at the Week 4 Friday demo against this list. **No-Go → 1-week fix sprint before beta**; the three REQUIRED blockers are non-waivable.

---

## 10. Post-MVP Backlog (Weeks 5–8 → GA)

| Item | Description | Estimate | Target |
|------|-------------|----------|--------|
| Secure expiring share links | Time-/view-limited audited share URLs for individual documents; **repurposes archived v1 link machinery** (P4 fast-follow); still clearance- and scan-gated | 8 SP | W5–6 |
| ClamAV container | Real malware scanning; `scan_method='clamav'`; rescan queue — the only sanctioned non-Vercel infra piece (D11) | 8 SP | W5–6 |
| Hierarchical clearance toggle | Firm-level switch L3 ⊃ L2 ⊃ L1 (P1 future toggle); exact-match remains default; matrix suite parameterized | 3 SP | W6 |
| Billing automation | Seat-based pricing → automated invoicing (MVP ships with designed pricing + manual invoicing) | 8 SP | W6–7 |
| SSO / SAML | Firm-level identity federation; audit `auth.*` events | 8 SP | W7 |
| Shared multi-firm case workspaces | Persistent multi-firm collaboration beyond one-way transfers (v2 headline feature) | 13 SP | W7–8 |
| OCR + full-text search | Text extraction into clearance-aware search index; access filtering unchanged (in-query) | 8 SP | W8 |
| E-signature | Signed-document workflows on case files | 13 SP | W8+ |
| Mobile triage app | Read/triage + approval surface for partners; viewer parity with watermark | 13 SP | W8+ |

---

## 11. Communication & Cadence

| Ceremony | Frequency | Timebox | Attendees | Purpose |
|----------|-----------|---------|-----------|---------|
| Daily standup | Mon–Fri | 15 min | Both devs, PM | Yesterday/today/blockers; access-path changes flagged for cross-review |
| Schema/API contract sync | W1 D2 · W2 D2 · W3 D1 | 30 min | Both devs | Freeze schema DDL, deny-reason enum, transfer state-machine contract |
| Sprint planning | W1 D1 (and Monday of each week, 15-min re-commit) | 1 h (W1) | Both devs, PM | Commit scope vs. the 80 SP budget |
| Demo + risk review | Every Friday | 45 min | Devs, PM, stakeholders | Working increment **with its audit trail shown**; risk register; parking-lot triage |
| Security spot-check | Fridays, W2–W4 | 20 min | Both devs | Bucket visibility, headers, new routes, RLS diff review |
| Retrospective | End W2, end W4 | 45 min | Both devs, PM | Process fixes; W4 retro feeds M3 grooming |
| Stakeholder update | Friday, async | — | PM → stakeholders | Milestone progress, risks, Go/No-Go posture |

**Tools:** GitHub (issues, PRs, Projects board) · Vercel previews · Supabase dashboard · Slack/email. **Definition of Ready:** acceptance criteria written, SP estimated, dependencies named, security-path test plan identified.

---

## 12. Appendix: Normative References

- `DECISIONS.md` — locked decisions D2, D6–D11, P1–P8, W1, A1, S1, N1, V1; canonical rate limits (§3); out-of-scope list (§4); MVP success criteria (§5).
- `DOMAIN_MODEL.md` — entity definitions (§2); **Access Rule A1–A6 and deny-reason enum (§3)**; clearance matrix (§3.3); transfer state machine (§5); audit action enum (§6); storage & delivery (§7); clearance-aware search (§8); multi-tenancy invariant (§10).
- v1 roadmap (link-shortener scope) archived in `docs-v1-archive/`; its expiring-link machinery is explicitly reserved for the secure share-links fast-follow (§10).

*End of document — BriefLock v2.0 sprint plan. Security-first ordering is the product: prove the lock before building doors.*
