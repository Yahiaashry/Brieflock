# BriefLock — Testing Strategy

**Version 2.0 — Regenerated for the legal document exchange core idea**

| Field | Value |
|---|---|
| **Status** | Draft for implementation |
| **Supersedes** | Testing Strategy v0.1 (v1 product: link expiry, click counting, public redirects) — archived in `docs-v1-archive/` |
| **Contract** | `DECISIONS.md` (🔒) + `DOMAIN_MODEL.md` (🔒) govern. Success criteria (DECISIONS §5) define "done". |
| **Stack** | Vitest (unit + integration) · Playwright (E2E) · k6 (load) · Supabase local (ephemeral DB) · GitHub Actions |
| **Golden rule** | The safety invariants **are** the product. The 3×3 clearance matrix, cross-firm invisibility (RLS), and audit integrity are **non-waivable release gates** — a red matrix test blocks release regardless of feature pressure. |

---

## 1. Philosophy

| # | Principle | Consequence |
|---|---|---|
| 1 | **Test the invariants, not the screens** | Every requirement below traces to A1–A6, the diagonal matrix (§3.3), transfer machine (§5), or audit chain (A1) |
| 2 | **Prove absence of leaks** | Security tests assert what does **not** happen: no existence oracles, no hidden counts, no reason codes in responses |
| 3 | **Fail-closed by construction** | Tests assert error paths issue no URLs, no partial state, no audit gaps |
| 4 | **Deterministic fixtures over mocks for the core** | The access rule, audit chain, and RLS are tested against a real (local Supabase) Postgres — mocks cannot prove RLS |
| 5 | **Fast feedback first** | Unit suite < 60 s; integration < 5 min; E2E < 15 min; k6 nightly |

## 2. Test Pyramid & Ownership

| Layer | Tool | Scope | Runtime | Gating |
|---|---|---|---|---|
| Unit | Vitest | pure logic: access decisions, scan parsers, chain canonicalization, rate limiter, transfer transition table | < 60 s | every PR |
| Integration | Vitest + supertest + local Supabase | route handlers against real DB/RLS/storage-fake; audit-before-URL ordering | < 5 min | every PR |
| E2E | Playwright | full browser: matrix E2E, upload→view, transfers, admin | < 15 min | PR + pre-release |
| Security | Vitest (RLS probes, tamper tests) + dependency scan | cross-firm invisibility, chain integrity, 404 discipline | in integration job | **release blocker** |
| Load | k6 | SLO verification (S1) | nightly + pre-release | SLO report |

## 3. Unit Tests (Vitest — pure, no I/O)

### 3.1 Access rule — the 3×3 matrix, table-driven (`lib/access`)

Parameterized over `(clearance, security_level)` — **all 9 cells asserted**:

| user ↓ / doc → | L1 doc | L2 doc | L3 doc |
|---|---|---|---|
| **L1** | allow | deny `CLEARANCE_MISMATCH` | deny `CLEARANCE_MISMATCH` |
| **L2** | deny `CLEARANCE_MISMATCH` | allow | deny `CLEARANCE_MISMATCH` |
| **L3** | deny `CLEARANCE_MISMATCH` | deny `CLEARANCE_MISMATCH` | allow |

Variant cases: deactivated user → `DEACTIVATED`; wrong firm → `FIRM_MISMATCH`; no case membership → `NOT_CASE_MEMBER`; `scan_status ∈ {pending, infected, error}` → `UNSCANNED`/`INFECTED`; L3 download on view-only case → `DOWNLOAD_BLOCKED_L3` (view still allowed); archived case → write denied `CASE_ARCHIVED`, read allowed; admin metadata allowed, admin content still diagonal-checked (P7); accepted-transfer grant satisfies A2 but not A4 (external member still diagonal-limited).

### 3.2 Audit chain canonicalization

- Canonical JSON: key ordering deterministic; null vs missing fields; timestamp → ISO 8601 UTC string; `details` non-object values.
- `entry_hash = SHA256(prev ‖ canonical)` matches the DB trigger's output for seeded event vectors (golden files).
- Genesis: first row's `prev_hash = 64 × '0'`.

### 3.3 Scan parser fixtures (`lib/scan`)

Fixture PDFs (committed, tiny): clean minimal PDF · PDF with `/JavaScript` action · `/OpenAction` + `/Launch` · `/EmbeddedFile` · truncated header · valid header/missing `%%EOF` · oversized-declaration → expect `clean` / `infected` / `error` verdicts exactly; sha256 fixture vectors.

### 3.4 Transfer transition table

All legal transitions pass; every illegal pair raises; immutable fields (case/firms/creator) raise on change; `sent_at`/`responded_at` stamping.

### 3.5 Rate limiter

Token-bucket math per class (10/30/60/100 per min): boundary at limit, refill over time (fake clock), per-key isolation, `Retry-After` integer computation.

### 3.6 Other pure units

Level-change rules (raise = case member; lower = admin + reason required) · deny-reason mapping to HTTP codes incl. the two carve-outs · pagination cursor codec · `ip_hash` determinism + salt sensitivity (D9).

## 4. Integration Tests (Vitest + supertest against route handlers, real local Supabase)

### 4.1 RLS probe suite — cross-firm invisibility (SECURITY R-1..R-8, **release blocker**)

Run against migration `0001` with two seeded firms, three clearances each, and a client per role:

| # | Probe | Assert |
|---|---|---|
| R-1 | Firm B selects firm A's cases/documents/audit | 0 rows — through direct select, joins, and counts |
| R-2 | Firm B admin queries audit | only firm B rows; `firm_id is null` rows invisible |
| R-3 | Cross-firm search (DOMAIN_MODEL §8) | no titles, counts, or existence of firm A items |
| R-4 | L2 user on firm's own L3 document | metadata invisible in list; direct id select → 0 rows (no oracle) |
| R-5 | Deactivated profile | every helper returns empty immediately (A1) |
| R-6 | `audit_events` writes as `authenticated` | INSERT/UPDATE/DELETE all denied |
| R-7 | `documents` UPDATE/DELETE as `authenticated` | denied (V1 immutability) |
| R-8 | Accepted transfer | external member sees only transferred documents at their clearance; `revoke` removes visibility on next read (lazy enforcement) |

### 4.2 Pipeline tests

- **Upload → scan → view**: upload-intent → fake PUT → complete → `scan_status` transitions asserted for each fixture class → content route issues URL only for `clean` + diagonal match; audit rows exist for `document.uploaded` and each access.
- **Audit-before-URL ordering**: instrumented storage fake asserts `issueReadUrl` is never called before the audit transaction commits (A1) — enforced structurally via the decision token (BACKEND_ARCH §3).
- **Write-route atomicity**: failing mutation (e.g. duplicate `case_reference`) leaves **no** audit row (same-transaction audit).
- **Transfer lifecycle**: draft → send → accept as recipient → external membership row exists → documents accessible per diagonal → revoke → membership gone, other-transfer re-grant edge preserved (BACKEND_ARCH §7).
- **Rate classes**: 429 + `Retry-After` per class boundary; content class at 61st request/min.
- **Denial uniformity**: byte-identical `403` bodies for every A1–A5 reason on the content route; `DOWNLOAD_BLOCKED_L3` is the only distinct body; unknown document id → `404` with **no** audit row; known-id denial → exactly one `document.access_denied` row with the precise reason (admins see it via `/audit`, users never do).

## 5. E2E Tests (Playwright — seeded demo firm, 3 users L1/L2/L3)

| Suite | Coverage | Gate |
|---|---|---|
| **matrix-e2e** | Login as L1/L2/L3 → same case: visible document sets match the diagonal exactly; every denied navigation renders the uniform interstitial; DevTools responses contain no reason codes | **non-waivable** |
| upload-e2e | Upload PDF (clean fixture) → pending chip → clean → view in watermarked viewer → watermark shows name + UTC timestamp (L2/L3); download for L1; upload infected fixture → quarantined row, no view | non-waivable |
| transfer-e2e | Compose wizard → send → recipient accepts → sees case + transferred docs at their clearance → sender admin revokes → access gone | required |
| admin-e2e | Member role/clearance changes with confirmations; audit view shows deny rows with reasons; NDJSON export downloads; last-admin guard blocks self-demote | required |
| auth-e2e | Login, magic link, invite accept with fixed role/clearance; failed login generic copy; session expiry mid-viewer → re-auth | required |
| slo-e2e | Dashboard initial load < 2 s on staging (S1) — measured, asserted loosely (CI variance), strictly nightly | nightly |

Playwright runs on preview deployments per PR; `matrix-e2e` and `upload-e2e` also run pre-release from staging.

## 6. Security Testing

| Area | Tests |
|---|---|
| RLS (§4.1) | The 8 probes gate every merge — a regression here is a **release blocker** (DOMAIN_MODEL §10, DECISIONS §5) |
| Chain integrity | Copy a seeded `audit_events` table → mutate one row in the copy → `audit_chain_verify()` must flag the exact position; tamper test runs in CI on every PR |
| Existence-oracle discipline | Route-level: unknown vs off-scope ids produce byte-identical `404`s; timing assertions loose (no string comparisons in code paths — lint rule) |
| Watermark/viewer | E2E asserts the CSP-locked iframe (FRONTEND_ARCH §4): no inline scripts, no external origins in the viewer context |
| Rate limits | k6 + integration burst tests per class; verify `Retry-After` correctness |
| Dependencies | `pnpm audit` + Dependabot; failing high/critical advisories block merge |
| Secrets | No secrets in client bundles (CI grep of build output for service-role key, `IP_SALT`, HMAC) |
| D9/D8 privacy | Audit rows never contain raw IPs (schema CHECK on `ip_hash` length 64); logs scrubbed (BACKEND_ARCH §10); a CI grep forbids `req.ip` writes outside `lib/geo.ts` |

## 7. Performance & Load (k6 — S1 verification)

| Scenario | Load | Pass criteria (p95) |
|---|---|---|
| `content-issuance` | 50 VU, 5 min | signed-URL issuance < 100 ms **including audit commit**; zero dropped audit writes |
| `api-mixed` | 100 VU, 10 min | all `/api/v1` routes < 200 ms |
| `dashboard` | staged ramp | initial load < 2 s (TTFB + hydration budget) |
| `upload-complete` | 20 VU streaming fixtures | p95 complete < 10 s for 10 MB; scan budget per BACKEND_ARCH §5 |
| soak | 2 h low VU | no memory growth in functions; chain verify still passes after soak |

Nightly on staging + pre-release; results archived as CI artifacts with trend deltas. Uptime: synthetic probes on `GET /api/v1/health` every minute from 3 regions → 99.9% availability reporting (S1).

## 8. Environments & Test Data

| Environment | Data | Purpose |
|---|---|---|
| Local | `supabase start` + migration `0004_seed` (demo firm, L1/L2/L3 users, case with L2+L3 docs, fixture PDFs incl. infected) | unit + integration + local E2E |
| Preview (per PR) | ephemeral branch DB + seed | Playwright suites |
| Staging | seed-like synthetic data; **no real documents** | k6, pre-release E2E, SLO rehearsal |
| Production | real | synthetics on `/health` only; no test data ever |

Fixture discipline: all test PDFs are committed fixtures (never real client documents); seed users are `l1@demo.test` / `l2@demo.test` / `l3@demo.test` mirroring DATABASE_SCHEMA §11 so every environment can re-prove the matrix in one command.

## 9. CI Pipeline (GitHub Actions)

```
PR → lint + typecheck
   → unit (Vitest)                          < 60 s
   → integration (local Supabase service)   RLS probes R-1..R-8 + pipelines   [BLOCKING]
   → deploy preview → Playwright (matrix-e2e, upload-e2e, transfer-e2e)       [BLOCKING]
   → pnpm audit + secret-scan                                                 [BLOCKING]
main → same + k6 smoke
nightly (cron) → full k6 + slo-e2e + chain-verify rehearsal → trend report
release → all above on staging + manual release checklist (ROADMAP Go/No-Go)
```

Branch protection: a PR cannot merge with any blocking job red — including RLS probes; there is no override label (non-waivable by policy).

## 10. Release Gates (Go/No-Go — aligned with ROADMAP §Go/No-Go)

| # | Gate | Source of proof | Waivable? |
|---|---|---|---|
| 1 | RLS probe suite green (cross-firm invisibility proven) | CI integration job | **No** |
| 2 | 3×3 clearance matrix E2E green | `matrix-e2e` | **No** |
| 3 | Audit chain verifies end-to-end (genesis → head) + tamper detected in test | `audit-verify` + CI tamper test | **No** |
| 4 | SLOs measured on staging: signed-URL p95 < 100 ms incl. audit commit · API < 200 ms · dashboard < 2 s | k6 report | No (trend-based) |
| 5 | Upload → first view of an L1 document < 60 s incl. scan gate | `upload-e2e` timing | No |
| 6 | Denial uniformity + no-oracle assertions green | integration §4.2 | No |
| 7 | Dependency scan clean of high/critical | CI | No |

**Definition of done (MVP)** — mirrors DECISIONS §5: zero cross-firm leakage (gate 1) · every access/denial auditable within 1 s and chain-verifiable (gate 3) · upload→view < 60 s (gate 5) · SLOs met (gate 4) · matrix E2E green (gate 2).

## Changelog

| Version | Change |
|---|---|
| 2.0 | Regenerated for the legal document exchange core idea: 3×3 diagonal-matrix unit + E2E gates, RLS probe suite as non-waivable blocker, audit-chain canonicalization + tamper tests, audit-before-URL ordering proof, transfer lifecycle + revoke edge, D11 scan fixtures, k6 SLO scenarios, release gates tied to DECISIONS §5. Removed link-expiry/click analytics testing. |
| 0.1 | Initial draft (v1 product — retired). |
