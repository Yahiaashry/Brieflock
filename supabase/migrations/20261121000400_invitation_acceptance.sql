create function public.accept_firm_invitation(
  invite_hash text, actor_key uuid, actor_email text, member_name text, audit_context jsonb
)
returns public.profiles
language plpgsql
set search_path = public
as $$
declare
  invitation public.invites;
  member public.profiles;
begin
  select * into invitation from public.invites
  where token_hash = invite_hash and accepted_at is null and expires_at > now()
  for update;
  if not found then raise sqlstate 'PT404' using message = 'Invitation not found'; end if;
  if actor_email is null or lower(actor_email) <> lower(invitation.email) then
    raise sqlstate 'PT403' using message = 'Invitation does not belong to this account';
  end if;
  if exists (select 1 from public.profiles where id = actor_key) then
    raise sqlstate 'PT409' using message = 'A profile already exists for this account.';
  end if;

  insert into public.profiles (id, firm_id, email, full_name, role, clearance_level)
  values (actor_key, invitation.firm_id, lower(actor_email), member_name,
    invitation.role, invitation.clearance_level) returning * into member;

  update public.invites set accepted_at = now() where id = invitation.id;
  insert into public.audit_events (
    actor_user_id, firm_id, action, result, ip_hash, country, city, user_agent, details
  ) values (
    member.id, member.firm_id, 'member.added', 'allow',
    audit_context->>'ipHash', audit_context->>'country', audit_context->>'city',
    audit_context->>'userAgent', jsonb_build_object(
      'scope', 'firm', 'invite_id', invitation.id, 'role', member.role,
      'clearance_level', member.clearance_level
    )
  );
  return member;
end
$$;

revoke execute on function public.accept_firm_invitation(text, uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.accept_firm_invitation(text, uuid, text, text, jsonb)
  to service_role;
revoke update, delete, truncate on public.audit_events from service_role;
