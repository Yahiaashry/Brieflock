# BriefLock — Tech Stack Selection & Justification

> **Version 2.0 — Updated for the legal document exchange core idea**  
> **Status:** Draft (v2.0)  
> **Owner:** Tech Stack Agent  
> **Workspace:** `C:\Users\HP\Documents\BriefLock`  
> **Source of truth:** `DECISIONS.md` (locked decisions & contract) + `DOMAIN_MODEL.md` (canonical domain model). If this file contradicts either, regenerate this file.  
> **Supersedes:** v1 stack doc (link shortener). ~80% of the v1 general web/tooling selections carried over; all link-shortener product assumptions (short codes, TTL links, redirect hot path, click analytics) have been removed or repurposed.

---

## 0. Executive Summary

BriefLock is a **secure document exchange and case-file management platform for law firms**. Firms (tenants) create cases, upload case PDFs, assign each document a **security level** (L1 standard / L2 high / L3 maximum), and exchange documents with other firms through **audited, acceptance-gated transfers**. Access to a document's content requires **all** of: firm membership (own firm or accepted transfer) ∩ case membership ∩ **exact clearance match** (compartments, not a hierarchy) ∩ a clean malware-scan status. Every access, every denial, and every administrative change is recorded in an **immutable, hash-chained audit log**.

The stack below supports a **1-month MVP**, a **security-first product posture**, and a **serverless, zero-infrastructure-management** operating model locked to **Vercel** (D2), with **Supabase** providing Postgres + Auth + Storage in one security boundary.

**Primary selection:** TypeScript · Next.js 15 (App Router) · React 19 · Tailwind CSS v4 · shadcn/ui + Radix UI · Supabase (PostgreSQL + Auth + Storage) · pdf.js (sandboxed watermarked viewer) · file-type/magic-bytes scan gate (D11) · Vercel · Vitest + RTL + Playwright · GitHub Actions.

---

## 1. Complete Stack Table

| # | Category | Technology | Version | Rationale |
|---|----------|------------|---------|-----------|
| 1 | Language | **TypeScript** | 5.x | Static typing, first-class Next.js/Supabase/Vercel support, fewer runtime defects in security-critical logic (access rule, audit hash-chain, scan gate). |
| 2 | Frontend framework | **Next.js (App Router)** | 15.x | Server Components, streaming, Route Handlers for the `/api/v1` REST API, edge middleware for rate limiting (D7) and geo headers (D8), Vercel-native (D2), Turbopack dev. |
| 3 | UI library | **React** | 19.x | Industry-standard component model, concurrent features, massive ecosystem, Next.js first-class citizen. |
| 4 | Styling | **Tailwind CSS** | v4 | Utility-first, no runtime CSS-in-JS overhead, rapid UI iteration, excellent shadcn/ui integration. |
| 5 | UI components + icons | **shadcn/ui + Radix UI + Lucide React** | Latest | Copy/paste component source (owned by the project, not a locked dependency), accessible Radix primitives (dialogs, tables, toasts for denial notices), tree-shakable Lucide icons. |
| 6 | Forms + validation | **React Hook Form + Zod** | Latest + 3.x | Performant uncontrolled forms; Zod schemas shared between client and server for upload metadata, transfer creation, and API contracts — end-to-end type safety. |
| 7 | Date handling | **date-fns** | 3.x | Modular, tree-shakable utilities — **repurposed in v2**: audit timestamp formatting (UTC) and retention math (`retention_days` sweep calculations). v1's link-TTL role is gone. |
| 8 | State management | **TanStack Query (React Query) + Zustand** | v5 + latest | Server state (cases, documents, transfers, audit views) via React Query; lightweight client state (viewer UI, filters, draft transfer) via Zustand/Context. |
| 9 | Database | **Supabase PostgreSQL** | Latest | Managed Postgres, ACID, **RLS firm-scoped multi-tenancy**, **pgcrypto** for the audit hash-chain, **pg_cron** sweep jobs (D6), TypeScript type generation from schema. |
| 10 | File storage | **Supabase Storage** | Latest | **Private buckets only**, object path `{firm_id}/{case_id}/{document_id}/{filename}`, **signed URLs with TTL ≤ 60 s**, same security boundary and region as the database; storage policies aligned with RLS. |
| 11 | Auth | **Supabase Auth** (primary) / **Clerk** (alternative) | Latest | Email/password + magic link (D10), deep Postgres/RLS integration (`auth.uid()`), JWT Bearer for the API, **no custom auth endpoints**; roles `firm_admin`/`lawyer`/`paralegal` + one clearance per user. |
| 12 | API layer | **Next.js Route Handlers** (App Router) | 15.x | REST `/api/v1` (documents, transfers, audit, search, health — N1) co-located with the app; in-process access-control service; `RateLimiter` interface (D7, in-memory MVP → Upstash later); cron endpoints behind `CRON_SECRET`. |
| 13 | Document viewer | **pdf.js (Mozilla)** | Latest (5.x) | Client-side canvas rendering inside a **CSP-locked sandboxed iframe**; dynamic **watermark overlay** (viewer full name + UTC timestamp, W1); no third-party viewer service ever touches client files. |
| 14 | Upload validation & scan gate | **file-type (npm) + custom magic-bytes / PDF structure checks**; **ClamAV container** (fast-follow) | Latest (ESM) / — | D11 MVP: in-function PDF validation (magic bytes, size ≤ 100 MB, embedded-JS heuristics) + **quarantine-until-scanned** (`scan_status != 'clean'` blocks all access). ClamAV = documented fast-follow, the **only future non-Vercel infra piece**. Client files are **never** sent to third-party scanning APIs. |
| 15 | Deployment | **Vercel** (primary) / **Railway** (alternative) | Platform | Next.js-native edge platform, preview deployments per PR, generous Hobby tier, zero-config CI/CD. **D2 locks the app to Vercel**; sole documented exception: the D11 ClamAV fast-follow container. |
| 16 | CI/CD | **GitHub Actions** | Platform | Native to GitHub, free minutes, matrix testing, Supabase CLI + Vercel integration; runs the **RLS test suite** and **clearance-matrix E2E** on every PR. |
| 17 | Unit & component testing | **Vitest 3.x + React Testing Library** | 3.x + Latest | Vite-native, fast, TypeScript-first unit tests (access-rule evaluator, audit canonical hashing, retention math, magic-bytes validator, Zod schemas) + user-centric component tests. |
| 18 | E2E testing | **Playwright** | 1.50+ | Cross-browser (Chromium, Firefox, WebKit), auto-waiting, traces/video on failure; drives the **3×3 clearance matrix** and transfer journeys end-to-end. |
| 19 | Error & performance monitoring | **Sentry** | Latest SDK | Client + server error capture, release tracking, performance traces measured against the S1 SLOs (signed-URL issuance < 100 ms, API < 200 ms), Next.js integration. |
| 20 | Log aggregation | **LogTail** (or equivalent) | Platform | Structured log collection, retention, search; **audit-chain verification alerts** and **denial-spike alerts**; `ip_hash` only — raw IPs never logged (D9). |
| 21 | Version control | **GitHub** | Platform | PR reviews, branch protection, Actions, Dependabot, secret scanning in one place. |

**Changes vs v1 table:** ➕ File storage (row 10), Document viewer (row 13), Upload validation & scan gate (row 14). Icons folded into row 5; unit + component testing merged into row 17. The v1 "product analytics (clicks/referrers)" row was **removed** — an authenticated legal platform runs no third-party click analytics (D8: no client legal data leaves the platform for enrichment); observability is covered by rows 19–20.

---

## 2. Language Choice Justification — TypeScript

### Why TypeScript

| Factor | Assessment for BriefLock |
|--------|--------------------------|
| **Static typing** | Catches type mismatches at compile time rather than runtime — critical for a platform where a clearance mismatch or a scan-pending document must never become viewable because of a shape mismatch in the access decision. |
| **Canonical enums as literal types** | `clearance_level` (1–3), `security_level` (1–3), `scan_status`, roles, transfer states, and deny reasons (§3.2) become discriminated unions — illegal states (e.g., issuing a signed URL for an `infected` document) are unrepresentable. |
| **Ecosystem alignment** | Next.js, Supabase, Vercel, shadcn/ui, and the testing tools all ship first-class TypeScript support and type definitions. |
| **Database type safety** | Supabase generates TypeScript types directly from the Postgres schema, keeping the client, API routes, and database in sync automatically. |
| **Team velocity** | Self-documenting code reduces onboarding time; IDE autocompletion and refactoring support speed up the 1-month MVP. |
| **Hiring / familiarity** | TypeScript is the dominant typed language in the React/Next.js ecosystem; easiest to staff and to find community answers for. |

### Risks & Mitigations

- **Build complexity:** Mitigated by Next.js's built-in TypeScript support (no separate build step configuration).
- **Type drift:** Mitigated by generating Supabase types from schema (`supabase gen types typescript`) and running `tsc --noEmit` in CI.

---

## 3. Framework Choice Justification — Next.js (App Router)

### Why Next.js

| Factor | Assessment for BriefLock |
|--------|--------------------------|
| **App Router** | React Server Components reduce client-side JS for case lists, document tables, and audit views; streaming improves perceived performance of dashboard initial load (S1: < 2 s). |
| **Route Handlers** | Native REST API (`/api/v1/*` — documents, transfers, audit, search, health) co-located with the web app, no separate backend service to operate — ideal for a small team on a 1-month MVP. |
| **Edge middleware** | Per-instance token-bucket rate limiting (D7, behind a `RateLimiter` interface) and Vercel geo-header capture (D8) run before API handlers; canonical limits per `DECISIONS.md` §3 (auth 10/min·IP, upload 30/min·user, content 60/min·user, other 100/min·user, all `429 + Retry-After`). |
| **Authenticated-only surface (P4)** | No public pages except login/signup/invite-accept; middleware-level session gating is simple. There are no SEO requirements for the app surface — a deliberate difference from v1's public share pages. |
| **Security headers / viewer sandbox** | App Router + middleware give precise control over CSP and headers — required to lock down the pdf.js viewer iframe (`sandbox`, strict CSP, no external origins). |
| **Serverless fit** | Next.js output maps cleanly to serverless functions on Vercel, matching the D2 "Vercel-only, no infrastructure management" decision. |

### Risks & Mitigations

- **Vendor perception (Vercel-centric):** Next.js is framework-open and deployable elsewhere (Railway, Render, self-hosted). Vercel is the deployment choice (D2), not a framework lock-in.
- **App Router learning curve:** Mitigated by starting with a small surface area (login, dashboard, case view, document viewer, transfer inbox, audit view).

---

## 4. Database Choice Justification — Supabase (PostgreSQL, Serverless)

### Why Supabase Postgres

| Factor | Assessment for BriefLock |
|--------|--------------------------|
| **Relational + ACID** | The transfer state machine, `case_members` inserts (idempotent `external` member admission on acceptance), and the audit write are transactional. The hardest invariant — **audit `document.viewed` row committed synchronously *before* the signed URL is issued** (A1) — needs a real transaction, not eventual consistency. |
| **RLS multi-tenancy (emphasized)** | Every table carries `firm_id` (or resolves to one via a parent). RLS makes cross-firm rows **structurally invisible** — including through search, counts, and error messages (DOMAIN_MODEL §10). The automated RLS test suite proving zero cross-firm leakage is a **release blocker** (DECISIONS §5). This is defense in depth beneath the application access rule, not a replacement for it. |
| **Audit hash-chain via pgcrypto** | `audit_events` is append-only (no UPDATE/DELETE grants for any role; insert = service role only). The chain — `entry_hash = SHA256(prev_hash ‖ canonical_json(event))`, genesis `prev_hash` = 64 zeros — is computed in-database with **pgcrypto** (`digest(..., 'sha256')`), so linkage integrity is enforced where the data lives, not only in app code. |
| **pg_cron sweeps (D6)** | Signed-URL cleanup and retention sweeps run via Supabase `pg_cron` every minute, paired with **lazy read-time checks as the real enforcer**; cron-triggered endpoints are protected by `CRON_SECRET`. |
| **Storage integration** | Supabase Storage lives in the same project: private buckets, storage-level policies keyed off the same `firm_id` path convention, and signed-URL issuance against the same service role — one security boundary, one region. |
| **JSONB flexibility** | `audit_events.details` and `firms.settings` (retention days, watermark defaults, L3 view-only default) are semi-structured; JSONB allows schema-flexible payloads without per-field migrations. |
| **Serverless / no-ops** | No database server to provision, patch, or scale manually; Supabase manages connection pooling (PgBouncer), backups, and failover. |
| **Local development** | Supabase CLI + Docker provides a local Postgres mirror — essential for exercising RLS policies (as `anon`, `authenticated`, and `service_role`) in CI without a shared dev database. |
| **TypeScript generation** | `supabase gen types typescript` keeps API route and client code in sync with schema changes. |

### Data model highlights (normative in `DOMAIN_MODEL.md`)

- `firms` — tenant root; every row is firm-scoped.
- `profiles` — extends `auth.users`; `role` (`firm_admin` \| `lawyer` \| `paralegal`) + **exactly one** `clearance_level`.
- `cases` — legal matter; `default_security_level`; per-case `allow_l3_download` flag (P5); `legal_hold`; `retention_days`.
- `case_members` — own-firm or `external` (cross-firm, admitted via accepted transfer) membership.
- `documents` — one immutable PDF (V1); `sha256`, `security_level`, `scan_status` (`pending`/`clean`/`infected`/`error`), size ≤ 100 MB, `mime_type = 'application/pdf'`.
- `transfers` / `transfer_items` — cross-firm send/receive with acceptance gate; `recipient_user_ids` designated at send time.
- `audit_events` — append-only, hash-chained; denials carry canonical `deny_reason` codes.

---

## 5. File Storage & Document Pipeline — Supabase Storage (new in v2.0)

This replaces v1's "redirect hot path" section: the hot path is no longer a 302 redirect — it is the **document pipeline** (upload → validate → scan → store → audit → signed URL → watermarked view).

### Why Supabase Storage

| Factor | Assessment for BriefLock |
|--------|--------------------------|
| **Private by default** | **No public buckets** (DOMAIN_MODEL §7). Documents are legal case files; the only delivery path is a short-lived signed URL issued by the API after authorization. |
| **Co-location with DB + Auth** | Same project, same region, same service role, same security boundary as Postgres and Supabase Auth — one vendor console, one audit surface, one region for the D2 Vercel-only topology. |
| **Storage policies mirror RLS** | Bucket policies are keyed to the `{firm_id}/{case_id}/{document_id}/{filename}` object path, so even direct storage access (never exposed in MVP) is firm-scoped the same way the tables are. |
| **Signed URLs, TTL ≤ 60 s** | Issued **only after** the audit row is committed (A1). 60 s is long enough for pdf.js to fetch and render, short enough that a leaked URL is nearly useless; `pg_cron` sweeps stale issuance records (D6). |
| **Standard S3-compatible API** | Objects are plain PDFs under a vendor-neutral key convention — trivially exportable (see exit strategy, §14). |

### Document pipeline (normative flow, DOMAIN_MODEL §7)

1. **Upload:** client sends PDF → API validates extension/MIME via `file-type` + custom magic-bytes check and size ≤ 100 MB (D11 pre-check).
2. **Store:** object written to the private bucket at `{firm_id}/{case_id}/{document_id}/{filename}`; SHA-256 computed and persisted; `scan_status = 'pending'`.
3. **Scan (D11 MVP):** in-function PDF structure validation (magic bytes, embedded-JS heuristics) → `clean` | `infected` | `error`; `scan_method = 'magic-bytes-mvp'`.
4. **Access gate:** any content access requires `scan_status = 'clean'` **and** the full Access Rule (A1–A6) evaluated server-side in a single typed module (the access-control service).
5. **Audit → issue:** `document.viewed`/`document.downloaded` audit row committed **synchronously first**; only then is a signed URL (TTL ≤ 60 s) issued.
6. **Delivery + view:** browser fetches bytes directly from Storage (Vercel bandwidth untouched) and renders in the sandboxed pdf.js viewer with watermark overlay (§6).

Every denial in this pipeline writes an `audit_events` row with a canonical reason (`UNSCANNED`, `INFECTED`, `FIRM_MISMATCH`, `NOT_CASE_MEMBER`, `CLEARANCE_MISMATCH`, `CASE_ARCHIVED`, `DOWNLOAD_BLOCKED_L3`, …). Access-time metadata captured for audit: `ip_hash` (salted SHA-256 at ingest, raw IP never persisted — D9), `country`/`city` from Vercel request geo headers (D8), truncated user-agent.

---

## 6. Document Viewer & Watermarking — pdf.js (new in v2.0)

### Why pdf.js (Mozilla)

| Factor | Assessment for BriefLock |
|--------|--------------------------|
| **Full rendering control** | pdf.js renders PDFs to canvas under our control — unlike a native browser plugin or `<embed>`, which we cannot watermark reliably or sandbox tightly. |
| **Watermark overlay (W1)** | Dynamic overlay with the viewer's **full name + UTC timestamp**, re-rendered per page; **mandatory for L2/L3, optional for L1**. Overlay is DOM/canvas on top of the pdf.js canvas — trivial with full control of the render surface. |
| **L3 view-only mode (P5)** | When `case.allow_l3_download = false`: rendering only — download button disabled, download attempts denied and logged (`DOWNLOAD_BLOCKED_L3`). The text layer/copy can be suppressed per-case. |
| **Sandboxability** | Runs inside a **CSP-locked, sandboxed iframe** (no same-origin access to the app, no external network calls), so viewer compromise cannot reach app sessions or other documents. |
| **No vendor touches client files** | Free, open-source (Apache-2.0), bundled client-side. No third-party viewer/DRM service ever receives the PDF bytes — consistent with D11's "never send client files to third parties" posture. |
| **Proven at scale** | Mozilla's own Firefox PDF engine; mature API, accessible text layer, broad browser support. |

### Alternatives considered

- **Native `<embed>`/iframe PDF:** zero control over watermark, download, or copy behavior — rejected.
- **Commercial viewers (e.g., PDFTron/Apryse):** strong DRM features but significant cost and vendor lock-in; overkill for MVP (P8 cost posture). Revisit only if post-MVP compliance requires certified redaction/annotation.

### Risks & Mitigations

- **Bundle size:** load pdf.js lazily inside the viewer route only (dynamic import; worker enabled).
- **Watermark circumvention:** watermarks deter but cannot *guarantee* prevention (screenshots exist); the mitigations are audit + accountability — every view is audited with the watermarked identity, and L3 can be switched to view-only per case. Documented limitation, not a stack defect.

---

## 7. Upload Validation & Malware Scan Gate — D11 (new in v2.0)

### MVP approach (locked)

- **`file-type` npm + custom magic-bytes check:** verify the uploaded bytes are genuinely `application/pdf` (`%PDF-` magic bytes via `file-type` plus our own structural checks) — never trust the client-declared MIME type.
- **In-function PDF structure validation:** size ≤ 100 MB, embedded-JS heuristics, structural sanity checks — runs inside the Vercel function (no external service).
- **Quarantine-until-scanned:** `scan_status = 'pending'` blocks **all** access (A5); only `clean` documents are ever viewable/downloadable.
- **Never** third-party scanning APIs for client files (D11, hard rule).

### ClamAV container — the documented fast-follow

Full ClamAV scanning requires a long-running daemon that **cannot run on Vercel**. It is the **sole sanctioned non-Vercel infra piece** (D2 exception), to be hosted separately (e.g., Railway/Fly.io container) and called by the app; `scan_method` upgrades from `magic-bytes-mvp` to `clamav`. Until then, the MVP gate is structural validation + quarantine.

### Why this is acceptable for MVP

The dominant real-world threat for a law-firm exchange is a malicious PDF reaching a lawyer's viewer. Structure validation + quarantine catches malformed/mismatched uploads and obvious embedded-script payloads immediately; the 60-second signed-URL TTL and watermark/audit controls limit blast radius. ClamAV closes the remaining gap on the fast-follow track — a documented, deliberate sequencing decision (D11), not an oversight.

---

## 8. Auth Provider Comparison & Selection

### Candidates compared

| Criterion | Supabase Auth | Clerk | Auth0 | NextAuth.js (Auth.js) |
|-----------|---------------|-------|-------|----------------------|
| **Email/password + magic links** | ✅ Native | ✅ Native | ✅ Native | ✅ (email provider) |
| **MFA / SSO** | ✅ (paid tiers) | ✅ (paid tiers) | ✅ Strong enterprise focus | Partial / self-built |
| **Database integration** | Deep (same Postgres, `auth.users`) | Separate user store (sync needed) | Separate user store | Self-managed (any DB) |
| **RLS integration** | ✅ Native (`auth.uid()`) | ❌ (app-layer only) | ❌ | ❌ |
| **Free tier** | Generous (500 MB DB, 50k users) | Up to 10k MAU | 7k MAU | Self-hosted (free) |
| **Implementation effort** | Low (already using Supabase DB) | Low (Next.js SDK) | Medium | Medium |
| **Vendor lock-in** | Medium (Postgres data portable; Auth is OIDC-compatible) | Medium (OIDC-portable) | High (feature lock-in) | Low (self-hostable) |

*(v1's social-login row dropped — out of MVP scope; SSO/SAML is out of scope per `DECISIONS.md` §4.)*

### Selection: Supabase Auth (primary), Clerk (designated alternative)

**Rationale**

1. **Single provider stack:** The database (and now Storage) is already Supabase; Supabase Auth keeps identity, data, and files in the same account, region, and security boundary — fewer integration points and lower operational surface for a 1-month MVP.
2. **RLS integration:** `auth.uid()` in Postgres policies, joined against `profiles.firm_id`, lets the database itself enforce firm-scoped multi-tenancy — the structural cross-firm invisibility the release-blocking RLS suite must prove. App-layer checks remain (defense in depth), but RLS is what makes leakage *structurally* impossible.
3. **Required features out of the box (D10):** Email/password + magic link are native; **no custom auth API endpoints** — the app uses the Supabase client SDK and JWT Bearer against `/api/v1`.
4. **Roles & clearance (D10):** `profiles.role ∈ {firm_admin, lawyer, paralegal}` and **exactly one `clearance_level` per user** (P6). Role and clearance changes are admin-only operations and always audited. The JWT carries the identity (`sub`); role/clearance are read server-side from `profiles` — never trusted from the client.
5. **Cost:** Free tier comfortably covers MVP-scale usage; Pro starts at $25/month.
6. **Exit path:** OIDC-compliant; profiles and credentials exportable to Clerk, Auth0, or self-hosted Auth.js if ever needed.

**When to switch to Clerk:** If a post-MVP phase adds enterprise SSO (SAML, Azure AD) or complex org models beyond `firms`, Clerk is the designated alternative behind an auth adapter.

---

## 9. Deployment Platform Comparison (Vercel vs Railway vs Render)

### Evaluation criteria

| Criterion | Weight | Notes |
|-----------|--------|-------|
| Next.js / App Router support | High | Native runtime features (middleware, image optimization, edge runtime) |
| Deployment experience | High | PR previews, zero-config Git integration |
| Pricing / free tier | High | MVP must start at $0/month; predictable paid growth |
| Database colocation | Medium | Lower latency if app and DB are in the same region |
| Scaling model | Medium | Serverless auto-scale vs container-based |
| Vendor portability | Medium | Ability to move off-platform (kept for exit planning, not MVP) |

### Comparison

| Criterion | **Vercel** | **Railway** | **Render** |
|-----------|-----------|-------------|------------|
| **Next.js support** | Native (created by Next.js team), edge middleware, image optimization | Strong (Nixpacks/Docker), good Next.js support | Good, but fewer Next.js-specific edge features |
| **Git integration** | Excellent (GitHub/GitLab/Bitbucket) | Excellent | Excellent |
| **Preview deployments** | ✅ Automatic per PR | ✅ (Railway environments) | ✅ (preview environments) |
| **Free tier** | Hobby: generous | ~$5 credit trial, then pay-as-you-go | Free tier (services spin down after inactivity) |
| **Paid pricing** | Pro: $20/user/month + usage | Usage-based (container hours + DB) | Standard: $7/month per service |
| **Database/storage colocation** | External Supabase (our choice) | Managed Postgres add-on + containers | Managed Postgres add-on |
| **Scaling** | Serverless functions auto-scale | Containers auto-scale | Containers (spin down on free tier) |
| **Regions** | Global edge network | Multiple regions | Multiple regions |
| **Lock-in** | Medium (Next.js is portable; Vercel platform config is not) | Medium (Docker-ish, portable) | Medium |

### Selection: Vercel — locked by D2

**Rationale**

1. **Next.js-native:** BriefLock is a Next.js App Router app; Vercel gives the best middleware, image-optimization, and serverless isolation support with zero configuration.
2. **Preview deployments:** Every PR gets a preview URL — used for QA and for Playwright E2E runs (including clearance-matrix scenarios) against ephemeral environments.
3. **Cost at MVP:** Hobby tier is free; with Supabase free tier the combined stack starts at ~$0/month.
4. **D2 is a locked decision:** The app runs on Vercel only (domain **TBD** — use `app.example.com` placeholders). The **sole documented exception** is the D11 fast-follow: the ClamAV scanner container, which cannot run on Vercel and would be hosted on Railway/Fly.io as a worker the app calls. No other infra drift is permitted without amending `DECISIONS.md`.
5. **Geo headers (D8):** Vercel request geo provides country/city for audit events — no third-party GeoIP vendor, no client legal data leaves the platform for enrichment.

**When Railway would enter the picture:** exclusively for the D11 ClamAV container (and, if ever needed, long-running workers beyond `pg_cron` sweeps) — it remains the documented alternative platform, not an MVP target.

---

## 10. Styling & UI Component Library Recommendations

### Recommended combination

| Layer | Technology | Role |
|-------|------------|------|
| Styling engine | **Tailwind CSS v4** | Utility-first CSS; no runtime CSS-in-JS; tiny production bundle |
| Component primitives | **Radix UI** | Accessible, unstyled primitives (Dialog, Popover, Dropdown Menu, Toast, Table) |
| Component collection | **shadcn/ui** | Copy/paste React components built on Radix + Tailwind; owned by the project |
| Icons | **Lucide React** | Consistent icon set, tree-shakable |
| Utility tailwind | `clsx`, `tailwind-merge`, `class-variance-authority` | Conditional class composition and variant APIs |

### Why this combination

- **Accessibility by default:** Radix primitives handle keyboard navigation, focus management, and ARIA attributes — critical for a professional tool lawyers use all day (and for denial/error messaging clarity).
- **No heavy runtime library:** shadcn/ui source lives in the repo (`/components/ui`) — no version-locked component library bloating the bundle.
- **Trust-appropriate visual language:** Dense data tables (cases, documents, audit), clear status badges (`scan_status`, security levels L1–L3), and unambiguous destructive-action confirmations (transfers, revocations) are quick to build with shadcn/ui primitives.
- **MVP-friendly:** Production-quality components out of the box; the 1-month MVP looks polished without a dedicated designer.

### Alternative considered

- **Mantine / Chakra UI:** Rich libraries, but runtime CSS-in-JS adds bundle size and a dependency layer; shadcn/ui's "copy source" model fits better.
- **Material UI:** Heavier, opinionated visual language; overkill here.

---

## 11. Testing Stack Justification

### Testing pyramid for BriefLock

```
        /\
       /E2E\      Playwright (upload → scan gate → clearance-gated view → transfer accept → denial logged)
      /------\
     /   Int   \   React Testing Library + Vitest (components, route handlers, access-control service)
    /------------\
   /    Unit      \   Vitest (access-rule evaluator, audit canonical-JSON hashing, retention math,
   ----------------            magic-bytes validator, Zod schemas)
```

| Layer | Tool | Version | What it covers | Why |
|-------|------|---------|----------------|-----|
| **Unit** | **Vitest** | 3.x | Access-rule evaluator (A1–A6), audit canonical-JSON + SHA-256 chain math, retention/date math, magic-bytes/PDF-structure validator, Zod schemas | Fast (sub-second), Vite-native, TypeScript-first, same toolchain as app builds |
| **Component** | **React Testing Library** | Latest | Upload form, document table, viewer chrome incl. watermark overlay, transfer inbox, denial toasts | User-centric assertions (query by role/label), discourages testing implementation details |
| **API route** | **Vitest + supertest-style fetch** | 3.x | Route handlers (`/api/v1/*`): access-control service, signed-URL issuance *after* audit commit, rate limiting, scan gate | Tests the REST contract without a browser |
| **E2E** | **Playwright** | 1.50+ | Full journeys: login → upload → scan → view (watermark) → transfer send/accept → external access → denial paths; the **3×3 clearance matrix** | Cross-browser, auto-waiting, CI-friendly, traces & video on failure |

### Security test emphasis (release blockers)

- **RLS suite:** automated tests against local Supabase (CLI + Docker) connecting as `anon`, `authenticated`, and `service_role` roles, proving **zero cross-firm data leakage** — including via search results, counts, and error messages (DOMAIN_MODEL §10; DECISIONS §5). A failure blocks release.
- **Clearance matrix (3×3):** only the diagonal (L1↔L1, L2↔L2, L3↔L3) allows access; every non-diagonal pair asserts a `CLEARANCE_MISMATCH` **audit row** — the product's core invariant (DOMAIN_MODEL §3.3).
- **Scan gate:** `pending`/`infected` documents blocked with `UNSCANNED`/`INFECTED` denials; `clean` unlocks.
- **Audit integrity:** genesis hash (64 zeros), linkage verification, and tamper detection (mutate a row → chain verification fails).
- **L3 download gate (P5):** view allowed, download denied + `DOWNLOAD_BLOCKED_L3` audit row when the per-case flag is set.

### CI integration

- GitHub Actions runs `vitest run` (incl. the RLS suite) on every PR.
- Playwright runs against Vercel preview deployments (or a local production build) on push to `main` and before releases.
- Coverage threshold: 80%+ for unit/utils; **100% for access-control paths** (access rule, scan gate, audit-write-before-issue, signed-URL issuance).

---

## 12. Monitoring & Observability Stack

| Layer | Tool | Purpose | Free tier | Paid from |
|-------|------|---------|-----------|-----------|
| **Error tracking** | **Sentry** | Client + server error capture, release tracking, performance traces vs S1 SLOs, Next.js SDK | ✅ (5k errors/month) | ~$29/month |
| **Log aggregation** | **LogTail** | Structured log collection, retention, search; audit-action and denial-spike alerts | ✅ (limited GB/month) | Usage-based |
| **Uptime / synthetic** | GitHub Actions cron or UptimeRobot | Periodic health check of `GET /api/v1/health` (N1) + dashboard load | ✅ | — |
| **Web vitals** | **Vercel Analytics** | Page/dashboard performance only — **no third-party click analytics on document pages** (D8) | ✅ | — |
| **Infrastructure metrics** | Supabase dashboard | Postgres usage, Storage usage/egress, connection pooling, `pg_cron` job status | ✅ | Pro $25/month |

### Product-specific alerting (new in v2.0)

- **Audit-chain verification alerting:** a scheduled job (`pg_cron` or CI cron) recomputes the `audit_events` hash chain; a head-hash mismatch or broken linkage → **critical alert** (Sentry page + LogTail). This is tamper detection for the platform's core integrity guarantee (A1).
- **Denial-spike alerting:**
  - *Firm-level (in-product):* ≥ 5 denials on the same profile within 15 min → alert email to the firm admin (DOMAIN_MODEL §3.2).
  - *Ops-level:* LogTail alert on `document.access_denied` rate anomalies (possible account probing or clearance scanning) and on `scan_status = 'infected'` spikes.

### Observability principles

- **Structured logging:** JSON logs keyed by `request_id`, `firm_id`, `case_id`, `document_id`, `action`, `deny_reason` for correlation in LogTail.
- **Privacy in logs (D9):** `ip_hash` only — raw IPs are never persisted or logged; no document content, no client PII in logs.
- **Error boundaries:** React error boundaries + Sentry Next.js SDK capture unexpected UI crashes.
- **Performance vs SLOs (S1, p95):** signed-URL issuance < 100 ms · API < 200 ms · dashboard initial load < 2 s · uptime 99.9% — tracked via Sentry traces and Vercel Web Vitals. *(v1's redirect-latency metric is retired with the link hot path.)*
- **Alerting:** Sentry alerts for error-rate spikes; LogTail alerts for audit-chain failure and denial spikes (above).

---

## 13. Cost Estimate (Free Tier vs Paid)

### Monthly projection at MVP / early scale

| Service | Free tier | Paid tier | Estimated monthly cost (MVP) | Estimated monthly cost (growth) |
|---------|-----------|-----------|------------------------------|---------------------------------|
| **Vercel** | Hobby: free | Pro: $20/user/month + usage | $0 | $20–$60 |
| **Supabase (DB + Auth + Storage)** | Free: 500 MB DB · 1 GB Storage · 5 GB egress · 50k MAU | Pro: $25/month (incl. ~100 GB Storage; additional storage ≈ $0.021/GB/month) | $0 | $25–$100+ |
| **pdf.js** | Free, Apache-2.0, bundled client-side | — | $0 | $0 |
| **file-type / scan gate (MVP)** | Free (npm, MIT) | — | $0 | $0 |
| **ClamAV container (fast-follow only)** | — (not in MVP) | Container hosting ≈ $5–15/month (Railway/Fly.io) | $0 | $5–$15 (only when built) |
| **Clerk** (if chosen) | Free: up to 10k MAU | Paid: usage-based | $0 | $0–$150 |
| **Sentry** | Free: 5k errors/month | Team: ~$29/month | $0 | $29 |
| **LogTail** | Free tier available | Usage-based | $0 | $10–$30 |
| **Domain** (TBD per D2; placeholder `app.example.com`) | — | ~$12/year amortized | ~$1 | ~$1 |
| **Playwright CI** | GitHub Actions free minutes | — | $0 | $0 |
| **Total** | | | **~$0–$1/month** | **~$60–$240/month** |

### Notes

- The stack is intentionally designed so the MVP runs at approximately **$0/month** (Vercel Hobby + Supabase Free + Sentry/LogTail free tiers + pdf.js/file-type free).
- **v1's link-traffic/bandwidth assumptions are removed.** Document bytes stream from Supabase Storage directly to the browser via signed URLs — Vercel bandwidth stays flat; **Supabase Storage capacity and egress are the new scaling variables**.
- Storage math: documents are capped at 100 MB each; 1 GB free ≈ 10 max-size PDFs or several hundred typical 1–5 MB case PDFs. Supabase Pro (100 GB included) is the first likely paid upgrade, alongside DB growth past 500 MB.
- Auth stays free within generous limits; Clerk remains free up to 10k MAU.
- The ClamAV container is the only *new* future line item (~$5–15/month) and only when the D11 fast-follow is built.
- Costs assume a single region; multi-region would increase egress and replication costs.

---

## 14. Vendor Lock-In Assessment & Exit Strategy

### Lock-in heatmap

| Component | Lock-in | Why | Exit difficulty |
|-----------|---------|-----|-----------------|
| TypeScript | Low | Language, portable | Trivial |
| Next.js | Low | Framework-standard code; deployable anywhere Node runs | Low (adapter changes) |
| Tailwind + shadcn/ui + Radix | Low | Source code owned by project | Low |
| React Query / Zustand | Low | Standard libraries | Low |
| Supabase Postgres | Medium | Standard SQL (portable); RLS policies + pgcrypto chain are plain Postgres features | Medium (`pg_dump` export + re-apply policies) |
| Supabase Auth | Medium | OIDC-compatible, but `auth.uid()` RLS coupling | Medium (OIDC provider swap) |
| **Supabase Storage** | **Medium–Low** | Objects are plain PDFs under a vendor-neutral key convention; S3-compatible API; only signed-URL issuance is vendor-specific | **Low–Medium: storage download script + re-upload to S3/GCS; re-implement 60 s URL signing** |
| **pdf.js** | **Low** | Apache-2.0 open source, bundled client-side; **no vendor service at all** | **Trivial (npm dependency swap at worst)** |
| Vercel | Medium | Next.js is portable; preview/deploy config is Vercel-specific | Low–Medium (Railway/Render/self-host) |
| Playwright / Vitest | Low | Test code is portable | Trivial |

### Exit strategy

1. **Data ownership — `pg_dump`:** All business data (firms, profiles, cases, case_members, documents metadata, transfers, audit_events) lives in standard PostgreSQL. Regular `pg_dump` exports and Supabase CLI backups ensure portability to any Postgres host (RDS, Railway Postgres, self-hosted). The audit hash chain is *data*, not vendor magic — it remains verifiable after export.
2. **File ownership — storage download script:** a documented script enumerates every Storage object (S3-compatible API / Supabase CLI), downloads all PDFs **preserving the `{firm_id}/{case_id}/{document_id}/{filename}` key structure**, and uploads them to any target (S3, GCS, Azure Blob, self-hosted MinIO). Signed-URL delivery is reproducible on any object store with URL signing.
3. **Auth portability:** Supabase Auth exposes OIDC/OAuth endpoints and user export; migrating to Clerk, Auth0, or self-hosted Auth.js is feasible without losing users (standard password-reset flow caveat).
4. **Framework abstraction:** Keep business logic — the access-rule evaluator, audit hash-chain computation/canonicalization, retention math, and scan validation — in plain TypeScript modules outside Next.js route handlers, reusable if the framework or host ever changes.
5. **No proprietary data formats:** PDFs are stored verbatim with our own SHA-256; `audit_events.details` is JSONB; the audit export endpoint emits NDJSON for cold archive — no encrypted blobs requiring a vendor-specific key store.
6. **Infrastructure-as-code-adjacent:** Environment variables, build commands, and project settings documented in `DEPLOYMENT.md`, so redeployment on another platform takes hours, not weeks.

---

## 15. Version Control & Branching Strategy

### Repository

- **Platform:** GitHub (single repository for the MVP; monorepo only if a separate API client SDK is added later).
- **Branches:** `main` (production), feature branches (`feature/clearance-gate`), optional release branches (`release/v0.1`), hotfix branches (`hotfix/...`).

### Strategy: GitHub Flow (trunk-based)

1. All development happens on short-lived feature branches off `main`.
2. Pull requests are required to merge into `main`.
3. PR requirements:
   - At least one approved review.
   - Required status checks pass: `tsc --noEmit`, `vitest run`, lint, build, Playwright (on preview deploy).
   - No merge conflicts.
4. `main` is always deployable; merging to `main` triggers automatic Vercel production deployment.

### Commit conventions

- **Conventional Commits** (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`) — enables automated changelogs and semantic versioning.
- Example: `feat(documents): enforce exact-clearance match on content access`

### Versioning

- **Semantic Versioning (SemVer)** starting at `0.1.0` during MVP (pre-1.0 allows breaking changes).
- Releases tagged in GitHub; GitHub Releases used for changelog artifacts.

### Security & hygiene

- Branch protection rules on `main` (no direct pushes, required reviews, up-to-date branches).
- Dependabot enabled for automated dependency updates.
- `.env.local`, Supabase service-role keys, `CRON_SECRET`, and the IP-hash salt never committed; `.env.example` committed with placeholder values.
- Secrets managed via Vercel Environment Variables / GitHub Secrets for CI.

---

## Appendix: Decision Log

| Decision | Selected | Alternative considered | Date | Reason |
|----------|----------|----------------------|------|--------|
| Language | TypeScript 5.x | JavaScript | — | Type safety for security-critical logic (access rule, audit chain, scan gate) |
| Framework | Next.js 15 (App Router) | Remix, Nuxt | — | Vercel-native, Route Handlers for `/api/v1`, React Server Components, middleware for rate limiting/geo |
| Database | Supabase Postgres (serverless) | Firebase, PlanetScale, self-hosted Postgres | — | Relational + ACID, firm-scoped RLS multi-tenancy, pgcrypto hash-chain, pg_cron sweeps, no-ops |
| **File storage** | **Supabase Storage (private buckets)** | AWS S3/GCS + separate signing service, Cloudflare R2 | v2.0 | Private-only buckets co-located with DB/Auth, storage policies mirroring RLS, signed URLs TTL ≤ 60 s, S3-compatible exit path |
| Auth | Supabase Auth | Clerk | — | Same provider as DB + Storage, RLS integration (`auth.uid()`), no custom auth endpoints (D10), OIDC exit path |
| **Document viewer** | **pdf.js (Mozilla)** | Native `<embed>`/iframe, commercial viewers (PDFTron/Apryse) | v2.0 | Full render control for the dynamic watermark (W1) and L3 view-only gate (P5); CSP-sandboxable; free, no vendor touches client files |
| **Malware scan approach** | **file-type + custom magic-bytes/PDF structure validation in-function; ClamAV container as fast-follow** | ClamAV now; third-party scanning APIs | v2.0 | Vercel-only constraint (D2); third-party scan APIs forbidden for client files (D11); quarantine-until-scanned MVP gate, ClamAV = sole documented non-Vercel infra piece |
| Deployment | Vercel (locked, D2) | Railway, Render | — | Best Next.js support, free preview deployments; sole exception documented: ClamAV fast-follow container |
| Styling | Tailwind v4 + shadcn/ui | Mantine, Chakra | — | Owned component source, no CSS-in-JS runtime |
| Testing | Vitest + RTL + Playwright | Jest + Cypress | — | Vite-native speed, cross-browser E2E; hosts the release-blocking RLS suite + 3×3 clearance matrix |
| **Link-shortener scope (v1)** | **— REMOVED in v2.0** | — | v2.0 | Core idea changed to secure document exchange/case files: short codes, TTL link expiration math, redirect-hot-path rationale, and click/referrer product analytics removed (v1's expiring-link machinery may be repurposed for the P4 fast-follow share-links feature only) |

---

*End of document. Normative sources: `DECISIONS.md` and `DOMAIN_MODEL.md` — if this file contradicts them, regenerate this file, not the contract.*
