# 🔔 Background push notifications — setup

This adds **real** push notifications: reminders (and "your partner added…" nudges)
that arrive on your iPhone and laptop **even when the app is closed**. It replaces
the old in-page reminders, which only fired while the app was open.

**How it works:** the browser holds a push *subscription* (stored in Supabase).
A small serverless function (`/api/send-push`) runs on a schedule, works out which
reminders are due, and sends a push to the right devices. A service worker wakes up
and shows the notification — no app open required.

You do this **once**. Budget ~15 minutes. Steps 1–4 are the pipeline; step 5 is a
scheduler; step 6 is each phone/laptop.

---

## Step 1 — Add the database tables

In **Supabase → SQL Editor**, paste and run the contents of
[`supabase/push-schema.sql`](supabase/push-schema.sql). Safe to re-run. It adds
`push_subscriptions`, `push_log`, and `push_outbox`.

## Step 2 — Generate your VAPID keys

VAPID keys are the signing keys for Web Push. Generate a pair once:

```bash
npm install          # pulls in web-push
npm run gen:vapid
```

It prints three lines — `VITE_VAPID_PUBLIC_KEY`, `VAPID_PUBLIC_KEY` (same value),
and `VAPID_PRIVATE_KEY`. Keep the private key secret.

## Step 3 — Set environment variables

**Vercel → Project → Settings → Environment Variables** (Production + Preview):

| Variable | Value | Notes |
|---|---|---|
| `VITE_VAPID_PUBLIC_KEY` | the public key | client build reads this |
| `VAPID_PUBLIC_KEY` | the public key (same) | server |
| `VAPID_PRIVATE_KEY` | the private key | **server only — never commit** |
| `VAPID_SUBJECT` | `mailto:rhodri@pixxel.space` | contact for the push service |
| `CRON_SECRET` | any long random string | protects `/api/send-push` |
| `HOUSEHOLD_TZ` | `Europe/Berlin` | *(optional)* reminder timezone; defaults to Berlin |

Your `VITE_SUPABASE_*` and `VITE_HOUSEHOLD_ID` are already set from the original setup.
For local dev, also put `VITE_VAPID_PUBLIC_KEY` in `.env.local`.

## Step 4 — Deploy

Push to GitHub as usual — Vercel rebuilds. (Background push only works on the
deployed build, not `npm run dev`; to test locally use `npm run build && npm run preview`.)

## Step 5 — Schedule the sender

`/api/send-push` needs to be called every few minutes. Pick **one**:

### Option A — Supabase pg_cron *(recommended: free, every 5 min, plan-independent)*
In Supabase, enable the **`pg_cron`** and **`pg_net`** extensions (Database → Extensions),
then run in the SQL Editor (edit the URL + secret):

```sql
select cron.schedule(
  'couples-hub-push',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://YOUR-APP.vercel.app/api/send-push',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET')
  );
  $$
);
```

### Option B — External cron (dead simple)
On [cron-job.org](https://cron-job.org) (free), create a job every 5 minutes hitting:
`https://YOUR-APP.vercel.app/api/send-push?secret=YOUR_CRON_SECRET`

### Option C — Vercel Cron
Add to `vercel.json` `crons`:
`{ "path": "/api/send-push", "schedule": "*/5 * * * *" }`
⚠️ On the Vercel **Hobby** plan crons only run **once a day** — use Option A or B for
real reminders unless you're on Pro. (Vercel Cron automatically sends the
`Authorization: Bearer $CRON_SECRET` header, so no `?secret=` needed.)

## Step 6 — Turn it on, on each device

First make sure you've **tapped your name** in the app (the "who are you" screen) so
reminders target the right person.

**iPhone / iPad — this order matters:**
1. Open the app URL in **Safari**.
2. **Share → Add to Home Screen → Add.** *(iOS only allows push for installed PWAs.)*
3. Open the app **from the new Home-Screen icon** (not Safari).
4. Tap the **🔔** in the top-right → **Allow**.

**Laptop (Chrome / Edge / Firefox):** open the app, tap **🔔** → **Allow**.

Do this for **both** of you, on **every** device you want notified.

---

## Test it

- **Endpoint check:** visit `https://YOUR-APP.vercel.app/api/send-push?secret=YOUR_CRON_SECRET`
  — you should get JSON like `{"ok":true,"subscriptions":2,"reminders":0,"nudges":0}`.
- **Reminder:** create an event a few minutes out, all-day off, with reminder
  "At time of event" (or a task due today with "15 minutes before"), then wait for
  the next scheduler run.
- **Partner nudge:** add a task as Rhodri → Becky's device gets a "📝 Rhodri added a
  task" push within one scheduler interval.

## Troubleshooting

- **Nothing on iPhone:** it must be opened from the **Home-Screen icon**, not a Safari
  tab, and permission allowed *inside* that installed app. Re-check Step 6.
- **`{"reason":"no_subscriptions"}`:** no device has tapped 🔔 + Allow yet.
- **`{"error":"no_vapid_keys"}`:** the `VAPID_*` env vars aren't set on the server.
- **Reminders at the wrong time:** set `HOUSEHOLD_TZ` (default `Europe/Berlin`).
- **Reminders never fire:** confirm the scheduler (Step 5) is actually running.
- **A device went silent:** subscriptions can expire; the sender prunes dead ones —
  just tap 🔔 again to re-subscribe.

## Notes / limits (v1)

- Reminders fire on the scheduler's grid (≈5 min), so "15 minutes before" means
  15 min ± the interval. Fine for reminders.
- While the app is **open**, you may briefly see both an instant in-app reminder and
  the background push. Harmless; can be de-duplicated later.
- `push_log` grows slowly (one row per reminder sent); trivial at two-person scale.
