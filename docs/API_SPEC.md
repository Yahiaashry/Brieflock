# BriefLock — REST API Specification

**Version 2.0 — Regenerated for the legal document exchange core idea**

| Field | Value |
|---|---|
| **Status** | Draft for implementation |
| **Supersedes** | API Spec v1.0 (self-destructing short-link API: `/links`, click tracking, public redirects) — archived in `docs-v1-archive/` |
| **Contract** | `DECISIONS.md` (🔒) and `DOMAIN_MODEL.md` (🔒) govern. Conflicts resolve in their favor. Naming per **N1**: `document`, `security_level` (documents), `clearance_level` (users), `transfer`, `audit_event`. |
| **Base URL** | `https://app.example.com/api/v1` — domain is **TBD** (D2); placeholders only, never an invented brand domain |
| **Format** | JSON (`application/json`) except `GET /audit/export` (NDJSON) |
| **Auth** | JWT Bearer issued by **Supabase Auth** (D10). **No custom auth endpoints exist** — there is no `/api/v1/auth/*`. |
| **Identifiers** | UUIDs in all paths (N1) — no guessable sequential IDs |

---

## 1. Conventions

### 1.1 Authentication

- Every route requires `Authorization: Bearer <supabase_jwt>` **except** `GET /api/v1/health` (the sole unauthenticated route, status only) and `POST /api/v1/invites/accept` (invite-token page; see §4.5).
- The JWT establishes **identity only**. `role`, `clearance_level`, and `is_active` are re-read from the database on every request — never trusted from token claims.
- Anonymous pages in the product are exactly three (P4): login, signup, invite-accept — all handled by Supabase Auth in the browser; only §4.5 touches this API.

### 1.2 Error envelope (uniform)

Every non-2xx response:

```json
{ "error": { "code": "ACCESS_DENIED", "message": "Request denied.", "request_id": "uuid" } }
```

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Malformed body / query; field errors in `details` |
| 401 | `UNAUTHENTICATED` | Missing/expired/invalid JWT |
| 403 | `ACCESS_DENIED` | **All content-access denials (A1–A5)** — generic, see §1.3 |
| 403 | `DOWNLOAD_BLOCKED_L3` | Sole distinct denial: L3 download on a view-only case (caller can already see the document) |
| 403 | `FORBIDDEN` | Authenticated but not permitted for this administrative action (e.g. non-admin calling an admin route) |
| 404 | `NOT_FOUND` | Unknown ID **or** any resource the caller must not learn exists (no existence oracle) |
| 409 | `CONFLICT` | Illegal state transition (e.g. transfer machine), duplicate unique key |
| 413 | `PAYLOAD_TOO_LARGE` | Upload metadata > limits (content itself never traverses the API, §6.1) |
| 429 | `RATE_LIMITED` | Rate class exceeded; always includes `Retry-After` (seconds) |
| 500 | `INTERNAL` | Unexpected failure (fail-closed; correlated in logs via `request_id`) |

### 1.3 Deny discipline (normative — DOMAIN_MODEL §3)

- Content-access failures of checks **A1–A5** return the **same generic** `403 ACCESS_DENIED` body for every reason: `UNAUTHENTICATED`, `DEACTIVATED`, `FIRM_MISMATCH`, `NOT_CASE_MEMBER`, `CLEARANCE_MISMATCH`, `UNSCANNED`, `INFECTED`. The response **never** reveals which check failed, whether the document exists, its filename, level, or case.
- The precise `deny_reason` (canonical enum, DOMAIN_MODEL §3.2) is persisted **only** in `audit_events` (`result='deny'`) and is visible to firm admins through the audit endpoints (§8).
- `DOWNLOAD_BLOCKED_L3` (§3.1 of DOMAIN_MODEL) is the one distinct code, because the caller can already see the document's metadata.
- Unknown IDs return `404`; off-scope IDs (wrong firm, wrong membership) also return `404` — never `403` — so probes learn nothing.

### 1.4 Rate limits (canonical — DECISIONS §3 / D7)

| Class | Limit | Key | Applies to |
|---|---|---|---|
| `auth` | 10/min | IP | `POST /invites/accept` (anonymous); Supabase Auth enforces its own login limits server-side and failures are audited as `auth.login_failed` |
| `upload` | 30/min | user | §6.1, §6.2 (upload-intent, complete) |
| `content` | 60/min | user | §6.5 (content issuance) |
| `standard` | 100/min | user | All other `/api/v1/*` |

On exceed: `429 RATE_LIMITED` + `Retry-After` header. Implementation is an in-memory per-instance token bucket behind a `RateLimiter` interface (D7) — not visible in the contract.

### 1.5 Pagination, filtering, timestamps

- Collection endpoints accept `?limit=` (default 50, max 100) and cursor pagination: response carries `"page": { "next_cursor": "uuid|null" }`.
- Timestamps are ISO 8601 UTC. All filters are exact-value or inclusive ranges as noted per endpoint.
- Multi-tenancy invariant (DOMAIN_MODEL §10): every list is filtered **in the query** by firm/case-membership/clearance predicates — counts and empty results never leak the existence of inaccessible rows.

### 1.6 Audit side effects

Every state-changing endpoint writes `audit_events` (enum of 23 actions, DOMAIN_MODEL §6 — closed set). The "Audit" column in the endpoint tables names the action(s) emitted. Content access **and every denial** are audited synchronously; the audit row for `document.viewed`/`document.downloaded` is committed **before** the signed URL is issued (A1).

---

## 2. Endpoint Map

| § | Method & path | Purpose | Auth | Class | Audit action(s) |
|---|---|---|---|---|---|
| 3.1 | `GET /health` | Liveness + DB probe | none | — | — |
| 4.1 | `POST /firms` | Create firm | JWT | std | `firm.updated` |
| 4.2 | `GET /firms/current` | Own firm + settings | JWT | std | — |
| 4.3 | `PATCH /firms/current` | Update firm settings | `firm_admin` | std | `firm.updated` |
| 4.4 | `GET /firms/members` · `GET /firms/members/{userId}` | List/show members | JWT | std | — |
| 4.5 | `PATCH /firms/members/{userId}` | Role / clearance / active | `firm_admin` | std | `member.role_changed` · `clearance.changed` · `member.removed` |
| 4.6 | `POST /firms/invites` · `DELETE /firms/invites/{inviteId}` | Create / revoke invite | `firm_admin` | std | `firm.updated` |
| 4.7 | `POST /invites/accept` | Accept invite (token page) | invite token | auth | `member.added` |
| 5.1 | `POST /cases` · `GET /cases` | Create / list cases | JWT | std | `case.created` |
| 5.2 | `GET /cases/{caseId}` | Case detail | JWT | std | — |
| 5.3 | `PATCH /cases/{caseId}` | Update / close / archive / flags | JWT | std | `case.updated` · `case.closed` · `case.archived` |
| 5.4 | `POST /cases/{caseId}/members` · `PATCH|DELETE /cases/{caseId}/members/{userId}` | Manage case members | JWT | std | `member.added` · `member.role_changed` · `member.removed` |
| 6.1 | `POST /cases/{caseId}/documents/upload-intent` | Start upload (returns one-time storage URL) | JWT | upload | — |
| 6.2 | `POST /documents/{documentId}/complete` | Finalize: validate, hash, scan | JWT | upload | `document.uploaded` · `document.scan_failed` |
| 6.3 | `GET /cases/{caseId}/documents` | List documents (filtered) | JWT | std | — |
| 6.4 | `GET /documents/{documentId}` | Document metadata | JWT | std | — |
| 6.5 | `GET /documents/{documentId}/content` | Signed-URL issuance (view/download) | JWT | content | `document.viewed` · `document.downloaded` · `document.access_denied` |
| 6.6 | `PATCH /documents/{documentId}/level` | Raise / lower security level | JWT | std | `document.level_raised` · `document.level_lowered` |
| 7.1 | `POST /transfers` · `GET /transfers` | Create draft / list | JWT | std | `transfer.created` |
| 7.2 | `GET /transfers/{transferId}` · `PATCH /transfers/{transferId}` | Detail / edit draft | JWT | std | — |
| 7.3 | `POST /transfers/{transferId}/{send,accept,reject,cancel,revoke}` | State transitions | JWT | std | `transfer.sent` · `transfer.accepted` · `transfer.rejected` · `transfer.cancelled` · `transfer.revoked` |
| 8.1 | `GET /audit` | Query firm audit trail | `firm_admin` | std | — |
| 8.2 | `GET /audit/export` | NDJSON export | `firm_admin` | std | `firm.updated` (details.type=`audit_export`) |
| 9.1 | `GET /search` | Clearance-aware search | JWT | std | — |

Out-of-band (not part of `/api/v1`, not for clients): `GET /api/cron/{scan-sweep,retention,denial-alerts,audit-verify}` — `pg_cron`/scheduler targets authenticated by `Authorization: Bearer $CRON_SECRET` (D6).

---

## 3. Health & Authentication Surface

### 3.1 `GET /health`

Public liveness + DB probe (N1). **No user data** in the response; used by the uptime synthetic (S1).

`200 OK`

```json
{ "status": "ok", "db": "ok", "time": "2026-10-16T18:00:00Z" }
```

`503` with `"db": "unreachable"` when the probe fails.

### 3.2 Authentication (handled by Supabase Auth — D10)

There are **no** auth endpoints in this API. The browser talks to Supabase Auth directly:

| Concern | Mechanism |
|---|---|
| Sign up / sign in (email+password), magic link | Supabase Auth JS client |
| Session refresh | Supabase Auth JS client |
| Failed logins | Audited by the platform as `auth.login_failed` (`actor_user_id = null`, `firm_id = null`) — visible to platform operators only |
| Auth rate limits | Enforced at Supabase Auth + edge (class `auth`, 10/min per IP) |

---

## 4. Firms, Members & Invites

### 4.1 `POST /firms`

Create the caller's firm. Called once after signup; the creating user becomes `firm_admin`.

**Request**

| Field | Type | Rules |
|---|---|---|
| `name` | string | 1–200 chars |
| `slug` | string | `^[a-z0-9-]{3,63}$`, globally unique (citext) |

`201 Created` → firm object (§4.2 response shape). `409` if `slug` taken.

### 4.2 `GET /firms/current`

`200 OK`

```json
{
  "id": "uuid", "name": "Hartwell & Roe LLP", "slug": "hartwell-roe",
  "settings": { "retention_days": 3650, "watermark_l1": false, "l3_view_only_default": false },
  "plan": "trial", "created_at": "…", "deactivated_at": null
}
```

### 4.3 `PATCH /firms/current` — `firm_admin` only

Partial update: `name`, `settings` (merged), `plan` (platform ops). → `200` firm object. Audit: `firm.updated` with `details.fields`.

### 4.4 `GET /firms/members` · `GET /firms/members/{userId}`

List/show profiles of the caller's firm. `firm_admin` sees all fields; others see `id, full_name, role` only (no clearance enumeration for non-admins).

```json
{ "id": "uuid", "email": "…", "full_name": "…", "role": "lawyer",
  "clearance_level": 2, "is_active": true, "created_at": "…" }
```

### 4.5 `POST /invites/accept`

**Anonymous surface** (one of the three P4 pages) — authorized by a single-use `invite_token` emailed to the new user, class `auth` (10/min per IP). The browser completes the Supabase Auth signup **first**; this endpoint then provisions the profile (it issues no credentials itself, so it is not an auth endpoint).

**Request**

| Field | Type | Rules |
|---|---|---|
| `invite_token` | string | Unused, unexpired invite token |
| `full_name` | string | 1–200 chars |

`201 Created` → profile object (role + `clearance_level` copied from the invite). Errors: `404` (unknown/used token), `409` (profile already exists), `429`.

### 4.6 `POST /firms/invites` · `DELETE /firms/invites/{inviteId}` — `firm_admin` only

**Create invite** — request: `email` (citext), `role` ∈ `firm_admin|lawyer|paralegal`, `clearance_level` ∈ 1|2|3. → `201 {invite}`; invitation email sent (transactional only, DOMAIN_MODEL §9). Audit: `firm.updated` (`details.type='invite_sent'`, recipient never in logs beyond email hash).

**Revoke invite** — `204`; token becomes unusable. Audit: `firm.updated` (`details.type='invite_revoked'`).

### 4.7 `PATCH /firms/members/{userId}` — `firm_admin` only

Partial update of a firm member. All changes audited; effective on the user's **next request** (authorization re-reads the DB every call).

**Request (any subset)**

| Field | Effect | Audit action |
|---|---|---|
| `role` ∈ `firm_admin\|lawyer\|paralegal` | Role change | `member.role_changed` (`details.scope='firm'`, before/after) |
| `clearance_level` ∈ 1\|2\|3 | New clearance compartment (exactly one per user, P6) | `clearance.changed` (before/after) |
| `is_active: false` | Deactivation; user fails A1 with `DEACTIVATED` | `member.removed` (`details.reason='deactivated'`) |
| `is_active: true` | Reactivation | `member.added` (`details.reason='reactivated'`) |

`200` → updated profile. Self-demotion guard: an admin cannot deactivate or demote themselves out of the last active admin seat → `409`.

---

## 5. Cases & Case Members

### 5.1 `POST /cases` · `GET /cases`

**Create case** — request: `title` (1–300), `case_reference` (firm-local human ref, unique per firm), `default_security_level` ∈ 1|2|3, `retention_days?` (int, null = firm default). The creator is inserted as case member with role `lead`. → `201` case object. Audit: `case.created`.

**List cases** — `?scope=mine` (default: cases where the caller is a member) | `scope=firm` (`firm_admin` only: all firm cases as **metadata**, P7) · `?status=open|closed|archived` · `?q=` (title / case_reference substring). In-query filtering (DOMAIN_MODEL §10) — no existence leaks via counts or empties.

```json
{ "id": "uuid", "firm_id": "uuid", "title": "State v. Dolan", "case_reference": "2026-CR-0114",
  "default_security_level": 2, "status": "open", "allow_l3_download": true,
  "legal_hold": false, "retention_days": null, "created_by": "uuid", "created_at": "…", "closed_at": null }
```

### 5.2 `GET /cases/{caseId}`

Case detail + `members[]` (`user_id`, `full_name`, `member_role`) and `document_count` — the count of documents **visible to the caller** under the access rule, computed in-query. `404` unless the caller is a member or (admin) via P7.

### 5.3 `PATCH /cases/{caseId}`

Partial update. Field permissions: `title`, `case_reference`, `default_security_level` (affects **future uploads only**, never existing documents), `status`, `retention_days` → `firm_admin` or case `lead`; `allow_l3_download` (P5), `legal_hold`, archive/close → `firm_admin` only.

| Change | Effect | Audit |
|---|---|---|
| `status: 'closed'` | Read-only matter; new uploads/transfers blocked as for archived? No — closed still allows member/uploads unless archived; `closed_at` set | `case.closed` |
| `status: 'archived'` | **New activity blocked** (uploads, level changes, member changes, new transfers → `403 CASE_ARCHIVED`); reading remains allowed | `case.archived` |
| `allow_l3_download: false` | L3 documents in this case become view-only (§6.5) | `case.updated` |
| `legal_hold: true` | Document excluded from retention sweeps | `case.updated` |

Lazy read-time checks are the real enforcer (D6) — the flag is consulted on every relevant request.

### 5.4 Case members

- `POST /cases/{caseId}/members` — `{user_id, role: 'lead'|'member'}`; own-firm **active** profiles only (`external` is reserved for transfers and cannot be set manually). Permitted to `firm_admin` or case `lead`. Audit: `member.added` (`details.scope='case'`).
- `PATCH /cases/{caseId}/members/{userId}` — `{role: 'lead'|'member'}`. Audit: `member.role_changed` (`details.scope='case'`).
- `DELETE /cases/{caseId}/members/{userId}` — remove own-firm membership. Audit: `member.removed` (`details.scope='case'`). Removing an `external` member is **not possible here** — external access is severed only by `transfer.revoke` (§7.3).

---

## 6. Documents

### 6.1 `POST /cases/{caseId}/documents/upload-intent` — class `upload`

**Step 1 of 2.** Files up to 100 MB never traverse the API (serverless body cap ≈ 4.5 MB): the client uploads bytes **directly to the private bucket** through a one-time signed URL; nothing is public (DOMAIN_MODEL §7).

**Request**

| Field | Type | Rules |
|---|---|---|
| `filename` | string | 1–255 chars, must end `.pdf` |
| `size_bytes` | int | ≤ 104857600 (100 MB) |
| `security_level` | 1\|2\|3 | optional; default = case `default_security_level`; may be **raised** at upload (P2), never lowered |
| `description` | string | optional, ≤ 2000 chars |

`201 Created`

```json
{
  "document": { "id": "uuid", "case_id": "uuid", "firm_id": "uuid",
    "filename": "intake-report.pdf", "storage_path": "{firm_id}/{case_id}/{document_id}/intake-report.pdf",
    "security_level": 2, "scan_status": "pending", "uploaded_by": "uuid", "uploaded_at": "…" },
  "upload": { "method": "PUT", "url": "https://<private-bucket-signed>/…",
    "headers": { "content-type": "application/pdf" }, "expires_in": 300 }
}
```

Errors: `400` validation · `404` (not a case member / wrong firm) · `403 CASE_ARCHIVED` (archived case, member caller) · `413` · `429`.

### 6.2 `POST /documents/{documentId}/complete` — class `upload`

**Step 2 of 2** — uploader only. The server streams the object from storage (service role), verifies `size_bytes` and **PDF magic bytes** (`%PDF-`), computes `sha256`, and runs the in-function structure scan (D11: magic bytes + embedded-JS heuristics, `scan_method='magic-bytes-mvp'`). No third-party scanner is ever contacted.

`200 OK` → document object with final `scan_status ∈ 'clean'|'infected'|'error'`.

- `clean` → accessible under the access rule. Audit: `document.uploaded` (`result='allow'`).
- `infected`/`error` → row kept, **quarantined** (access blocked while `scan_status != 'clean'`, A5). Audit: `document.uploaded` **and** `document.scan_failed` (`details.method='magic-bytes-mvp'`).
- Object missing / undersized / wrong bytes → `400 VALIDATION_ERROR`; the pending row remains for retry.

### 6.3 `GET /cases/{caseId}/documents`

Filtered **in the query** by the access-rule predicates (A2 firm-or-transfer scope, A3 membership, A4 exact clearance) — an L2 member never learns an L3 document exists (FR-18 discipline).

Query: `?level=1|2|3` · `?scan_status=` · `?q=` (filename/description) · `?superseded=false` (default) · `?scope=mine|firm` (`firm` = `firm_admin` metadata exception, P7) · sort `uploaded_at desc` · pagination.

```json
{ "data": [ { "id": "uuid", "filename": "…", "security_level": 2, "scan_status": "clean",
  "size_bytes": 48213, "sha256": "…64 hex…", "description": null, "superseded": false,
  "uploaded_by": "uuid", "uploaded_at": "…" } ], "page": { "next_cursor": null } }
```

### 6.4 `GET /documents/{documentId}`

Single metadata object (same shape as §6.3 items + `storage_path` omitted; `case_id` included). Same predicates → `404` otherwise. `firm_admin` may fetch metadata for **any** document of the firm (P7) — metadata only, never content.

### 6.5 `GET /documents/{documentId}/content?disposition=view|download` — class `content`

**The core endpoint.** Server-side sequence, in order:

1. Authenticate (A1) — invalid/expired JWT → `401`.
2. Load the access context (document, profile, case, membership, accepted-transfer grant) in **one** query.
3. Evaluate **A1–A6**; on failure → audit `document.access_denied` (`result='deny'`, canonical `deny_reason`) committed **synchronously**, then respond `403 ACCESS_DENIED` (generic — §1.3). Unknown ID → `404` (no audit row; rate limiting is the probe control).
4. If `disposition=download` and `security_level=3` and `case.allow_l3_download=false` → audit `document.access_denied` (`deny_reason='DOWNLOAD_BLOCKED_L3'`), respond `403 DOWNLOAD_BLOCKED_L3` (the one distinct denial; view remains allowed).
5. Otherwise commit `document.viewed` (view) or `document.downloaded` (download) — **synchronously, before any URL exists** (A1) — then issue a Storage signed URL, **TTL ≤ 60 s**.

`200 OK`

```json
{ "signed_url": "https://…", "expires_at": "2026-10-16T18:01:00Z", "ttl_seconds": 60,
  "disposition": "view", "document_id": "uuid",
  "watermark": { "required": true, "viewer_name": "Marcus Oyelaran", "issued_at": "2026-10-16T18:00:00Z" } }
```

`watermark.required = true` for L2/L3 (W1, mandatory) and for L1 when the firm setting enables it. Signed URLs are private, `Cache-Control: no-store`, never CDN-cached; expiry ~50 s triggers a silent re-authorization by the client.

### 6.6 `PATCH /documents/{documentId}/level`

Change a document's security level (P2). Content is immutable (V1) — this is metadata only.

| Rule | Detail |
|---|---|
| **Raise** (`target > current`) | Any own-firm **case member** (not `external`) |
| **Lower** (`target < current`) | `firm_admin` **only**, with mandatory `reason` (≤ 500 chars) |
| Request | `{ "security_level": 1\|2\|3, "reason?": "…" }` |
| Errors | `403 FORBIDDEN` (non-admin lowering / external member) · `400` (missing reason on lower) · `403 CASE_ARCHIVED` |
| Audit | `document.level_raised` / `document.level_lowered` (before/after; `reason` on lower) |

`200` → document object.

---

## 7. Transfers (cross-firm exchange — P3)

State machine (DOMAIN_MODEL §5 — the only legal transitions):

```
draft ──send──▶ sent ──accept──▶ accepted
                  │  └─reject──▶ rejected
                  └─cancel──▶ cancelled            accepted ──revoke(owning admin)──▶ revoked
```

Illegal transition → `409 CONFLICT`. Right transition, wrong actor → `403 FORBIDDEN`. All transitions audited with `transfer_id`.

### 7.1 `POST /transfers` · `GET /transfers`

**Create draft** — caller must be an owning-firm **case member**.

| Field | Type | Rules |
|---|---|---|
| `case_id` | uuid | Caller's firm's case, not archived |
| `to_firm_id` | uuid | Must ≠ caller's firm |
| `recipient_emails` | string[] | 1–10; each must resolve to an **active** profile of `to_firm_id` (stored as `recipient_user_ids uuid[]`) |
| `document_ids` | uuid[] | 1–50; documents of `case_id` (any level the sender can see — recipients re-verify under the full access rule) |
| `message` | string | optional, ≤ 1000 chars |

`201` → transfer object (§7.2 shape), `status: 'draft'`. Audit: `transfer.created`. Drafts are editable until sent; draft edits are not separately audited (private to the sender).

**List** — `?direction=outgoing` (default; transfers of cases where the caller is an owning-firm member) | `incoming` (transfers where the caller is a designated recipient) · `?status=` filter. In-query filtering, no leaks.

### 7.2 `GET /transfers/{transferId}` · `PATCH /transfers/{transferId}`

**Detail** — visible to owning-firm case members, owning-firm admin (P7), and **designated recipients**. Includes `case_title`, `case_reference`, `from_firm`, `to_firm`, `recipients[]` (email + resolved name once accepted), `items[]` (document metadata: id, filename, security_level, size_bytes), `status`, `message`, `history[]` (status + timestamp + actor).

**Edit** — `recipient_emails`, `document_ids`, `message` — only while `status='draft'`, sender side. `409` otherwise.

### 7.3 `POST /transfers/{transferId}/{send|accept|reject|cancel|revoke}`

| Action | Actor | From → To | Effects |
|---|---|---|---|
| `/send` | Owning-firm case member | `draft → sent` | Transactional email to each recipient (DOMAIN_MODEL §9); `sent_at` set; audit `transfer.sent` |
| `/accept` | **Designated recipient only** | `sent → accepted` | Each designated recipient inserted into `case_members` with role `external` (**idempotent** insert); `responded_at` set; email to sender; audit `transfer.accepted` |
| `/reject` | **Designated recipient only** | `sent → rejected` | Email to sender; audit `transfer.rejected` |
| `/cancel` | Owning-firm case member | `sent → cancelled` | Audit `transfer.cancelled` |
| `/revoke` | **Owning-firm admin** | `accepted → revoked` | External memberships created by this transfer are **removed**; future access severed (A2 honors only `status='accepted'`); past access remains fully audited; email to recipients (optional); audit `transfer.revoked` |

Scope note: acceptance grants **case membership**, but document access still requires the full access rule — an external member reaches **only the transferred documents** (A2 transfer branch); anything else in the case remains `FIRM_MISMATCH`.

---

## 8. Audit Trail (A1 / V1)

### 8.1 `GET /audit` — `firm_admin` only

Firm-scoped, filterable query over `audit_events`. RLS + endpoint both enforce: **only** rows with `firm_id = caller's firm`; rows with `firm_id = null` (e.g. `auth.login_failed`) are never visible to firm admins (platform operators only).

Query: `?case_id=` · `?document_id=` · `?transfer_id=` · `?actor_user_id=` · `?action=` (one of the 23 enum values) · `?result=allow|deny|info` · `?deny_reason=` (canonical enum) · `?from=&?to=` (occurred_at range) · `?limit=&cursor=` · sort `occurred_at desc`.

```json
{ "data": [ { "id": "uuid", "occurred_at": "…", "actor_user_id": "uuid", "actor_name": "Marcus Oyelaran",
  "firm_id": "uuid", "case_id": "uuid", "document_id": "uuid", "transfer_id": null,
  "action": "document.access_denied", "result": "deny", "deny_reason": "CLEARANCE_MISMATCH",
  "ip_hash": "…64 hex…", "country": "DE", "city": "Berlin", "user_agent": "…≤200 chars…",
  "details": {} } ], "page": { "next_cursor": null } }
```

This is the **only** surface where precise `deny_reason` values are exposed — and only to firm admins.

### 8.2 `GET /audit/export` — `firm_admin` only

`?from=&to=` (inclusive; max 90 days per call). Streams **NDJSON** (`application/x-ndjson`): one canonical event per line, **including `prev_hash`/`entry_hash`**, suitable for cold archive and offline chain re-verification. The export itself is audited: `firm.updated` with `details.type='audit_export'`.

---

## 9. Search (clearance-aware — DOMAIN_MODEL §8)

### 9.1 `GET /search?q=…`

`q` is required (1–200 chars; matches case title, case reference, filename, description). Filters: `?case_id=` · `?level=1|2|3` · `?from=&to=` (uploaded_at) · pagination.

```json
{ "documents": [ { "id": "uuid", "filename": "…", "security_level": 2, "case_id": "uuid",
    "case_title": "…", "uploaded_at": "…" } ],
  "cases": [ { "id": "uuid", "title": "…", "case_reference": "…", "default_security_level": 2 } ],
  "page": { "next_cursor": null } }
```

Filtering happens **in the query** (access-rule predicates), never post-filter: titles, counts, and the existence of inaccessible items are never leaked — including through pagination counts and empty results.

---

## 10. Cross-Cutting Rules (implementation checklist)

| Rule | Detail |
|---|---|
| No existence oracle | Unknown **and** off-scope IDs → `404`; identical bodies; no timing or count side channels |
| Generic denial | A1–A5 failures → identical `403 ACCESS_DENIED`; `DOWNLOAD_BLOCKED_L3` is the sole distinct code; `CASE_ARCHIVED` appears only on write paths for existing members |
| Audit-before-URL | `document.viewed`/`downloaded` committed synchronously before the signed URL is issued (A1); denials audited synchronously too |
| Signed URLs | TTL ≤ 60 s; private bucket; `Cache-Control: no-store`; never CDN-cached; silent re-authz before expiry |
| Immutability | No endpoint mutates document content (V1); replacement = new upload with `superseded` flag on the old row |
| Clearance source of truth | DB re-read per request; JWT carries identity only (D10) |
| Enum discipline | Deny reasons (9) and audit actions (23) are closed sets; new values require a contract amendment, never a local addition |
| Privacy | `ip_hash` (salted SHA-256) + `country`/`city` from Vercel geo headers; raw IPs never persisted (D9, D8) |
| Cron surface | `/api/cron/*` is outside `/api/v1`, gated by `CRON_SECRET` (D6) — not for clients |

## Changelog

| Version | Change |
|---|---|
| 2.0 | Regenerated for the legal document exchange core idea: cases/documents/transfers/audit surface, A1–A6 content endpoint, acceptance-gated transfer machine, hash-chained audit query/export. Supersedes v1.0 (short-link API: `/links`, click analytics, public redirects). |
| 1.0 | Initial draft (v1 product — retired). |
