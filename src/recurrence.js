// recurrence.js — recurring task spawning, chore rotation, vacation handling
import { addDays, addWeeks, addMonths, addYears, parseISO, format, getDay } from 'date-fns'
import { genId, PEOPLE } from './constants'

const adults = () => PEOPLE.filter(p => p.adult).map(p => p.id)

function parseDays(s) {
  return String(s || '').split(',').map(x => parseInt(x, 10)).filter(n => n >= 0 && n <= 6)
}

// Advance a date string by one recurrence period.
// opts.days = comma weekday numbers (weekly multi-day, e.g. "2,4" = Tue & Thu);
// opts.until = ISO date after which the series stops (returns null).
export function advanceDate(dateStr, recur, opts = {}) {
  const d = parseISO(dateStr)
  const days = parseDays(opts.days)
  let next
  if (recur === 'weekly' && days.length) {
    let cur = addDays(d, 1)
    for (let i = 0; i < 7; i++) { if (days.includes(getDay(cur))) { next = cur; break } cur = addDays(cur, 1) }
    if (!next) next = addDays(d, 7)
  } else {
    next = recur === 'daily'   ? addDays(d, 1)
         : recur === 'weekly'  ? addWeeks(d, 1)
         : recur === 'monthly' ? addMonths(d, 1)
         : recur === 'yearly'  ? addYears(d, 1)
         : null
  }
  if (!next) return null
  const out = format(next, 'yyyy-MM-dd')
  if (opts.until && out > opts.until) return null   // series has ended
  return out
}

// Given a rotation string "rhodri,becky" and the current assignee,
// return the next assignee, skipping anyone who is away.
export function nextAssignee(rotation, current, away = []) {
  if (!rotation) return current
  const order = rotation.split(',').filter(Boolean)
  if (order.length === 0) return current
  let idx = order.indexOf(current)
  for (let step = 1; step <= order.length; step++) {
    const cand = order[(idx + step) % order.length]
    if (!away.includes(cand)) return cand
  }
  return current // everyone away — keep as is
}

// When a recurring task is completed, build the next instance (or null if not recurring).
// Respects rotation and vacation mode.
export function buildNextInstance(task, away = []) {
  if (!task.recur || task.recur === 'none' || !task.due_date) return null
  const nextDate = advanceDate(task.due_date, task.recur, { days: task.recur_days, until: task.recur_until })
  if (!nextDate) return null

  let assignee = task.rotation
    ? nextAssignee(task.rotation, task.assigned_to, away)
    : task.assigned_to

  // If no rotation but the sole assignee is an away adult, hand to a present adult
  if (!task.rotation && away.includes(assignee) && adults().includes(assignee)) {
    const present = adults().find(a => !away.includes(a))
    if (present) assignee = present
  }

  return {
    ...task,
    id: genId(),
    assigned_to: assignee,
    due_date: nextDate,
    status: 'todo',
    completed: false,
    completed_at: null,
    snoozed_until: null,
    subtasks: (task.subtasks || []).map(s => ({ ...s, id: genId(), done: false })),
    created_at: new Date().toISOString(),
  }
}

// Is this task effectively paused because its assignee is away?
export function isPaused(task, away = []) {
  return away.includes(task.assigned_to) && task.assigned_to !== 'both'
}
