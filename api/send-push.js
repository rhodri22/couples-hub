// /api/send-push.js — the background push sender.
//
// Run on a schedule (Vercel Cron, Supabase pg_cron, or an external pinger — see
// PUSH_SETUP.md). Each run it:
//   1. finds tasks/events whose reminder time just passed (in the household's
//      timezone), and pushes them to the assigned person's devices;
//   2. drains push_outbox (partner-activity nudges like "Becky added an event").
// A push_log table makes reminders idempotent, so overlapping runs never double-send.
// Expired subscriptions (404/410) are pruned automatically.
//
// Required env (Vercel → Settings → Environment Variables):
//   VITE_SUPABASE_URL / SUPABASE_URL, VITE_SUPABASE_ANON_KEY / SUPABASE_ANON_KEY
//   VITE_HOUSEHOLD_ID / HOUSEHOLD_ID
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY   (from `node scripts/generate-vapid.mjs`)
// Optional:
//   VAPID_SUBJECT      contact URL/mailto for the push service (default mailto:hub@example.com)
//   CRON_SECRET        if set, callers must send ?secret=… or Authorization: Bearer …
//   HOUSEHOLD_TZ       IANA tz for reminder times (default Europe/Berlin)
//   PUSH_WINDOW_MIN    look-back window in minutes (default 15)

import webpush from 'web-push'

function env(...names) { for (const n of names) if (process.env[n]) return process.env[n]; return undefined }

const TZ = process.env.HOUSEHOLD_TZ || 'Europe/Berlin'
const WINDOW_MIN = parseInt(process.env.PUSH_WINDOW_MIN || '15', 10)
const ADULTS = ['rhodri', 'becky']

// ── timezone helpers: turn a local wall-clock time into a UTC instant ──────────
function tzOffsetMs(utcMs, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p = {}
  for (const part of dtf.formatToParts(new Date(utcMs))) p[part.type] = part.value
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return asUTC - utcMs
}
function wallToUtcMs(y, mo, d, h, mi, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, 0)
  const off = tzOffsetMs(guess, tz)
  let ms = guess - off
  const off2 = tzOffsetMs(ms, tz)          // second pass handles DST boundaries
  if (off2 !== off) ms = guess - off2
  return ms
}
// The local Y-M-D `off` days from `nowMs`, as a 'YYYY-MM-DD' string.
function localDateStr(nowMs, off, tz) {
  const dtf = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
  return dtf.format(new Date(nowMs + off * 86400000))
}
function weekdayOf(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

// Does a recurring/multi-day event fall on the given date string?
function occursOn(ev, ymd) {
  const s = ev.start_date
  const en = ev.end_date || ev.start_date
  if (ymd >= s && ymd <= en) return true          // ISO date strings compare correctly
  const r = ev.recur
  if (!r || r === 'none' || ymd < s) return false
  if (ev.recur_until && ymd > ev.recur_until) return false
  if (r === 'daily') return true
  if (r === 'weekly') {
    const days = String(ev.recur_days || '').split(',').map(n => parseInt(n, 10)).filter(n => n >= 0 && n <= 6)
    return days.length ? days.includes(weekdayOf(ymd)) : weekdayOf(ymd) === weekdayOf(s)
  }
  const [, sm, sd] = s.split('-').map(Number)
  const [, m, d] = ymd.split('-').map(Number)
  if (r === 'monthly') return d === sd
  if (r === 'yearly') return d === sd && m === sm
  return false
}

function leadPhrase(mins) {
  if (mins === 0) return 'now'
  const d = mins / 1440, h = mins / 60
  if (Number.isInteger(d) && d >= 1) return `in ${d} day${d > 1 ? 's' : ''}`
  if (Number.isInteger(h) && h >= 1) return `in ${h} hour${h > 1 ? 's' : ''}`
  return `in ${mins} min`
}

// Which adults' devices should a task/event reminder go to?
function audiencePersons(assignedTo) {
  let ids = String(assignedTo || '').split(',').map(s => s.trim()).filter(Boolean)
  if (ids.includes('both')) ids = ['rhodri', 'becky']
  ids = ids.filter(id => ADULTS.includes(id))
  return ids.length ? ids : ADULTS   // Lana-only / unassigned → tell both humans
}

export default async function handler(req, res) {
  const SUPABASE_URL = env('SUPABASE_URL', 'VITE_SUPABASE_URL')
  const SUPABASE_KEY = env('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY')
  const HID = env('HOUSEHOLD_ID', 'VITE_HOUSEHOLD_ID') || 'demo-household'
  const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY
  const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY
  const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:hub@example.com'
  const SECRET = process.env.CRON_SECRET

  // Auth: Vercel Cron sends "Authorization: Bearer <CRON_SECRET>"; external
  // pingers can pass ?secret=<CRON_SECRET>. If no secret is set, allow (but you
  // really should set one — see PUSH_SETUP.md).
  if (SECRET) {
    const auth = req.headers?.authorization || ''
    const qs = req.query?.secret
    if (qs !== SECRET && auth !== `Bearer ${SECRET}`) {
      res.status(401).json({ error: 'unauthorized' }); return
    }
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) { res.status(503).json({ error: 'no_supabase_env' }); return }
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) { res.status(503).json({ error: 'no_vapid_keys' }); return }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)

  const jsonHeaders = { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}`, 'content-type': 'application/json' }
  const get = path => fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: jsonHeaders }).then(r => r.json())

  async function claim(dedupeKey) {
    // Insert into push_log; unique constraint means a 409 = already sent.
    const r = await fetch(`${SUPABASE_URL}/rest/v1/push_log`, {
      method: 'POST', headers: { ...jsonHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ dedupe_key: dedupeKey }),
    })
    return r.status === 201
  }
  async function deleteSub(endpoint) {
    await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`,
      { method: 'DELETE', headers: jsonHeaders }).catch(() => {})
  }
  async function markOutboxSent(id) {
    await fetch(`${SUPABASE_URL}/rest/v1/push_outbox?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: { ...jsonHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ sent_at: new Date().toISOString() }),
    }).catch(() => {})
  }

  try {
    const [subs, tasks, events, outbox] = await Promise.all([
      get(`push_subscriptions?household_id=eq.${HID}&select=*`),
      get(`tasks?household_id=eq.${HID}&completed=eq.false&select=id,title,assigned_to,due_date,reminder_minutes`),
      get(`events?household_id=eq.${HID}&select=id,title,assigned_to,start_date,end_date,all_day,start_time,recur,recur_days,recur_until,reminder_minutes`),
      get(`push_outbox?household_id=eq.${HID}&sent_at=is.null&select=*`),
    ])

    const allSubs = Array.isArray(subs) ? subs : []
    if (allSubs.length === 0) { res.status(200).json({ ok: true, reason: 'no_subscriptions' }); return }

    const now = Date.now()
    const windowMs = WINDOW_MIN * 60000
    const inWindow = fireMs => fireMs <= now && fireMs > now - windowMs

    // Deliver a payload to the subscriptions belonging to `persons`.
    let delivered = 0, failed = 0
    async function deliver(persons, payload) {
      const targets = allSubs.filter(s => !s.person || persons.includes(s.person))
      for (const s of targets) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify(payload),
          )
          delivered++
        } catch (err) {
          failed++
          const code = err && err.statusCode
          if (code === 404 || code === 410) await deleteSub(s.endpoint)
        }
      }
    }

    let sentReminders = 0

    // ── Task reminders ── anchor = due_date at 09:00 local, minus the lead ──────
    for (const t of (tasks || [])) {
      if (!t.due_date || t.reminder_minutes == null) continue
      const [y, mo, d] = String(t.due_date).split('-').map(Number)
      if (!y) continue
      const fireMs = wallToUtcMs(y, mo, d, 9, 0, TZ) - t.reminder_minutes * 60000
      if (!inWindow(fireMs)) continue
      if (!(await claim(`task:${t.id}:${new Date(fireMs).toISOString()}`))) continue
      await deliver(audiencePersons(t.assigned_to), {
        title: `📋 ${t.title}`,
        body: `Due ${leadPhrase(t.reminder_minutes)}`,
        url: '/?view=tasks',
        tag: `task-${t.id}`,
      })
      sentReminders++
    }

    // ── Event reminders ── one-off use start_date; recurring scan a day window ──
    for (const ev of (events || [])) {
      if (ev.reminder_minutes == null || !ev.start_date) continue
      const timeStr = (ev.all_day === false && ev.start_time) ? ev.start_time : '09:00'
      const [h, mi] = timeStr.split(':').map(Number)

      const dates = []
      if (!ev.recur || ev.recur === 'none') {
        dates.push(ev.start_date)
      } else {
        for (let off = -1; off <= 9; off++) {           // covers reminders up to a week ahead
          const ymd = localDateStr(now, off, TZ)
          if (occursOn(ev, ymd)) dates.push(ymd)
        }
      }

      for (const ymd of dates) {
        const [yy, mm, dd] = ymd.split('-').map(Number)
        const fireMs = wallToUtcMs(yy, mm, dd, h || 9, mi || 0, TZ) - ev.reminder_minutes * 60000
        if (!inWindow(fireMs)) continue
        if (!(await claim(`event:${ev.id}:${ymd}:${ev.reminder_minutes}`))) continue
        await deliver(audiencePersons(ev.assigned_to), {
          title: `📅 ${ev.title}`,
          body: `Starts ${leadPhrase(ev.reminder_minutes)}`,
          url: '/?view=calendar',
          tag: `event-${ev.id}-${ymd}`,
        })
        sentReminders++
      }
    }

    // ── Partner-activity nudges (push_outbox) ──────────────────────────────────
    let sentOutbox = 0
    for (const o of (outbox || [])) {
      const persons = o.target_person ? [o.target_person] : ADULTS
      await deliver(persons, {
        title: o.title,
        body: o.body || '',
        url: o.url || '/',
        tag: `outbox-${o.id}`,
      })
      await markOutboxSent(o.id)
      sentOutbox++
    }

    res.status(200).json({ ok: true, subscriptions: allSubs.length, reminders: sentReminders, nudges: sentOutbox, delivered, failed })
  } catch (e) {
    res.status(500).json({ error: 'server', detail: String(e).slice(0, 300) })
  }
}
