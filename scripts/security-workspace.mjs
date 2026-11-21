// Local-only synthetic workspace. Never bootstrap users against hosted Supabase.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

function localOrigin(value, label) {
  const url = new URL(value);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), `${label} must be local`);
  return url.origin;
}
const app = localOrigin(process.env.NEXT_PUBLIC_APP_URL, "BriefLock");
const backend = localOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL, "Supabase");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(backend, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const password = "BurpLocal!2026";
const output = new URL("../security-fixtures/", import.meta.url);
const pdf = await readFile(new URL("../public/sample/brieflock-sample.pdf", import.meta.url));
const checks = [];
const firms = {
  alpha: { id: "33333333-3333-4333-8333-333333333333", name: "BURP Alpha Legal (synthetic)", slug: "burp-alpha-test" },
  beta: { id: "44444444-4444-4444-8444-444444444444", name: "BURP Beta Legal (synthetic)", slug: "burp-beta-test" },
};
const specifications = [
  ["sender", "alpha", "firm_admin", 2],
  ["security", "alpha", "security", 2],
  ["level1", "alpha", "lawyer", 1],
  ["level2", "alpha", "lawyer", 2],
  ["level3", "alpha", "lawyer", 3],
  ["nonmember", "alpha", "paralegal", 2],
  ["receiverAdmin", "beta", "firm_admin", 2],
  ["receiverSecurity", "beta", "security", 2],
  ["receiver", "beta", "lawyer", 2],
  ["otherRecipient", "beta", "paralegal", 2],
];
const actors = {};
async function api(actor, path, { method = "GET", body, status = 200, text = false } = {}) {
  const response = await fetch(`${app}/api/v1${path}`, {
    method,
    headers: {
      ...(actor ? { authorization: `Bearer ${actor.token}` } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const raw = await response.text();
  assert.equal(response.status, status, `${method} ${path}: ${raw.slice(0, 250)}`);
  return text ? raw : raw ? JSON.parse(raw) : null;
}
async function signIn(email) {
  const client = createClient(backend, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, options);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  assert.ifError(error);
  return { id: data.user.id, token: data.session.access_token, email };
}
async function checked(name, fn) {
  await fn();
  checks.push(name);
  console.log(`PASS ${name}`);
}

// Only these two reserved synthetic firms and named .test users are provisioned.
for (const firm of Object.values(firms)) {
  const existing = await admin.from("firms").select("slug").eq("id", firm.id).maybeSingle();
  assert.ifError(existing.error);
  assert.ok(!existing.data || existing.data.slug === firm.slug, "Reserved fixture ID belongs to another firm; refusing to overwrite it");
  const { error } = await admin.from("firms").upsert(firm, { onConflict: "id" });
  assert.ifError(error);
}
const knownUsers = [];
for (let page = 1; ; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
  assert.ifError(error);
  knownUsers.push(...data.users);
  if (data.users.length < 100) break;
}
for (const [key, firmKey, role, level] of specifications) {
  const email = `${key.toLowerCase()}@burp-${firmKey}.test`;
  let user = knownUsers.find((item) => item.email === email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(error);
    user = data.user;
  }
  const profile = {
    id: user.id, firm_id: firms[firmKey].id, email,
    full_name: `BURP ${key} (test)`, role, clearance_level: level, is_active: true,
  };
  const { error } = await admin.from("profiles").upsert(profile, { onConflict: "id" });
  assert.ifError(error);
  actors[key] = { ...await signIn(email), ...profile };
}

async function matter(actor, reference) {
  const { data, error } = await admin.from("cases").select("*")
    .eq("firm_id", actor.firm_id).eq("case_reference", reference).maybeSingle();
  assert.ifError(error);
  return data ?? api(actor, "/cases", { method: "POST", status: 201, body: {
    title: `${reference} - synthetic Burp security testing`,
    case_reference: reference, default_security_level: 1,
  } });
}
async function member(actor, caseId, user) {
  const { data, error } = await admin.from("case_members").select("user_id")
    .eq("case_id", caseId).eq("user_id", user.id).maybeSingle();
  assert.ifError(error);
  if (!data) await api(actor, `/cases/${caseId}/members`, {
    method: "POST", status: 201, body: { user_id: user.id, role: "member" },
  });
}
async function document(actor, caseId, filename, level, complete = true) {
  const { data, error } = await admin.from("documents").select("*")
    .eq("case_id", caseId).eq("filename", filename).maybeSingle();
  assert.ifError(error);
  if (data) return data;
  const { document: created, upload } = await api(actor, `/cases/${caseId}/documents/upload-intent`, {
    method: "POST", status: 201,
    body: { filename, size_bytes: pdf.length, security_level: level,
      description: "SYNTHETIC TEST DATA. No real clients. Used for Burp authorization checks." },
  });
  if (!complete) return created;
  assert.equal(new URL(upload.url).origin, backend, "Upload must stay on local Supabase");
  const response = await fetch(upload.url, { method: upload.method, headers: upload.headers, body: pdf });
  assert.ok(response.ok, `Storage upload failed: ${response.status}`);
  const completed = await api(actor, `/documents/${created.id}/complete`, { method: "POST" });
  assert.equal(completed.scan_status, "clean");
  return completed;
}
const alphaCase = await matter(actors.sender, "BURP-ALPHA-001");
const betaCase = await matter(actors.receiverAdmin, "BURP-BETA-001");
for (const key of ["level1", "level2", "level3"]) await member(actors.sender, alphaCase.id, actors[key]);
await member(actors.receiverAdmin, betaCase.id, actors.receiver);
const documents = {};
for (const level of [1, 2, 3]) {
  documents[`level${level}`] = await document(actors.sender, alphaCase.id, `BURP-L${level}-synthetic.pdf`, level);
}
documents.pending = await document(actors.sender, alphaCase.id, "BURP-pending-quarantine.pdf", 2, false);
const lockedCase = await matter(actors.level3, "BURP-L3-VIEW-ONLY");
await api(actors.sender, `/cases/${lockedCase.id}`, { method: "PATCH", body: { allow_l3_download: false } });
documents.viewOnly = await document(actors.level3, lockedCase.id, "BURP-L3-view-only.pdf", 3);

const transfers = {};
for (const state of ["draft", "sent", "accepted", "rejected", "cancelled", "revoked"]) {
  const doc = await document(actors.sender, alphaCase.id, `BURP-transfer-${state}.pdf`, 2);
  const message = `BURP fixture ${state}`;
  const { data: existing, error } = await admin.from("transfers").select("*")
    .eq("case_id", alphaCase.id).eq("message", message).maybeSingle();
  assert.ifError(error);
  let transfer = existing ?? await api(actors.sender, "/transfers", {
    method: "POST", status: 201, body: {
      case_id: alphaCase.id, to_firm_id: firms.beta.id,
      recipient_user_ids: [actors.receiver.id], document_ids: [doc.id], message,
    },
  });
  if (!existing) {
    const steps = {
      draft: [], sent: ["send"], accepted: ["send", "accept"],
      rejected: ["send", "reject"], cancelled: ["send", "cancel"], revoked: ["send", "accept", "revoke"],
    }[state];
    for (const action of steps) transfer = await api(
      ["accept", "reject"].includes(action) ? actors.receiver : actors.sender,
      `/transfers/${transfer.id}/${action}`, { method: "POST" },
    );
  }
  transfers[state] = { id: transfer.id, status: transfer.status, document_id: doc.id };
}
const reverseDoc = await document(actors.receiverAdmin, betaCase.id, "BURP-return-to-alpha.pdf", 2);
const reverseMessage = "BURP fixture reverse sent";
const { data: reverseExisting, error: reverseError } = await admin.from("transfers").select("*")
  .eq("case_id", betaCase.id).eq("message", reverseMessage).maybeSingle();
assert.ifError(reverseError);
let reverse = reverseExisting ?? await api(actors.receiverAdmin, "/transfers", {
  method: "POST", status: 201, body: { case_id: betaCase.id, to_firm_id: firms.alpha.id,
    recipient_user_ids: [actors.level2.id], document_ids: [reverseDoc.id], message: reverseMessage },
});
if (!reverseExisting) reverse = await api(actors.receiverAdmin, `/transfers/${reverse.id}/send`, { method: "POST" });
transfers.reverse = { id: reverse.id, status: reverse.status, document_id: reverseDoc.id };

await mkdir(output, { recursive: true });
for (const level of [1, 2, 3]) await writeFile(new URL(`BURP-L${level}-synthetic.pdf`, output), pdf);
await writeFile(new URL("not-a-pdf.pdf", output), "Synthetic invalid PDF: plain text, no active content.\n");
const manifest = {
  generated_at: new Date().toISOString(), app, backend, password,
  accounts: Object.fromEntries(Object.entries(actors).map(([key, actor]) => [key, {
    id: actor.id, email: actor.email, role: actor.role, clearance_level: actor.clearance_level, firm_id: actor.firm_id,
  }])), firms, cases: { alpha: alphaCase.id, beta: betaCase.id, viewOnly: lockedCase.id },
  documents: Object.fromEntries(Object.entries(documents).map(([key, doc]) => [key, { id: doc.id, filename: doc.filename }])),
  transfers,
};
await writeFile(new URL("fixtures.json", output), JSON.stringify(manifest, null, 2));
const host = new URL(app).host;
const backendHost = new URL(backend).host;
function rawRequest(method, path, token, body) {
  return `${method} ${path} HTTP/1.1\nHost: ${host}\n${token ? `Authorization: Bearer <${token}>\n` : ""}${body ? "Content-Type: application/json\n" : ""}\n${body ? JSON.stringify(body, null, 2) : ""}`;
}
const requests = [
  `### Obtain a local test token; replace the public anon-key placeholder. Copy access_token from the response.\nPOST /auth/v1/token?grant_type=password HTTP/1.1\nHost: ${backendHost}\napikey: <LOCAL_SUPABASE_ANON_KEY>\nContent-Type: application/json\n\n${JSON.stringify({ email: actors.sender.email, password }, null, 2)}`,
  ["Unauthenticated cases: expect 401", rawRequest("GET", "/api/v1/cases")],
  ["Sender outgoing transfers: expect 200", rawRequest("GET", "/api/v1/transfers?direction=outgoing", "SENDER_TOKEN")],
  ["Receiver incoming transfers: expect 200; no drafts", rawRequest("GET", "/api/v1/transfers?direction=incoming", "RECEIVER_TOKEN")],
  ["Receiver draft probe: expect 404", rawRequest("GET", `/api/v1/transfers/${transfers.draft.id}`, "RECEIVER_TOKEN")],
  ["Pending transfer content: expect 404", rawRequest("GET", `/api/v1/documents/${transfers.sent.document_id}/content`, "RECEIVER_TOKEN")],
  ["Accepted transfer content: expect 200", rawRequest("GET", `/api/v1/documents/${transfers.accepted.document_id}/content`, "RECEIVER_TOKEN")],
  ["Revoked transfer content: expect 404", rawRequest("GET", `/api/v1/documents/${transfers.revoked.document_id}/content`, "RECEIVER_TOKEN")],
  ["Clearance matrix: use L1/L2/L3 tokens with each document ID from fixtures.json", rawRequest("GET", `/api/v1/documents/${documents.level2.id}/content`, "LEVEL2_TOKEN")],
  ["Pending quarantine: expect 403", rawRequest("GET", `/api/v1/documents/${documents.pending.id}/content`, "SENDER_TOKEN")],
  ["L3 view-only download: expect 403 DOWNLOAD_BLOCKED_L3", rawRequest("GET", `/api/v1/documents/${documents.viewOnly.id}/content?disposition=download`, "LEVEL3_TOKEN")],
  ["Admin audit access: expect 403", rawRequest("GET", "/api/v1/audit", "SENDER_TOKEN")],
  ["Security audit access: expect 200; Alpha firm only", rawRequest("GET", "/api/v1/audit", "SECURITY_TOKEN")],
  ["Security export: expect 200", rawRequest("GET", "/api/v1/audit/export", "SECURITY_TOKEN")],
  ["Lawyer privilege escalation: expect 403", rawRequest("PATCH", `/api/v1/firms/members/${actors.level2.id}`, "LEVEL2_TOKEN", { role: "firm_admin" })],
  ["Invalid upload metadata: expect 422", rawRequest("POST", `/api/v1/cases/${alphaCase.id}/documents/upload-intent`, "SENDER_TOKEN", { filename: "../test.pdf", security_level: 4, size_bytes: -1 })],
].map((item) => Array.isArray(item) ? `### ${item[0]}\n${item[1]}` : item).join("\n\n");
await writeFile(new URL("requests.http", output), `${requests}\n`);
console.log("Local Burp fixtures ready: security-fixtures/fixtures.json (no session tokens stored)");

if (process.argv.includes("--verify")) {
  await checked("unauthenticated API requests are denied", () => api(null, "/cases", { status: 401 }));
  await checked("all nine exact-clearance combinations", async () => {
    for (const level of [1, 2, 3]) for (const docLevel of [1, 2, 3]) {
      const result = await api(actors[`level${level}`], `/documents/${documents[`level${docLevel}`].id}/content`, {
        status: level === docLevel ? 200 : 403,
      });
      if (level === docLevel) {
        assert.ok(result.ttl_seconds > 0 && result.ttl_seconds <= 60);
        assert.ok((await fetch(result.signed_url)).ok);
      } else assert.equal(result.signed_url, undefined);
    }
  });
  await checked("same-firm nonmember and cross-firm content denied", async () => {
    await api(actors.nonmember, `/documents/${documents.level2.id}/content`, { status: 403 });
    await api(actors.otherRecipient, `/documents/${documents.level2.id}/content`, { status: 404 });
  });
  await checked("security role has no content or member-management bypass", async () => {
    await api(actors.security, `/documents/${documents.level2.id}/content`, { status: 403 });
    await api(actors.security, `/firms/members/${actors.level1.id}`, { method: "PATCH", body: { role: "firm_admin" }, status: 403 });
    await api(actors.security, "/firms/invites", { method: "POST", body: {}, status: 403 });
  });
  await checked("pending content and view-only download are denied", async () => {
    await api(actors.sender, `/documents/${documents.pending.id}/content`, { status: 403 });
    await api(actors.level3, `/documents/${documents.viewOnly.id}/content`);
    const result = await api(actors.level3, `/documents/${documents.viewOnly.id}/content?disposition=download`, { status: 403 });
    assert.equal(result.error.code, "DOWNLOAD_BLOCKED_L3");
    await api(actors.sender, "/transfers", { method: "POST", status: 422, body: {
      case_id: alphaCase.id, to_firm_id: firms.beta.id, recipient_user_ids: [actors.receiver.id], document_ids: [documents.pending.id],
    } });
  });
  await checked("sender and recipient lists, draft privacy, and designation", async () => {
    const incoming = await api(actors.receiver, "/transfers?direction=incoming");
    const outgoing = await api(actors.sender, "/transfers?direction=outgoing");
    assert.ok(incoming.data.some((item) => item.id === transfers.sent.id));
    assert.ok(outgoing.data.some((item) => item.id === transfers.draft.id));
    assert.ok(!incoming.data.some((item) => item.id === transfers.draft.id));
    await api(actors.receiver, `/transfers/${transfers.draft.id}`, { status: 404 });
    await api(actors.otherRecipient, `/transfers/${transfers.sent.id}/accept`, { method: "POST", status: 404 });
    await api(actors.receiver, `/documents/${transfers.sent.document_id}/content`, { status: 404 });
    await api(actors.receiver, `/documents/${transfers.accepted.document_id}/content`);
    await api(actors.receiver, `/documents/${transfers.revoked.document_id}/content`, { status: 404 });
  });
  await checked("only security can read/export audit; each firm's history stays isolated", async () => {
    for (const key of ["sender", "level1", "level2", "nonmember", "receiverAdmin"]) {
      await api(actors[key], "/audit", { status: 403 });
      await api(actors[key], "/audit/export", { status: 403 });
    }
    for (const key of ["security", "receiverSecurity"]) {
      const actor = actors[key];
      const result = await api(actor, `/audit?transfer_id=${transfers.accepted.id}`);
      assert.ok(result.data.some((event) => event.action === "transfer.accepted"));
      assert.ok(result.data.every((event) => event.firm_id === actor.firm_id));
      const rows = (await api(actor, "/audit/export", { text: true })).trim().split("\n").filter(Boolean).map(JSON.parse);
      assert.ok(rows.length > 0 && rows.every((row) => row.firm_id === actor.firm_id));
    }
  });
  await checked("case membership and member privilege changes are enforced and audited", async () => {
    await api(actors.level2, `/cases/${alphaCase.id}/members`, { method: "POST", status: 403,
      body: { user_id: actors.nonmember.id, role: "member" } });
    await api(actors.sender, `/cases/${alphaCase.id}/members`, { method: "POST", status: 422,
      body: { user_id: actors.receiver.id, role: "member" } });
    await api(actors.level2, `/firms/members/${actors.level2.id}`, { method: "PATCH", status: 403,
      body: { role: "firm_admin" } });
    await api(actors.sender, `/firms/members/${actors.level2.id}`, { method: "PATCH", body: { clearance_level: 1 } });
    await api(actors.level2, `/documents/${documents.level2.id}/content`, { status: 403 });
    await api(actors.sender, `/firms/members/${actors.level2.id}`, { method: "PATCH", body: { clearance_level: 2 } });
    await api(actors.sender, `/firms/members/${actors.nonmember.id}`, { method: "PATCH", body: { is_active: false } });
    await api(actors.nonmember, "/cases", { status: 403 });
    await api(actors.sender, `/firms/members/${actors.nonmember.id}`, { method: "PATCH", body: { is_active: true } });
    const events = await api(actors.security, "/audit?action=clearance.changed");
    assert.ok(events.data.some((event) => event.details.user_id === actors.level2.id));
  });
  await checked("invitations bind identity, role and clearance; reuse/revocation fail", async () => {
    const email = `invited-${randomUUID()}@burp-alpha.test`;
    const { data: user, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(error);
    const invite = await api(actors.sender, "/firms/invites", { method: "POST", status: 201,
      body: { email, role: "security", clearance_level: 1 } });
    const token = invite.invite_token ?? new URL(invite.invite_url).searchParams.get("token");
    const body = { invite_token: token, full_name: "BURP invited security member", role: "firm_admin", clearance_level: 3 };
    await api(actors.otherRecipient, "/invites/accept", { method: "POST", status: 403, body });
    const newcomer = await signIn(email);
    const joined = await api(newcomer, "/invites/accept", { method: "POST", status: 201, body });
    assert.equal(joined.id, user.user.id);
    assert.equal(joined.role, "security");
    assert.equal(joined.clearance_level, 1);
    await api(newcomer, "/invites/accept", { method: "POST", status: 404, body });
    await api(newcomer, "/audit");
    const revoked = await api(actors.sender, "/firms/invites", { method: "POST", status: 201,
      body: { email, role: "lawyer", clearance_level: 2 } });
    await api(actors.sender, `/firms/invites/${revoked.invite.id}`, { method: "DELETE", status: 204 });
    await api(newcomer, "/invites/accept", { method: "POST", status: 404,
      body: { invite_token: revoked.invite_token ?? new URL(revoked.invite_url).searchParams.get("token"), full_name: "BURP test" } });
    const expired = await api(actors.sender, "/firms/invites", { method: "POST", status: 201,
      body: { email, role: "lawyer", clearance_level: 2 } });
    const expiration = await admin.from("invites").update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", expired.invite.id);
    assert.ifError(expiration.error);
    await api(newcomer, "/invites/accept", { method: "POST", status: 404,
      body: { invite_token: expired.invite_token ?? new URL(expired.invite_url).searchParams.get("token"), full_name: "BURP test" } });
  });
  await checked("direct database audit policy denies admins and scopes security", async () => {
    for (const key of ["sender", "security", "receiverSecurity"]) {
      const actor = actors[key];
      const client = createClient(backend, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        ...options, global: { headers: { authorization: `Bearer ${actor.token}` } },
      });
      const { data, error } = await client.from("audit_events").select("firm_id").limit(100);
      assert.ifError(error);
      if (key === "sender") assert.equal(data.length, 0);
      else assert.ok(data.length > 0 && data.every((event) => event.firm_id === actor.firm_id));
      const attempt = await client.from("audit_events").insert({ firm_id: actor.firm_id, action: "firm.updated", result: "info" });
      assert.ok(attempt.error, "Browser role must not insert audit events");
    }
    const { data, error } = await admin.rpc("audit_chain_summary");
    assert.ifError(error);
    assert.equal(data[0].first_failure, null);
  });
  await writeFile(new URL("verification.json", output), JSON.stringify({ completed_at: new Date().toISOString(), checks }, null, 2));
  console.log(`${checks.length} security workflow checks passed. Fixtures remain available for Burp.`);
}
