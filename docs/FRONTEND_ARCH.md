# BriefLock — Frontend Architecture

**Version 2.0 — Regenerated for the legal document exchange core idea**

| Field | Value |
|---|---|
| **Status** | Draft for implementation |
| **Supersedes** | Frontend Architecture v0.1 (v1 product: link dashboard, click analytics charts, QR panel) — archived in `docs-v1-archive/` |
| **Contract** | `DECISIONS.md` (🔒) + `DOMAIN_MODEL.md` (🔒) govern. Screens = `UI_UX_DESIGN.md` §2–§3. API = `API_SPEC.md`. |
| **Stack** | Next.js 16 App Router · TypeScript · Tailwind CSS · shadcn/ui · SWR (polling/revalidation) · React Hook Form + Zod · Supabase Auth JS (D10) · Vercel (D2) |
| **Golden rules** | The browser **never decides access** — the frontend renders only what `/api/v1` returns and treats every denial identically; **no third-party scripts** beyond Sentry/LogTail beacons (D8: no analytics vendors); document bytes never touch the main document context except via the sandboxed viewer |

---

## 1. Directory Structure

```
src/
  app/
    (auth)/                    # the ONLY anonymous surface (P4)
      login/page.tsx
      signup/page.tsx
      invite/accept/page.tsx
    (app)/                     # session-required shell (sidebar + topbar)
      layout.tsx               # Server Component: session guard + nav
      cases/page.tsx                    # dashboard (UI_UX §3.3)
      cases/[caseId]/page.tsx           # case detail + documents + members + transfers
      cases/[caseId]/documents/[documentId]/page.tsx   # viewer host → iframe
      transfers/page.tsx                # outgoing/incoming
      members/page.tsx                  # firm admin
      audit/page.tsx                    # firm admin
      settings/page.tsx                 # firm admin
      search/page.tsx
    api/…                      # none — the API is the only backend surface (API_SPEC)
  components/                  # shadcn/ui + app components (UI_UX §4)
    level-badge, scan-chip, status-chip, access-denied-interstitial,
    watermark-overlay, upload-modal, transfer-wizard, confirm-dialog, empty-state
  lib/
    api-client.ts              # typed fetch wrapper for /api/v1 (error envelope aware)
    auth-client.ts             # Supabase browser client (session only)
    types.ts                   # shared DTO types mirroring API_SPEC schemas
    format.ts                  # bytes, dates (UTC), hash truncation
  hooks/
    use-scan-status.ts         # polls document row until terminal
    use-signed-url.ts          # TTL-aware URL lifecycle (§4)
```

Two-surface rule (P4): everything outside `(auth)` renders inside `(app)/layout.tsx`, which redirects to `/login` without a session. There is no public share-link route, no QR page, no anonymous anything else.

## 2. Rendering & Data Flow

| Concern | Decision |
|---|---|
| Default | **Server Components** for all reads: lists, detail pages, audit — they call `/api/v1` server-side with the forwarded session cookie and render rows; nothing client-side re-derives visibility |
| Interactivity | Client Components only where state lives: upload modal, transfer wizard, member/case forms, viewer controls, audit filters |
| Data fetching | `lib/api-client.ts` — single wrapper: injects JWT, unwraps the error envelope, maps `code` → typed errors; **no direct Postgres/Storage client reads** (the anon Supabase key is used for Auth only) |
| Polling | SWR with 2 s interval for scan status (§3.6) and 30 s revalidation on lists; manual refetch on mutations |
| Pagination | Cursor-based (`page.next_cursor`, API_SPEC §1.5); server Components render first page, client `loadMore` fetches subsequent cursors |
| Search | Debounced (300 ms) client fetch on `(app)/search`; results are server-filtered already — the client renders them verbatim and adds nothing (no client-side filtering, ever) |
| Forms | RHF + Zod schemas in `lib/types.ts` mirrored from the API contract; field errors from `400 details` mapped back onto inputs |
| Mutations | Every mutation goes through `api-client` → typed result; audit-relevant actions open a `ConfirmDialog` whose copy names the consequence (UI_UX §9) |

**Visibility invariant**: the client renders only server-returned rows — it never hides, filters, or annotates based on clearance (the diagonal rule was applied in the query). A stale cache after a clearance change is handled by revalidation-on-focus + mandatory `router.refresh()` after every member/clearance mutation.

## 3. State Management

| Layer | Tool | Notes |
|---|---|---|
| Session | `auth-client.ts` — Supabase browser client + `onAuthStateChange` → small React context (`SessionProvider`) in `(app)/layout.tsx` | Holds user id/email **only**; role/clearance always come from server-rendered data |
| Server data | SWR keyed by route + query string; `revalidateOnFocus`, `refreshInterval` only where specified (§2) | No Redux/Zustand — no cross-page client state exists |
| Forms | RHF + Zod per form component; schema reuse from `lib/types.ts` | Submit → `api-client` → inline field errors (`400 details`) or `ConfirmDialog` for audited actions |
| Uploads | `UploadModal` local state machine: `select → uploading → scanning → done/failed`; progress via XHR upload progress to the signed PUT URL | Bytes go straight to the bucket; on `complete` the modal triggers list revalidation |
| Viewer | `use-signed-url` hook: fetch → countdown to `expires_at` → refetch at T-10 s → swap URL into iframe src without remount (scroll preserved) | Failure at any point → `AccessDeniedInterstitial` |

## 4. Document Viewer (pdf.js — sandboxed, watermarked; W1)

```
(app)/cases/[caseId]/documents/[documentId]/page.tsx   (Server Component)
  └─ fetches content metadata via /api/v1 …/content?disposition=view
  └─ renders <ViewerFrame src={signed_url} watermark={…} />
       ViewerFrame (client):
         <iframe sandbox="allow-scripts" csp="…">   ← pdf.js bundle served same-origin from /viewer/
           pdf.js renders to canvas; no navigation, no popups, no downloads
         <WatermarkOverlay name timestamp />          ← canvas, pointer-events-none (UI_UX §6)
```

| Rule | Detail |
|---|---|
| Isolation | The viewer runs in a **CSP-locked sandboxed iframe** with `allow-scripts` only — no same-origin DOM access to the app, no `allow-downloads`, no `allow-popups` (SECURITY viewer controls) |
| pdf.js | Version-pinned, served self-hosted from `/viewer/` (no CDN); worker from the same origin; legacy build off |
| Signed URLs | Live ≤ 60 s; the hook refetches at T-10 s; the URL exists **only in memory** (never in `sessionStorage`, logs, or error reports — Sentry `beforeSend` scrubs it) |
| Download | Button (when allowed) requests `disposition=download` and triggers a programmatic anchor click on the fresh URL; for L3 view-only cases the control is not rendered (server still enforces `DOWNLOAD_BLOCKED_L3`) |
| Failure | Expired/forbidden refresh → uniform interstitial; a `404` mid-session (document purged) → same interstitial |

## 5. Auth Integration (D10)

- `(auth)` pages use the Supabase Auth JS flows directly (password, magic link); no custom endpoints exist and none are stubbed.
- `(app)/layout.tsx` (Server Component) reads the session server-side; unauthenticated → `redirect(/login?next=…)`; `next` is path-only (validated `startsWith('/')`) to avoid open redirects.
- After login: `GET /api/v1/firms/current`; 404 → firm-creation screen (UI_UX §3.2b); invite-accept flow: Supabase signup on the anonymous page → `POST /invites/accept` → dashboard.
- Sign-out clears the session and hard-navigates to `(auth)`; server components re-render on next request (no cached `(app)` shell survives logout — `dynamic = 'force-dynamic'` on the shell).

## 6. Component Conventions

- **shadcn/ui primitives only** for controls (dialog, dropdown, table, toast) — consistent a11y (UI_UX §7) for free; app-specific components from UI_UX §4 live in `components/` and are the only allowed wrappers.
- `LevelBadge` / `ScanChip` / `StatusChip` are the single source of those visuals; no ad-hoc colored spans.
- `AccessDeniedInterstitial` handles every denial: props are only `{code}` — the component owns all copy (UI_UX §3.15), so denial text cannot drift per-screen.
- Every `ConfirmDialog` usage must name the audited consequence in its body copy (matches TESTING copy-freeze checks).
- Tables: server-rendered shell + client `loadMore`; sticky first column on narrow screens; no client-side sort/filter of security-relevant lists (server does it).

## 7. Security on the Client

| Rule | Detail |
|---|---|
| CSP | Strict default-src 'self'; script-src 'self' (+ Sentry beacon origin); frame-src 'self' (viewer only); no inline scripts except nonce'd bootstraps; `frame-ancestors 'none'` on the app, viewer frame allows only the app (FRONTEND/SECURITY alignment) |
| Keys | Only the **anon** Supabase key reaches the browser; service role, `IP_SALT`, `ACCESS_TOKEN_HMAC` are server-only (CI greps the bundle — TESTING §6) |
| Analytics | **None.** No third-party analytics/tag managers; Vercel web analytics disabled in favor of server-side SLO metrics (D8); the only third-party beacons are Sentry/LogTail |
| Signed URLs | Held in component memory only; scrubbed from Sentry events; never persisted anywhere (§4) |
| No access logic | No clearance/matrix code exists client-side; anything that looks like a permission check in the client is a code-review blocker (§2 invariant) |
| Dependencies | Minimal, version-pinned, Dependabot-monitored; no runtime CSS/JS from CDNs |

## 8. Loading / Empty / Error Standards

- Every list: skeleton rows → purposeful empty state (with its primary action) → inline error banner + retry (UI_UX §3.16).
- Mutations: optimistic **only for safe UI state** (e.g. toggle revalidation) — never for access-relevant actions; audited actions wait for the server response.
- Global error boundary: `500 INTERNAL` renders a calm error screen with the `request_id` (from the envelope) shown for support, plus retry — never a stack trace.
- Toasts: success confirmations for audited actions include the audit hint ("Level changed — logged in the audit trail").

## 9. Performance (S1 budgets)

| Budget | Target | Technique |
|---|---|---|
| Dashboard initial load | p95 < 2 s | Server Components (no client data waterfall), route prefetch on hover, first page only (50 rows), no web fonts blocking (subset + `font-display: swap`), zero third-party scripts (D8) |
| Signed-URL consumption | TTI of viewer < 1 s after URL fetch | pdf.js lazy chunk, worker kept warm after first open, iframe pre-warmed on case page hover |
| Interactivity | < 100 ms for tab switches | Client Components only for interactive leaves; lists server-rendered |
| JS budget | ≤ 200 KB gzip on `(app)` shell | shadcn tree-shaking, no moment/lodash-class utilities, `format.ts` hand-rolled |

Core Web Vitals monitored via server-side VercelSpeed insights + a CI Lighthouse gate on the `(auth)` pages (LCP < 2.5 s).

## 10. Frontend Test Hooks (for TESTING_STRATEGY)

- **Component tests (Vitest + RTL)**: `LevelBadge`/`ScanChip` states; `AccessDeniedInterstitial` renders identical DOM for all A1–A5 codes and the two carve-out codes verbatim; upload modal state machine incl. infected path; `use-signed-url` T-10 s refetch (fake timers).
- **Page objects (Playwright)**: `LoginPO`, `CaseListPO`, `CaseDetailPO`, `ViewerPO` (asserts watermark canvas exists + iframe sandbox attrs), `TransferWizardPO`, `MembersPO`, `AuditPO` — shared with the E2E suites (TESTING §5) so copy-freeze checks (UI_UX §10.6) run against one definition.
- **Contract stubs**: MSW handlers mirror `API_SPEC` examples so Storybook/stories and component tests run without a backend; MSW responses assert the client never filters or re-orders server rows (§2 invariant).

## Changelog

| Version | Change |
|---|---|
| 2.0 | Regenerated for the legal document exchange core idea: two-surface route groups per P4, server-rendered visibility (client never decides access), sandboxed CSP-locked pdf.js viewer with dynamic watermark (W1), signed-URL lifecycle hook, uniform denial interstitial, no-analytics posture (D8). Removed link dashboard/analytics frontend. |
| 0.1 | Initial draft (v1 product — retired). |
