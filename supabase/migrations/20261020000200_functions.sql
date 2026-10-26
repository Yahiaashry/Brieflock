-- BriefLock — audit hash chain, immutability guard, transfer state guard,
-- audit verification, and retention helpers.

-- Deterministic canonical form. Timestamps are emitted as explicit UTC
-- microsecond ISO-8601 strings so the chain never depends on session TimeZone.
create or replace function public.audit_canonical_json(e public.audit_events)
returns text
language sql
stable
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'id', e.id,
    'chain_seq', e.chain_seq,
    'occurred_at', to_char(
      e.occurred_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'actor_user_id', e.actor_user_id,
    'firm_id', e.firm_id,
    'case_id', e.case_id,
    'document_id', e.document_id,
    'transfer_id', e.transfer_id,
    'action', e.action,
    'result', e.result,
    'deny_reason', e.deny_reason,
    'ip_hash', e.ip_hash,
    'country', e.country,
    'city', e.city,
    'user_agent', e.user_agent,
    'details', coalesce(e.details, '{}'::jsonb)
  )::text
$$;

create or replace function public.trg_audit_chain()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_prev char(64);
begin
  perform pg_advisory_xact_lock(hashtext('brieflock:audit_chain'));

  select a.entry_hash
    into v_prev
    from public.audit_events a
   order by a.chain_seq desc
   limit 1;

  new.prev_hash := coalesce(v_prev, repeat('0', 64));
  new.entry_hash := encode(
    digest(new.prev_hash || public.audit_canonical_json(new), 'sha256'),
    'hex'
  );
  return new;
end
$$;

create trigger trg_audit_chain
  before insert on public.audit_events
  for each row execute function public.trg_audit_chain();

create or replace function public.trg_audit_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_events is append-only'
    using errcode = '42501';
end
$$;

create trigger trg_audit_immutable
  before update or delete on public.audit_events
  for each row execute function public.trg_audit_immutable();

create or replace function public.audit_chain_verify()
returns table (chain_seq bigint, ok boolean)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with walk as (
    select
      a.chain_seq,
      a.prev_hash,
      a.entry_hash,
      encode(
        digest(a.prev_hash || public.audit_canonical_json(a), 'sha256'),
        'hex'
      ) as recomputed,
      lag(a.entry_hash) over (order by a.chain_seq) as expected_prev,
      row_number() over (order by a.chain_seq) as expected_seq
    from public.audit_events a
  )
  select
    walk.chain_seq,
    (
      walk.chain_seq = walk.expected_seq
      and walk.recomputed = walk.entry_hash
      and (
        (walk.expected_prev is null and walk.chain_seq = 1
          and walk.prev_hash = repeat('0', 64))
        or (walk.expected_prev is not null and walk.expected_prev = walk.prev_hash)
      )
    ) as ok
  from walk
  order by walk.chain_seq
$$;

create or replace function public.trg_transfer_guard()
returns trigger
language plpgsql
as $$
begin
  if new.case_id is distinct from old.case_id
     or new.from_firm_id is distinct from old.from_firm_id
     or new.to_firm_id is distinct from old.to_firm_id
     or new.created_by is distinct from old.created_by then
    raise exception 'immutable transfer fields'
      using errcode = '23514';
  end if;

  if old.status <> 'draft'
     and new.recipient_user_ids is distinct from old.recipient_user_ids then
    raise exception 'recipient list is immutable after send'
      using errcode = '23514';
  end if;

  if new.status is distinct from old.status
     and (old.status, new.status) not in (
       ('draft', 'sent'),
       ('sent', 'accepted'),
       ('sent', 'rejected'),
       ('sent', 'cancelled'),
       ('accepted', 'revoked')
     ) then
    raise exception 'illegal transfer transition % -> %', old.status, new.status
      using errcode = '23514';
  end if;

  if new.status = 'sent' and new.sent_at is null then
    new.sent_at := now();
  end if;

  if new.status in ('accepted', 'rejected') and new.responded_at is null then
    new.responded_at := now();
  end if;

  return new;
end
$$;

create trigger trg_transfer_guard
  before update on public.transfers
  for each row execute function public.trg_transfer_guard();

-- Pure-SQL retention marking. The app job performs object deletion and audit.
create or replace function public.retention_mark()
returns bigint
language sql
security definer
set search_path = public, extensions
as $$
  with candidates as (
    update public.documents d
       set retention_marked_at = now()
      from public.cases c
      join public.firms f on f.id = c.firm_id
     where d.case_id = c.id
       and d.superseded = false
       and d.retention_marked_at is null
       and c.legal_hold = false
       and d.uploaded_at
           + make_interval(days => coalesce(c.retention_days, (f.settings->>'retention_days')::int))
           < now()
    returning d.id
  )
  select count(*)::bigint from candidates
$$;

create or replace function public.invite_expiry_sweep()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  removed bigint;
begin
  delete from public.invites
   where accepted_at is null
     and expires_at < now();
  get diagnostics removed = row_count;
  return removed;
end
$$;
