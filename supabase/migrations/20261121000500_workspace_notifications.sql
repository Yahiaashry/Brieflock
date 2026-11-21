create table public.workspace_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  topic text not null check (topic in ('sent', 'accepted', 'rejected', 'revoked', 'denials')),
  reference_id uuid not null,
  dedupe_key text not null unique,
  next_attempt_at timestamptz not null default now(),
  attempts integer not null default 0,
  delivered_at timestamptz
);
alter table public.workspace_notifications enable row level security;
revoke all on public.workspace_notifications from anon, authenticated;
grant select, insert, update on public.workspace_notifications to service_role;
create index workspace_notifications_pending_idx on public.workspace_notifications (next_attempt_at)
  where delivered_at is null and attempts < 5;

create function public.queue_transfer_notice()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.workspace_notifications (recipient_id, topic, reference_id, dedupe_key)
  select recipient, new.status, new.id, new.id || ':' || new.status || ':' || recipient
  from unnest(case when new.status = 'sent' then new.recipient_user_ids
    else array[new.created_by] end) recipient
  on conflict (dedupe_key) do nothing;
  return new;
end
$$;

create trigger queue_transfer_notice after update of status on public.transfers
for each row when (new.status is distinct from old.status and new.status in ('sent', 'accepted', 'rejected', 'revoked'))
execute function public.queue_transfer_notice();

create function public.queue_denial_notices(actor_key uuid, firm_key uuid)
returns void
language sql
set search_path = public
as $$
  with threshold as (
    select count(*) >= 5 as reached from (
      select 1 from public.audit_events
      where actor_user_id = actor_key and firm_id = firm_key
        and action = 'document.access_denied' and occurred_at >= now() - interval '15 minutes'
      limit 5
    ) recent
  )
  insert into public.workspace_notifications (recipient_id, topic, reference_id, dedupe_key)
  select p.id, 'denials', actor_key,
    actor_key || ':denials:' || p.id || ':' || floor(extract(epoch from now()) / 900)
  from public.profiles p cross join threshold
  where p.firm_id = firm_key and p.role = 'firm_admin' and p.is_active and threshold.reached
  on conflict (dedupe_key) do nothing
$$;

create function public.claim_workspace_notices()
returns table (id uuid, topic text, reference_id uuid, attempts integer, email text)
language sql
set search_path = public
as $$
  with picked as (
    select n.id from public.workspace_notifications n
    where n.delivered_at is null and n.attempts < 5 and n.next_attempt_at <= now()
    order by n.next_attempt_at, n.id limit 10 for update skip locked
  ), claimed as (
    update public.workspace_notifications n set attempts = n.attempts + 1,
      next_attempt_at = now() + interval '15 minutes'
    from picked where n.id = picked.id
    returning n.*
  )
  select n.id, n.topic, n.reference_id, n.attempts, p.email::text
  from claimed n left join public.profiles p on p.id = n.recipient_id and p.is_active
$$;

revoke execute on function public.queue_denial_notices(uuid, uuid), public.claim_workspace_notices()
  from public, anon, authenticated;
grant execute on function public.queue_denial_notices(uuid, uuid), public.claim_workspace_notices()
  to service_role;
