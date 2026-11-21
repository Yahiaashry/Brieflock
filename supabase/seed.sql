-- BriefLock local/demo fixtures. Every password is: BriefLock!23
-- These users exist only in local development and disposable preview branches.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'authenticated', 'authenticated', 'marcus@hartwellroe.test',
   extensions.crypt('BriefLock!23', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Marcus Oyelaran"}'::jsonb, now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   'authenticated', 'authenticated', 'priya@hartwellroe.test',
   extensions.crypt('BriefLock!23', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Priya Raman"}'::jsonb, now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
   'authenticated', 'authenticated', 'elena@hartwellroe.test',
   extensions.crypt('BriefLock!23', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Elena Voss"}'::jsonb, now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
   'authenticated', 'authenticated', 'daniel@hartwellroe.test',
   extensions.crypt('BriefLock!23', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Daniel Achebe"}'::jsonb, now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
   'authenticated', 'authenticated', 'james@ashcroftvale.test',
   extensions.crypt('BriefLock!23', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"James Whitfield"}'::jsonb, now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'ffffffff-ffff-4fff-8fff-ffffffffffff',
   'authenticated', 'authenticated', 'nadia@ashcroftvale.test',
   extensions.crypt('BriefLock!23', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Nadia Haddad"}'::jsonb, now(), now(), '', '', '', '', '', '', '', '')
on conflict (id) do nothing;

insert into auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
select
  u.id::text,
  u.id,
  jsonb_build_object(
    'sub', u.id::text,
    'email', u.email,
    'email_verified', true
  ),
  'email',
  now(),
  now(),
  now()
from auth.users u
where u.id in (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'ffffffff-ffff-4fff-8fff-ffffffffffff'
)
on conflict (provider_id, provider) do nothing;

insert into public.firms (id, name, slug, settings, plan)
values
  ('11111111-1111-4111-8111-111111111111', 'Hartwell & Roe LLP', 'hartwell-roe',
   '{"retention_days":3650,"watermark_l1":false,"l3_view_only_default":false,"retention_mode":"tombstone"}'::jsonb,
   'standard'),
  ('22222222-2222-4222-8222-222222222222', 'Ashcroft & Vale', 'ashcroft-vale',
   '{"retention_days":2555,"watermark_l1":true,"l3_view_only_default":true,"retention_mode":"tombstone"}'::jsonb,
   'trial')
on conflict (id) do nothing;

insert into public.profiles (
  id, firm_id, email, full_name, role, clearance_level, is_active, created_at
)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111',
   'marcus@hartwellroe.test', 'Marcus Oyelaran', 'firm_admin', 2, true, now() - interval '400 days'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111',
   'priya@hartwellroe.test', 'Priya Raman', 'lawyer', 1, true, now() - interval '320 days'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111',
   'elena@hartwellroe.test', 'Elena Voss', 'lawyer', 3, true, now() - interval '280 days'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '11111111-1111-4111-8111-111111111111',
   'daniel@hartwellroe.test', 'Daniel Achebe', 'paralegal', 2, true, now() - interval '210 days'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '22222222-2222-4222-8222-222222222222',
   'james@ashcroftvale.test', 'James Whitfield', 'firm_admin', 2, true, now() - interval '500 days'),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', '22222222-2222-4222-8222-222222222222',
   'nadia@ashcroftvale.test', 'Nadia Haddad', 'lawyer', 2, true, now() - interval '260 days')
on conflict (id) do nothing;

insert into public.cases (
  id, firm_id, title, case_reference, default_security_level, status,
  allow_l3_download, legal_hold, retention_days, created_by, created_at, closed_at
)
values
  ('10000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'State v. Dolan', '2026-CR-0114', 2, 'open', true, false, null,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now() - interval '120 days', null),
  ('10000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   'Meridian Property Dispute', '2026-CV-0081', 1, 'open', true, false, 365,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now() - interval '90 days', null),
  ('10000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111',
   'Vantage Regulatory Inquiry', '2026-REG-0042', 3, 'open', false, true, null,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now() - interval '70 days', null),
  ('10000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111',
   'Coastline Lease Review', '2025-CV-0310', 1, 'closed', true, false, 1095,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now() - interval '300 days', now() - interval '40 days'),
  ('10000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111',
   'Halloran Estate', '2024-PR-0099', 2, 'archived', true, true, null,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now() - interval '420 days', now() - interval '120 days'),
  ('10000000-0000-4000-8000-000000000006', '22222222-2222-4222-8222-222222222222',
   'Ashcroft v. Meridian Holdings', '2026-COM-0177', 2, 'open', true, false, null,
   'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', now() - interval '65 days', null)
on conflict (id) do nothing;

insert into public.case_members (case_id, user_id, role, added_by, added_at)
values
  ('10000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'lead', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now() - interval '120 days'),
  ('10000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'member', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now() - interval '118 days'),
  ('10000000-0000-4000-8000-000000000001', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'member', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now() - interval '117 days'),
  ('10000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'lead', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now() - interval '90 days'),
  ('10000000-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'member', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now() - interval '89 days'),
  ('10000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'lead', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now() - interval '70 days'),
  ('10000000-0000-4000-8000-000000000003', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'member', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now() - interval '69 days'),
  ('10000000-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'lead', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now() - interval '300 days'),
  ('10000000-0000-4000-8000-000000000005', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'member', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now() - interval '420 days'),
  ('10000000-0000-4000-8000-000000000006', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'lead', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', now() - interval '65 days'),
  ('10000000-0000-4000-8000-000000000006', 'ffffffff-ffff-4fff-8fff-ffffffffffff', 'member', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', now() - interval '64 days'),
  ('10000000-0000-4000-8000-000000000006', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'external', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', now() - interval '22 days'),
  ('10000000-0000-4000-8000-000000000001', 'ffffffff-ffff-4fff-8fff-ffffffffffff', 'external', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now() - interval '33 days')
on conflict (case_id, user_id) do nothing;

insert into public.documents (
  id, case_id, firm_id, filename, storage_path, size_bytes, sha256,
  security_level, scan_status, scan_method, description, uploaded_by, uploaded_at, superseded
)
values
  ('d0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', 'engagement-letter.pdf',
   '11111111-1111-4111-8111-111111111111/10000000-0000-4000-8000-000000000001/d0000000-0000-4000-8000-000000000001/engagement-letter.pdf',
   18240, encode(extensions.digest('seed-engagement-letter', 'sha256'), 'hex'),
   2, 'clean', 'magic-bytes-mvp', 'Signed engagement letter.', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now() - interval '110 days', false),
  ('d0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', 'witness-statement.pdf',
   '11111111-1111-4111-8111-111111111111/10000000-0000-4000-8000-000000000001/d0000000-0000-4000-8000-000000000002/witness-statement.pdf',
   48213, encode(extensions.digest('seed-witness-statement', 'sha256'), 'hex'),
   2, 'clean', 'magic-bytes-mvp', 'Statement of Frances Iwu.', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now() - interval '104 days', false),
  ('d0000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', 'scene-memo.pdf',
   '11111111-1111-4111-8111-111111111111/10000000-0000-4000-8000-000000000001/d0000000-0000-4000-8000-000000000003/scene-memo.pdf',
   22109, encode(extensions.digest('seed-scene-memo', 'sha256'), 'hex'),
   1, 'clean', 'magic-bytes-mvp', 'Internal scene attendance memo.', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', now() - interval '96 days', false),
  ('d0000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', 'protected-witness.pdf',
   '11111111-1111-4111-8111-111111111111/10000000-0000-4000-8000-000000000001/d0000000-0000-4000-8000-000000000004/protected-witness.pdf',
   55290, encode(extensions.digest('seed-protected-witness', 'sha256'), 'hex'),
   3, 'clean', 'magic-bytes-mvp', 'Protected witness identity annex.', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', now() - interval '90 days', false),
  ('d0000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', 'sealed-exhibit.pdf',
   '11111111-1111-4111-8111-111111111111/10000000-0000-4000-8000-000000000001/d0000000-0000-4000-8000-000000000005/sealed-exhibit.pdf',
   73344, encode(extensions.digest('seed-sealed-exhibit', 'sha256'), 'hex'),
   3, 'pending', 'magic-bytes-mvp', 'Sealed exhibit awaiting scan.', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', now() - interval '88 days', false),
  ('d0000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002',
   '11111111-1111-4111-8111-111111111111', 'lease-agreement.pdf',
   '11111111-1111-4111-8111-111111111111/10000000-0000-4000-8000-000000000002/d0000000-0000-4000-8000-000000000006/lease-agreement.pdf',
   98802, encode(extensions.digest('seed-lease-agreement', 'sha256'), 'hex'),
   1, 'clean', 'magic-bytes-mvp', 'Executed lease and annexes.', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now() - interval '80 days', false),
  ('d0000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000003',
   '11111111-1111-4111-8111-111111111111', 'regulator-submission.pdf',
   '11111111-1111-4111-8111-111111111111/10000000-0000-4000-8000-000000000003/d0000000-0000-4000-8000-000000000007/regulator-submission.pdf',
   140112, encode(extensions.digest('seed-regulator-submission', 'sha256'), 'hex'),
   3, 'clean', 'magic-bytes-mvp', 'Confidential regulator submission.', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now() - interval '55 days', false),
  ('d0000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000006',
   '22222222-2222-4222-8222-222222222222', 'settlement-agreement.pdf',
   '22222222-2222-4222-8222-222222222222/10000000-0000-4000-8000-000000000006/d0000000-0000-4000-8000-000000000008/settlement-agreement.pdf',
   66120, encode(extensions.digest('seed-settlement-agreement', 'sha256'), 'hex'),
   2, 'clean', 'magic-bytes-mvp', 'Draft settlement agreement.', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', now() - interval '22 days', false),
  ('d0000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000006',
   '22222222-2222-4222-8222-222222222222', 'hearing-schedule.pdf',
   '22222222-2222-4222-8222-222222222222/10000000-0000-4000-8000-000000000006/d0000000-0000-4000-8000-000000000009/hearing-schedule.pdf',
   31200, encode(extensions.digest('seed-hearing-schedule', 'sha256'), 'hex'),
   2, 'clean', 'magic-bytes-mvp', 'Agreed hearing schedule.', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', now() - interval '20 days', false),
  ('d0000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000005',
   '11111111-1111-4111-8111-111111111111', 'estate-inventory.pdf',
   '11111111-1111-4111-8111-111111111111/10000000-0000-4000-8000-000000000005/d0000000-0000-4000-8000-00000000000a/estate-inventory.pdf',
   41210, encode(extensions.digest('seed-estate-inventory', 'sha256'), 'hex'),
   2, 'clean', 'magic-bytes-mvp', 'Archived estate inventory.', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', now() - interval '380 days', false)
on conflict (id) do nothing;

insert into public.transfers (
  id, case_id, from_firm_id, to_firm_id, created_by, recipient_user_ids,
  status, message, sent_at, responded_at, created_at
)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000006',
   '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
   'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
   array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']::uuid[],
   'accepted', 'Settlement agreement for your review.',
   now() - interval '23 days', now() - interval '22 days', now() - interval '24 days'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   array['ffffffff-ffff-4fff-8fff-ffffffffffff']::uuid[],
   'draft', 'Draft transfer pending final review.', null, null, now() - interval '3 days'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002',
   '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   array['ffffffff-ffff-4fff-8fff-ffffffffffff']::uuid[],
   'sent', 'Executed lease for the joint matter.', now() - interval '11 days', null, now() - interval '12 days'),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   array['ffffffff-ffff-4fff-8fff-ffffffffffff']::uuid[],
   'accepted', 'Witness statement for the parallel filing.',
   now() - interval '34 days', now() - interval '33 days', now() - interval '35 days'),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000002',
   '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   array['ffffffff-ffff-4fff-8fff-ffffffffffff']::uuid[],
   'rejected', 'Initial disclosure bundle.', now() - interval '48 days', now() - interval '47 days', now() - interval '49 days')
on conflict (id) do nothing;

insert into public.transfer_items (transfer_id, document_id)
values
  ('20000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000008'),
  ('20000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000002'),
  ('20000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000006'),
  ('20000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000002'),
  ('20000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000006')
on conflict do nothing;

-- Hash chain fills prev_hash/entry_hash via trg_audit_chain.
insert into public.audit_events (
  occurred_at, actor_user_id, firm_id, case_id, document_id, transfer_id,
  action, result, deny_reason, country, city, user_agent, details
)
values
  (now() - interval '120 days', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111', '10000000-0000-4000-8000-000000000001',
   null, null, 'case.created', 'allow', null, 'GB', 'London', 'Seed fixture',
   '{"title":"State v. Dolan"}'::jsonb),
  (now() - interval '110 days', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111', '10000000-0000-4000-8000-000000000001',
   'd0000000-0000-4000-8000-000000000001', null, 'document.uploaded', 'allow', null,
   'GB', 'London', 'Seed fixture', '{"scan_status":"clean"}'::jsonb),
  (now() - interval '104 days', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111', '10000000-0000-4000-8000-000000000001',
   'd0000000-0000-4000-8000-000000000002', null, 'document.uploaded', 'allow', null,
   'GB', 'London', 'Seed fixture', '{"scan_status":"clean"}'::jsonb),
  (now() - interval '35 days', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111', '10000000-0000-4000-8000-000000000001',
   null, '20000000-0000-4000-8000-000000000004', 'transfer.created', 'info', null,
   'GB', 'London', 'Seed fixture', '{"items":1}'::jsonb),
  (now() - interval '34 days', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111', '10000000-0000-4000-8000-000000000001',
   null, '20000000-0000-4000-8000-000000000004', 'transfer.sent', 'allow', null,
   'GB', 'London', 'Seed fixture', '{"status":"sent"}'::jsonb),
  (now() - interval '33 days', 'ffffffff-ffff-4fff-8fff-ffffffffffff',
   '11111111-1111-4111-8111-111111111111', '10000000-0000-4000-8000-000000000001',
   null, '20000000-0000-4000-8000-000000000004', 'transfer.accepted', 'allow', null,
   'GB', 'London', 'Seed fixture', '{"status":"accepted"}'::jsonb),
  (now() - interval '22 days', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111', '10000000-0000-4000-8000-000000000006',
   'd0000000-0000-4000-8000-000000000008', null, 'document.viewed', 'allow', null,
   'GB', 'London', 'Seed fixture', '{"disposition":"view"}'::jsonb),
  (now() - interval '18 days', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111', '10000000-0000-4000-8000-000000000001',
   'd0000000-0000-4000-8000-000000000004', null, 'document.access_denied', 'deny',
   'CLEARANCE_MISMATCH', 'GB', 'London', 'Seed fixture', '{"disposition":"view"}'::jsonb),
  (now() - interval '12 days', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111', '10000000-0000-4000-8000-000000000002',
   null, '20000000-0000-4000-8000-000000000003', 'transfer.created', 'info', null,
   'GB', 'London', 'Seed fixture', '{"items":1}'::jsonb),
  (now() - interval '11 days', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111', '10000000-0000-4000-8000-000000000002',
   null, '20000000-0000-4000-8000-000000000003', 'transfer.sent', 'allow', null,
   'GB', 'London', 'Seed fixture', '{"status":"sent"}'::jsonb),
  (now() - interval '2 days', null, null, null, null, null,
   'auth.login_failed', 'info', null, null, null, 'Seed fixture', '{}'::jsonb);


-- Dedicated security reviewer for local integration tests. No admin/content bypass.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
) values (
  '00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999999999',
  'authenticated', 'authenticated', 'security@hartwellroe.test',
  extensions.crypt('BriefLock!23', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Security Reviewer (synthetic)"}'::jsonb,
  now(), now(), '', '', '', '', '', '', '', ''
) on conflict (id) do nothing;
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select id::text, id, jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users where id = '99999999-9999-4999-8999-999999999999'
on conflict (provider_id, provider) do nothing;
insert into public.profiles (id, firm_id, email, full_name, role, clearance_level)
values ('99999999-9999-4999-8999-999999999999', '11111111-1111-4111-8111-111111111111',
  'security@hartwellroe.test', 'Security Reviewer (synthetic)', 'security', 2)
on conflict (id) do nothing;
