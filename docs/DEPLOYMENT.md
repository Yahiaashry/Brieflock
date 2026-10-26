# BriefLock — Deployment & DevOps

> **Product:** BriefLock — secure document exchange and case-file management platform for law firms
> **Owner:** DevOps / SRE
> **Version:** 2.0
> **Domain:** TBD (D2) — this document uses `app.example.com` placeholders everywhere; never invent a brand domain
> **Stack:** Next.js (TypeScript) · Supabase (Postgres + Auth + Storage) · Vercel (sole PaaS, D2) · GitHub Actions · Sentry + LogTail
> **Normative refs:** `DECISIONS.md` (locked contract) · `DOMAIN_MODEL.md` (canonical model). Any conflict resolves in their favor.

---

## 0. Overview & TL;DR

| Item | Decision |
|------|----------|
| Primary PaaS | **Vercel — Vercel-only** (D2). No alternative PaaS is sanctioned; sole future infra exception is the D11 ClamAV sidecar. |
| Database | **Supabase** managed Postgres + Auth + Storage, provisioned in the **same region** as the Vercel app region |
| Object storage | **Private Supabase Storage buckets** (case PDFs + audit NDJSON archive) — no public buckets, access only via signed URLs with TTL ≤ 60 s |
| CI/CD | **GitHub Actions** — 3 workflows: `ci.yml` (lint → unit → integration w/ Supabase container + **RLS suite required** → build), `deploy-preview.yml` (per-PR), `deploy-production.yml` (health check + signed-URL smoke test) |
| Preview env | One per PR, seeded with a synthetic clearance-matrix fixture (firms/users at L1–L3) |
| Monitoring | **Sentry** (errors/traces) + **LogTail** (logs/alerts) + synthetic checks on `GET /api/v1/health` + upload-view smoke; nightly audit-chain verification |
| Uptime target | **99.9%** (S1) |
| Rollback | Forward-fix first → Vercel promote-previous → DB restore via PITR. MVP targets: **RPO ≤ 24 h / RTO ≤ 4 h** |
| Tenancy | In the database (`firms` + RLS), not in infra — one deployment serves all firms |

**Hot paths:** signed-URL issuance (p95 < 100 ms, S1) · access-rule evaluation on every content GET · upload + scan gate (`scan_status = 'clean'` or access is blocked) · authenticated dashboard reads.

**Sensitive data:** case PDFs at security levels L1–L3, firm/lawyer PII, transfer records, the hash-chained audit log. Raw IPs are **never** persisted or logged — salted+SHA-256 `ip_hash` only (D9).

---

## 1. Deployment Architecture

### 1.1 PaaS, region, storage

BriefLock runs on **Vercel only** (D2). There is no VM, cluster, or alternate PaaS. Supabase provides Postgres, Auth, and Storage from a single project in the **same region** as the Vercel function region (e.g. `iad1`/Washington, D.C. for US-heavy firms, or an EU region if GDPR data-residency dominates — choose once; Supabase is single-region per project).

```
┌──────────────┐  HTTPS  app.example.com (TBD, D2)  ┌────────────────────────────┐
│ Firm users   │ ─────────────────────────────────► │  Vercel Edge Network       │
│ (auth-only,  │                                    │  • Next.js App Router      │
│  P4)         │                                    │  • Edge Middleware         │
└──────────────┘                                    │  • Serverless Functions    │
                                                    └─────────────┬──────────────┘
                                       Postgres wire · S3-compatible object API
                                       ┌───────────────────▼──────────────────────┐
                                       │  Supabase project (same region as app)   │
                                       │  • Postgres + RLS (firms, cases,         │
                                       │    documents, transfers, audit_events)   │
                                       │  • Auth: email/password + magic link D10 │
                                       │  • Storage: PRIVATE buckets              │
                                       │    case-documents / audit-archive        │
                                       │  • pg_cron sweeps every 1 min (D6)       │
                                       └───────────────────┬──────────────────────┘
                                                           │
                     ┌─────────────────────────────────────┼──────────────────────┐
                     │ Observability                       │ Fast-follow (D11)    │
                     │ • Sentry (errors, traces, CSP)      │ ClamAV scan sidecar  │
                     │ • LogTail (structured logs, alerts) │ — the only future    │
                     │ • Nightly audit-chain verification  │ non-Vercel infra     │
                     └─────────────────────────────────────┴──────────────────────┘
```

**Edge Middleware responsibilities:** security-header injection (§12), auth session guard, in-memory per-instance rate limiting behind the `RateLimiter` interface (D7; Upstash slots in later), and capture of Vercel request geo headers (D8) → `country`/`city` stored alongside the salted `ip_hash` (D9). Canonical rate limits live in `DECISIONS.md` §3.

### 1.2 Private storage bucket provisioning (required step)

Storage is provisioned **by migration, per environment** (§5). Three invariants:

1. **No public buckets, ever.** Buckets are created with `public = false` and no public URL policy. `DOMAIN_MODEL.md` §7: path layout `{firm_id}/{case_id}/{document_id}/{filename}`.
2. **Two private buckets per environment project:** `case-documents` (case PDFs, ≤ 100 MB each) and `audit-archive` (cold NDJSON audit exports, §8/§9). Each environment's **separate Supabase project hosts its own physically separate bucket instances** — a bucket is never shared across environments; the app has no cross-project bucket access.
3. **Signed URLs only, TTL ≤ 60 s** (`SIGNED_URL_TTL_SECONDS=60`), issued server-side **only after** the `document.viewed`/`document.downloaded` audit row is committed (A1). No long-lived or public object URLs. Direct `storage.objects` access is denied to non-service roles by storage policies shipped in the same migration.

CI asserts bucket privacy after every migration run (§2.2, §5.2); Appendix A tracks it as a launch gate.

### 1.3 Malware scanning — MVP and the D11 fast-follow

- **MVP (Vercel-only constraint):** in-function PDF structure validation — magic bytes + embedded-JS heuristics — with **quarantine-until-scanned**: any document with `scan_status != 'clean'` blocks all content access (access-rule check A5). `scan_method = 'magic-bytes-mvp'`.
- **Fast-follow:** a dedicated **ClamAV container** as a sidecar/standalone service reachable from a scan worker. This is the **only** sanctioned future non-Vercel infrastructure piece (D11); when introduced, `scan_method` flips to `clamav` and scanning moves out of the upload path. Client files are **never** sent to third-party scanning APIs.

### 1.4 Component responsibilities

| Component | Responsibility |
|-----------|----------------|
| Vercel Edge Middleware | Security headers (§12), auth guard, rate limiting (D7), geo/IP-hash capture (D8/D9) |
| Next.js App Router | Authenticated app: cases, documents, transfers, audit views, `/api/v1/*` routes |
| Serverless Functions | Signed-URL issuance (post-audit), upload + scan gate, transfer notifications, sweep endpoints (CRON_SECRET, D6) |
| Supabase Postgres | All entities per `DOMAIN_MODEL.md`; `audit_events` append-only + hash-chained (A1) |
| Supabase Auth | Email/password + magic link (D10) — **no custom auth API endpoints** |
| Supabase Storage | Private buckets for case PDFs and audit NDJSON; signed URLs ≤ 60 s |
| Supabase pg_cron | Sweep jobs every 1 min: signed-URL cleanup, retention (D6); lazy read-time checks are the real enforcer |
| Sentry | Error tracking, tracing, release health, CSP violation reports |
| LogTail | Centralized structured logs, retention, alert queries (denial spikes, 5xx) |
| GitHub Actions | Lint, unit, integration + RLS suite, build, migrate, deploy (preview + production), nightly chain verify |

---

## 2. CI/CD Pipeline (GitHub Actions)

### 2.1 Workflow layout

```
.github/
└── workflows/
    ├── ci.yml                 # lint → unit → integration (Supabase container + RLS suite) → build
    ├── deploy-preview.yml     # per-PR preview deployment + seeded clearance-matrix fixture
    └── deploy-production.yml  # production deploy on merge to main + health check + signed-URL smoke test
```

### 2.2 `ci.yml` — lint, unit, integration, build

Triggers: `push` to `main`/`develop`, `pull_request`.

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run lint          # eslint + prettier --check
      - run: npx tsc --noEmit      # type check

  unit:
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run test:unit     # access-rule units, transfer state machine, rate limiter
      - uses: codecov/codecov-action@v4
        with: { token: '${{ secrets.CODECOV_TOKEN }}' }

  integration:
    runs-on: ubuntu-latest         # Docker is available for the Supabase container stack
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with: { version: latest }
      - run: npm ci
      - run: supabase start        # local Postgres + Auth + Storage + pg_cron
      - run: supabase db reset     # schema + RLS policies + private buckets + cron schedules + seed
      - run: supabase status -o env >> "$GITHUB_ENV"   # expose local URL/keys to tests
      - name: Assert storage buckets exist and are private
        run: supabase db execute --file scripts/assert-private-buckets.sql
      - run: npm run test:integration
        env:
          SUPABASE_URL: http://127.0.0.1:54321
      - name: RLS suite (release blocker — zero cross-firm leakage)
        run: npm run test:rls      # 3×3 clearance matrix, cross-firm invisibility, transfer gates

  build:
    runs-on: ubuntu-latest
    needs: [unit, integration]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run build         # next build
      - name: Assert no server-only secrets in client bundle
        run: npm run check:client-bundle   # grep build output for SUPABASE_SERVICE_ROLE_KEY value
      - uses: actions/upload-artifact@v4
        with: { name: nextjs-build, path: .next, retention-days: 1 }
```

**The RLS suite is a required status check.** It proves the multi-tenancy invariant (`DOMAIN_MODEL.md` §10): cross-firm rows are structurally invisible through queries, search, counts, and error messages, and only the diagonal of the 3×3 clearance matrix allows content access. A red RLS suite blocks merge — this is a release blocker per `DECISIONS.md` §5, not a warning.

### 2.3 `deploy-preview.yml` — per-PR preview

Triggers: `pull_request` (opened, reopened, synchronize); `closed` (cleanup).

1. Requires `ci.yml` green (including the RLS suite) — failing PRs get no preview.
2. Provisions a disposable preview database: a **Supabase branch** off staging (or a dedicated preview project), then `supabase db push` (schema + RLS + bucket + cron migrations) and applies the **seeded preview fixture** (§6.2).
3. Builds and deploys to a Vercel preview URL using `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID`.
4. Posts the preview URL + demo credentials from the fixture as a PR comment (§6.3).
5. On close/merge: preview deactivated; Vercel garbage-collects old previews; the preview DB branch is deleted.

### 2.4 `deploy-production.yml` — production deploy

Trigger: `push` to `main` (after merge). Protected by branch rules + required reviews.

1. `ci.yml` must pass — RLS suite included as a required status check.
2. Supabase CLI migrations run against production (schema, RLS, **private bucket ensure + privacy assert**, pg_cron schedules — see §5).
3. Deploy to Vercel production: `vercel --prod`.
4. Sentry release created (Sentry CLI / GitHub integration) so errors are attributed to the release.
5. **Post-deploy verification** (fails the job on any error):
   - **Health check:** `GET https://app.example.com/api/v1/health` → expect `200` + `{ "status": "ok" }` within 10 s; retry ×5 over 2 min before failing.
   - **Signed-URL smoke test** (replaces v1 redirect synthetics — there is no public traffic in BriefLock): authenticate as the dedicated synthetic **smoke user** (L1 fixture pre-seeded in production, firm `"ZZ-SMOKE (synthetic)"`), call `GET /api/v1/documents/{SMOKE_DOCUMENT_ID}/content`, and assert: `200` response · returned signed URL has TTL ≤ 60 s · `GET` on the signed URL returns `200` + `application/pdf` · a `document.viewed` audit row was committed (A1). Only synthetic smoke data is touched.
6. Notify Slack/email on success/failure.

### 2.5 Required secrets (GitHub)

| Secret | Purpose |
|--------|---------|
| `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` | Vercel CLI deploys (D2) |
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI (migrations, branches) |
| `SUPABASE_PROJECT_REF_STAGING` / `SUPABASE_PROJECT_REF_PRODUCTION` | Migration targets |
| `SMOKE_TEST_EMAIL` / `SMOKE_TEST_PASSWORD` / `SMOKE_DOCUMENT_ID` | Signed-URL smoke test against the synthetic prod fixture |
| `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` | Release tracking |
| `SLACK_WEBHOOK_URL` | Deploy + alert notifications |
| `CODECOV_TOKEN` | Coverage reporting (optional) |

---

## 3. Environment Management

Three environments. **Each has its own Supabase project and its own private storage buckets** — never shared across environments.

| Environment | Git branch | Vercel | Supabase project | Private buckets (inside that project) | Data |
|-------------|-----------|--------|------------------|----------------------------------------|------|
| **Development** | `feature/*` | `vercel dev` / local | Local Docker (`supabase start`) | `case-documents`, `audit-archive` (local instances) | Synthetic only |
| **Staging** | `develop` | Vercel staging project | Staging Supabase project | `case-documents`, `audit-archive` (staging instances) | Synthetic + seeded fixtures (§6) |
| **Production** | `main` | Vercel production | Production Supabase project | `case-documents`, `audit-archive` (production instances) | Real client legal data — access restricted |

**Promotion flow:** feature → `develop` (staging) → `main` (production). Production deploys require an approved PR and green CI (RLS suite included). Direct pushes to `main` are blocked by branch protection.

**Data policy:** real client legal data never leaves production — no production dumps restored into staging/dev; lower environments use the synthetic fixtures (§6.2). Supersedes v1 "staging copy of production data" habits: sanitize or synthesize, never copy raw.

**Config drift prevention:** environment variable **names** are identical across environments; only values differ. Audit vars quarterly (Appendix A).

---

## 4. Environment Variables & Secret Management

### 4.1 Where secrets live

| Layer | Tool | What's stored |
|-------|------|---------------|
| CI/CD | GitHub Actions Secrets | Deploy tokens, Supabase access token, smoke credentials (never in repo) |
| PaaS | Vercel Project Settings → Environment Variables | Runtime env vars per environment (Production / Preview / Development) |
| Database | Supabase Dashboard → Settings → API / Database | `DATABASE_URL` (internal), service-role key (also mirrored to Vercel as a server var) |
| Local dev | `.env.local` (gitignored) | Local Supabase URL/keys from `supabase status` |

**Never commit** `.env`, `.env.local`, `.env.production`, or anything containing keys. `.gitignore` covers `.env*` except `.env.example`.

### 4.2 Full reference

| Variable | Scope | Example / placeholder | Purpose & decision ref |
|----------|-------|----------------------|------------------------|
| `NEXT_PUBLIC_APP_URL` | client + server | `https://app.example.com` | Canonical app origin. **Placeholder — real domain TBD (D2).** |
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | `https://<project-ref>.supabase.co` | Supabase endpoint (per-environment project) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | `eyJ…` | Anon key; safe to ship — all access is still RLS-enforced |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | `eyJ…` | Bypasses RLS. Used for: service-role-only `audit_events` inserts (A1), sweeps, smoke seeding, admin ops. **Must never appear in any client bundle** (CI enforces, §2.2). |
| `SUPABASE_STORAGE_BUCKET` | server | `case-documents` | Private bucket holding case PDFs |
| `SIGNED_URL_TTL_SECONDS` | server | `60` | Signed-URL TTL cap (model §7: ≤ 60 s) |
| `IP_HASH_SALT` | **server only** | 32-byte hex (`openssl rand -hex 32`) | D9: salt for SHA-256 IP hashing at ingest. Raw IPs never persisted or logged. Per-environment value. |
| `CRON_SECRET` | **server only** | `openssl rand -hex 32` | Protects cron/sweep endpoints (D6); callers send `Authorization: Bearer $CRON_SECRET` |
| `RESEND_API_KEY` | **server only** | `re_…` | Transactional email **if** using Resend (transfer.sent/accepted/rejected, invites, repeated-denial alerts). Alternative: Supabase Auth built-in email (no extra vendor). Pick exactly one per environment. |
| `SENTRY_DSN` | **server only** | `https://….ingest.sentry.io/…` | Server SDK error tracking |
| `NEXT_PUBLIC_SENTRY_DSN` | client | `https://…ingest.us.sentry.io/…` | Browser SDK (omit if browser error capture is disabled) |
| `LOGTAIL_SOURCE_TOKEN` | **server only** | `…` | Structured log shipping (§8) |
| `DATABASE_URL` | server / CI | `postgresql://…` | Direct Postgres for migrations/CLI; runtime app uses Supabase client + pooled connection |
| `UPSTASH_REDIS_REST_URL` / `…TOKEN` | server | — | **Future only** (D7): shared rate-limit backend when the in-memory limiter stops sufficing |

**Naming convention:** `NEXT_PUBLIC_*` is inlined into the client bundle at build time — treat it as public. Everything else is server-only. The one catastrophic mistake to design against: **`SUPABASE_SERVICE_ROLE_KEY` must never be referenced in a client component or prefixed `NEXT_PUBLIC_`** — it silently disables RLS for that caller. CI greps the built bundle for the key's literal value and fails the build (§2.2).

### 4.3 Secret rotation

- Rotate every **90 days**: `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`, `VERCEL_TOKEN`, `CRON_SECRET`, `RESEND_API_KEY`, `LOGTAIL_SOURCE_TOKEN`.
- Rotate **immediately** on suspected leak or accidental commit: assume compromise → revoke → generate → update every environment → check Sentry/LogTail for anomalous use in the exposure window.
- **`IP_HASH_SALT` is the exception:** rotating it changes every future `ip_hash`, breaking longitudinal correlation with past events (D9). Rotate only as part of incident response; when you do, record the rotation point in `audit_events` (system actor, `firm.updated`/info) so ip_hash series can be interpreted across the boundary.
- Maintain a secret inventory (name, owner, environment, last-rotation date) — reviewed at the quarterly var audit.

---

## 5. Database Migrations in CI (Supabase CLI)

Migrations are version-controlled SQL in `supabase/migrations/` and are the source of truth for schema **and storage topology and cron schedules**.

### 5.1 Local workflow

```bash
supabase init                                  # one-time
supabase start                                 # local Postgres + Auth + Storage + pg_cron
supabase migration new add_transfers           # create supabase/migrations/<ts>_add_transfers.sql
supabase db reset                              # apply everything locally, then re-seed
```

### 5.2 What migrations must set up (idempotently)

Beyond tables/RLS, the migration set must contain:

```sql
-- 1. Private buckets (create-or-reassert privacy; CI asserts afterwards)
insert into storage.buckets (id, name, public)
values ('case-documents', 'case-documents', false)
on conflict (id) do update set public = false;

insert into storage.buckets (id, name, public)
values ('audit-archive', 'audit-archive', false)
on conflict (id) do update set public = false;

-- 2. Storage policies: no anon/authenticated object access; service-role handles all I/O
--    (deny-by-default on storage.objects for bucket_id in ('case-documents','audit-archive'))

-- 3. Audit integrity (A1): no UPDATE/DELETE grants or policies on audit_events for any role;
--    insert restricted to service role; hash-chain trigger maintains prev_hash/entry_hash
--    (entry_hash = SHA256(prev_hash ‖ canonical_event), genesis prev_hash = 64 zeros)

-- 4. pg_cron sweep schedules (D6, every 1 min)
select cron.schedule('signed-url-sweep', '* * * * *', $$ select cleanup_expired_signed_urls() $$);
select cron.schedule('retention-sweep',   '* * * * *', $$ select enforce_retention_policy()  $$);
```

**Bucket privacy is a migration assertion, not a dashboard setting.** `scripts/assert-private-buckets.sql` (run in CI after every `db push`, §2.2) fails if any managed bucket has `public = true` or if a storage policy grants object read to anon/authenticated roles.

CI migration job (runs in `deploy-preview.yml` and `deploy-production.yml` before the Vercel deploy):

```yaml
  migrate:
    runs-on: ubuntu-latest
    needs: build
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with: { version: latest }
      - run: supabase link --project-ref $SUPABASE_PROJECT_REF
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      - run: supabase db push            # apply pending migrations (incl. buckets + cron)
      - run: supabase db execute --file scripts/assert-private-buckets.sql
```

### 5.3 Safety rules

- **No destructive migrations in production without a manual gate** (no `DROP TABLE`/`DROP COLUMN`/data deletion). Additive changes + backfill, then a follow-up cleanup migration.
- Test migrations against staging before production. For high-risk changes, test against a **sanitized** staging copy — never a raw production dump (§3 data policy).
- Migration files are immutable once merged: never edit; add a new migration to fix.
- Keep `down` migrations for local rollback testing only; production rollback is forward-fix (§10).

---

## 6. Preview Deployments (per-PR)

### 6.1 Flow

Every pull request gets a **live preview environment** automatically:

1. PR opened/updated (with `ci.yml` green) → `deploy-preview.yml` provisions a preview DB (Supabase branch off staging or a dedicated preview project), pushes migrations, seeds the fixture, and deploys to a Vercel preview URL.
2. Vercel posts the preview URL + fixture credentials as a PR comment.
3. QA / stakeholders test the preview before merge; on merge/close the preview and its DB branch are destroyed.

### 6.2 Seeded preview fixture (`supabase/seeds/preview_seed.sql`)

Previews ship with **synthetic data covering the full clearance matrix** so reviewers can actually exercise the product's core invariant (model §3.3) instead of staring at an empty dashboard:

| Fixture element | Content |
|-----------------|---------|
| Firms | 2 synthetic firms: `"Alpha & Co (synthetic)"`, `"Beta LLP (synthetic)"` |
| Users (per firm) | `firm_admin`, lawyer with clearance L1, lawyer L2, lawyer L3, paralegal L1 (D10 roles; exactly one clearance per user) |
| Cases | One case per `default_security_level` (1/2/3), plus one L3 case with `allow_l3_download = false` (P5 view-only) |
| Documents | Tiny synthetic PDFs at L1/L2/L3 in the matching cases, uploaded to the preview `case-documents` bucket |
| Transfers | One transfer in `sent` state from Alpha → Beta, to exercise accept/reject and `external` case membership |

Fixture passwords are preview-only and never reused in staging or production. Previews never contain real client data.

### 6.3 Reviewer walkthrough (posted with the preview URL)

1. Sign in as the L1/L2/L3 lawyers → confirm **diagonal-only** access; every non-diagonal attempt returns `CLEARANCE_MISMATCH` and appears in the audit trail.
2. Open an L2/L3 document → confirm the **watermark overlay** (viewer full name + UTC timestamp).
3. On the view-only L3 case → confirm download is denied (`DOWNLOAD_BLOCKED_L3`) and logged.
4. Accept the transfer as a designated Beta recipient → confirm `external` case membership + document access under the full access rule.
5. Sign in as `firm_admin` → confirm metadata + audit visibility but **no** content access without matching clearance + case membership (P7).

---

## 7. Monitoring & Alerting

### 7.1 Error tracking — Sentry

- Browser + server SDKs; `release` tied to the GitHub SHA (§2.4).
- Alert rules: new issue in production → `#alerts`; issue frequency spike (> 5× baseline in 15 min) → `#alerts` + on-call; crash-free sessions < 99.5% → critical.
- CSP `report-uri` is pointed at Sentry so header-policy violations (§12) surface as events.

### 7.2 Uptime & synthetic checks

- **Health check:** external uptime monitor hits `GET https://app.example.com/api/v1/health` every 60 s from ≥ 2 regions. 3 consecutive failures → page on-call.
- **Upload-view smoke test** (no public-traffic synthetics — BriefLock has none): a scheduled job runs an authenticated round-trip against the synthetic smoke fixture — upload tiny PDF → wait for `scan_status = 'clean'` → request content → assert signed URL (≤ 60 s TTL) → fetch → confirm `document.viewed` audit row. Staging every 5 min, production every 15 min. 2 consecutive failures → `#alerts`.

### 7.3 Product-security alerts (BriefLock-specific)

| Alert | Condition | Channel | Severity |
|-------|-----------|---------|----------|
| **Audit chain mismatch** | Nightly verification recomputes the hash chain (`entry_hash = SHA256(prev_hash ‖ canonical_event)`) over `audit_events` and finds any mismatch | `#security` + on-call SMS | **Critical** — treat as possible tampering (§10.3) |
| **Denial spike (per profile)** | ≥ 5 denied attempts on the same profile within 15 min (model §3.2) | Transactional email to the firm admin + `#security` digest | High |
| **Platform denial spike** | > 20 denials / 15 min across profiles (aggregated ops view of the same signal — possible probing/enumeration) | `#security` | High |
| **Infected document** | Any document reaches `scan_status = 'infected'` | `#security` + firm admin email; quarantine confirmed (access blocked, A5) | High |

**Nightly chain-verify job:** a scheduled GitHub Actions workflow (`audit-chain-verify.yml`, cron `0 3 * * *`) streams `audit_events` with a read-only service connection, recomputes the chain from genesis, and alerts on mismatch; it also posts a nightly "chain OK, N events" summary to `#security`.

### 7.4 Latency & error rate (SLOs, S1)

- Sentry traces: p95 **signed-URL issuance < 100 ms**, API < 200 ms, dashboard initial load < 2 s; alert when p95 breached for 15 min.
- LogTail: alert if HTTP 5xx > 1% over 5 minutes.
- Dashboard: uptime %, error rate, p50/p95 latency, uploads/day, views/day, denials/day, infected count.

### 7.5 Alert routing

| Severity | Condition | Channel | Response |
|----------|-----------|---------|----------|
| Critical | Site down · DB unreachable · **audit chain mismatch** | SMS + Slack + email | Immediate on-call response |
| High | Denial spike · infected document · smoke test failing · 5xx > 1% · SLO p95 breach | Slack + email | Respond within 1 hour |
| Medium | 5xx 1–5% · deprecation warnings | Slack | Respond within business hours |
| Low | Coverage drop · lint warnings | Email / ticket | Next sprint |

---

## 8. Log Aggregation & Retention

### 8.1 Log sources

| Source | Ships to | Method |
|--------|----------|--------|
| Vercel platform logs (builds, deployments, function logs) | LogTail | Vercel log drain / LogTail integration |
| Next.js server & edge logs | LogTail | Structured logger (pino) + `console` passthrough |
| Supabase (Postgres, Auth, Storage) logs | Supabase dashboard + LogTail | Supabase log forwarding |
| Sentry | Sentry | SDK captures errors/traces/CSP reports (not general logs) |
| `audit_events` | Private `audit-archive` bucket | Nightly **NDJSON export** (below) |

### 8.2 PII redaction rules (D9/D8)

- **No raw IPs anywhere in logs.** Middleware computes `ip_hash = SHA256(IP_HASH_SALT ‖ ip)` at ingest before any logging; only `ip_hash` + `country` (+ `city` when available) may appear.
- No email addresses (log `profile_id`), no document content, no filenames beyond what the audit row already carries, and **never log a full signed URL** (truncate to path — the signature is a credential).
- `user_agent` truncated to 200 chars (model §2.8).
- Structured JSON only: `{ level, timestamp, requestId, actor_user_id, firm_id, case_id, document_id, action, result, deny_reason, ip_hash, … }`; correlate across services via `requestId`.

### 8.3 Audit NDJSON export (cold archive)

The `audit_events` table is append-only and retained **indefinitely**. A nightly job exports the day's events as **NDJSON** batches to the private `audit-archive` bucket:

```
audit/YYYY/MM/DD/batch-<seq>.ndjson     # one JSON object per audit event
audit/YYYY/MM/DD/manifest.json          # { count, first_entry_hash, last_entry_hash }
```

The manifest's `last_entry_hash` is what the post-restore chain verification in §9.3 checks against — the archive doubles as tamper-evidence for backups.

### 8.4 Retention policy

| Log type | Retention | Reason |
|----------|-----------|--------|
| Application logs (LogTail) | 30 days (free) / 90 days (paid) | Debugging, incident review |
| Access/security log entries (LogTail) | 90 days | Abuse investigation (authoritative record lives in `audit_events`) |
| **`audit_events` + NDJSON archive** | **Indefinite** | Append-only legal telemetry; small rows |
| Build/deploy logs | 30 days | CI debugging |

---

## 9. Backup Strategy

Supabase managed backups + application-level exports, with **priority ordered by irreplaceability** — the audit log is number one.

### 9.1 Backup matrix

| Priority | Asset | Mechanism | Verify after restore |
|----------|-------|-----------|----------------------|
| **1** | `audit_events` (append-only) | Supabase PITR + nightly NDJSON archive to `audit-archive` (§8.3) | Recompute hash chain end-to-end; compare row count + `last_entry_hash` vs archive manifest |
| 2 | Document metadata (`documents`, `cases`, `case_members`, `transfers`, `firms`, `profiles`) | PITR + weekly `pg_dump` of critical tables to an encrypted external store | Row counts per firm; `sha256` spot checks |
| 3 | Storage objects (case PDFs) | **Bucket versioning where the plan supports it; otherwise nightly incremental sync** of new/changed objects to an encrypted, versioned secondary store (objects are immutable per V1, so incrementals are cheap) | Object existence per `storage_path` + `sha256` verification |
| 4 | Everything else | Supabase daily backups / PITR | Counts |

- **PITR** (Supabase Pro) on production: restore to any timestamp in the retention window.
- **Weekly `pg_dump`** of critical tables as an independent copy; encryption keys stored separately from the backups.
- Retention sweeps (pg_cron, D6) and restore cleanup **must skip rows belonging to any case with `legal_hold = true`** — legal hold beats retention and beats cleanup, in backups and in production alike (P8).

### 9.2 Storage bucket backup specifics

- Enable object versioning on `case-documents` if the plan exposes it; otherwise run a nightly incremental copy job (content-addressed by `documents.sha256`) to the versioned secondary.
- Because uploaded documents are immutable (V1), the incremental only ever adds objects — restore is a matter of re-uploading anything missing.
- `audit-archive` bucket contents are themselves backups; replicate them to the secondary store too.

### 9.3 Restore procedure (legal-hold aware)

1. Declare incident; assess the data-loss window.
2. Restore via **PITR** to a **new** Supabase project at the target timestamp (or restore the weekly dump if PITR is unavailable).
3. Run the idempotent migrations against the restored project (schema + RLS + **recreate private buckets** + cron schedules).
4. **Audit log first (highest priority):** run chain verification over the restored `audit_events`; compare row count and `last_entry_hash` against the latest NDJSON manifest. A mismatch here stops the cutover — investigate before proceeding.
5. **Reconcile storage:** for every `documents` row, confirm the object exists at `storage_path` in the restored bucket; re-upload missing objects from the bucket backup; verify `sha256` on a sample (and 100% for anything re-uploaded).
6. **Legal-hold pass:** list all cases with `legal_hold = true`; confirm their rows, objects, and audit events survived the restore; confirm retention sweeps exclude them.
7. Verify counts (firms, profiles, cases, documents, transfers, audit_events) against application metrics; run a quick cross-tenant RLS spot check.
8. Re-point app env vars to the restored project; cut over traffic; document actual RPO/RTO.

**Targets (MVP):** RPO ≤ 24 h on free-tier daily backups; **RTO ≤ 4 h**. With PITR enabled (Pro): RPO ≤ minutes. Drill the full restore once per quarter.

---

## 10. Rollback Procedure

Preferred order: **forward-fix first** (deploy a reverting commit) → **Vercel promote-previous** → **database restore via PITR** (§9.3).

### 10.1 Application rollback (Vercel)

1. Vercel dashboard → project → Deployments → select last known-good → **Promote to Production** (instant, zero-downtime).
2. Or CLI: redeploy the previous known-good deployment with `--prod`.
3. Confirm `GET https://app.example.com/api/v1/health` returns `200` and the signed-URL smoke test passes (`npm run smoke:signed-url`).
4. Create a Sentry release annotation for the rollback.

### 10.2 Database rollback

- **Schema:** never revert migrations in production — ship a **forward-fix** migration. `down` migrations are for local environments only.
- **Data:** restore from PITR into a new project per §9.3 (audit-chain verification and legal-hold pass included), verify, then cut over.

### 10.3 Rollback decision matrix

| Scenario | Action |
|----------|--------|
| Bad code deploy (5xx spike) | Vercel promote previous deployment (minutes) |
| Bad migration breaks schema | Forward-fix migration; if unsafe, PITR restore to pre-migration timestamp |
| Bad data written (e.g., mass clearance changes) | PITR restore to new project, verify, cut over |
| Storage object lost/corrupted | Restore object from bucket versioning / nightly incremental (§9.2) |
| **Audit chain mismatch** | **Do not restore blindly** — a chain mismatch is a tampering signal: freeze writes if feasible, preserve evidence (NDJSON archive), escalate to incident response. Restoring may destroy the evidence. |
| Config/env incident | Revert env var in Vercel, redeploy |

**Targets:** RPO ≤ 24 h / RTO ≤ 4 h MVP (§9.3). **Rollback drill once per quarter**, including a PITR rehearsal and a bucket-restore rehearsal.

---

## 11. Cost Optimization

### 11.1 Cost model

| Service | MVP (free tier) | Growth | Notes |
|---------|-----------------|--------|-------|
| Vercel | Hobby — $0 | Pro — $20/mo (team) | Commercial use requires Pro; per-PR previews included |
| Supabase | Free — $0 (500 MB DB, ~1 GB file storage, limited egress) | Pro — $25/mo + compute/storage add-ons | Pro adds PITR; **storage egress scales with watermarked PDF viewing** (each view streams the file; ≤ 100 MB/doc cap) |
| Sentry | Developer — $0 (5k errors/mo) | Team — $26/mo | Error tracking + CSP reports |
| LogTail | Free — $0 | $0–75 by log volume | Structured logs + alert queries |
| **Total** | **≈ $0 / mo** | **≈ $55–230 / mo** | Supabase add-ons (compute + storage + egress) are the main swing factor |

### 11.2 Cost drivers specific to BriefLock

- **Storage egress, not API traffic, is the dominant variable.** Every watermarked view/download is a full-file transfer from Supabase Storage under a short-TTL signed URL; private documents cannot be CDN-cached. Budget egress per active firm and watch the Supabase egress dashboard.
- In-function PDF scanning (D11 MVP) runs inside the upload function — keep the heuristics cheap; the ClamAV sidecar fast-follow moves this cost off Vercel.
- Signed-URL issuance is a < 100 ms p95 path (S1) — cheap per call, but 60/min/user limit (D7 canonical) bounds it.
- Keep serverless functions short; offload sweeps to pg_cron (D6), not long-running functions.

### 11.3 Cost guardrails

- Billing alerts (Vercel + Supabase) at 50% / 80% / 100% of budget.
- Review top-cost functions and Supabase egress/storage monthly.
- Preview environments expire after 7 days of inactivity; preview DB branches are destroyed on PR close (§6.1).
- Move to paid tiers only when a real limit is hit — but **do not** defer Supabase Pro if PITR (§9) is required by the backup policy.

---

## 12. Security Headers

Injected via `next.config.js` and asserted in CI against the preview deployment. The app is authenticated-only (P4), so the whole app is **noindex**.

### 12.1 `next.config.js` headers

```js
/** @type {import('next').NextConfig} */
const base = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },               // never leak case URLs via Referer
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },            // whole-app noindex (P4)
];

// App shell: never embeddable.
const shellCsp = [
  "default-src 'self'",
  "script-src 'self'",                                            // no inline; Next inline bootstrap → nonce/hash via middleware
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.ingest.sentry.io",
  "frame-src 'self'",                                             // the in-app viewer iframe
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "report-uri <sentry-csp-endpoint>",
].join('; ');

// Viewer route (hosts pdf.js inside the app's sandboxed iframe).
const viewerCsp = [
  "default-src 'self'",
  "script-src 'self'",
  "worker-src blob:",                                             // pdf.js creates workers from blob URLs
  "child-src blob:",
  "img-src 'self' blob: data:",
  "connect-src 'self' https://*.supabase.co",                     // fetches the PDF via the ≤60s signed URL
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "sandbox allow-scripts",                                        // opaque origin inside the iframe
  "frame-ancestors 'self'",                                       // embeddable only by our own app shell
].join('; ');

const nextConfig = {
  async headers() {
    return [
      { // specific rule first so it wins over the catch-all — assert both variants in CI (§12.3)
        source: '/viewer/:path*',
        headers: [
          ...base,
          { key: 'Content-Security-Policy', value: viewerCsp },
          // DENY here would break the in-app iframe; frame-ancestors 'self' governs the viewer.
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          ...base,
          { key: 'Content-Security-Policy', value: shellCsp },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
```

Plus `app/robots.ts` (or `public/robots.txt`):

```
User-agent: *
Disallow: /
```

### 12.2 Header rationale

| Header | Value | Purpose |
|--------|-------|---------|
| `Content-Security-Policy` (shell) | restrictive, no inline scripts | XSS mitigation; app must never be framed |
| `Content-Security-Policy` (viewer) | `worker-src blob:`, `sandbox allow-scripts`, `frame-ancestors 'self'` | Lets pdf.js run inside the sandboxed iframe while blocking every other embedding and inline script |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Force HTTPS |
| `X-Frame-Options` | `DENY` on the app shell; `SAMEORIGIN` on `/viewer/*` | Clickjacking protection; the exception is the viewer, which the app itself embeds (governed by `frame-ancestors 'self'`) |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME sniffing |
| `Referrer-Policy` | `no-referrer` | Case/document URLs must never leak via Referer |
| `Permissions-Policy` | sensors disabled | Reduce attack surface |
| `X-Robots-Tag` + robots.txt | `noindex, nofollow` / `Disallow: /` | The whole app stays out of search engines (P4: no public surface) |

### 12.3 Verification

- Scan **securityheaders.com** / Mozilla Observatory on every release against `app.example.com` (placeholders until the D2 domain is chosen).
- CI header-check step `curl`s the preview URL and asserts: shell returns `frame-ancestors 'none'` + `X-Frame-Options: DENY`; `/viewer/*` returns `frame-ancestors 'self'`, `worker-src blob:`, and still carries HSTS + `no-referrer` + `noindex`.
- Confirm a third-party page cannot iframe the viewer route (manual check once per release).
- CSP violations stream to Sentry via `report-uri` and are triaged like errors.

---

## Appendix A. Deployment Checklist

- [ ] Branch protection on `main`: require PR review + required status checks (`ci.yml`, **including the RLS suite**)
- [ ] **RLS suite green in CI** — release blocker; proves zero cross-firm leakage + 3×3 clearance matrix
- [ ] Vercel project connected to GitHub; Production + Preview environments configured (Vercel-only, D2)
- [ ] Supabase production project created in the **same region** as the Vercel app region
- [ ] **Storage buckets created by migration and private in every environment** (`assert-private-buckets` green; no anon/authenticated object policies)
- [ ] Signed-URL TTL ≤ 60 s verified on staging; signed URLs issued only post-audit-commit
- [ ] **Watermark verified on staging** — L2/L3 mandatory overlay (viewer full name + UTC timestamp); L1 optional
- [ ] **Audit chain-verify job scheduled** (nightly workflow) + test alert fired to `#security`
- [ ] Denial-spike alert (≥ 5 / 15 min per profile → firm admin) and scan-infected alert configured
- [ ] `CRON_SECRET` set; sweep endpoints reject unauthenticated calls (D6)
- [ ] CI client-bundle secret scan green — `SUPABASE_SERVICE_ROLE_KEY` absent from every bundle
- [ ] GitHub secrets added (`VERCEL_*`, `SUPABASE_*`, `SMOKE_*`, `SENTRY_*`, `SLACK_WEBHOOK_URL`)
- [ ] `.env.example` committed with placeholder names only (`app.example.com`, no real values)
- [ ] Environment matrix live: separate Supabase projects **and** separate buckets per environment (§3)
- [ ] Preview fixture seeds all 3 clearance levels + transfer (§6.2); reviewer walkthrough posted on a test PR
- [ ] Sentry + LogTail sources configured; test events received; CSP `report-uri` wired
- [ ] Uptime monitor on `GET /api/v1/health`; upload-view smoke scheduled (staging 5 min / prod 15 min)
- [ ] Security headers verified on staging + production (shell **and** viewer variants, §12.3)
- [ ] robots.txt `Disallow: /` + `X-Robots-Tag: noindex` verified
- [ ] Backups confirmed: PITR enabled, weekly `pg_dump`, bucket versioning/incremental, NDJSON audit archive; **test restore performed** incl. chain verification + legal-hold pass
- [ ] Rollback runbook reviewed by on-call; quarterly drill scheduled
- [ ] Domain placeholders (`app.example.com`) replaced once the real domain is decided (D2 TBD); HSTS preload submitted

---

## Appendix B. Quick Reference Commands

```bash
# Local dev
npm run dev
supabase start && supabase db reset   # schema + RLS + private buckets + cron schedules + seeds

# Migrations (§5)
supabase migration new <name>
supabase db push                      # remote env via CI; manual escape hatch below
supabase link --project-ref $SUPABASE_PROJECT_REF
supabase db execute --file scripts/assert-private-buckets.sql   # must pass after every push

# Preview fixture (§6)
psql "$PREVIEW_DATABASE_URL" -f supabase/seeds/preview_seed.sql

# Deploy (CI owns this — manual escape hatch)
vercel deploy                         # preview
vercel deploy --prod                  # production (after CI approval)

# Post-deploy verification
curl -fsS https://app.example.com/api/v1/health
npm run smoke:signed-url              # health + authenticated signed-URL round-trip on the smoke fixture

# Logs & verification jobs
vercel logs <deployment-url>
npm run audit:verify                  # recompute the audit hash chain (what the nightly job runs)

# Rollback
# Vercel dashboard → Deployments → Promote previous to Production
# DB: PITR restore per §9.3 (audit chain first, then storage reconcile, then legal-hold pass)
```

---

*Maintained by DevOps/SRE. Review quarterly or after any major infrastructure change. This document patches v1.0; anything here that contradicts `DECISIONS.md` or `DOMAIN_MODEL.md` is wrong — regenerate the document, not the contract.*
