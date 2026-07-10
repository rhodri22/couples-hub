// ics.js — build a single-event .ics file and trigger an "Add to calendar" on
// any platform (iOS, Android, macOS, Windows all understand .ics). Also a
// mailto helper to email an event. No server or API key needed.
import { format, parseISO } from 'date-fns'

function pad(n) { return String(n).padStart(2, '0') }
function fmtDate(d) { return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` }
function fmtDateTime(d) { return `${fmtDate(d)}T${pad(d.getHours())}${pad(d.getMinutes())}00` }
function esc(s = '') { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n') }

const RRULE = { yearly: 'FREQ=YEARLY', monthly: 'FREQ=MONTHLY', weekly: 'FREQ=WEEKLY', daily: 'FREQ=DAILY' }

// Build a VCALENDAR string for one event
export function buildEventICS(ev) {
  const start = parseISO(ev.start_date)
  const endRaw = ev.end_date ? parseISO(ev.end_date) : start
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Couples Hub//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT']
  lines.push(`UID:${ev.id || Math.random().toString(36).slice(2)}@couples-hub`)
  lines.push(`DTSTAMP:${fmtDateTime(new Date())}Z`)

  if (ev.all_day || !ev.start_time) {
    // All-day: DTEND is exclusive, so add a day
    const endExcl = new Date(endRaw); endExcl.setDate(endExcl.getDate() + 1)
    lines.push(`DTSTART;VALUE=DATE:${fmtDate(start)}`)
    lines.push(`DTEND;VALUE=DATE:${fmtDate(endExcl)}`)
  } else {
    const [h, m] = ev.start_time.split(':').map(Number)
    const s = new Date(start); s.setHours(h || 0, m || 0, 0, 0)
    const e = new Date(s); e.setHours(s.getHours() + 1)
    lines.push(`DTSTART:${fmtDateTime(s)}`)
    lines.push(`DTEND:${fmtDateTime(e)}`)
  }
  if (ev.recur && RRULE[ev.recur]) lines.push(`RRULE:${RRULE[ev.recur]}`)
  lines.push(`SUMMARY:${esc(ev.title)}`)
  if (ev.notes) lines.push(`DESCRIPTION:${esc(ev.notes)}`)
  if (ev.reminder_minutes != null) {
    const mins = Number(ev.reminder_minutes)
    const trigger = mins > 0 ? `-PT${mins}M` : 'PT0S'   // 0 = "at time of event" (a valid trigger, not a dropped alarm)
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:${trigger}`, `DESCRIPTION:${esc(ev.title)}`, 'END:VALARM')
  }
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.join('\r\n')
}

// Download / open the .ics so the native calendar offers to add it
export function addEventToCalendar(ev) {
  const ics = buildEventICS(ev)
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(ev.title || 'event').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

// Open the user's email app with the event details prefilled
export function emailEvent(ev) {
  const when = ev.all_day || !ev.start_time
    ? format(parseISO(ev.start_date), 'EEEE d MMMM yyyy')
    : `${format(parseISO(ev.start_date), 'EEEE d MMMM yyyy')} at ${ev.start_time}`
  const subject = `Event: ${ev.title}`
  const body = [`${ev.title}`, ``, `When: ${when}`, ev.notes ? `Notes: ${ev.notes}` : '', ``, `— sent from Couple's Hub`].filter(Boolean).join('\n')
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
