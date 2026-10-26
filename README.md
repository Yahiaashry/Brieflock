# BriefLock

Secure document exchange and case-file management platform for law firms.

> **Status:** Pre-implementation — documentation consolidated, ready to scaffold.
> **Normative source:** [`CONTRACT.md`](CONTRACT.md) — locked decisions, domain model, access rule, and mechanics. It wins over every other document. No other file is maintained as a spec.

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
| `.github/workflows/ci.yml` | CI: lint · typecheck · tests |

## Stack

TypeScript · Next.js 15 (App Router) · React 19 · Tailwind CSS v4 · shadcn/ui + Radix UI · Supabase (Postgres + RLS + Auth + private Storage) · pdf.js viewer · Vitest + React Testing Library + Playwright · Vercel.

## Quickstart

Scaffold pending — builds in the order defined by the “Solo build sequence” in [`CONTRACT.md`](CONTRACT.md):

1. Supabase project + migrations (schema → RLS → functions → cron)
2. Next.js scaffold + auth/invite + cases
3. Upload pipeline + access engine + audit chain
4. Watermarked viewer + transfers
5. Governance (admin, search, denial alerts, retention) + hardening

## License

TBD
