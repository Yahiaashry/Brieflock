# BriefLock

Secure document exchange and case-file management platform for law firms.

> **Product contract:** [`CONTRACT.md`](CONTRACT.md) governs access and workflow behavior. The Figma Design Page supplies the visual system.

---

## What it is

- Firms (tenants) create legal **cases** and upload case PDFs tagged **L1 / L2 / L3** security levels.
- Every lawyer holds exactly **one clearance level**; document content opens only on an **exact clearance match** — compartments, not a hierarchy (the 3×3 matrix: only the diagonal opens).
- Cross-firm sharing happens **only** via audited, **acceptance-gated transfers**; the owning firm can revoke future access.
- Every access, every denial, and every administrative change is written to an **immutable, hash-chained audit log**; signed URLs (TTL ≤ 60 s) are issued only **after** the audit row commits.
- Viewing happens in a CSP-locked, sandboxed pdf.js viewer with a dynamic watermark (viewer name + UTC timestamp).

## Repository map

| Path | Purpose |
|---|---|
| `CONTRACT.md` | The single normative contract — decisions, domain model, access rule, jobs, env inventory |
| `docs/` | Frozen v2 reference documents (PRD, architecture, API spec, security, etc.) |
| `supabase/` | Migrations: schema, RLS suite, functions/triggers, pg_cron jobs |
| `.env.example` | Full environment-variable inventory |
| `.github/workflows/ci.yml` | Lint, types, Vitest, production build, database policy tests, and browser journeys |

## Stack

TypeScript · Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · shadcn/ui + Radix UI · Supabase (Postgres + RLS + Auth + private Storage) · pdf.js viewer · Vitest + React Testing Library + Playwright · Cloudflare Workers.

## Quickstart

Requires **Node.js 24 LTS** (`nvm use` picks it up from `.nvmrc`).

1. Start Docker and install a Supabase CLI from the v2 stable line. Run `npm ci`, then `supabase start` from this repository. The CLI applies migrations and loads the local seed.
2. Copy `.env.example` to `.env.local`. Use the local API URL, anonymous key, and service-role key from `supabase status`. Set the app URL to `http://127.0.0.1:3000` and generate separate random values for `IP_HASH_SALT` and `CRON_SECRET`.
3. Run `npm run dev` and open `http://127.0.0.1:3000`. The local seed signs in with `marcus@hartwellroe.test` and `BriefLock!23`. The seed is for disposable environments.
4. Upload [the sample PDF](public/sample/brieflock-sample.pdf) to verify storage and the viewer. The seed creates metadata rows for example documents. A fresh upload exercises the actual file path.

### Verification

- `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
- `supabase test db` checks tenant boundaries, transaction rollback, audit coverage, and legal holds.
- With the local environment exported and the app running, run `node --test scripts/workspace.integration.mjs` for the clearance matrix and transfer flow.
- Run `npx playwright install chromium`, then `npx playwright test` for browser sign-in, case navigation, upload, and the viewer. The integration suites use synthetic records and require a local, disposable instance.

### Burp security workspace

Run `npm run security:fixtures` against local Supabase and a running local app to
create two synthetic firms, ten test accounts, cases, PDF uploads, and transfers
in every workflow state. Run `npm run security:verify` for live authorization
checks. Generated account details, record IDs and raw Burp request templates are
in the ignored `security-fixtures/` directory. Follow
[`docs/BURP_SECURITY_TESTING.md`](docs/BURP_SECURITY_TESTING.md) for the walkthrough.

Audit review/export is restricted to the dedicated **Security personnel** role.
Firm administrators invite members and assign roles but do not inherit audit
access. Apply migrations through `20261121000800` before using this version.

For hosted environments, apply the migrations before starting the updated app. Add the app’s `/auth/callback` URL to the Supabase Auth redirect allowlist. Configure custom SMTP in Supabase Auth for sign-in links and account confirmations. For application invitations and notifications, set `BRIEFLOCK_EMAIL_FROM` and either `RESEND_API_KEY` or the `BRIEFLOCK_SMTP_*` variables shown in `.env.example`. The initiating administrator can copy a firm invitation link if email is unavailable. Scheduled endpoints use `CRON_SECRET`. Review cadence, failures, and timings in an isolated deployment before onboarding firms.

The daily audit archive writes numbered NDJSON files to the private `brieflock-audit-archive` bucket. Retries resume from the last confirmed batch. A run can archive up to 10,000 events and reports `batch_limit_reached` when it uses the entire allowance. The bucket belongs to the same Supabase project.

### Cloudflare Workers

Use the existing Supabase project for Postgres, Auth, and private Storage. Set `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_MAX_UPLOAD_MB` for the build. Run `npm run build:cloudflare`, then deploy with `npx wrangler deploy --keep-vars`. Set the app and Supabase public URLs as Worker variables. Configure the service-role key, IP hash salt, and cron secret as Worker secrets. Add the Worker’s `/auth/callback` URL to Supabase Auth. The legacy Vercel project uses `vercel.json` to redirect old links.

The scoped `cookie` override keeps the OpenNext request converter compatible with the Worker bundle’s default import.

The Worker configuration uses static assets, a self-binding for internal API calls, and one cron trigger that dispatches four daily jobs. The Cloudflare audit job archives up to 3,000 events per run, and the retention job processes up to 10 candidates per run. Review cron results and representative PDF uploads against the Workers Free runtime limits before relying on the deployment.

## License


