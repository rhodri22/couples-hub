-- ════════════════════════════════════════════════════════════════════════════
-- Couple's Hub — Web Push tables
-- Run this once in Supabase → SQL Editor (safe to re-run; everything uses
-- `if not exists`). Adds the three tables the background push pipeline needs.
-- ════════════════════════════════════════════════════════════════════════════

-- One row per device (Rhodri's iPhone, Becky's iPhone, the laptop, …).
create table if not exists push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  household_id text not null,
  person       text,                                   -- 'rhodri' | 'becky' | null
  endpoint     text unique not null,                   -- upsert key (one row per device)
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists push_subs_household_idx on push_subscriptions(household_id);

-- Idempotency ledger: guarantees each reminder is sent at most once even if the
-- sender runs on overlapping schedules.
create table if not exists push_log (
  id         uuid primary key default gen_random_uuid(),
  dedupe_key text unique not null,
  created_at timestamptz not null default now()
);

-- Partner-activity nudges ("Becky added an event"), drained by /api/send-push.
create table if not exists push_outbox (
  id            uuid primary key default gen_random_uuid(),
  household_id  text not null,
  target_person text,                                  -- who to notify; null = both
  title         text not null,
  body          text default '',
  url           text default '/',
  created_at    timestamptz not null default now(),
  sent_at       timestamptz
);
create index if not exists push_outbox_pending_idx on push_outbox(household_id) where sent_at is null;

-- Row Level Security — matches the app's existing open ("allow all") model, so
-- the anon key used by both the browser and the serverless sender keeps working.
do $$
declare t text;
begin
  foreach t in array array['push_subscriptions','push_log','push_outbox'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "allow all %s" on %I', t, t);
    execute format('create policy "allow all %s" on %I for all using (true) with check (true)', t, t);
  end loop;
end $$;

-- Refresh PostgREST's schema cache so the new tables are visible immediately.
notify pgrst, 'reload schema';
