begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(18);

select ok(
  not has_function_privilege('authenticated', 'public.apply_transfer_action(uuid,uuid,text,jsonb)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.finalize_document_scan(uuid,uuid,text,text,text,jsonb,jsonb)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.audit_chain_verify()', 'EXECUTE'),
  'privileged workflow functions are unavailable to browser roles'
);

select throws_ok(
  $$select public.apply_transfer_action('20000000-0000-4000-8000-000000000003',
    'ffffffff-ffff-4fff-8fff-ffffffffffff', 'accept',
    jsonb_build_object('userAgent', repeat('x', 201)))$$,
  '23514', null, 'an audit failure aborts transfer acceptance'
);
select is((select status from transfers where id = '20000000-0000-4000-8000-000000000003'),
  'sent', 'failed acceptance leaves the transfer sent');
select is((select count(*) from case_members where case_id = '10000000-0000-4000-8000-000000000002'
  and user_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'), 0::bigint,
  'failed acceptance grants no membership');
select is((public.apply_transfer_action('20000000-0000-4000-8000-000000000003',
  'ffffffff-ffff-4fff-8fff-ffffffffffff', 'accept', '{}')).status, 'accepted',
  'acceptance can be retried after rollback');
select is((select count(*) from audit_events where transfer_id = '20000000-0000-4000-8000-000000000003'
  and action = 'transfer.accepted'), 2::bigint, 'acceptance writes an audit event for both firms');
select throws_ok(
  $$select public.apply_transfer_action('20000000-0000-4000-8000-000000000003',
    'ffffffff-ffff-4fff-8fff-ffffffffffff', 'accept', '{}')$$,
  'PT409', null, 'a duplicate transition reports a conflict'
);

select is((public.apply_transfer_action('20000000-0000-4000-8000-000000000002',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'send', '{}')).status, 'sent',
  'the sender can send a valid draft');
select is((public.apply_transfer_action('20000000-0000-4000-8000-000000000002',
  'ffffffff-ffff-4fff-8fff-ffffffffffff', 'accept', '{}')).status, 'accepted',
  'overlapping transfer can be accepted');
select is((public.apply_transfer_action('20000000-0000-4000-8000-000000000004',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'revoke', '{}')).status, 'revoked',
  'owning admin can revoke the first grant');
select is((select count(*) from case_members where case_id = '10000000-0000-4000-8000-000000000001'
  and user_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'), 1::bigint,
  'revocation preserves a still-accepted grant');
select is((public.apply_transfer_action('20000000-0000-4000-8000-000000000002',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'revoke', '{}')).status, 'revoked',
  'owning admin can revoke the last grant');
select is((select count(*) from case_members where case_id = '10000000-0000-4000-8000-000000000001'
  and user_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'), 0::bigint,
  'revoking the last grant removes external membership');

select throws_ok(
  $$select public.finalize_document_scan('d0000000-0000-4000-8000-000000000005',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'clean', repeat('a', 64), 'test', '[]',
    jsonb_build_object('userAgent', repeat('x', 201)))$$,
  '23514', null, 'audit failure rolls back scan finalization'
);
select is((select scan_status from documents where id = 'd0000000-0000-4000-8000-000000000005'),
  'pending', 'file stays quarantined after finalization fails');
select is((public.finalize_document_scan('d0000000-0000-4000-8000-000000000005',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'clean', repeat('a', 64), 'test', '[]', '{}')).scan_status,
  'clean', 'valid scan can finalize after rollback');
select is((public.finalize_document_scan('d0000000-0000-4000-8000-000000000005',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'infected', repeat('b', 64), 'test', '[]', '{}')).sha256::text,
  repeat('a', 64), 'retry preserves the first committed scan verdict');
select is((select first_failure from public.audit_chain_summary()), null::bigint,
  'audit chain verifies after rollback and conflicting requests');

select * from finish();
rollback;
