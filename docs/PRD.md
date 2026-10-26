# BriefLock — Product Requirements Document

**Version 2.0 — Regenerated for the legal document exchange core idea**

| Field | Value |
|---|---|
| **Product** | BriefLock — secure document exchange & case-file management platform for law firms |
| **Status** | Draft for implementation |
| **Supersedes** | PRD v1.0 (self-destructing short links) — archived in `docs-v1-archive/` |
| **Contract** | `DECISIONS.md` (🔒 locked) and `DOMAIN_MODEL.md` (🔒 locked) are the single source of truth. This PRD implements them; any conflict resolves in their favor. |
| **Audience** | Engineering, product design, QA |
| **Platform** | Next.js + TypeScript web app on **Vercel** [D2] · Supabase (Postgres + RLS + Auth + Storage) |
| **Auth** | Supabase Auth — email/password + magic link; **no custom auth API endpoints** [D10] |
| **Deployment** | Vercel-only; public domain **TBD** — use `app.example.com` placeholders, never an invented domain [D2] |
| **MVP timeline** | 4 weeks |
| **Priority key** | **P0** = MVP launch blocker · **P1** = post-MVP within 60 days · **P2** = v2 / backlog |

> **Note on normative excerpts:** tables marked *"verbatim"* below are copied from `DOMAIN_MODEL.md` / `DECISIONS.md` for convenience. The originals govern.

---

## 1. Executive Summary & Elevator Pitch

### 1.1 What BriefLock is

BriefLock is a **secure document exchange and case-file management platform for law firms**. Firms create **cases** (legal matters), upload case **documents** (immutable PDFs), and tag each document with a **security level**:

| Level | Name | Example matter | Handling |
|---|---|---|---|
| L1 | Standard | Property theft, contracts | Watermark optional |
| L2 | High | Murder case | Watermark mandatory |
| L3 | Maximum | War crimes | Watermark mandatory; per-case download gate |

Every lawyer holds **exactly one clearance level**. A document's content opens only when **all** of the following hold simultaneously:

1. The user belongs to the owning firm **or** received the document via an **accepted transfer**;
2. The user is a **member of the case**;
3. The user's clearance level **exactly equals** the document's security level — **compartments, not a hierarchy**: an L3 lawyer cannot open an L2 PDF, and an L2 lawyer cannot open an L3 PDF;
4. The document has **passed malware scanning**.

Every access, every **denied** attempt, and every administrative change is recorded in an **immutable, hash-chained audit log** ("severe telemetry"). There is **no unauthenticated access to anything in MVP** [P4].

### 1.2 Elevator pitch

> BriefLock is the digital case room for law firms: every case PDF carries a security level — L1 property theft, L2 murder, L3 war crimes — and every lawyer holds exactly one clearance. A document opens only when firm membership, case membership, an *exact* clearance match, and a clean malware scan all line up. Firms exchange documents through audited, acceptance-gated transfers — not email attachments — and every view, every denial, and every admin change lands in an immutable, hash-chained audit log a firm can put in front of a judge.

### 1.3 Positioning

For firms handling matters of sharply different sensitivity in the same practice, BriefLock is a secure document exchange and case-file platform. Unlike shared drives (hierarchical folder permissions, no per-document sensitivity discipline, no acceptance step for outside firms) and unlike email (zero control after send, no reliable record of who read what), BriefLock makes **exact-clearance matching, watermarked viewing, acceptance-gated cross-firm transfer, and tamper-evident audit the default** — for the whole firm, provably.

### 1.4 Strategic goals & MVP success definition

1. Launch the MVP in 4 weeks: firms & clearances, cases & documents, the full access rule, transfers, audit log, clearance-aware search, notifications.
2. Meet the locked success criteria (DECISIONS §5): **zero cross-firm data leakage** (automated RLS suite — release blocker), every access/denial auditable within 1 s with a verifying hash chain, upload → first view of an L1 document < 60 s including the scan gate, SLOs met, and a green 3×3 clearance-matrix E2E suite.
3. Land 3–5 pilot firms running real matters through BriefLock within 30 days of launch.
4. Establish the compliance foundation firms require before buying: GDPR **processor** posture, DPA template, legal-hold flag, retention settings [P8]. (SOC 2 is post-MVP.)
5. Keep the architecture honest to the contract: Vercel-only [D2], Supabase Auth [D10], no third-party file scanning [D11], IP minimization [D9], canonical naming [N1].

---

## 2. Problem Statement & Goals

### 2.1 Problem

Law firms run matters of wildly different sensitivity — a property-theft file and a war-crimes file — through the same tools built for neither:

- **Everything in the folder.** Shared drives grant folder-level access. The paralegal who needs the intake receipts can also open the strategy memo; "sensitivity" lives in people's heads, not in the system.
- **Email is the exchange mechanism.** Documents sent to co-counsel or the counter firm as attachments are forwardable forever, unwatermarked, with no acceptance step and no way to cut access off when an engagement ends.
- **Hierarchy-based permissions don't fit.** "Senior people can see more" is exactly wrong for compartmented matters: the lead war-crimes counsel (L3) must *not* open a colleague's L2 murder file, and vice versa. No mainstream tool expresses "exact match only."
- **No defensible record.** After an incident, firms cannot answer *who opened this file, when, from where, who approved the access, and who changed the permissions* — the question regulators, clients, and courts ask.

The result: confidentiality obligations (client confidentiality, privilege, evidence-safety in atrocity-crimes matters) are enforced by policy documents and trust, not by the system.

### 2.2 Goals (MVP)

| ID | Goal | Success signal |
|---|---|---|
| **G1** | **Tenancy & clearance control** — a firm admin can provision a firm, invite users with roles, and assign exactly one clearance level per user, with every admin change audited. | Full admin workflow (signup → 5 invited users with correct clearances) < 15 min; 100% of admin actions present in the audit log. |
| **G2** | **Compartmented access** — content access only on the exact-match diagonal (L1→L1, L2→L2, L3→L3), plus case membership and a clean scan; watermarked viewing for L2/L3 [W1]. | Zero off-diagonal content deliveries in production; clearance-matrix E2E green (3×3). |
| **G3** | **Audited cross-firm exchange** — owning firms send acceptance-gated transfers to designated recipients; acceptance grants external case membership without loosening the access rule; revocation cuts future access. | Transfers exercise the full state machine (draft→sent→accepted→revoked) with every transition audited. |
| **G4** | **Defensible audit** — every access, denial, and admin change lands in the immutable, hash-chained audit log within 1 s, filterable by admins, exportable as NDJSON. | Hash-chain verification job green daily; admin can reconstruct any document's full access history. |
| **G5** | **Ship on Vercel + Supabase in 4 weeks** meeting the S1 SLOs and DECISIONS §5 criteria. | All P0 FRs done; RLS suite green; SLOs measured in staging. |

### 2.3 Non-Goals (MVP — summary)

No public share links or anonymous pages beyond login/signup/invite-accept [P4]; no SSO/SAML; no e-signature; no document editing or versioning; no OCR; no folders/tags; no billing automation; no mobile apps; no multi-firm shared case workspaces; no hierarchical clearances; no chat. Full list in **§7** (verbatim-plus from DECISIONS §4).

---

## 3. Target Audience & Personas

### 3.1 Audience map

- **Buyer / administrator:** managing partner or firm operations lead (personas 1) — owns clearances, invites, audit review.
- **Daily users:** litigators, associates, paralegals (personas 2–3) — live in case files.
- **External participants:** lawyers at other firms who receive documents via transfers (persona 4) — authenticated users of their *own* firm, granted scoped access into the sender's case.
- **Platform operator (BriefLock staff):** sees only platform-level telemetry (audit rows with `firm_id = null`, e.g. `auth.login_failed`); never firm document content.

### 3.2 Personas

**Persona 1 — Dana Whitfield, Managing Partner / Firm Admin — "the clearance controller"**
- Hartwell & Roe LLP, 38 lawyers; `firm_admin` role; personal clearance L2 (she works her own matters).
- **Needs:** invite + role + clearance in one audited flow; audit filters ("who touched the Kessler file this week"); denial alerts when something looks wrong; revoke transfers when an engagement ends; provable inability to read content she isn't cleared and assigned for (she wants to *demonstrate* this to clients).
- **Job-to-be-done:** "When an associate rotates off the murder-case team, I change her clearance and memberships with one audited action — and prove nothing else moved."
- **Success metric:** clearance change effective on the user's *next request*; every admin action findable in the audit view in under a minute.

**Persona 2 — Marcus Oyelaran, Senior Litigator on an L2 murder-case team**
- `lawyer` role; clearance L2; member of the *State v. Dolan* case (default level L2).
- **Needs:** fast watermarked viewing of L2 case PDFs; raising specific documents above the case default when content demands it; search across exactly his accessible documents; no noise — he must not even see that an L3 war-crimes document exists in a neighboring case.
- **Job-to-be-done:** "I open the case, see exactly the documents at my clearance, and read them in the watermarked viewer without downloading anything."
- **Success metric:** signed-URL issuance p95 < 100 ms [S1]; zero existence leaks of off-clearance documents in lists or search.

**Persona 3 — Priya Nair, Paralegal handling L1 property-theft volume work**
- `paralegal` role; clearance L1; uploads intake PDFs to several standard-sensitivity cases.
- **Needs:** quick, reliable uploads (≤ 100 MB PDFs); clarity when a file is quarantined pending scan; optional watermark at L1 per firm settings; a system that stops her from lowering a level she raised by mistake (admin does that, with a reason).
- **Job-to-be-done:** "Upload the intake PDFs to the right case at the right level and know they're quarantined until scanned clean."
- **Success metric:** upload → first view of an L1 document < 60 s including the scan gate (DECISIONS §5).

**Persona 4 — Elena Costa, Associate at the receiving firm — "the transfer recipient"**
- `lawyer` at Calder & Voss LLP (counter/parallel firm); clearance L2; designated recipient of a transfer containing L2 evidence PDFs from Hartwell & Roe.
- **Needs:** a clear incoming-transfer notification; an explicit accept/reject decision; after acceptance, watermarked in-app viewing under the *full* access rule; certainty about when her access ends (revocation).
- **Job-to-be-done:** "Accept the other firm's evidence bundle, read the L2 PDFs watermarked with my name and the UTC time — and know exactly when my access ends."
- **Success metric:** notification → accept → first watermarked view in one session; access severed immediately upon revocation, with the history preserved.

### 3.3 Commercial model (MVP)

Seat-based per-user subscription is **designed** but billing automation is out of scope (DECISIONS §4): MVP ships a `plan` field (`trial` default) with manual tier flips and invoicing. No self-serve checkout, no metering UI.

---

## 4. Functional Requirements

### 4.0 API surface map

All resource identifiers are UUIDs in API paths; no guessable sequential IDs [N1]. Prefix `/api/v1` for everything.

| Method & path | Purpose | Auth | Rate class (§3 of DECISIONS) |
|---|---|---|---|
| `GET /api/v1/health` | Liveness + DB probe; status only, no data | none (sole exception, for uptime checks) | — |
| `POST /api/v1/firms` | Create firm (post-signup; first user becomes `firm_admin`) | JWT | standard |
| `POST /api/v1/invites` · `POST /api/v1/invites/:id/accept` | Invite user (role + clearance preset) · accept invite | JWT · invite token (anonymous page) | auth |
| `PATCH /api/v1/profiles/:id` | Change role / clearance / `is_active` | `firm_admin` only | standard |
| `GET|POST /api/v1/cases` · `GET|PATCH /api/v1/cases/:id` | Case CRUD | JWT | standard |
| `POST /api/v1/cases/:id/members` · `DELETE /api/v1/cases/:id/members/:userId` | Add/remove case members | admin or case lead | standard |
| `POST /api/v1/documents` | Upload PDF (`case_id` in body) | JWT | upload |
| `GET /api/v1/cases/:id/documents` · `GET /api/v1/documents/:id` | Metadata lists/detail (filtered) | JWT | standard |
| `PATCH /api/v1/documents/:id/level` | Raise / lower security level (§4.5 rules) | JWT | standard |
| `GET /api/v1/documents/:id/content?disposition=view\|download` | Signed-URL issuance (view / download) | JWT | content |
| `POST /api/v1/transfers` · `POST /api/v1/transfers/:id/{send,accept,reject,cancel,revoke}` | Transfer lifecycle | JWT | standard |
| `GET /api/v1/transfers` | Incoming/outgoing transfer inbox | JWT | standard |
| `GET /api/v1/audit` · `GET /api/v1/audit/export` | Audit views · NDJSON export | `firm_admin` | standard |
| `GET /api/v1/search?q=` | Clearance-aware search | JWT | standard |

### 4.1 Firms, users & clearances

| ID | Requirement | Priority |
|---|---|---|
| FR-01 | **Firm provisioning:** signup (Supabase Auth) followed by `POST /api/v1/firms` creates the `firms` row (`name`, `slug citext unique`, `settings jsonb` = retention days / watermark defaults / `l3_view_only` default, `plan='trial'`). The creating user's profile becomes `firm_admin`. | P0 |
| FR-02 | **Invite flow:** firm admin invites by email, presetting role and clearance. Invite email per §9. The invite-accept page is one of only three anonymous pages [P4]. Acceptance creates the `profiles` row (`firm_id`, `role`, `clearance_level`, `is_active=true`). | P0 |
| FR-03 | **Roles:** `firm_admin` \| `lawyer` \| `paralegal` [D10]. Roles are administrative; they never grant content access by themselves. Role changes are **admin-only** and audited (`member.role_changed`). | P0 |
| FR-04 | **Clearance assignment:** exactly **one** `clearance_level ∈ {1,2,3}` per user (DOMAIN_MODEL §2.2). Admin-only; audited (`clearance.changed`) with before/after values; **effective immediately** — authorization reads `profiles.clearance_level` from the database at request time; the JWT is used for identity/session only, never as the authorization source (prevents stale-claim access after a change). | P0 |
| FR-05 | **Deactivation:** admin sets `is_active=false` (`deactivated_at` set). Deactivated users fail check A1 with `DEACTIVATED`. Audited as `member.removed` with `details.reason='deactivated'` (the canonical enum has no dedicated action). Reactivation is admin-only and audited as `member.added`. | P0 |
| FR-06 | **Firm settings:** retention days, L1 watermark default, `l3_view_only` default for new cases. Edited by admin; audited (`firm.updated`). | P1 |
| FR-07 | **Firm plan & lifecycle:** plan changes (trial→paid) and firm deactivation (soft) via admin/platform ops; audited (`firm.updated`). | P2 |

### 4.2 Cases & membership

| ID | Requirement | Priority |
|---|---|---|
| FR-08 | **Case CRUD:** create/list/update cases with `title`, `case_reference` (firm-local human ref, unique per firm), `default_security_level ∈ {1,2,3}`, `status ∈ ('open','closed','archived')`. Creator is inserted as case member with role `lead`. Audited: `case.created`, `case.updated`. Case list shows only cases where the caller is a member (admins: all firm cases — metadata per P7). | P0 |
| FR-09 | **Case members:** add/remove own-firm profiles with role `lead` \| `member`. The `external` role is **reserved for transfers** and cannot be set manually. Audited: `member.added`, `member.removed`. | P0 |
| FR-10 | **Case lifecycle:** close (`case.closed`) and archive (`case.archived`), both audited. Archived cases allow **reading**; new activity (uploads, new transfers, member changes, level changes) is blocked and logged as `CASE_ARCHIVED` denial. Lazy read-time check is the real enforcer [D6]. | P0 |
| FR-11 | **L3 download flag:** per-case `allow_l3_download boolean` default `true` [P5]; toggled by firm admin; audited (`case.updated`). See FR-24 for enforcement. | P0 |
| FR-12 | **Legal hold & retention:** per-case `legal_hold boolean` (blocks all deletion/retention sweeps for that case's documents) and `retention_days int null` override. Admin-editable; audited (`case.updated`). | P1 |

### 4.3 Document upload & integrity

| ID | Requirement | Priority |
|---|---|---|
| FR-13 | **Upload validation:** PDF-only — enforce `size_bytes ≤ 104857600` (100 MB), `mime_type = 'application/pdf'`, and **server-side PDF magic bytes** verification (`%PDF-` header). Anything else → `400`. Rate class: upload, 30/min/user (DECISIONS §3). | P0 |
| FR-14 | **Content hash:** SHA-256 (`sha256 char(64)`) computed server-side at ingest and stored for tamper-evidence; surfaced in metadata to permitted users. | P0 |
| FR-15 | **Scan gate [D11]:** after storage, `scan_status='pending'` → in-function PDF structure validation (magic bytes, embedded-JS heuristics) → `clean` \| `infected` \| `error` (`scan_method='magic-bytes-mvp'`). **Access blocked unless `scan_status='clean'`** (A5): `UNSCANNED` for pending/error, `INFECTED` for infected. Infected/error writes `document.scan_failed` audit. Quarantine = storage path unchanged; nothing is deleted automatically. | P0 |
| FR-16 | **Storage:** private Supabase Storage bucket, path `{firm_id}/{case_id}/{document_id}/{filename}`; **no public buckets**; no direct object URLs — signed URLs only (FR-22). | P0 |
| FR-17 | **Document metadata & level at upload:** `filename`, optional `description`, `security_level` defaulting to the case's `default_security_level`; the uploader may **raise** it at upload time (Decision P2). `document.uploaded` records the chosen level; if raised above default, a `document.level_raised` event is also written. Uploaded documents are **immutable** (no editing, no in-place versioning — [V1]); replacement = new upload with `superseded` flag on the old row. | P0 |
| FR-18 | **Filtered visibility (no existence leaks):** document lists (`GET /api/v1/cases/:id/documents`) and metadata detail (`GET /api/v1/documents/:id`) return rows only when the caller passes the same predicates as the access rule — same firm (or, for external members, recipient of an accepted transfer carrying *that* document), case membership, **exact clearance** — evaluated **in the query** (RLS + joins), never post-filter. An L2 case member therefore does not see that an L3 document exists. Failures return a generic `404` (no existence confirmation). Firm admins see firm-wide **metadata** in dedicated admin views (P7) — see FR-26. | P0 |

### 4.4 Clearance-gated access (the core)

**Normative access rule — verbatim from DOMAIN_MODEL §3.** Content access (`GET /documents/:id/content`) is granted **iff all** checks pass, evaluated server-side:

| # | Check | Failure reason |
|---|---|---|
| A1 | Authenticated, `is_active = true` | `UNAUTHENTICATED` / `DEACTIVATED` |
| A2 | `profile.firm_id = document.firm_id` **OR** profile ∈ `transfers.recipient_user_ids` of an **accepted** transfer carrying this document | `FIRM_MISMATCH` |
| A3 | Active `case_members` row for `(document.case_id, profile.id)` (own-firm or `external`) | `NOT_CASE_MEMBER` |
| A4 | `profile.clearance_level = document.security_level` — **exact match** | `CLEARANCE_MISMATCH` |
| A5 | `document.scan_status = 'clean'` | `UNSCANNED` / `INFECTED` |
| A6 | Case not `archived` for **new** activity (reading remains allowed; downloads still gated by §3.1) | `CASE_ARCHIVED` |

**Deny reasons (canonical enum, verbatim — DOMAIN_MODEL §3.2):**
`UNAUTHENTICATED` · `DEACTIVATED` · `FIRM_MISMATCH` · `NOT_CASE_MEMBER` · `CLEARANCE_MISMATCH` · `UNSCANNED` · `INFECTED` · `CASE_ARCHIVED` · `DOWNLOAD_BLOCKED_L3`

**Clearance matrix — verbatim from DOMAIN_MODEL §3.3 (the product's core invariant):**

| User ↓ \ Document → | L1 | L2 | L3 |
|---|---|---|---|
| **L1** | ✅ view+download | ❌ | ❌ |
| **L2** | ❌ | ✅ view+download (watermark) | ❌ |
| **L3** | ❌ | ❌ | ✅ view+download (watermark; per-case view-only flag) |

Only the diagonal allows access. Non-diagonal = `CLEARANCE_MISMATCH` denial, logged.

| ID | Requirement | Priority |
|---|---|---|
| FR-19 | **Access-rule engine:** implement A1–A6 server-side, in order, returning the canonical deny reasons above. The engine is the single code path used by content access, and its predicates are reused (as query predicates) by lists and search (FR-18, FR-41). | P0 |
| FR-20 | **Exact-match matrix enforcement:** only the diagonal allows access (table above). Compartments, not hierarchy [P1] — a higher clearance grants **nothing** at other levels. Every off-diagonal content attempt is a `CLEARANCE_MISMATCH` denial, logged. | P0 |
| FR-21 | **Generic denial interstitials (leak nothing):** all content-access denials (A1–A5 failures) render **one uniform generic interstitial** ("You don't have access to this document") with HTTP 403 — same copy, same payload shape for every reason; no filename, no case title, no security level, no existence confirmation. The precise `deny_reason` is persisted **only** in `audit_events` and surfaced to firm admins in the audit view. Two narrow exceptions that leak nothing new: the `DOWNLOAD_BLOCKED_L3` notice ("downloads are disabled for this case — view in the secure viewer") shown to users who can already see the document, and in-app `CASE_ARCHIVED` notices shown to existing case members. | P0 |
| FR-22 | **Signed-URL delivery:** content is delivered via Supabase Storage signed URLs, **TTL ≤ 60 s**, issued **only after** the `document.viewed` / `document.downloaded` audit row is committed [A1]. `disposition=view` → viewer; `disposition=download` → attachment delivery. | P0 |
| FR-23 | **Watermarked viewer [W1]:** pdf.js in a **CSP-locked sandboxed iframe** with a dynamic overlay watermark: viewer **full name + UTC timestamp**, tiled across the page. Mandatory for **L2 and L3**; optional for **L1** per firm settings. | P0 |
| FR-24 | **L3 download gate [P5]:** if `document.security_level = 3` AND `case.allow_l3_download = false` → **view allowed (watermarked)**; download attempt denied with reason `DOWNLOAD_BLOCKED_L3`, logged as a denial. | P0 |
| FR-25 | **Downloads (allowed cases):** L1/L2 documents, and L3 when the case flag allows, are downloadable via attachment-disposition signed URL; `document.downloaded` audited. | P0 |
| FR-26 | **Admin exception (P7):** firm admins may read **metadata and audit trails** of their firm's cases — including for cases/documents they are not members of and at any level — in dedicated admin views. **Never** document content unless A1–A5 pass for the admin personally. **No admin backdoor** exists in any code path; the content endpoint has no admin branch. | P0 |

### 4.5 Document level raise / lower (Decision P2)

| ID | Requirement | Priority |
|---|---|---|
| FR-27 | **Raise:** the uploader may set a document's level above the case default at upload time (FR-17). Post-upload **raising** is permitted to own-firm case members via `PATCH /api/v1/documents/:id/level` (direction=`up`). Audited: `document.level_raised` with before/after. | P0 |
| FR-28 | **Lower:** **firm admin only**, with a **mandatory reason**, via the same endpoint (direction=`down`). Audited: `document.level_lowered` with before/after + reason in `details`. Non-admin lowering attempts → `403`; the UI never offers lowering to non-admins. | P0 |

### 4.6 Transfers (cross-firm exchange — Decision P3)

**Transfer state machine — verbatim from DOMAIN_MODEL §5:**

```
draft ──send──▶ sent ──accept──▶ accepted
                  │  └─reject──▶ rejected
                  └─cancel──▶ cancelled            accepted ──revoke(owning admin)──▶ revoked
```

| ID | Requirement | Priority |
|---|---|---|
| FR-29 | **Draft:** an owning-firm **case member** creates a transfer: documents from the case (`transfer_items`), designated recipients (`recipient_user_ids uuid[]` — active profiles of the receiving firm), `to_firm_id ≠ from_firm_id`, optional `message`. Audited: `transfer.created`. Drafts are editable until sent (no draft deletion in MVP — avoid enum growth). | P0 |
| FR-30 | **State machine:** exactly the transitions above; illegal transitions → `409`. All transitions audited with `transfer_id`: `transfer.sent`, `transfer.accepted`, `transfer.rejected`, `transfer.cancelled`, `transfer.revoked`. | P0 |
| FR-31 | **Send:** sender must be an owning-firm member of the case; recipients are emailed (`transfer.sent` → recipients, §9). Recipients must belong to `to_firm_id` and be active. | P0 |
| FR-32 | **Accept / reject:** permitted **only to designated recipients**. On `accept`: each designated recipient is inserted into `case_members` with role `external` (**idempotent**) and `transfer.accepted` is audited; the sender is notified (§9). **Scope of external access:** A3 (case membership) passes for the whole case, but A2 passes only for documents carried by an accepted transfer addressed to that user — so external members can access **only the transferred documents**; anything else in the case remains `FIRM_MISMATCH`. Lists and search apply the same predicate. | P0 |
| FR-33 | **Revoke:** owning-firm **admin** only, from `accepted` → `revoked`. Severs future access: the external case memberships created by the transfer are removed, and A2 honors only transfers in status `accepted`. **Past access remains fully audited.** Sender-side confirmation; recipients may be notified (§9). | P0 |
| FR-34 | **Transfer inbox:** incoming and outgoing transfer lists with status filter; transfer detail showing items, recipients, status history. | P1 |

### 4.7 Audit log (Decision A1)

**Audit action enum — verbatim from DOMAIN_MODEL §6 (closed set):**
`auth.login_failed` · `member.added` · `member.removed` · `member.role_changed` · `clearance.changed` · `case.created` · `case.updated` · `case.closed` · `case.archived` · `document.uploaded` · `document.viewed` · `document.downloaded` · `document.access_denied` · `document.level_raised` · `document.level_lowered` · `document.scan_failed` · `transfer.created` · `transfer.sent` · `transfer.accepted` · `transfer.rejected` · `transfer.cancelled` · `transfer.revoked` · `firm.updated`

| ID | Requirement | Priority |
|---|---|---|
| FR-35 | **Append-only, hash-chained:** `audit_events` has **no UPDATE/DELETE policies or grants for any role**; insert is **service-role only**. Chain: `entry_hash = SHA256(prev_hash ‖ canonical_json(all fields except hashes))`; genesis `prev_hash` = 64×'0'. | P0 |
| FR-36 | **Event shape:** every event carries `occurred_at`, `actor_user_id` (null = system), `firm_id` / `case_id` / `document_id` / `transfer_id` (nullable), `action` (enum above), `result ∈ ('allow','deny','info')`, `deny_reason` (§3.2 enum when deny), `ip_hash`, `country`, `city`, `user_agent` (truncated 200 chars), `details jsonb`. Actions map to contract language: user deactivation → `member.removed` (`details.reason='deactivated'`), audit export → `firm.updated` (`details.type='audit_export'`). The enum is closed — new actions (e.g., first-class export or purge events) require a DECISIONS/DOMAIN_MODEL amendment, not a local addition. | P0 |
| FR-37 | **Synchronous audit-before-issue:** content access events (`document.viewed` / `document.downloaded`) are committed **before** the signed URL is issued [A1]; **every denial** writes an `audit_events` row (`result='deny'`, `deny_reason`). Target: every access and denial queryable within **1 s** (DECISIONS §5). The 100 ms signed-URL SLO includes this commit (NFR-01). | P0 |
| FR-38 | **Admin audit views:** firm-scoped, filterable by case, document, actor, action, result, and date range. `firm_id = null` rows (e.g., `auth.login_failed`) are visible only to platform operators, never to firm admins (RLS-enforced). | P0 |
| FR-39 | **NDJSON export:** admin-only endpoint emitting newline-delimited canonical events (including both hashes) suitable for cold archive and offline chain re-verification. Export itself audited (FR-36). | P1 |
| FR-40 | **Hash-chain verification job:** `pg_cron` sweep (every 1 min window, [D6]) plus on-demand verification endpoint recomputes the chain from genesis to head; any break alerts firm admins and platform ops. Daily green verification is a release requirement (Appendix B). | P0 |

### 4.8 Clearance-aware search (DOMAIN_MODEL §8)

| ID | Requirement | Priority |
|---|---|---|
| FR-41 | `GET /api/v1/search` returns only documents/cases the caller can access under the access rule — **filtering happens in the query** (RLS + access-rule predicates: firm/transfer scope, case membership, exact clearance), never post-filter. Titles, counts, and the **existence of inaccessible items are never leaked** — including through pagination counts and error messages. | P0 |
| FR-42 | Search refinements: filter by `case_reference`, filename, date range; matches on case title, case reference, filename, description. | P2 |

### 4.9 Notifications (DOMAIN_MODEL §9)

| ID | Requirement | Priority |
|---|---|---|
| FR-43 | **Transactional email only** (Supabase/Resend; no marketing): `invite` → new user · `transfer.sent` → recipients · `transfer.accepted`/`transfer.rejected` → sender · repeated-denial alert → firm admin. Emails carry **no access-granting tokens**; deep links land on login (P4). | P0 |

### 4.10 Denial alerts

| ID | Requirement | Priority |
|---|---|---|
| FR-44 | **Repeated-denial alert:** ≥ **5 denied access attempts by the same profile within 15 min** → alert email to the firm admin(s) with actor, count, time window, and reasons. The alert evidence is the underlying `document.access_denied` rows themselves (no new audit action; email delivery tracked in platform logs). Repeat alerts for the same profile are throttled to 1/hour. | P0 |

### 4.11 Rate limiting (D7 + DECISIONS §3)

**Canonical limits — verbatim from DECISIONS §3:**

| Endpoint class | Limit | Key | On exceed |
|---|---|---|---|
| Auth (login / magic-link request) | 10/min | IP | 429 + `Retry-After` |
| Upload (`POST /documents`) | 30/min | user | 429 + `Retry-After` |
| Content (`GET /documents/:id/content`) | 60/min | user | 429 + `Retry-After` |
| All other `/api/v1/*` | 100/min | user | 429 + `Retry-After` |

| ID | Requirement | Priority |
|---|---|---|
| FR-45 | Enforce the canonical limits table exactly; respond `429 Too Many Requests` with `Retry-After`. | P0 |
| FR-46 | Implementation: **in-memory per-instance token bucket** behind a `RateLimiter` interface so Upstash Redis can slot in later [D7]. IP-keyed limits use the raw IP transiently in memory only; IPs are **never persisted** raw (D9, NFR-06). | P0 |

### 4.12 Authentication & session (D10 + P4)

| ID | Requirement | Priority |
|---|---|---|
| FR-47 | **Supabase Auth:** email/password + magic link; JWT Bearer for API. **No custom auth API endpoints.** Failed logins audited as `auth.login_failed` (actor null). Auth rate limit 10/min/IP (table above). | P0 |
| FR-48 | **No unauthenticated surface:** the only anonymous pages are **login, signup, invite-accept** [P4]; the only unauthenticated API route is `GET /api/v1/health` (status only). Every other route requires a valid JWT of an active profile. | P0 |
| FR-49 | **Health endpoint:** `GET /api/v1/health` [N1] — liveness + DB probe; no user data in the response; used by the uptime synthetic check (S1). | P0 |

---

## 5. Non-Functional Requirements

| ID | Category | Requirement | Priority |
|---|---|---|---|
| NFR-01 | Performance | **Signed-URL issuance p95 < 100 ms** [S1] — including the synchronous audit commit (FR-37). | P0 |
| NFR-02 | Performance | **API p95 < 200 ms** [S1] (all `/api/v1/*` excluding content bytes themselves, which stream from storage). | P0 |
| NFR-03 | Performance | **Dashboard initial load < 2 s** [S1]. | P0 |
| NFR-04 | Reliability | **Uptime 99.9%** [S1], measured monthly via synthetic checks on `GET /api/v1/health` + login page. | P0 |
| NFR-05 | Multi-tenancy | **RLS invariant (DOMAIN_MODEL §10):** every table carries `firm_id` (or resolves to one via a parent). RLS makes cross-firm rows **structurally invisible** — including through search, counts, and error messages. An **automated RLS test suite** proving this invariant is a **release blocker**. RLS selects on firm + case membership + exact clearance for document visibility; the access-rule engine re-checks A1–A6 server-side on content (defense in depth). | P0 |
| NFR-06 | Privacy | **IP minimization [D9]:** IPs salted+hashed (SHA-256) at ingest; salt in a server env var; **raw IPs never persisted**; store `country` (and `city` when available) from Vercel request geo headers [D8] — no third-party GeoIP vendor, no client legal data leaves the platform for enrichment. `user_agent` truncated to 200 chars. | P0 |
| NFR-07 | Security | **No third-party file scanning [D11]:** MVP scanning = in-function PDF structure validation (magic bytes, embedded-JS heuristics) + **quarantine-until-scanned**. Full ClamAV container is a fast-follow and the **only** future non-Vercel infra piece. **Never** send client files to third-party scanning APIs. | P0 |
| NFR-08 | Compliance | **GDPR processor posture [P8]:** BriefLock is a

processor for law firms: a signed DPA template is provided; Supabase EU region by default; subprocessors limited to Vercel (hosting), Supabase (data + storage), transactional email, Sentry/LogTail (telemetry, **never document content**); 72-hour breach notification; `legal_hold` flag honored over retention; SOC 2 is post-MVP. |
| NFR-09 | Operability | Health probe `GET /api/v1/health` (N1) powers 99.9% uptime synthetics (S1); structured logs scrubbed of document metadata; `audit_chain_verify` runs daily (D6) and pages on any mismatch. |

## 6. UX Principles (summary — full detail in `UI_UX_DESIGN.md`)

1. **Two surfaces only** (P4): `(auth)` = login/signup/invite-accept; everything else session-gated. No public share links.
2. **The client never decides access** — screens render exactly what `/api/v1` returns; invisible documents leave no trace (no hidden counts, no disabled rows).
3. **Diagonal compartments as a taught mental model** — users always know their single clearance (P6) and what it excludes.
4. **Uniform denials** — one interstitial for all A1–A5 failures; precise reasons live only in the admin audit view.
5. **Watermark is mandatory UI** for L2/L3 (W1); L3 download can be view-only per case (P5).
6. **Every consequential action confirms its consequence and is audited** — admins see the trail (`document.access_denied` with `deny_reason`, level changes, member changes, transfers).

## 7. Non-Goals (MVP — verbatim from DECISIONS §4, plus derived exclusions)

Secure share links (fast-follow: repurposed v1 machinery) · SSO/SAML · e-signature · document editing/versioning (V1: immutable; replacement = new upload) · OCR · folders/tags · deadlines & calendars · billing automation (seat-based pricing designed; invoicing manual) · mobile apps · multi-firm shared case workspaces (v2) · hierarchical clearances (P1 future toggle — L3 ⊉ L2 in MVP) · chat/comments.

Derived exclusions: no admin content backdoor (P7 — admins see metadata + audit, never content without clearance) · no raw IP storage (D9) · no third-party malware scanning of client files (D11) · no public storage buckets · no custom auth endpoints (D10) · no client-side analytics vendors (D8).

## 8. Success Metrics (MVP)

**Release-defining criteria (DECISIONS §5 — pass/fail):**

| Criterion | Proof |
|---|---|
| Zero cross-firm data leakage | Automated RLS probe suite (SECURITY R-1..R-8) — **non-waivable release blocker** |
| Every content access & denial auditable within 1 s; hash chain verifies | Audit-before-URL integration tests + `audit_chain_verify` + tamper test |
| Upload → first view of an L1 document < 60 s incl. scan gate | `upload-e2e` timing |
| Clearance-matrix E2E green (3×3 allow/deny) | `matrix-e2e` — **non-waivable** |
| SLOs (S1): signed-URL p95 < 100 ms incl. audit commit · API p95 < 200 ms · dashboard < 2 s · uptime 99.9% | k6 + synthetics |

**Operational KPIs (server-side measurement only — D8 forbids client analytics vendors):**

| KPI | Source |
|---|---|
| Weekly active firms / active users | Supabase query over `audit_events` |
| Cases created, documents uploaded, transfers sent per week | audit events (`case.created`, `document.uploaded`, `transfer.sent`) |
| Transfer acceptance rate | `transfer.accepted` / `transfer.sent` |
| Time-to-first-view after upload | `document.uploaded` → `document.viewed` delta |
| Denial rate per 1k content views | `document.access_denied` / views (spike = UX or security signal) |
| Scan quarantine rate | `document.scan_failed` / uploads |

## 9. Open Questions

| # | Question | Owner / decision point |
|---|---|---|
| 1 | Production domain (D2: placeholders `app.example.com` until named) | Founder, pre-launch |
| 2 | ClamAV container (fast-follow) — timing and the sole non-Vercel infra piece | Eng, post-MVP |
| 3 | Demand signal for the P1 hierarchical-clearance toggle | Design partners, post-MVP |
| 4 | Share-link fast-follow scope (P4 repurposing) | Product, post-MVP |
| 5 | DPA subprocessor list finalization + EU region confirmation | Ops/legal, pre-launch |
| 6 | Retention purge event audit actions (closed 23-value enum needs a contract amendment) | Eng + legal |
| 7 | Pricing tiers beyond seat-based design; invoicing workflow | Founder, pre-GA |

## 10. MVP Release Checklist (Go/No-Go — detail in `ROADMAP.md`)

**Non-waivable blockers:**

1. ☐ RLS probe suite (cross-firm invisibility) green in CI — release blocker
2. ☐ 3×3 clearance-matrix E2E suite green — release blocker
3. ☐ Audit chain verifies end-to-end + tamper detection proven — release blocker

**Supporting gates:** SLOs measured on staging (S1) · upload→first-view < 60 s · denial uniformity + no-oracle tests green · dependency/secret scans clean · DPA + subprocessors documented · demo seed proves the matrix locally.

## Changelog

| Version | Change |
|---|---|
| 2.0 | Regenerated for the legal document exchange core idea: firms/cases/documents/transfers/audit product, L1–L3 compartments with diagonal-only clearance, acceptance-gated cross-firm transfers, hash-chained audit, non-waivable release gates. Supersedes v1.0 (self-destructing short-link PRD). |
| 1.0 | Initial PRD (v1 product — retired). |
