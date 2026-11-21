alter table public.documents
  add column purge_claimed_at timestamptz;

create index documents_pending_purge_idx on public.documents (retention_marked_at, id)
  where retention_marked_at is not null and purged_at is null;

create function public.list_document_purge_candidates()
returns table (id uuid)
language sql stable
set search_path = public
as $$
  select d.id from public.documents d
  join public.cases c on c.id = d.case_id and not c.legal_hold
  join public.firms f on f.id = c.firm_id
  where d.purged_at is null and d.retention_marked_at is not null
    and (d.purge_claimed_at < now() - interval '15 minutes' or (
      d.purge_claimed_at is null
      and d.uploaded_at + make_interval(days => coalesce(
        c.retention_days, (f.settings->>'retention_days')::int
      )) < now()
    ))
  order by d.purge_claimed_at nulls last, d.retention_marked_at, d.id
  limit 50
$$;

-- The case row lock orders hold changes against storage purge claims.
create function public.reject_hold_during_purge()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1 from public.documents
    where case_id = new.id and purge_claimed_at is not null and purged_at is null
  ) then
    raise sqlstate 'PT409' using message = 'A retention purge is in progress for this case.';
  end if;
  return new;
end
$$;

create trigger reject_hold_during_purge
before update of legal_hold on public.cases
for each row when (new.legal_hold and not old.legal_hold)
execute function public.reject_hold_during_purge();

create function public.claim_document_purge(document_key uuid)
returns text
language plpgsql
set search_path = public
as $$
declare
  matter public.cases;
  object_path text;
begin
  select c.* into matter from public.cases c
  join public.documents d on d.case_id = c.id
  where d.id = document_key for update of c;
  if not found or matter.legal_hold then return null; end if;

  update public.documents d set purge_claimed_at = now()
  where d.id = document_key and d.purged_at is null and d.retention_marked_at is not null
    and (
      -- Resume an interrupted purge even if the retention period later changed.
      d.purge_claimed_at < now() - interval '15 minutes'
      or (
        d.purge_claimed_at is null
        and d.uploaded_at + make_interval(days => coalesce(
          matter.retention_days,
          (select (settings->>'retention_days')::int from public.firms where id = matter.firm_id)
        )) < now()
      )
    )
  returning d.storage_path into object_path;
  return object_path;
end
$$;

create function public.finish_document_purge(document_key uuid)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  purged public.documents;
begin
  update public.documents
  set superseded = true, purged_at = now()
  where id = document_key and purged_at is null and purge_claimed_at is not null
  returning * into purged;
  if not found then return false; end if;

  insert into public.audit_events (firm_id, case_id, document_id, action, result, details)
  values (
    purged.firm_id, purged.case_id, purged.id, 'document.purged', 'info',
    jsonb_build_object('reason', 'retention', 'retention_marked_at', purged.retention_marked_at)
  );
  return true;
end
$$;

revoke execute on function public.list_document_purge_candidates(), public.claim_document_purge(uuid), public.finish_document_purge(uuid)
  from public, anon, authenticated;
grant execute on function public.list_document_purge_candidates(), public.claim_document_purge(uuid), public.finish_document_purge(uuid)
  to service_role;
