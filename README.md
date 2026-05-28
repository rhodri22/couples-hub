# Couple's Hub 💑

A shared to-do list + calendar app for Rhodri & Becky. Real-time sync via Supabase, hosted on Vercel, installable as a PWA on any device.

---

## Features

- **Board / List / Calendar** views — switch between them at any time
- **Kanban board** (To Do → In Progress → Done) inspired by Trello
- **Calendar** with task dots, tap any day to see/add tasks
- **Assignees** — Rhodri, Becky, or Both
- **Categories** — Home, Errands, Social, Dates, Finance, Health (colour-coded)
- **Custom reminders** per task — 15 min up to 1 week before due
- **Browser push notifications** + app badge count
- **Real-time sync** — changes appear on both devices within ~1 second
- **Offline support** — works without internet, syncs when back online

---

## Step 1 — Supabase setup

### 1a. Create project

1. Go to [supabase.com](https://supabase.com) → New project
2. Name it `couples-hub`, pick a region close to you, set a password
3. Wait ~2 minutes to provision

### 1b. Run this SQL in the SQL Editor

```sql
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
  created_at       timestamptz not null default now()
);

-- Index for fast household queries
create index if not exists tasks_household_idx on tasks(household_id);

-- Enable Row Level Security (optional but recommended)
alter table tasks enable row level security;

-- Allow all operations for now (tighten later if needed)
create policy "allow all" on tasks for all using (true) with check (true);

-- Enable real-time
alter publication supabase_realtime add table tasks;
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
4. Click **Deploy** — you'll get a URL like `https://couples-hub.vercel.app`

Both of you use the **same URL** — that's what ties your data together.

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
