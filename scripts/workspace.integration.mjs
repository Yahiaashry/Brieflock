import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";

function localOrigin(value, name) {
  const url = new URL(value);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), `${name} must be local`);
  return url.origin;
}

const app = localOrigin(process.env.NEXT_PUBLIC_APP_URL, "Application origin");
const supabase = localOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL, "Supabase origin");
const testPassword = "BriefLock!23";

async function signIn(email) {
  const client = createClient(supabase, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password: testPassword });
  assert.ifError(error);
  assert.ok(data.session);
  return { token: data.session.access_token, id: data.user.id };
}

async function request(actor, path, { method = "GET", body, status = 200 } = {}) {
  const response = await fetch(`${app}/api/v1${path}`, {
    method,
    headers: {
      authorization: `Bearer ${actor.token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.equal(response.status, status, `${method} ${path}`);
  return status === 204 ? undefined : response.json();
}

test("uploads, 3×3 clearance, and an accepted then revoked transfer", async () => {
  const [priya, marcus, elena, nadia] = await Promise.all([
    signIn("priya@hartwellroe.test"),
    signIn("marcus@hartwellroe.test"),
    signIn("elena@hartwellroe.test"),
    signIn("nadia@ashcroftvale.test"),
  ]);

  const reference = `CI-${randomUUID()}`;
  const matter = await request(marcus, "/cases", {
    method: "POST", status: 201,
    body: { title: "Clearance integration test", case_reference: reference, default_security_level: 1 },
  });
  for (const user of [priya, elena]) {
    await request(marcus, `/cases/${matter.id}/members`, {
      method: "POST", status: 201, body: { user_id: user.id, role: "member" },
    });
  }

  const pdf = await readFile(new URL("../public/sample/brieflock-sample.pdf", import.meta.url));
  const documents = [];
  for (const security_level of [1, 2, 3]) {
    const { document, upload } = await request(marcus, `/cases/${matter.id}/documents/upload-intent`, {
      method: "POST", status: 201,
      body: { filename: `level-${security_level}.pdf`, security_level, size_bytes: pdf.length },
    });
    const response = await fetch(upload.url, { method: upload.method, headers: upload.headers, body: pdf });
    assert.ok(response.ok, `Storage rejected L${security_level} upload`);
    const completed = await request(marcus, `/documents/${document.id}/complete`, { method: "POST" });
    assert.equal(completed.scan_status, "clean");
    documents.push(document.id);
  }

  for (const [actorIndex, actor] of [priya, marcus, elena].entries()) {
    for (const [docIndex, id] of documents.entries()) {
      const allowed = actorIndex === docIndex;
      const content = await request(actor, `/documents/${id}/content`, { status: allowed ? 200 : 403 });
      if (allowed) {
        assert.ok(content.ttl_seconds > 0 && content.ttl_seconds <= 60);
        assert.equal(content.watermark.required, docIndex > 0);
        assert.ok((await fetch(content.signed_url)).ok);
      } else {
        assert.equal(content.error.code, "ACCESS_DENIED");
        assert.equal(content.signed_url, undefined);
      }
    }
  }

  const levelTwo = documents[1];
  await request(nadia, `/documents/${levelTwo}/content`, { status: 404 });
  const transfer = await request(marcus, "/transfers", {
    method: "POST", status: 201,
    body: {
      case_id: matter.id, document_ids: [levelTwo],
      to_firm_id: "22222222-2222-4222-8222-222222222222",
      recipient_user_ids: [nadia.id],
    },
  });
  await request(nadia, `/transfers/${transfer.id}`, { status: 404 });
  await request(marcus, `/transfers/${transfer.id}/send`, { method: "POST" });
  await request(nadia, `/transfers/${transfer.id}/accept`, { method: "POST" });
  await request(nadia, `/documents/${levelTwo}/content`);
  await request(nadia, `/documents/${documents[0]}/content`, { status: 404 });
  await request(marcus, `/transfers/${transfer.id}/revoke`, { method: "POST" });
  await request(nadia, `/documents/${levelTwo}/content`, { status: 404 });

  const verifier = await request({ token: process.env.CRON_SECRET }, "/jobs/audit-verify");
  assert.equal(verifier.status, "ok");
  assert.ok(verifier.checked > 0);
});

test("an audit export includes every matching page and stays within its firm", async () => {
  const marcus = await signIn("security@hartwellroe.test");
  const admin = createClient(supabase, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const marker = randomUUID();
  const occurred_at = new Date().toISOString();
  const firmId = "11111111-1111-4111-8111-111111111111";
  const events = Array.from({ length: 1002 }, (_, index) => ({
    firm_id: index < 1001 ? firmId : "22222222-2222-4222-8222-222222222222",
    occurred_at,
    action: "firm.updated",
    result: "info",
    details: { marker, index },
  }));
  const { error } = await admin.from("audit_events").insert(events);
  assert.ifError(error);

  const params = new URLSearchParams({ from: occurred_at, to: occurred_at });
  const response = await fetch(`${app}/api/v1/audit/export?${params}`, {
    headers: { authorization: `Bearer ${marcus.token}` },
  });
  assert.equal(response.status, 200);
  const rows = (await response.text()).trim().split("\n")
    .map((line) => JSON.parse(line))
    .filter((row) => row.details.marker === marker);
  assert.equal(rows.length, 1001);
  assert.equal(new Set(rows.map((row) => row.details.index)).size, 1001);
  assert.ok(rows.every((row) => row.firm_id === firmId));

  const cron = { token: process.env.CRON_SECRET };
  const archiveJob = await request(cron, "/jobs/audit-export");
  assert.ok(archiveJob.archived >= 1002);
  const bucket = admin.storage.from("brieflock-audit-archive");
  const { data: objects, error: listError } = await bucket.list("chain");
  assert.ifError(listError);
  assert.ok(objects.length >= 3);
  const archived = [];
  for (const object of objects) {
    const { data: file, error: fileError } = await bucket.download(`chain/${object.name}`);
    assert.ifError(fileError);
    archived.push(...(await file.text()).trim().split("\n").map((line) => JSON.parse(line)));
  }
  assert.equal(archived.filter((row) => row.details.marker === marker).length, 1002);
  const outsider = createClient(supabase, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${marcus.token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: accessError } = await outsider.storage
    .from("brieflock-audit-archive")
    .download(`chain/${objects[0].name}`);
  assert.ok(accessError);
  assert.equal((await request(cron, "/jobs/audit-export")).archived, 0);
});
