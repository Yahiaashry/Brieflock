# BriefLock — Context for Claude

Prepared from the local working tree on 2026-11-17. Give this file to Claude together with repository access (or the relevant source files). It is a handoff snapshot, not a replacement specification.

## Start here

You are helping develop **BriefLock**, a secure document exchange and case-file management app for law firms. Continue from the existing implementation. Do not scaffold a new app.

Read `CONTRACT.md` first: it is the single normative product and security contract. When implementation differs, describe the discrepancy and implement the contract within the user's requested scope. `docs/` contains frozen v2 reference material; it does not override the contract. Some contract section references are stale, so use section headings when navigating.

The README's “Pre-implementation” and “Scaffold pending” statements are stale: the repository already contains pages, components, API handlers, Supabase migrations, a PDF viewer, and unit tests. Presence of implementation does not establish production readiness.

No specific next feature or fix was selected as part of preparing this handoff. Follow the user's next request; do not infer an authorized deployment or database migration from this file.

## Product and non-negotiable rules

- Firms are tenants. Cases contain PDFs, case membership, default security levels, retention settings, and legal hold settings.
- Each user has exactly one clearance level: L1, L2, or L3. Access requires an **exact match** with the document level. L3 does not grant access to L1 or L2.
- Content access requires an active user, owning-firm membership or an accepted transfer grant, case membership, matching clearance, and a clean scan.
- Roles are `firm_admin`, `lawyer`, and `paralegal`. Firm admins can inspect firm metadata and audit history but have no content-access bypass. Lawyer/paralegal labels do not change content gates.
- Cross-firm sharing uses one-way, acceptance-gated transfers. Acceptance creates external case membership; revocation removes future grants. Draft transfers must remain private to the sending side.
- Documents are immutable. Replacement means a new upload. Only the uploader may raise a document's level; lowering requires a firm admin and a reason.
- Archived cases reject mutations; authorized viewing and downloading continue.
- PDFs are limited to 100 MiB (`104857600` bytes). Upload through a signed direct-to-private-Storage URL, then call completion for size/PDF validation, hash calculation, and scanning. Do not route upload bytes through a Next.js API handler.
- Non-clean documents remain quarantined. MVP scanning is PDF structure/magic-byte and embedded-JavaScript heuristics; ClamAV is a future addition, not an existing antivirus guarantee.
- Content endpoints return signed-URL JSON, not document bytes. Read URLs have a hard maximum TTL of 60 seconds. Await the audit insert before minting the URL.
- Audit events are append-only and hash-chained by a database trigger with serialized inserts. TypeScript inserts event fields; it must not become a second hash-chain implementation.
- Audit real access denials. Unknown or unrelated cross-firm IDs get a uniform 404 without an audit row. Use generic denial responses except the specific L3 download gate.
- Private Storage only. Service-role credentials stay server-side. Raw IPs must never be persisted; use salted SHA-256 hashes and Vercel geo headers.
- L2/L3 views require viewer-name and UTC-time watermarks; L1 watermarking is configurable. Per-case L3 view-only settings must also be enforced server-side.
- Retention must respect legal holds. Search must filter access in the query without leaking inaccessible titles, counts, or existence.
- Contract release gates include cross-firm RLS probes, a 3-by-3 clearance E2E matrix, and audit-chain verification plus tamper detection. Existing unit tests alone do not satisfy these gates.

MVP excludes anonymous share links, hierarchical clearance, SSO, e-signatures, editing/versioning, OCR, folders/tags, calendars, billing automation, mobile apps, and chat/comments. Deployment target is Vercel with Supabase; consult the contract before adding infrastructure.

## Current stack and commands

Current `package.json` declares Node.js >=24 (also `.nvmrc`), Next.js 16.4.3 App Router, React/React DOM 19.3.1, strict TypeScript, Tailwind CSS v4, Radix UI, Lucide icons, Supabase JS/SSR, Zod, ESLint 9 flat config, and Vitest 3. Use `package-lock.json` for resolved versions.

The app uses root `app/`, not `src/app/`. The `@/` alias resolves to the repository root. Next.js interception/session refresh is in `proxy.ts`; `middleware.ts` is currently deleted in the working tree. Styling uses existing UI primitives under `components/ui/`.

```sh
npm ci
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```

`dev` uses `next dev --disable-source-maps`; `dev:debug` uses ordinary `next dev`. `start` serves a production build. Database scripts pin the Supabase CLI to 2.6.8:

```sh
npm run db:push
npm run db:migrate
npm run db:types
```

Inspect database target and script behavior before using these commands. `db:types` currently redirects output to `lib/types/database.ts`, while the existing application domain types are in `lib/types.ts`; check/create the destination directory as appropriate.

## Setup and environment

Use `.env.example` as the inventory and put actual local values in an untracked local environment file. Never include real credentials in a handoff or commit.

`lib/env.ts` currently validates:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server only)
- `IP_HASH_SALT` (minimum 16 characters)
- `CRON_SECRET` (minimum 16 characters)
- `SIGNED_URL_TTL_SECONDS` (integer 1–60, default 60)

The template also lists `NEXT_PUBLIC_APP_URL`, `SUPABASE_JWT_SECRET`, `RESEND_API_KEY`, optional `SENTRY_DSN`/`LOGTAIL_TOKEN`, and a demo-mode flag. Inventory entries are not proof the corresponding integration is wired up. Inspect actual call sites.

Local login can prefill seed/demo credentials; it still uses Supabase authentication. Do not assume a mock cookie bypasses current app authentication. Seed data is in `supabase/seed.sql`; old mock helpers remain under `lib/mock/`.

## Code map

- `app/(auth)/`: login, signup, invite acceptance, and auth server actions.
- `app/firm-setup/`: authenticated firm onboarding.
- `app/(app)/`: authenticated shell and cases, document viewer, transfers, members, audit, settings, and search pages. Feature actions live alongside their routes.
- `app/api/v1/`: route handlers for health, dashboard, firms/members/invites, cases/membership, document metadata/upload/completion/content/levels, transfers/actions, search, audit/export, and jobs.
- `lib/auth/server.ts`: request-cached SSR user/profile/token lookup and page guards.
- `lib/auth/index.ts`: Bearer-token API authentication and active-profile/admin guards.
- `lib/api/server.ts`: server-side HTTP calls to `/api/v1`, Bearer forwarding, structured client errors, and request-scoped GET deduplication via React `cache`.
- `lib/access/index.ts`: pure `evaluateAccess`, document access resolution, and watermark policy. `lib/access/cases.ts` and `transfers.ts` handle related visibility/grants.
- `lib/audit/index.ts`: synchronous event writer and database verification RPC caller.
- `lib/storage/`: object paths, private Storage operations, and signed URLs.
- `lib/scan/`, `lib/ratelimit/`, `lib/geo/`, `lib/errors/`, `lib/jobs/auth.ts`: scan heuristics, per-instance token buckets, IP privacy/geo, API envelopes, and cron-secret guards.
- `lib/types.ts`: application domain types; `lib/serializers/`: response shaping.
- `components/cases/`, `transfers/`, `members/`, `audit/`, `settings/`, `auth/`: feature UI.
- `components/viewer/document-viewer.tsx`: parent fetches authorized PDF bytes and sends an ArrayBuffer through `postMessage` into a sandboxed iframe. The iframe permits scripts only; messages are checked against its window.
- `public/viewer/`: self-hosted `viewer.html`, `pdf.mjs`, and `pdf.worker.mjs`. Preserve the iframe handshake and CSP assumptions when changing these files.
- `next.config.js`: security headers and separate static-viewer CSP. `proxy.ts`: Supabase cookie refresh, page redirects, and nonce-based app CSP. API routes are excluded from its matcher and enforce their own auth.
- `supabase/migrations/`: schema/RLS, functions/triggers, cron, purge support, and draft-transfer privacy migration.
- `.github/workflows/ci.yml`: Node 24, `npm ci`, lint, typecheck, tests. Dedicated RLS/E2E/chain jobs remain comments.

Important implementation detail: API `authenticate()` currently returns a **service-role** Supabase client after verifying the caller's token. That client bypasses RLS. Explicit app authorization and tenant filters are therefore essential; do not assume those API queries automatically run under caller RLS. Test caller-role RLS separately.

## Observed gaps to verify when relevant

These are observations from a source review, not a complete audit or a request to fix everything:

1. The viewer currently receives an initial signed URL and fetches the PDF. The interval in `DocumentViewer` is an iframe-readiness ping, not periodic reauthorization. The contract's T-minus-10-second silent reauthorization loop is not present in the inspected component/page; URL expiration alone cannot retract bytes already loaded in memory.
2. `vercel.json` schedules `/api/v1/jobs/audit-verify` daily at 03:00 and `/api/v1/jobs/retention` daily at 04:00. These paths/cadences differ from the contract's named jobs and hourly retention purge. The retention handler exports POST only; verify compatibility with the scheduler before relying on it. Audit verification exports GET and POST.
3. Denial-alert and scheduled cold audit-export job routes are absent from the current route inventory. A user-facing audit export route does exist. Email/monitoring environment placeholders do not establish implemented delivery or alerting.
4. Tests found: `lib/access/index.test.ts`, `lib/ratelimit/index.test.ts`, `lib/scan/index.test.ts`, and `lib/utils.test.ts`. Vitest runs `**/*.test.ts` in a Node environment. Playwright and React Testing Library are mentioned in design docs but are not declared in the inspected package manifest.
5. Documentation describes SWR for polling, but SWR is not declared in the current manifest. Preserve actual server-component/server-action patterns unless the task calls for a change.
6. An untracked `BriefLock Final v2 (1).docx` is present. Its contents were not reviewed for this handoff; do not assume it overrides the contract.

## Existing local work — preserve it

The workspace had extensive uncommitted changes before this context file was created. Do not reset, discard, or overwrite them. Run `git status --short` and inspect relevant diffs before editing.

Observed work includes dependency/framework/configuration updates, migration from middleware to proxy, CSP/viewer adjustments, safer login redirects, request-cached auth/API reads, and changes to cases, document levels, and transfer handlers/UI. These are working-tree observations, not a verified account of their completion or correctness.

Notable untracked files at handoff include `.nvmrc`, `eslint.config.mjs`, `proxy.ts`, `lib/utils.test.ts`, `public/robots.txt`, and `supabase/migrations/20261026000100_transfer_draft_privacy.sql`. The migration replaces `can_see_transfer()` to hide draft transfers from recipient-side direct RLS reads. Its presence does not prove it has been applied to any database.

The only file added for this handoff is `CLAUDE_CONTEXT.md`. No application files were changed, no tests/build were run, and no deployment or database operation was performed while preparing it. Runtime behavior, deployed configuration, migration application, and test status remain unverified in this handoff.

## Working approach

Read the relevant source and contract sections, preserve existing work, make focused changes, and run checks appropriate to the change. For application logic, use lint/typecheck and relevant tests; verify viewer/auth/UI behavior in the browser when touched. Report what changed, what was verified, and any remaining limitation. Never describe release gates as passed without running them.
