-- BriefLock — pg_cron schedules for pure-SQL maintenance.
-- App-driven jobs (purge, alerts, verify, export) live under /api/v1/jobs/*.

create extension if not exists pg_cron;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'brieflock-invite-expiry';
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  select jobid into existing_job from cron.job where jobname = 'brieflock-retention-mark';
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end
$$;

select cron.schedule(
  'brieflock-invite-expiry',
  '0 * * * *',
  $$select public.invite_expiry_sweep();$$
);

select cron.schedule(
  'brieflock-retention-mark',
  '* * * * *',
  $$select public.retention_mark();$$
);
