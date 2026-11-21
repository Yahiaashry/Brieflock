-- Preserve atomic transitions and audit the receiving firm as well as the sender.
create or replace function public.apply_transfer_action(
  transfer_key uuid, actor_key uuid, requested_action text, audit_context jsonb
)
returns public.transfers
language plpgsql
set search_path = public
as $$
declare
  actor public.profiles;
  current_transfer public.transfers;
  matter public.cases;
  previous_status text;
  expected_status text;
  next_status text;
  event_action text;
  is_sender boolean;
  is_recipient boolean;
begin
  select * into actor from public.profiles where id = actor_key and is_active;
  if not found then raise sqlstate 'PT403' using message = 'Inactive actor'; end if;

  -- Lock the case before the transfer. All transitions for the same case
  -- share this lock so one revocation cannot remove another grant.
  select c.* into matter from public.cases c
  join public.transfers t on t.case_id = c.id
  where t.id = transfer_key for update of c;
  if not found then raise sqlstate 'PT404' using message = 'Transfer not found'; end if;

  select * into current_transfer from public.transfers where id = transfer_key for update;
  if not found then raise sqlstate 'PT404' using message = 'Transfer not found'; end if;
  is_sender := actor.firm_id = current_transfer.from_firm_id;
  is_recipient := actor.firm_id = current_transfer.to_firm_id
    and actor.id = any(current_transfer.recipient_user_ids)
    and current_transfer.status <> 'draft';
  if not is_recipient and not (is_sender and (
    actor.role = 'firm_admin' or exists (
      select 1 from public.case_members where case_id = matter.id and user_id = actor.id
        and role <> 'external'
    )
  )) then
    raise sqlstate 'PT404' using message = 'Transfer not found';
  end if;

  case requested_action
    when 'send' then
      expected_status := 'draft'; next_status := 'sent'; event_action := 'transfer.sent';
    when 'accept' then
      expected_status := 'sent'; next_status := 'accepted'; event_action := 'transfer.accepted';
    when 'reject' then
      expected_status := 'sent'; next_status := 'rejected'; event_action := 'transfer.rejected';
    when 'cancel' then
      expected_status := 'sent'; next_status := 'cancelled'; event_action := 'transfer.cancelled';
    when 'revoke' then
      expected_status := 'accepted'; next_status := 'revoked'; event_action := 'transfer.revoked';
    else raise sqlstate 'PT404' using message = 'Transfer action not found';
  end case;

  if requested_action in ('accept', 'reject') then
    if not is_recipient then raise sqlstate 'PT403' using message = 'Recipient required'; end if;
  elsif requested_action = 'revoke' then
    if not is_sender or actor.role <> 'firm_admin' then
      raise sqlstate 'PT403' using message = 'Owning firm admin required';
    end if;
  elsif not is_sender or not exists (
    select 1 from public.case_members
    where case_id = matter.id and user_id = actor.id and role <> 'external'
  ) then
    raise sqlstate 'PT403' using message = 'Owning firm case membership required';
  end if;

  if current_transfer.status <> expected_status then
    raise sqlstate 'PT409' using message = 'Transfer status changed';
  end if;
  -- Cancellation, rejection and revocation reduce access even on an archived case.
  if matter.status = 'archived' and requested_action in ('send', 'accept') then
    raise sqlstate 'PT422' using message = 'Case archived';
  end if;
  if requested_action = 'send' and (
    not exists (select 1 from public.transfer_items where transfer_id = transfer_key)
    or exists (
      select 1 from public.transfer_items i
      join public.documents d on d.id = i.document_id
      where i.transfer_id = transfer_key
        and (d.case_id <> matter.id or d.firm_id <> actor.firm_id or
             d.superseded or d.scan_status <> 'clean' or d.retention_marked_at is not null
             or d.security_level <> actor.clearance_level)
    )
    or exists (
      select 1 from unnest(current_transfer.recipient_user_ids) as recipient(id)
      where not exists (
        select 1 from public.profiles p
        where p.id = recipient.id and p.firm_id = current_transfer.to_firm_id and p.is_active
      )
    )
  ) then
    raise sqlstate 'PT409' using message = 'The draft documents or recipients are no longer available';
  end if;

  previous_status := current_transfer.status;
  update public.transfers set status = next_status where id = transfer_key
  returning * into current_transfer;

  if requested_action = 'accept' then
    insert into public.case_members (case_id, user_id, role, added_by)
    select matter.id, p.id, 'external', actor.id
    from public.profiles p
    where p.id = any(current_transfer.recipient_user_ids)
      and p.firm_id = current_transfer.to_firm_id and p.is_active
    on conflict (case_id, user_id) do nothing;
  elsif requested_action = 'revoke' then
    delete from public.case_members m
    where m.case_id = matter.id and m.role = 'external'
      and m.user_id = any(current_transfer.recipient_user_ids)
      and not exists (
        select 1 from public.transfers t
        where t.case_id = matter.id and t.status = 'accepted'
          and m.user_id = any(t.recipient_user_ids)
      );
  end if;

  insert into public.audit_events (
    actor_user_id, firm_id, case_id, transfer_id, action, result,
    ip_hash, country, city, user_agent, details
  ) values (
    actor.id, current_transfer.from_firm_id, matter.id, transfer_key, event_action, 'allow',
    audit_context->>'ipHash', audit_context->>'country', audit_context->>'city',
    audit_context->>'userAgent',
    jsonb_build_object('from_status', previous_status, 'to_status', next_status)
  );
  -- Both firms need their own immutable transfer history. Drafts remain private.
  insert into public.audit_events (
    actor_user_id, firm_id, case_id, transfer_id, action, result,
    ip_hash, country, city, user_agent, details
  ) values (
    actor.id, current_transfer.to_firm_id, matter.id, transfer_key, event_action, 'allow',
    audit_context->>'ipHash', audit_context->>'country', audit_context->>'city',
    audit_context->>'userAgent',
    jsonb_build_object('from_status', previous_status, 'to_status', next_status)
  );
  return current_transfer;
end
$$;
