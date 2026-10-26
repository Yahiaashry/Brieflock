alter table public.documents
  add column if not exists purged_at timestamptz;
