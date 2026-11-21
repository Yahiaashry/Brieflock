create function public.workspace_counts(actor_key uuid)
returns table (
  open_cases bigint, visible_documents bigint,
  pending_scans bigint, incoming_transfers bigint
)
language sql stable
set search_path = public
as $$
  with actor as (
    select id, firm_id, role, clearance_level
    from public.profiles where id = actor_key and is_active
  ), memberships as (
    select m.case_id from public.case_members m join actor a on a.id = m.user_id
  ), document_counts as (
    select count(*) as visible, count(*) filter (where d.scan_status = 'pending') as pending
    from public.documents d cross join actor a
    where d.superseded = false and (
      (d.firm_id = a.firm_id and a.role = 'firm_admin')
      or (
        d.security_level = a.clearance_level
        and exists (select 1 from memberships m where m.case_id = d.case_id)
        and (
          d.firm_id = a.firm_id
          or exists (
            select 1 from public.transfer_items i
            join public.transfers t on t.id = i.transfer_id
            where i.document_id = d.id and t.case_id = d.case_id
              and t.to_firm_id = a.firm_id and t.status = 'accepted'
              and a.id = any(t.recipient_user_ids)
          )
        )
      )
    )
  )
  select
    (select count(*) from memberships m join public.cases c on c.id = m.case_id where c.status = 'open'),
    dc.visible,
    dc.pending,
    (select count(*) from public.transfers t cross join actor a
     where t.to_firm_id = a.firm_id and t.status = 'sent' and a.id = any(t.recipient_user_ids))
  from document_counts dc
  where exists (select 1 from actor)
$$;

revoke execute on function public.workspace_counts(uuid) from public, anon, authenticated;
grant execute on function public.workspace_counts(uuid) to service_role;
