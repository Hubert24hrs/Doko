-- Ezike Oba :: Foundation 006
-- Durable rate limiting.
--
-- An in-process counter is useless on Vercel: every cold start resets it and
-- concurrent lambdas never share state. The counter lives in Postgres so the
-- limit actually holds across instances.

create table if not exists public.rate_limit_counters (
  bucket_key    text not null,
  window_start  timestamptz not null,
  request_count integer not null default 0,
  updated_at    timestamptz not null default now(),

  primary key (bucket_key, window_start),
  constraint rate_limit_count_non_negative check (request_count >= 0)
);

create index if not exists rate_limit_counters_window_idx
  on public.rate_limit_counters (window_start);

alter table public.rate_limit_counters enable row level security;

-- No policies at all: the table is unreachable through PostgREST. The only
-- way in is consume_rate_limit(), which is SECURITY DEFINER.

-- ---------------------------------------------------------------------------
-- Atomically consume one unit from a fixed window.
--
-- Returns the post-increment count and whether the caller is still allowed.
-- The INSERT .. ON CONFLICT DO UPDATE is a single statement, so concurrent
-- callers cannot both read a stale count and under-count.
-- ---------------------------------------------------------------------------

create or replace function public.consume_rate_limit(
  p_bucket_key text,
  p_limit      integer,
  p_window_ms  bigint
)
returns table (allowed boolean, current_count integer, window_start timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  if p_limit <= 0 or p_window_ms <= 0 then
    raise exception 'consume_rate_limit: limit and window must be positive';
  end if;

  -- Floor "now" to the start of the current fixed window.
  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / (p_window_ms / 1000.0))
    * (p_window_ms / 1000.0)
  );

  insert into public.rate_limit_counters as c (bucket_key, window_start, request_count)
  values (p_bucket_key, v_window_start, 1)
  on conflict (bucket_key, window_start) do update
    set request_count = c.request_count + 1,
        updated_at = now()
  returning c.request_count into v_count;

  return query select (v_count <= p_limit), v_count, v_window_start;
end;
$fn$;

revoke all on function public.consume_rate_limit(text, integer, bigint) from public;
grant execute on function public.consume_rate_limit(text, integer, bigint) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Housekeeping. Call from a scheduled job (pg_cron) once that is configured;
-- until then it can be run manually. Rows are tiny, so this is not urgent.
-- ---------------------------------------------------------------------------

create or replace function public.prune_rate_limit_counters(p_older_than interval default interval '1 day')
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_deleted integer;
begin
  delete from public.rate_limit_counters
   where window_start < now() - p_older_than;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$fn$;

revoke all on function public.prune_rate_limit_counters(interval) from public, anon, authenticated;
