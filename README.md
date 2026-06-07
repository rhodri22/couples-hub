# Couple's Hub 💑

A shared to-do list + calendar app for Rhodri & Becky. Real-time sync via Supabase, hosted on Vercel, installable as a PWA on any device.

---

## Features

**Views:** Board (Kanban) · List · Calendar · Notes

- **Recurring tasks** — daily / weekly / monthly / yearly chores that auto-recreate when ticked off
- **Chore rotation** — recurring tasks can rotate between people each time they're done
- **Natural-language quick-add** — type "Walk Lana tomorrow 8am every day for becky" and it fills in date, time, repeat and assignee
- **Streaks & points** — household completion streak + a weekly leaderboard and all-time points per person
- **Vacation / away mode** — mark someone away; their recurring chores pause and rotated ones skip them
- **Snooze** — push an overdue task to tomorrow / 3 days / next week in one tap
- **Task templates** — save routines (food shop, holiday prep) and spawn all their tasks at once
- **Subtasks / checklists** — break a task into steps with a progress bar
- **Calendar subscription feed** — subscribe in Google/Apple Calendar so Hub events show in your phone calendar
- **Calendar events** separate from tasks — birthdays, anniversaries, holidays, appointments, with repeat
- **Multi-day events** — holidays span as a bar across the calendar
- **Overview panel** — live overdue / today / open / done counts with progress bar and reminders
- **Per-person colour coding** — Rhodri (blue), Becky (lilac), Lana (orange), All (green)
- **Countdowns** — days until your next big events
- **Custom reminders** per task & event — "at time" up to 1 week before
- **Browser push notifications** + app badge count
- **Real-time sync** across all devices · **Offline support**

### ✨ Premium upgrade
- **Glass redesign** — deep, dark frosted-glass interface with depth and glow; your three colours as the accent lights
- **AI Assistant** — “Plan our week” fairly splits the chores, plus free-form suggestions, powered by your own Anthropic API key
- **Date-night generator** — pick a vibe, budget and time; get fresh ideas (AI or built-in) and send them to your calendar
- **Us dashboard** — a shared **couple level** you climb together with XP, **badges** to unlock, a gentle **relationship pulse** check-in, and **reward coupons** you each set for the other
- **Add to phone calendar** — every event has an "Add to calendar" button that drops it straight into Apple/Google Calendar (a standard `.ics`), plus "Email this event"; works on every platform with no setup
- **Daily email reminders** — optionally get a morning email with the day's events and tasks due, sent to both of you (needs a free Resend key)
- **Upcoming-events list** — a tap-to-edit, tap-to-delete agenda under the calendar, so managing events is easy on any device

### 🏠 Daily-driver experience
- **Today home screen** (the new default) — a warm greeting, today's events and tasks, one gentle nudge, and **"This week at a glance"** showing who's on what (who's free to gym, who's got Lana, who's doing the shop)
- **Leaner navigation** — Today · Tasks · Calendar · More (everything else tucked into More, so it stays light)
- **Partner onboarding** — a first-run welcome where you tap who you are on the phone; share one link and your partner just opens it and taps their name. No backend, ever, for them. One-tap "clear the examples" to start fresh
- **Private, mutual pulse** — you only see your partner's mood after logging your own; export or delete your check-ins anytime; no streaks, no nudges if you skip

> **Upgrading from an older version?** Just run the whole SQL block below again — it's
> safe to re-run (everything uses `if not exists` / `add column if not exists`). Your
> existing tasks and events are preserved; the new columns and tables are simply added.

---

## Step 1 — Supabase setup

### 1a. Create project

1. Go to [supabase.com](https://supabase.com) → New project
2. Name it `couples-hub`, pick a region close to you, set a password
3. Wait ~2 minutes to provision

### 1b. Run this SQL in the SQL Editor

```sql
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
```

### 1c. Get your keys

In Supabase: **Settings → API**
- Copy **Project URL** → `VITE_SUPABASE_URL`
- Copy **anon public** key → `VITE_SUPABASE_ANON_KEY`

---

## Step 2 — Local development

```bash
git clone <your-repo>
cd couples-hub
cp .env.local.example .env.local
# Edit .env.local with your Supabase URL, key, and household ID
npm install
npm run dev
```

Open `http://localhost:5173`

---

## Step 3 — Deploy to Vercel

1. Push code to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → New Project → import the repo
3. Under **Environment Variables**, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_HOUSEHOLD_ID` (e.g. `rhodri-becky-hub`)
   - `ANTHROPIC_API_KEY` — *optional, for the AI features.* Get one at [console.anthropic.com](https://console.anthropic.com). This stays server-side and is never exposed to the browser. (Optionally `ANTHROPIC_MODEL` to override the default `claude-sonnet-4-6`.)
   - `RESEND_API_KEY` — *optional, for the daily email reminder.* Get one at [resend.com](https://resend.com) (free tier is plenty). (Optionally `EMAIL_FROM`, e.g. `Couple's Hub <hub@yourdomain.com>`, using a verified Resend sender — otherwise the test sender only delivers to your own Resend account email.)
4. Click **Deploy** — you'll get a URL like `https://couples-hub.vercel.app`

Both of you use the **same URL** — that's what ties your data together.

> **No API key?** The app still works fully — the date-night generator falls back to a built-in idea bank, and the AI Assistant simply asks you to add a key. Add the key any time to switch the AI on.

---

## Step 4 — Install as PWA on each device

### iPhone / iPad (Safari only)
1. Open the Vercel URL in **Safari**
2. Tap the **Share** button (box with arrow)
3. Scroll down → **Add to Home Screen** → **Add**

### Android (Chrome)
1. Open the Vercel URL in Chrome
2. Tap **⋮** → **Add to Home Screen** or **Install app**
3. Tap **Add**

The app opens full-screen with no browser bar. ✓

---

## Step 5 — Enable notifications

When you first open the app, tap the 🔔 icon in the top-right to allow push notifications. Both of you need to do this on each device.

Reminders are scheduled per task — you choose the timing (15 min → 1 week before) when creating or editing a task.

---

## Pushing updates

```bash
git add .
git commit -m "your change"
git push
```

Vercel auto-redeploys. No Supabase changes needed.

---

## Sync status indicator

The small dot in the header shows:
- ⚪ Idle — all good
- 🟡 Spinning — saving change
- 🟢 Green — just synced
- 🔴 Red — offline (changes cached locally, will sync on reconnect)
