insert into storage.buckets (id, name, public)
values ('brieflock-audit-archive', 'brieflock-audit-archive', false);

create table public.audit_archive_progress (
  singleton boolean primary key default true check (singleton),
  exported_through bigint not null default 0,
  pending_through bigint,
  pending_count integer,
  check (
    (pending_through is null and pending_count is null)
    or (pending_through is not null and pending_through > exported_through
        and pending_count is not null and pending_count between 1 and 500)
  )
);

alter table public.audit_archive_progress enable row level security;
revoke all on public.audit_archive_progress from public, anon, authenticated, service_role;
insert into public.audit_archive_progress default values;

create function public.claim_audit_archive_batch()
returns table (after_seq bigint, through_seq bigint, row_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  progress public.audit_archive_progress;
begin
  select * into strict progress from public.audit_archive_progress
  where singleton for update;

  if progress.pending_through is null then
    select max(batch.chain_seq), count(*)::integer
    into progress.pending_through, progress.pending_count
    from (
      select e.chain_seq from public.audit_events e
      where e.chain_seq > progress.exported_through
      order by e.chain_seq
      limit 500
    ) batch;

    if progress.pending_count = 0 then return; end if;

    update public.audit_archive_progress
    set pending_through = progress.pending_through, pending_count = progress.pending_count
    where singleton;
  end if;

  return query select progress.exported_through, progress.pending_through, progress.pending_count;
end;
$$;

create function public.finish_audit_archive_batch(batch_end bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  progress public.audit_archive_progress;
begin
  select * into strict progress from public.audit_archive_progress
  where singleton for update;

  if progress.exported_through >= batch_end then return true; end if;
  if progress.pending_through is distinct from batch_end then return false; end if;

  update public.audit_archive_progress
  set exported_through = batch_end, pending_through = null, pending_count = null
  where singleton;
  return true;
end;
$$;

revoke execute on function public.claim_audit_archive_batch(),
  public.finish_audit_archive_batch(bigint) from public, anon, authenticated;
grant execute on function public.claim_audit_archive_batch(),
  public.finish_audit_archive_batch(bigint) to service_role;
