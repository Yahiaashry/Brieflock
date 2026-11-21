-- Keep the audit position and predecessor under the same transaction lock.
-- Preserve historical row numbers and hashes.
alter table public.audit_events alter column chain_seq drop identity;
create index audit_firm_chain_idx on public.audit_events (firm_id, chain_seq desc);

create or replace function public.trg_audit_chain()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  previous_position bigint;
  previous_hash char(64);
begin
  perform pg_advisory_xact_lock(hashtext('brieflock:audit_chain'));
  select chain_seq, entry_hash into previous_position, previous_hash
  from public.audit_events order by chain_seq desc limit 1;

  new.chain_seq := coalesce(previous_position, 0) + 1;
  new.prev_hash := coalesce(previous_hash, repeat('0', 64));
  new.entry_hash := encode(
    digest(new.prev_hash || public.audit_canonical_json(new), 'sha256'), 'hex'
  );
  return new;
end
$$;

create function public.audit_chain_summary()
returns table (checked bigint, first_failure bigint)
language sql stable
set search_path = public
as $$
  select count(*), min(chain_seq) filter (where not ok)
  from public.audit_chain_verify()
$$;

create function public.apply_transfer_action(
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
  return current_transfer;
end
$$;

create function public.finalize_document_scan(
  document_key uuid, actor_key uuid, verdict text, checksum text,
  method text, findings jsonb, audit_context jsonb
)
returns public.documents
language plpgsql
set search_path = public
as $$
declare
  uploaded public.documents;
  actor public.profiles;
  matter public.cases;
begin
  select * into actor from public.profiles where id = actor_key and is_active;
  if not found then raise sqlstate 'PT403' using message = 'Inactive actor'; end if;

  select c.* into matter from public.cases c
  join public.documents d on d.case_id = c.id
  where d.id = document_key and d.uploaded_by = actor.id and d.firm_id = actor.firm_id
  for share of c;
  if not found then raise sqlstate 'PT404' using message = 'Document not found'; end if;

  select * into uploaded from public.documents
  where id = document_key and uploaded_by = actor.id and firm_id = actor.firm_id for update;
  if not found then raise sqlstate 'PT404' using message = 'Document not found'; end if;
  if not exists (
    select 1 from public.case_members where case_id = matter.id and user_id = actor.id
      and role <> 'external'
  ) then raise sqlstate 'PT403' using message = 'Case membership required'; end if;
  if uploaded.scan_status <> 'pending' then return uploaded; end if;
  if matter.status = 'archived' then raise sqlstate 'PT422' using message = 'Case archived'; end if;
  if verdict is null or verdict not in ('clean', 'infected', 'error')
     or checksum is null or checksum !~ '^[0-9a-f]{64}$' then
    raise sqlstate 'PT422' using message = 'Invalid scan result';
  end if;

  update public.documents set sha256 = checksum, scan_status = verdict, scan_method = method
  where id = document_key returning * into uploaded;

  insert into public.audit_events (
    actor_user_id, firm_id, case_id, document_id, action, result,
    ip_hash, country, city, user_agent, details
  ) values (
    actor.id, uploaded.firm_id, uploaded.case_id, uploaded.id, 'document.uploaded',
    case when verdict = 'clean' then 'allow' else 'info' end,
    audit_context->>'ipHash', audit_context->>'country', audit_context->>'city',
    audit_context->>'userAgent', jsonb_build_object(
      'size_bytes', uploaded.size_bytes, 'sha256', checksum, 'scan_status', verdict
    )
  );

  if verdict <> 'clean' then
    insert into public.audit_events (
      actor_user_id, firm_id, case_id, document_id, action, result, deny_reason,
      ip_hash, country, city, user_agent, details
    ) values (
      actor.id, uploaded.firm_id, uploaded.case_id, uploaded.id, 'document.scan_failed', 'deny',
      case when verdict = 'infected' then 'INFECTED' else 'UNSCANNED' end,
      audit_context->>'ipHash', audit_context->>'country', audit_context->>'city',
      audit_context->>'userAgent', jsonb_build_object('method', method, 'findings', findings)
    );
  end if;
  return uploaded;
end
$$;

revoke execute on function public.audit_chain_verify(),
  public.audit_chain_summary(), public.apply_transfer_action(uuid, uuid, text, jsonb),
  public.finalize_document_scan(uuid, uuid, text, text, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.audit_chain_verify(),
  public.audit_chain_summary(), public.apply_transfer_action(uuid, uuid, text, jsonb),
  public.finalize_document_scan(uuid, uuid, text, text, text, jsonb, jsonb)
  to service_role;
