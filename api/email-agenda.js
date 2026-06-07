// /api/email-agenda.js — emails a daily agenda of upcoming events + due tasks
// to the couple. Triggered by Vercel Cron (see vercel.json) once a day, or
// manually with ?test=1 to send a test right now.
//
// Required env (set in Vercel → Settings → Environment Variables):
//   RESEND_API_KEY        from resend.com (free tier is plenty)
// Optional:
//   EMAIL_FROM            e.g. "Couple's Hub <hub@yourdomain.com>" (a verified
//                         Resend sender). Defaults to Resend's test sender,
//                         which can only deliver to your own Resend account email.
//   CRON_SECRET           if set, the cron URL must include ?secret=THAT
//
// Reads recipient emails + the on/off toggle from your Supabase `settings` row,
// so set those in the app (Connect → Email reminders) first.

const FROM_DEFAULT = "Couple's Hub <onboarding@resend.dev>"

function env(...names) { for (const n of names) if (process.env[n]) return process.env[n]; return undefined }

export default async function handler(req, res) {
  const SUPABASE_URL = env('SUPABASE_URL', 'VITE_SUPABASE_URL')
  const SUPABASE_KEY = env('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY')
  const HID = env('HOUSEHOLD_ID', 'VITE_HOUSEHOLD_ID') || 'demo-household'
  const RESEND = process.env.RESEND_API_KEY
  const FROM = process.env.EMAIL_FROM || FROM_DEFAULT
  const isTest = req.query?.test === '1' || req.query?.test === 'true'

  if (process.env.CRON_SECRET && !isTest && req.query?.secret !== process.env.CRON_SECRET) {
    res.status(401).json({ error: 'unauthorized' }); return
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) { res.status(503).json({ error: 'no_supabase_env' }); return }

  const sb = path => fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}` } }).then(r => r.json())

  try {
    const [settingsArr, events, tasks] = await Promise.all([
      sb(`settings?household_id=eq.${HID}&select=*`),
      sb(`events?household_id=eq.${HID}&select=*`),
      sb(`tasks?household_id=eq.${HID}&select=*&completed=eq.false`),
    ])
    const settings = Array.isArray(settingsArr) ? settingsArr[0] : settingsArr
    const emails = (settings?.emails || []).filter(Boolean)
    const remindersOn = !!settings?.email_reminders

    if (!isTest && !remindersOn) { res.status(200).json({ ok: false, reason: 'reminders_off' }); return }
    if (emails.length === 0) { res.status(200).json({ ok: false, reason: 'no_emails' }); return }
    if (!RESEND) { res.status(503).json({ error: 'no_resend_key' }); return }

    // Date helpers (UTC-ish; good enough for a daily nudge)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
    const dayEnd = new Date(tomorrow); dayEnd.setHours(23, 59, 59, 0)
    const md = d => `${d.getMonth()}-${d.getDate()}`
    const parse = s => { const [y, m, dd] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, dd || 1) }

    const todaysEvents = (events || []).filter(e => {
      const s = parse(e.start_date), en = parse(e.end_date || e.start_date)
      const spans = s <= dayEnd && en >= today
      const yearly = e.recur === 'yearly' && (md(s) === md(today) || md(s) === md(tomorrow))
      return spans || yearly
    }).sort((a, b) => parse(a.start_date) - parse(b.start_date))

    const dueTasks = (tasks || []).filter(t => {
      if (!t.due_date) return false
      const d = parse(t.due_date)
      return d <= dayEnd
    }).sort((a, b) => parse(a.due_date) - parse(b.due_date))

    if (!isTest && todaysEvents.length === 0 && dueTasks.length === 0) {
      res.status(200).json({ ok: true, sent: false, reason: 'nothing_today' }); return
    }

    const fmt = d => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    const row = (icon, title, sub) => `<tr><td style="padding:8px 0;font-size:20px;width:34px">${icon}</td><td style="padding:8px 0"><div style="font-weight:600;color:#0f1830">${title}</div><div style="font-size:13px;color:#6b7a90">${sub}</div></td></tr>`
    const evHtml = todaysEvents.map(e => row('📅', escapeHtml(e.title), `${fmt(parse(e.start_date))}${e.recur === 'yearly' ? ' · yearly' : ''}`)).join('')
    const tkHtml = dueTasks.map(t => row('✅', escapeHtml(t.title), `Due ${fmt(parse(t.due_date))}`)).join('')

    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f6f8fc;border-radius:16px">
        <h1 style="font-size:20px;margin:0 0 4px;color:#0f1830">💕 Your Couple's Hub agenda</h1>
        <p style="margin:0 0 18px;color:#6b7a90;font-size:14px">${fmt(today)} — here's what's coming up.</p>
        ${todaysEvents.length ? `<h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#8a98ad;margin:16px 0 4px">Events</h2><table style="width:100%;border-collapse:collapse">${evHtml}</table>` : ''}
        ${dueTasks.length ? `<h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#8a98ad;margin:16px 0 4px">Tasks due</h2><table style="width:100%;border-collapse:collapse">${tkHtml}</table>` : ''}
        ${(!todaysEvents.length && !dueTasks.length) ? `<p style="color:#6b7a90">Nothing scheduled — enjoy the breathing room. 🌿</p>` : ''}
        <p style="margin-top:22px;font-size:12px;color:#aab4c2">Sent from your Couple's Hub${isTest ? ' · test message' : ''}</p>
      </div>`

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${RESEND}` },
      body: JSON.stringify({ from: FROM, to: emails, subject: `💕 Your agenda — ${fmt(today)}`, html }),
    })
    const out = await r.json().catch(() => ({}))
    if (!r.ok) { res.status(502).json({ error: 'resend_failed', detail: out }); return }
    res.status(200).json({ ok: true, sent: true, to: emails, events: todaysEvents.length, tasks: dueTasks.length })
  } catch (e) {
    res.status(500).json({ error: 'server', detail: String(e).slice(0, 200) })
  }
}

function escapeHtml(s = '') { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])) }
