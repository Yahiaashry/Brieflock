begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(8);

set local role authenticated;
set local request.jwt.claims = '{"sub":"ffffffff-ffff-4fff-8fff-ffffffffffff","role":"authenticated"}';
select is((select count(*) from firms where id = '11111111-1111-4111-8111-111111111111'), 0::bigint,
  'receiving lawyer cannot enumerate the other firm');
select is((select count(*) from cases where id = '10000000-0000-4000-8000-000000000004'), 0::bigint,
  'unshared cross-firm case is invisible');
select is((select count(*) from transfers where id = '20000000-0000-4000-8000-000000000002'), 0::bigint,
  'designated recipient cannot see a draft transfer');
select is((select count(*) from transfer_items where transfer_id = '20000000-0000-4000-8000-000000000002'), 0::bigint,
  'items do not expose the hidden draft');
select is((select count(*) from audit_events), 0::bigint,
  'lawyer cannot read audit records through the database');

set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';
select is((select count(*) from documents where id = 'd0000000-0000-4000-8000-000000000003'), 1::bigint,
  'assigned L1 lawyer sees an L1 document');
select is((select count(*) from documents where id = 'd0000000-0000-4000-8000-000000000004'), 0::bigint,
  'assignment alone cannot expose an L3 document to the L1 lawyer');
select is((select count(*) from documents where id = 'd0000000-0000-4000-8000-000000000008'), 0::bigint,
  'unshared cross-firm document remains invisible');

reset role;
select * from finish();
rollback;
