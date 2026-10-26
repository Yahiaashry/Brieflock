-- BriefLock — core schema, constraints, indexes, RLS, and private storage.
-- Canonical source: CONTRACT.md §4, §6, §13.

create extension if not exists pgcrypto;
create extension if not exists citext;

create table public.firms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  slug citext not null unique check (slug::text ~ '^[a-z0-9-]{3,63}$'),
  settings jsonb not null default jsonb_build_object(
    'retention_days', 3650,
    'watermark_l1', false,
    'l3_view_only_default', false,
    'retention_mode', 'tombstone'
  ),
  plan text not null default 'trial' check (plan in ('trial', 'standard')),
  created_at timestamptz not null default now(),
  deactivated_at timestamptz
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  firm_id uuid not null references public.firms(id),
  email citext not null,
  full_name text not null check (char_length(full_name) between 1 and 200),
  role text not null check (role in ('firm_admin', 'lawyer', 'paralegal')),
  clearance_level int not null check (clearance_level in (1, 2, 3)),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  deactivated_at timestamptz
);
create unique index profiles_email_per_firm_uq on public.profiles (firm_id, email);
create index profiles_firm_idx on public.profiles (firm_id);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id),
  email citext not null,
  role text not null check (role in ('firm_admin', 'lawyer', 'paralegal')),
  clearance_level int not null check (clearance_level in (1, 2, 3)),
  token_hash text not null unique check (char_length(token_hash) = 64),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz
);
create index invites_firm_idx on public.invites (firm_id);
create index invites_expiry_idx on public.invites (expires_at)
  where accepted_at is null;

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id),
  title text not null check (char_length(title) between 1 and 300),
  case_reference text not null check (char_length(case_reference) between 1 and 100),
  default_security_level int not null check (default_security_level in (1, 2, 3)),
  status text not null default 'open' check (status in ('open', 'closed', 'archived')),
  allow_l3_download boolean not null default true,
  legal_hold boolean not null default false,
  retention_days int check (retention_days is null or retention_days > 0),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (firm_id, case_reference)
);
create index cases_firm_idx on public.cases (firm_id);
create index cases_firm_status_idx on public.cases (firm_id, status);

create table public.case_members (
  case_id uuid not null references public.cases(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  role text not null default 'member' check (role in ('lead', 'member', 'external')),
  added_by uuid references public.profiles(id),
  added_at timestamptz not null default now(),
  primary key (case_id, user_id)
);
create index case_members_user_idx on public.case_members (user_id);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id),
  firm_id uuid not null references public.firms(id),
  filename text not null check (char_length(filename) between 1 and 255),
  storage_path text not null unique,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 104857600),
  mime_type text not null default 'application/pdf' check (mime_type = 'application/pdf'),
  sha256 char(64) not null,
  security_level int not null check (security_level in (1, 2, 3)),
  scan_status text not null default 'pending'
    check (scan_status in ('pending', 'clean', 'infected', 'error')),
  scan_method text not null default 'magic-bytes-mvp',
  description text check (description is null or char_length(description) <= 2000),
  uploaded_by uuid not null references public.profiles(id),
  uploaded_at timestamptz not null default now(),
  superseded boolean not null default false,
  retention_marked_at timestamptz
);
create index documents_case_idx on public.documents (case_id);
create index documents_firm_level_idx on public.documents (firm_id, security_level);
create index documents_sha_idx on public.documents (sha256);
create index documents_retention_idx on public.documents (retention_marked_at)
  where retention_marked_at is not null and superseded = false;

create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id),
  from_firm_id uuid not null references public.firms(id),
  to_firm_id uuid not null references public.firms(id),
  created_by uuid not null references public.profiles(id),
  recipient_user_ids uuid[] not null
    check (array_length(recipient_user_ids, 1) between 1 and 10),
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'accepted', 'rejected', 'cancelled', 'revoked')),
  message text check (message is null or char_length(message) <= 1000),
  sent_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  check (to_firm_id <> from_firm_id)
);
create index transfers_case_idx on public.transfers (case_id);
create index transfers_status_idx on public.transfers (status);
create index transfers_recipients_idx on public.transfers using gin (recipient_user_ids);

create table public.transfer_items (
  transfer_id uuid not null references public.transfers(id) on delete cascade,
  document_id uuid not null references public.documents(id),
  primary key (transfer_id, document_id)
);
create index transfer_items_document_idx on public.transfer_items (document_id);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  chain_seq bigint generated always as identity unique,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid references public.profiles(id),
  firm_id uuid references public.firms(id),
  case_id uuid references public.cases(id),
  document_id uuid references public.documents(id),
  transfer_id uuid references public.transfers(id),
  action text not null check (action in (
    'auth.login_failed', 'member.added', 'member.removed', 'member.role_changed',
    'clearance.changed', 'case.created', 'case.updated', 'case.closed', 'case.archived',
    'document.uploaded', 'document.viewed', 'document.downloaded', 'document.access_denied',
    'document.level_raised', 'document.level_lowered', 'document.scan_failed',
    'document.purged', 'transfer.created', 'transfer.sent', 'transfer.accepted',
    'transfer.rejected', 'transfer.cancelled', 'transfer.revoked', 'firm.updated'
  )),
  result text not null check (result in ('allow', 'deny', 'info')),
  deny_reason text check (deny_reason in (
    'UNAUTHENTICATED', 'DEACTIVATED', 'FIRM_MISMATCH', 'NOT_CASE_MEMBER',
    'CLEARANCE_MISMATCH', 'UNSCANNED', 'INFECTED', 'CASE_ARCHIVED',
    'DOWNLOAD_BLOCKED_L3'
  )),
  ip_hash char(64),
  country text,
  city text,
  user_agent text check (user_agent is null or char_length(user_agent) <= 200),
  details jsonb not null default '{}'::jsonb,
  prev_hash char(64) not null,
  entry_hash char(64) not null unique,
  check (
    (result = 'deny' and deny_reason is not null)
    or (result <> 'deny' and deny_reason is null)
  )
);
create index audit_firm_time_idx on public.audit_events (firm_id, occurred_at desc);
create index audit_document_idx on public.audit_events (document_id);
create index audit_case_idx on public.audit_events (case_id);
create index audit_actor_idx on public.audit_events (actor_user_id);
create index audit_transfer_idx on public.audit_events (transfer_id);

-- Helper predicates (security definer so RLS policies never recurse).

create or replace function public.auth_firm_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select firm_id
  from public.profiles
  where id = (select auth.uid()) and is_active
  limit 1
$$;

create or replace function public.is_firm_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and is_active
      and role = 'firm_admin'
  )
$$;

create or replace function public.is_case_member(target_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.case_members cm
    join public.profiles p on p.id = cm.user_id
    where cm.case_id = target_case_id
      and cm.user_id = (select auth.uid())
      and p.is_active
  )
$$;

create or replace function public.can_see_document(target_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.documents d
    join public.profiles p
      on p.id = (select auth.uid())
      and p.is_active
      and p.clearance_level = d.security_level
    join public.cases c on c.id = d.case_id
    join public.case_members cm
      on cm.case_id = d.case_id
      and cm.user_id = p.id
    where d.id = target_document_id
      and (
        p.firm_id = d.firm_id
        or exists (
          select 1
          from public.transfers t
          join public.transfer_items ti on ti.transfer_id = t.id
          where t.status = 'accepted'
            and p.id = any (t.recipient_user_ids)
            and ti.document_id = d.id
        )
      )
  )
$$;

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
          and p.id = any (t.recipient_user_ids)
        )
      )
  )
$$;

-- RLS: reads only for client roles; every write is service-role only.

alter table public.firms enable row level security;
alter table public.profiles enable row level security;
alter table public.invites enable row level security;
alter table public.cases enable row level security;
alter table public.case_members enable row level security;
alter table public.documents enable row level security;
alter table public.transfers enable row level security;
alter table public.transfer_items enable row level security;
alter table public.audit_events enable row level security;

create policy firms_select on public.firms
  for select to authenticated
  using (id = public.auth_firm_id());

create policy profiles_select on public.profiles
  for select to authenticated
  using (firm_id = public.auth_firm_id());

create policy invites_select on public.invites
  for select to authenticated
  using (firm_id = public.auth_firm_id() and public.is_firm_admin());

create policy cases_select on public.cases
  for select to authenticated
  using (
    firm_id = public.auth_firm_id()
    and (public.is_case_member(id) or public.is_firm_admin())
  );

create policy case_members_select on public.case_members
  for select to authenticated
  using (
    exists (
      select 1
      from public.cases c
      where c.id = case_id
        and c.firm_id = public.auth_firm_id()
        and (public.is_case_member(c.id) or public.is_firm_admin())
    )
  );

create policy documents_select on public.documents
  for select to authenticated
  using (
    public.can_see_document(id)
    or (firm_id = public.auth_firm_id() and public.is_firm_admin())
  );

create policy transfers_select on public.transfers
  for select to authenticated
  using (public.can_see_transfer(id));

create policy transfer_items_select on public.transfer_items
  for select to authenticated
  using (public.can_see_transfer(transfer_id));

create policy audit_events_select on public.audit_events
  for select to authenticated
  using (
    firm_id is not null
    and firm_id = public.auth_firm_id()
    and public.is_firm_admin()
  );

revoke all on public.firms, public.profiles, public.invites, public.cases,
  public.case_members, public.documents, public.transfers, public.transfer_items,
  public.audit_events
  from anon, authenticated;

grant select on public.firms, public.profiles, public.invites, public.cases,
  public.case_members, public.documents, public.transfers, public.transfer_items,
  public.audit_events
  to authenticated;

grant all on public.firms, public.profiles, public.invites, public.cases,
  public.case_members, public.documents, public.transfers, public.transfer_items,
  public.audit_events
  to service_role;

grant usage, select on all sequences in schema public to service_role;

-- Private bucket. No client-role storage policies exist by design.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'case-documents',
  'case-documents',
  false,
  104857600,
  array['application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
