-- Keep draft transfers private to the sending side until they are sent.
-- The API already excludes drafts from recipient lists; this closes the
-- matching direct-read path through PostgREST/RLS.

create or replace function public.can_see_transfer(target_transfer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.transfers t
    join public.profiles p
      on p.id = (select auth.uid())
      and p.is_active
    where t.id = target_transfer_id
      and (
        (
          p.firm_id = t.from_firm_id
          and (public.is_case_member(t.case_id) or p.role = 'firm_admin')
        )
        or (
          p.firm_id = t.to_firm_id
          and t.status <> 'draft'
          and p.id = any (t.recipient_user_ids)
        )
      )
  )
$$;
