-- ── TASKS ──
create table if not exists tasks (
  id               uuid primary key default gen_random_uuid(),
  household_id     text not null,
  title            text not null,
  category         text not null default 'home',
  assigned_to      text not null default 'both',
  status           text not null default 'todo',
  due_date         date,
  reminder_minutes integer,
  completed        boolean not null default false,
  recur            text not null default 'none',
  completed_at     timestamptz,
  snoozed_until    timestamptz,
  rotation         text,
  subtasks         jsonb not null default '[]',
  created_at       timestamptz not null default now()
);

-- If you already had a tasks table from an earlier version, add the new columns:
alter table tasks add column if not exists recur         text not null default 'none';
alter table tasks add column if not exists completed_at  timestamptz;
alter table tasks add column if not exists snoozed_until timestamptz;
alter table tasks add column if not exists rotation      text;
alter table tasks add column if not exists subtasks      jsonb not null default '[]';

-- ── EVENTS (calendar) ──
create table if not exists events (
  id               uuid primary key default gen_random_uuid(),
  household_id     text not null,
  title            text not null,
  event_type       text not null default 'other',
  assigned_to      text not null default 'both',
  start_date       date not null,
  end_date         date,
  all_day          boolean not null default true,
  start_time       text,
  recur            text not null default 'none',
  reminder_minutes integer,
  notes            text,
  created_at       timestamptz not null default now()
);

-- If you already had an events table from an earlier version, add any missing columns:
alter table events add column if not exists event_type       text not null default 'other';
alter table events add column if not exists assigned_to      text not null default 'both';
alter table events add column if not exists end_date         date;
alter table events add column if not exists all_day          boolean not null default true;
alter table events add column if not exists start_time       text;
alter table events add column if not exists recur            text not null default 'none';
alter table events add column if not exists reminder_minutes integer;
alter table events add column if not exists notes            text;

-- ── NOTES (memo board) ──
create table if not exists notes (
  id           uuid primary key default gen_random_uuid(),
  household_id text not null,
  text         text not null,
  author       text not null default 'both',
  created_at   timestamptz not null default now()
);

-- ── TEMPLATES ──
create table if not exists templates (
  id           uuid primary key default gen_random_uuid(),
  household_id text not null,
  name         text not null,
  items        jsonb not null default '[]',
  created_at   timestamptz not null default now()
);

-- ── SETTINGS (vacation mode, email reminders) ──
create table if not exists settings (
  household_id    text primary key,
  away            jsonb   not null default '[]',
  emails          jsonb   not null default '[]',
  email_reminders boolean not null default false
);

-- If you already had a settings table from an earlier version, add the new columns:
alter table settings add column if not exists emails          jsonb   not null default '[]';
alter table settings add column if not exists email_reminders boolean not null default false;

create table if not exists moods (
  id           text primary key,
  household_id text not null,
  person       text not null,
  level        int  not null,
  note         text default '',
  date         text not null,
  created_at   timestamptz default now()
);

create table if not exists rewards (
  id           text primary key,
  household_id text not null,
  title        text not null,
  emoji        text default '🎁',
  cost         int  not null default 0,
  created_by   text not null,
  redeemed_by  text,
  redeemed_at  timestamptz,
  created_at   timestamptz default now()
);

create table if not exists date_ideas (
  id           text primary key,
  household_id text not null,
  title        text not null,
  description  text default '',
  vibe         text,
  budget       text,
  done         boolean default false,
  done_at      timestamptz,
  created_at   timestamptz default now()
);

-- Indexes
create index if not exists tasks_household_idx      on tasks(household_id);
create index if not exists events_household_idx     on events(household_id);
create index if not exists notes_household_idx      on notes(household_id);
create index if not exists templates_household_idx  on templates(household_id);
create index if not exists moods_household_idx      on moods(household_id);
create index if not exists rewards_household_idx    on rewards(household_id);
create index if not exists date_ideas_household_idx on date_ideas(household_id);

-- Row Level Security + open "allow all" policies + realtime.
-- This block is idempotent — safe to run again and again with no "already exists" errors.
do $$
declare t text;
begin
  foreach t in array array['tasks','events','notes','templates','settings','moods','rewards','date_ideas'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "allow all %s" on %I', t, t);
    execute format('create policy "allow all %s" on %I for all using (true) with check (true)', t, t);
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- Refresh PostgREST's schema cache so new tables are visible immediately
notify pgrst, 'reload schema';
-- ════════════════════════════════════════════════════════════════════════
-- Couple's Hub — Expenses table (one-time setup)
-- Run ONCE in Supabase → SQL Editor before using the Expenses tab.
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════
create table if not exists expenses (
  id           uuid primary key default gen_random_uuid(),
  household_id text not null,
  title        text not null,
  amount       numeric not null default 0,
  paid_by      text not null default 'rhodri',   -- 'rhodri' | 'becky'
  split        text not null default 'even',      -- 'even' | 'rhodri' | 'becky'
  settled      boolean not null default false,
  settled_at   timestamptz,
  created_at   timestamptz not null default now()
);

alter table expenses add column if not exists category    text;
alter table expenses add column if not exists date         date;
alter table expenses add column if not exists note         text;
alter table expenses add column if not exists split_value  numeric;

alter table expenses enable row level security;
drop policy if exists "allow all expenses" on expenses;
create policy "allow all expenses" on expenses for all using (true) with check (true);

do $$ begin
  alter publication supabase_realtime add table expenses;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
