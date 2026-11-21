-- Security review is separate from firm administration. Existing admins keep
-- member management, but must appoint a security member for audit access.
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('firm_admin', 'security', 'lawyer', 'paralegal'));
alter table public.invites drop constraint invites_role_check;
alter table public.invites add constraint invites_role_check
  check (role in ('firm_admin', 'security', 'lawyer', 'paralegal'));

create function public.is_security_personnel()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and is_active and role = 'security'
  )
$$;
revoke execute on function public.is_security_personnel() from public, anon;
grant execute on function public.is_security_personnel() to authenticated, service_role;

drop policy audit_events_select on public.audit_events;
create policy audit_events_select on public.audit_events for select to authenticated
using (firm_id is not null and firm_id = public.auth_firm_id() and public.is_security_personnel());

-- Repeated-denial alerts contain security information and go only to active
-- security personnel, including when a previously queued alert is delivered.
create or replace function public.queue_denial_notices(actor_key uuid, firm_key uuid)
returns void language sql set search_path = public
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
  where p.firm_id = firm_key and p.role = 'security' and p.is_active and threshold.reached
  on conflict (dedupe_key) do nothing
$$;

create or replace function public.claim_workspace_notices()
returns table (id uuid, topic text, reference_id uuid, attempts integer, email text)
language sql set search_path = public
as $$
  with picked as (
    select n.id from public.workspace_notifications n
    where n.delivered_at is null and n.attempts < 5 and n.next_attempt_at <= now()
    order by n.next_attempt_at, n.id limit 10 for update skip locked
  ), claimed as (
    update public.workspace_notifications n set attempts = n.attempts + 1,
      next_attempt_at = now() + interval '15 minutes'
    from picked where n.id = picked.id returning n.*
  )
  select n.id, n.topic, n.reference_id, n.attempts, p.email::text
  from claimed n left join public.profiles p on p.id = n.recipient_id and p.is_active
    and (n.topic <> 'denials' or p.role = 'security')
$$;
