// recurrence.js — recurring task spawning, chore rotation, vacation handling
import { addDays, addWeeks, addMonths, addYears, parseISO, format } from 'date-fns'
import { genId, PEOPLE } from './constants'

const adults = () => PEOPLE.filter(p => p.adult).map(p => p.id)

// Advance a date string by one recurrence period
export function advanceDate(dateStr, recur) {
  const d = parseISO(dateStr)
  const next = recur === 'daily'   ? addDays(d, 1)
             : recur === 'weekly'  ? addWeeks(d, 1)
             : recur === 'monthly' ? addMonths(d, 1)
             : recur === 'yearly'  ? addYears(d, 1)
             : null
  return next ? format(next, 'yyyy-MM-dd') : null
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
  const nextDate = advanceDate(task.due_date, task.recur)
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
