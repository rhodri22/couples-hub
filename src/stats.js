// stats.js — streaks, points, and "who's pulling their weight" analytics
import { parseISO, isSameDay, subDays, startOfDay, isWithinInterval, differenceInCalendarDays } from 'date-fns'
import { PEOPLE } from './constants'

// Household streak: consecutive days (ending today or yesterday) with >=1 completed task
export function computeStreak(tasks) {
  const done = tasks.filter(t => t.completed && t.completed_at).map(t => startOfDay(parseISO(t.completed_at)))
  if (done.length === 0) return 0
  const hasDay = d => done.some(x => isSameDay(x, d))
  const today = startOfDay(new Date())
  // streak can count today if something done, else start from yesterday
  let start = hasDay(today) ? today : subDays(today, 1)
  if (!hasDay(start)) return 0
  let streak = 0
  let cursor = start
  while (hasDay(cursor)) { streak++; cursor = subDays(cursor, 1) }
  return streak
}

// Points per person — 1 per completed task, +1 bonus if completed on/before due date
export function computePoints(tasks) {
  const pts = {}
  PEOPLE.forEach(p => { pts[p.id] = 0 })
  tasks.filter(t => t.completed).forEach(t => {
    const who = t.assigned_to
    if (pts[who] == null) pts[who] = 0
    pts[who] += 1
    if (t.due_date && t.completed_at) {
      const onTime = differenceInCalendarDays(parseISO(t.completed_at), parseISO(t.due_date)) <= 0
      if (onTime) pts[who] += 1
    }
  })
  return pts
}

// Completed counts in the last 7 days, per person (the leaderboard / fairness view)
export function weeklyLeaderboard(tasks) {
  const end = startOfDay(new Date())
  const start = subDays(end, 6)
  const counts = {}
  PEOPLE.forEach(p => { counts[p.id] = 0 })
  tasks.filter(t => t.completed && t.completed_at).forEach(t => {
    const d = startOfDay(parseISO(t.completed_at))
    if (isWithinInterval(d, { start, end })) {
      if (counts[t.assigned_to] == null) counts[t.assigned_to] = 0
      counts[t.assigned_to] += 1
    }
  })
  return counts
}
