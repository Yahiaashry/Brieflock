# BriefLock: local Burp security workspace

This workspace uses synthetic firms, people, cases and copies of the sample PDF.
The setup script refuses hosted application or Supabase origins. It never resets
the database. Keep it local; do not copy these known passwords to production.

## Start and populate

1. Start the local Supabase containers. Apply pending migrations using
   `./scripts/apply-local-migrations.ps1` (targets only `supabase_db_BriefLock`).
2. Configure `.env.local` with local Supabase keys and a local application URL.
3. Start the application with `npm run dev`. For synthetic invitation testing,
   leave application email unconfigured; an administrator receives a copyable
   invitation link. Real email delivery is a separate integration check.
4. Run `npm run security:fixtures`. Re-running reuses the reserved synthetic
   accounts, cases and named documents. It restores the test accounts' roles,
   clearance and activation state. It does not undo manual transfer transitions.
5. Run `npm run security:verify` for live API/database permission checks. This
   creates extra synthetic invitation users and audit events on each run.

Generated files are in the ignored `security-fixtures/` directory:

- `fixtures.json`: actual account IDs, roles, clearance levels, case/document IDs,
  transfer IDs/statuses, local URLs and the synthetic password. No session tokens.
- `requests.http`: individual raw requests with expected outcomes and token
  placeholders. These are copy/paste templates, not a Burp project or an
  automatically imported Community Edition scan.
- Three valid PDFs named for L1/L2/L3 and a harmless invalid `not-a-pdf.pdf`.
- `verification.json`: the most recent successful API security check list.

## Accounts and privileges

All accounts below use **BurpLocal!2026**, only on this local workspace.

- `sender@burp-alpha.test`: Alpha firm administrator, L2. Creates cases, manages
  membership and invitations, sends transfers and revokes access. Cannot read audit.
- `security@burp-alpha.test`: Alpha security personnel, L2. Reads/exports only
  Alpha audit; cannot manage members or automatically open case documents.
- `level1@burp-alpha.test`, `level2@burp-alpha.test`,
  `level3@burp-alpha.test`: lawyers assigned to the main Alpha case at L1/L2/L3.
  Only documents matching their exact clearance open.
- `nonmember@burp-alpha.test`: Alpha paralegal, L2, deliberately not assigned
  to the main Alpha case. Its document content must be denied.
- `receiveradmin@burp-beta.test`: Beta administrator, L2. Sends the reverse
  transfer. Cannot read audit.
- `receiversecurity@burp-beta.test`: Beta security personnel, L2. Reads only Beta audit.
- `receiver@burp-beta.test`: designated Beta recipient, L2.
- `otherrecipient@burp-beta.test`: Beta paralegal, L2, deliberately not designated.

Firm admins assign the security role through Members. They cannot read audit
unless their role becomes security; a firm must retain an active administrator.
No role bypasses document membership, accepted sharing, exact clearance or scanning.

## Cases and transfer states

- `BURP-ALPHA-001`: L1/L2/L3 clean PDFs, pending quarantine metadata, and six
  separately uploaded L2 PDFs for draft/sent/accepted/rejected/cancelled/revoked
  transfer scenarios. Separate documents isolate each sharing state.
- `BURP-BETA-001`: Beta-owned sample and an outgoing transfer to Alpha's L2 lawyer.
- `BURP-L3-VIEW-ONLY`: L3 document; view succeeds for its L3 lead, download fails.

The main Alpha case includes the sender and three clearance lawyers. Accepted
transfers add external membership to the recipient. Membership alone does not
expose documents absent an accepted grant for that particular document.

## Capture requests in Burp Community

1. Open **Proxy → Intercept**, leave **Intercept off**, click **Open browser**.
2. Visit the local URL in `fixtures.json`, normally `http://localhost:3000`.
3. Sign in as the sender. Visit Cases, Transfers and Members. Upload only a
   synthetic PDF. Requests appear in **Proxy → HTTP history**.
4. Add the BriefLock host to scope. Add local Supabase at `127.0.0.1:54321`
   when testing auth, storage or direct row-level policies.
5. Right-click an interesting request → **Send to Repeater**. Send it unchanged
   once, then alter one field/header/ID per check. Inspect response bodies and
   resulting application state, not only response codes.
6. Use separate browser sessions or sign out/in to compare sender and receiver.
   Never assume changing a user ID in JSON changes the authenticated actor.

BriefLock makes some API calls on the server, so they do not appear in browser
history. Use `requests.http` to test the direct APIs:

1. Create a Repeater request to local Supabase, HTTP, port 54321. Paste the first
   request block, without its `###` description. Replace the anon-key placeholder
   using `NEXT_PUBLIC_SUPABASE_ANON_KEY` from `.env.local`; this is the public key,
   never the service-role key. Use the desired synthetic email and password.
2. Send it and copy `access_token` from the response. Keep tokens private.
3. Create a Repeater request to BriefLock, HTTP, port 3000. Paste one application
   request block and replace its token placeholder with that actor's token.
   Ensure Repeater's target host/port matches its Host header.
4. Burp normally updates Content-Length automatically for edited JSON requests.

## Checks to perform

1. Remove authorization: protected APIs return 401.
2. Try all nine clearance combinations: only L1→L1, L2→L2, L3→L3 succeed.
3. Use the nonmember or another firm on an unshared document: no signed URL.
4. Probe a draft as the recipient: 404; drafts never appear in Incoming.
5. Open the sent transfer's document before acceptance: 404. Accept the transfer
   as its designated recipient; that document then opens. An undesignated user
   cannot accept, even if they are the receiving firm's administrator.
6. Revoke an accepted transfer as its owning administrator. A new content request
   fails. Existing signed storage URLs can remain valid until expiry (at most 60 s).
7. Try rejected/cancelled/revoked content and illegal repeat transitions: no new
   access or duplicate acceptance. A conflict is expected for repeated transitions.
8. Change view to download on the L3 view-only document: 403 DOWNLOAD_BLOCKED_L3.
9. Try pending quarantine content: 403. A renamed text file must never become clean.
10. Try member promotion and invitations as a lawyer or security member: 403.
    Admin assignments take effect on existing tokens because profiles are re-read.
11. Invite a synthetic local user as Security personnel. Acceptance is bound to
    that email and the invite's stored role/clearance. Client-supplied promotion,
    token reuse, expired links and revoked links must not work.
12. Open `/audit` and `/api/v1/audit/export` as an admin/lawyer: denied. Security
    can review its own firm's events only, including both sides' transfer history.
13. With a user's JWT, query Supabase audit_events directly: admins see no rows;
    security sees its firm only. Browser roles cannot insert/update/delete audit.
14. Correlate case creation, membership, invitations, content denials and transfer
    transitions with audit events. Unknown/cross-firm document probes intentionally
    return uniform 404 without an owning-firm document audit event.

## Automated verification

- `npm run typecheck`, `npm run lint`, `npm test`.
- `npm run security:verify`: creates fixtures then runs live permission checks.
- `node --env-file=.env.local --test scripts/workspace.integration.mjs`: original
  clearance/transfer tests and full audit export/archive checks; requires the local seed.
- `npx playwright test tests/e2e/security-workspace.spec.ts --workers=1`: case,
  upload, wizard send, recipient acceptance, sender revocation, invitations and
  security-only navigation. Generate fixtures first. Set
  `PLAYWRIGHT_CHROMIUM_CHANNEL=msedge` to use an installed Edge browser.
- `supabase test db`: row-level policies, immutable audit, transfer rollback,
  overlapping grants, retention and security-role separation.

These checks do not establish that all vulnerabilities are absent. Hosted
deployment configuration, distributed rate limits, mail delivery, signed URL
expiry over elapsed time, and broader input/security testing remain separate checks.
