// /api/calendar.js — Vercel serverless function
// Serves a live .ics feed of the household's events, so Google/Apple Calendar
// can subscribe and show Couple's Hub events inside the native calendar.
//
// Usage:  https://<your-app>.vercel.app/api/calendar?household=rhodri-becky-hub

export default async function handler(req, res) {
  const household = (req.query.household || '').toString()
  if (!household) {
    res.status(400).send('Missing household parameter')
    return
  }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    res.status(500).send('Server not configured with Supabase credentials')
    return
  }

  let events = []
  try {
    const url = `${SUPABASE_URL}/rest/v1/events?household_id=eq.${encodeURIComponent(household)}&select=*`
    const resp = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } })
    if (resp.ok) events = await resp.json()
  } catch (e) {
    res.status(502).send('Could not reach the database')
    return
  }

  const ics = buildICS(events, household)
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
  res.setHeader('Content-Disposition', 'inline; filename="couples-hub.ics"')
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate')
  res.status(200).send(ics)
}

function pad(n) { return String(n).padStart(2, '0') }
function dateOnly(d) { const x = new Date(d); return `${x.getUTCFullYear()}${pad(x.getUTCMonth() + 1)}${pad(x.getUTCDate())}` }
function stamp() { const d = new Date(); return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z` }
function esc(s) { return (s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n') }

function addDaysStr(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return dateOnly(d)
}

function rruleFor(recur) {
  switch (recur) {
    case 'daily':   return 'RRULE:FREQ=DAILY'
    case 'weekly':  return 'RRULE:FREQ=WEEKLY'
    case 'monthly': return 'RRULE:FREQ=MONTHLY'
    case 'yearly':  return 'RRULE:FREQ=YEARLY'
    default:        return null
  }
}

function buildICS(events, household) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Couples Hub//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:Couple's Hub`,
    'X-WR-TIMEZONE:UTC',
  ]
  for (const e of events) {
    const start = e.start_date
    const end = e.end_date || e.start_date
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${e.id}@couples-hub`)
    lines.push(`DTSTAMP:${stamp()}`)
    if (e.all_day === false && e.start_time) {
      const [h, m] = e.start_time.split(':')
      lines.push(`DTSTART:${dateOnly(start)}T${pad(h)}${pad(m)}00`)
      lines.push(`DTEND:${dateOnly(start)}T${pad(h)}${pad(m)}00`)
    } else {
      // All-day: DTEND is exclusive, so add 1 day to the end date
      lines.push(`DTSTART;VALUE=DATE:${dateOnly(start)}`)
      lines.push(`DTEND;VALUE=DATE:${addDaysStr(end, 1)}`)
    }
    const rrule = rruleFor(e.recur)
    if (rrule) lines.push(rrule)
    lines.push(`SUMMARY:${esc(e.title)}`)
    if (e.notes) lines.push(`DESCRIPTION:${esc(e.notes)}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}
