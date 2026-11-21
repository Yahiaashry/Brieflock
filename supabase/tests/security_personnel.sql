begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(10);

-- Transaction-scoped role changes on existing local fixtures; rolled back below.
update profiles set role = 'security' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
insert into audit_events (firm_id, action, result, details) values
 ('11111111-1111-4111-8111-111111111111', 'firm.updated', 'info', '{"test":"security-policy"}'),
 ('22222222-2222-4222-8222-222222222222', 'firm.updated', 'info', '{"test":"security-policy"}');

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select is((select count(*) from audit_events), 0::bigint, 'firm admin has no direct audit access');
select ok(not public.is_security_personnel(), 'admin does not inherit security privileges');

set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';
select ok(public.is_security_personnel(), 'active security member is recognized');
select is((select count(*) from audit_events where details->>'test' = 'security-policy'), 1::bigint,
 'security can read its own firm event');
select is((select count(*) from audit_events where firm_id = '22222222-2222-4222-8222-222222222222'),
 0::bigint, 'security cannot read another firm audit');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'UPDATE'),
 'security cannot promote itself through the browser database role');
select ok(not has_table_privilege('authenticated', 'public.audit_events', 'INSERT'),
 'security cannot forge audit entries');
select ok(not has_table_privilege('authenticated', 'public.audit_events', 'UPDATE')
 and not has_table_privilege('authenticated', 'public.audit_events', 'DELETE'),
 'security cannot alter or erase audit history');

reset role;
update profiles set is_active = false where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';
select ok(not public.is_security_personnel(), 'deactivated security loses privileges immediately');
select is((select count(*) from audit_events), 0::bigint, 'deactivated security cannot read audit');
reset role;
select * from finish();
rollback;
