// nlp.js — lightweight natural-language parser for quick task entry
// Parses things like:
//   "Walk Lana tomorrow at 8am every day for becky"
//   "Pay rent on the 1st monthly"
//   "Buy milk friday for rhodri"
import {
  addDays, nextDay, format, parse, isValid, setHours, setMinutes, startOfDay
} from 'date-fns'
import { CATEGORIES, PEOPLE } from './constants'

const WEEKDAYS = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3, thursday: 4, thu: 4, thurs: 4,
  friday: 5, fri: 5, saturday: 6, sat: 6,
}
const MONTHS = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3,
  may: 4, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7,
  september: 8, sep: 8, sept: 8, october: 9, oct: 9, november: 10, nov: 10,
  december: 11, dec: 11,
}

export function parseTaskText(input) {
  let text = ' ' + input.trim() + ' '
  const lower = text.toLowerCase()
  const result = { title: input.trim(), due_date: '', start_time: '', recur: 'none', assigned_to: null, category: null }
  const today = startOfDay(new Date())
  const removals = []

  // ── Recurrence ──
  const recurPatterns = [
    [/\bevery ?day\b|\bdaily\b/i, 'daily'],
    [/\bevery ?week\b|\bweekly\b/i, 'weekly'],
    [/\bevery ?month\b|\bmonthly\b/i, 'monthly'],
    [/\bevery ?year\b|\byearly\b|\bannually\b/i, 'yearly'],
  ]
  for (const [re, val] of recurPatterns) {
    const m = text.match(re)
    if (m) { result.recur = val; removals.push(m[0]); break }
  }
  // "every monday" → weekly on monday
  const everyDay = text.match(/\bevery (sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thurs|fri|sat)\b/i)
  if (everyDay) {
    result.recur = 'weekly'
    const wd = WEEKDAYS[everyDay[1].toLowerCase()]
    result.due_date = format(nextDay(today, wd), 'yyyy-MM-dd')
    removals.push(everyDay[0])
  }

  // ── Time ── "at 2pm", "at 14:00", "9am", "2:30pm"
  let timeM = text.match(/\bat (\d{1,2})(?::(\d{2}))? ?(am|pm)?\b/i) || text.match(/\b(\d{1,2})(?::(\d{2}))? ?(am|pm)\b/i)
  if (timeM) {
    let h = parseInt(timeM[1], 10)
    const min = timeM[2] ? parseInt(timeM[2], 10) : 0
    const ap = (timeM[3] || '').toLowerCase()
    if (ap === 'pm' && h < 12) h += 12
    if (ap === 'am' && h === 12) h = 0
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
      result.start_time = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
      removals.push(timeM[0])
    }
  }

  // ── Relative dates ──
  if (!result.due_date) {
    if (/\btoday\b|\btonight\b/i.test(lower)) { result.due_date = format(today, 'yyyy-MM-dd'); removals.push((lower.match(/today|tonight/) || [])[0]) }
    else if (/\btomorrow\b|\btmr\b|\btmrw\b/i.test(lower)) { result.due_date = format(addDays(today, 1), 'yyyy-MM-dd'); removals.push((text.match(/tomorrow|tmr|tmrw/i) || [])[0]) }
  }
  // "in N days/weeks"
  const inN = text.match(/\bin (\d{1,3}) (day|days|week|weeks)\b/i)
  if (!result.due_date && inN) {
    const n = parseInt(inN[1], 10) * (/week/i.test(inN[2]) ? 7 : 1)
    result.due_date = format(addDays(today, n), 'yyyy-MM-dd')
    removals.push(inN[0])
  }
  // "next week"
  if (!result.due_date && /\bnext week\b/i.test(text)) { result.due_date = format(addDays(today, 7), 'yyyy-MM-dd'); removals.push('next week') }
  // "next monday" / "monday" / "on friday"
  if (!result.due_date) {
    const dayM = text.match(/\b(?:next |on )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thurs|fri|sat)\b/i)
    if (dayM) {
      const wd = WEEKDAYS[dayM[1].toLowerCase()]
      result.due_date = format(nextDay(today, wd), 'yyyy-MM-dd')
      removals.push(dayM[0])
    }
  }
  // "22 jan" / "jan 22" / "22nd january"
  if (!result.due_date) {
    let dm = text.match(/\b(\d{1,2})(?:st|nd|rd|th)? (january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/i)
    let day, mon
    if (dm) { day = parseInt(dm[1], 10); mon = MONTHS[dm[2].toLowerCase()] }
    else {
      dm = text.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec) (\d{1,2})(?:st|nd|rd|th)?\b/i)
      if (dm) { mon = MONTHS[dm[1].toLowerCase()]; day = parseInt(dm[2], 10) }
    }
    if (dm && day >= 1 && day <= 31 && mon != null) {
      const yr = today.getFullYear()
      let d = new Date(yr, mon, day)
      if (d < today) d = new Date(yr + 1, mon, day) // next occurrence
      result.due_date = format(d, 'yyyy-MM-dd')
      removals.push(dm[0])
    }
  }
  // "on the 1st" (day of month) → for monthly bills
  if (!result.due_date) {
    const dom = text.match(/\bon the (\d{1,2})(?:st|nd|rd|th)?\b/i)
    if (dom) {
      const day = parseInt(dom[1], 10)
      if (day >= 1 && day <= 31) {
        const now = new Date()
        let d = new Date(now.getFullYear(), now.getMonth(), day)
        if (d < today) d = new Date(now.getFullYear(), now.getMonth() + 1, day)
        result.due_date = format(d, 'yyyy-MM-dd')
        removals.push(dom[0])
      }
    }
  }

  // ── Person ── "for rhodri/becky/lana", or a bare name
  for (const p of PEOPLE) {
    if (p.id === 'both') continue
    const re = new RegExp(`\\b(?:for |@)?${p.label}\\b`, 'i')
    if (re.test(text)) {
      result.assigned_to = p.id
      const m = text.match(new RegExp(`\\bfor ${p.label}\\b`, 'i')) || text.match(new RegExp(`\\b${p.label}\\b`, 'i'))
      if (m) removals.push(m[0])
      break
    }
  }
  if (/\b(both of us|everyone|together|us)\b/i.test(text)) result.assigned_to = 'both'

  // ── Category by keyword (don't strip — keep in title) ──
  for (const c of CATEGORIES) {
    if (c.kw.some(k => lower.includes(k))) { result.category = c.id; break }
  }

  // ── Build cleaned title ──
  let title = input.trim()
  // sort removals longest-first to avoid partial overlaps
  removals.filter(Boolean).sort((a, b) => b.length - a.length).forEach(r => {
    title = title.replace(new RegExp(r.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ')
  })
  // tidy connective words left dangling
  title = title.replace(/\b(for|on|at|every|in|the|next)\b\s*$/i, '')
              .replace(/\s{2,}/g, ' ')
              .replace(/\s+,/g, ',')
              .trim()
  result.title = title || input.trim()
  return result
}

// Build a human summary of what was parsed, for the preview chip
export function describeParse(p) {
  const bits = []
  if (p.due_date) {
    const d = parse(p.due_date, 'yyyy-MM-dd', new Date())
    if (isValid(d)) bits.push('📅 ' + format(d, 'EEE d MMM'))
  }
  if (p.start_time) bits.push('🕑 ' + p.start_time)
  if (p.recur && p.recur !== 'none') bits.push('🔁 ' + p.recur)
  if (p.assigned_to) {
    const person = PEOPLE.find(x => x.id === p.assigned_to)
    if (person) bits.push(person.icon + ' ' + person.label)
  }
  return bits
}
