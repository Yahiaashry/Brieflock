begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(15);

insert into audit_events (action, result)
select 'firm.updated', 'info' from generate_series(1, 1050);
select ok((select checked > 1000 and first_failure is null from audit_chain_summary()),
  'the summary includes the full chain past the HTTP row cap');

create temporary table first_archive_batch as select * from claim_audit_archive_batch();
select is((select row_count from first_archive_batch), 500, 'archive claims a bounded batch');
select is((select through_seq from claim_audit_archive_batch()),
  (select through_seq from first_archive_batch), 'retry resumes the same unconfirmed batch');
select ok(not finish_audit_archive_batch((select through_seq + 1 from first_archive_batch)),
  'the checkpoint rejects an unclaimed batch end');
select ok(finish_audit_archive_batch((select through_seq from first_archive_batch)),
  'a successful upload advances the archive checkpoint');
select ok(finish_audit_archive_batch((select through_seq from first_archive_batch)),
  'confirming the same batch twice is safe');
select is((select after_seq from claim_audit_archive_batch()),
  (select through_seq from first_archive_batch), 'the next batch starts at the confirmed checkpoint');

alter table audit_events disable trigger trg_audit_immutable;
update audit_events set details = '{"changed":true}'
where chain_seq = (select max(chain_seq) from audit_events);
alter table audit_events enable trigger trg_audit_immutable;
select is((select first_failure from audit_chain_summary()),
  (select max(chain_seq) from audit_events), 'tampering after row 1000 is detected');

update documents set uploaded_at = now() - interval '20 years', retention_marked_at = now()
where id in ('d0000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-000000000007');
select is(claim_document_purge('d0000000-0000-4000-8000-000000000007'), null::text,
  'the retention job cannot claim a case with a legal hold');
select ok(claim_document_purge('d0000000-0000-4000-8000-000000000006') is not null,
  'the job can claim a due document with no legal hold');
select is(claim_document_purge('d0000000-0000-4000-8000-000000000006'), null::text,
  'a second worker cannot claim an in-flight document');
select throws_ok(
  $$update cases set legal_hold = true where id = '10000000-0000-4000-8000-000000000002'$$,
  'PT409', null, 'a legal hold cannot silently race a storage deletion'
);
select ok(finish_document_purge('d0000000-0000-4000-8000-000000000006'),
  'a claimed deletion can finalize');
select ok(not finish_document_purge('d0000000-0000-4000-8000-000000000006'),
  'duplicate finalization is idempotent');
select is((select count(*) from audit_events where action = 'document.purged'
  and document_id = 'd0000000-0000-4000-8000-000000000006'), 1::bigint,
  'the tombstone writes exactly one purge audit event');

select * from finish();
rollback;
