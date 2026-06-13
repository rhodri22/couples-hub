import { format, addDays } from 'date-fns'

// ─── People with per-person colours ───────────────────────────────────────────
export const PEOPLE = [
  { id: 'rhodri', label: 'Rhodri', icon: '👨', color: '#3b82c4', soft: '#3b82c422', text: '#5fa8e8', adult: true },
  { id: 'becky',  label: 'Becky',  icon: '👩', color: '#a78bca', soft: '#a78bca22', text: '#c4abe0', adult: true },
  { id: 'lana',   label: 'Lana',   icon: '🐶', color: '#e08e3c', soft: '#e08e3c22', text: '#f0a857', adult: false },
  { id: 'both',   label: 'All',    icon: '👨‍👩‍🦮', color: '#4caf72', soft: '#4caf7222', text: '#6dca90', adult: false },
]

// ─── Task categories ──────────────────────────────────────────────────────────
export const CATEGORIES = [
  { id: 'home',     label: 'Home',     color: '#4a90d9', kw: ['clean','tidy','vacuum','laundry','dishes','bin','bins','trash','rubbish','hoover','dust','wash'] },
  { id: 'errands',  label: 'Errands',  color: '#7ec8e3', kw: ['buy','collect','pick up','post','return','drop off','shop','order'] },
  { id: 'social',   label: 'Social',   color: '#1e3a5f', kw: ['party','dinner','drinks','meet','visit','call','birthday'] },
  { id: 'dates',    label: 'Dates',    color: '#e06b9a', kw: ['date','restaurant','cinema','movie','anniversary'] },
  { id: 'finance',  label: 'Finance',  color: '#2d6a9f', kw: ['pay','bill','rent','invoice','bank','tax','budget','transfer'] },
  { id: 'health',   label: 'Health',   color: '#50c878', kw: ['vet','doctor','dentist','gym','medicine','prescription','appointment','exercise'] },
]

// ─── Event types ──────────────────────────────────────────────────────────────
export const EVENT_TYPES = [
  { id: 'birthday',    label: 'Birthday',    icon: '🎂', color: '#e06b9a' },
  { id: 'anniversary', label: 'Anniversary', icon: '💍', color: '#d4a5e0' },
  { id: 'holiday',     label: 'Holiday',     icon: '✈️', color: '#3b82c4' },
  { id: 'appointment', label: 'Appointment', icon: '📍', color: '#e08e3c' },
  { id: 'social',      label: 'Social',      icon: '🎉', color: '#50c878' },
  { id: 'other',       label: 'Other',       icon: '📌', color: '#7ec8e3' },
]

export const KANBAN_COLS = [
  { id: 'todo',        label: 'To Do',       color: '#2d6a9f' },
  { id: 'in_progress', label: 'In Progress', color: '#4a90d9' },
  { id: 'done',        label: 'Done',        color: '#50c878' },
]

export const REMINDER_OPTIONS = [
  { value: 0,     label: 'At time of event' },
  { value: 15,    label: '15 minutes before' },
  { value: 30,    label: '30 minutes before' },
  { value: 60,    label: '1 hour before' },
  { value: 180,   label: '3 hours before' },
  { value: 720,   label: '12 hours before' },
  { value: 1440,  label: '24 hours before' },
  { value: 2880,  label: '2 days before' },
  { value: 10080, label: '1 week before' },
]

export const RECUR_OPTIONS = [
  { value: 'none',    label: 'Does not repeat' },
  { value: 'daily',   label: 'Every day' },
  { value: 'weekly',  label: 'Every week' },
  { value: 'monthly', label: 'Every month' },
  { value: 'yearly',  label: 'Every year' },
]

// ─── Lookups ──────────────────────────────────────────────────────────────────
export const getCat       = id => CATEGORIES.find(c => c.id === id) || CATEGORIES[0]
export const getPerson    = id => PEOPLE.find(p => p.id === id) || PEOPLE[3]
export const ASSIGNABLE = PEOPLE.filter(p => p.id !== 'both')
export const getAssignees = item => {
  let ids = Array.isArray(item?.assignees) && item.assignees.length ? item.assignees : (item?.assigned_to ? [item.assigned_to] : [])
  if (ids.includes('both')) ids = ['rhodri', 'becky', 'lana']
  ids = [...new Set(ids)].filter(id => ['rhodri', 'becky', 'lana'].includes(id))
  return ids.map(id => PEOPLE.find(p => p.id === id)).filter(Boolean)
}
export const assigneeIds = item => getAssignees(item).map(p => p.id)
export const primaryPerson = item => getAssignees(item)[0] || getPerson('both')
export const normalizeAssign = row => {
  const ids = assigneeIds(row)
  const assigned_to = ids.length === 3 ? 'both' : (ids.length === 1 ? ids[0] : (ids[0] || 'both'))
  return { ...row, assignees: ids, assigned_to }
}
export const getEventType = id => EVENT_TYPES.find(e => e.id === id) || EVENT_TYPES[5]

export function genId() {
  try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID() } catch {}
  // RFC4122 v4 fallback (older Safari / non-HTTPS contexts where crypto.randomUUID is missing)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

// ─── Demo data ────────────────────────────────────────────────────────────────
const today = new Date()
const iso = d => format(d, 'yyyy-MM-dd')

export const DEMO_TASKS = [
  { id: genId(), title: 'Book restaurant for anniversary', category: 'dates', assigned_to: 'rhodri', status: 'todo', due_date: iso(addDays(today, 3)), reminder_minutes: 1440, completed: false, recur: 'none', completed_at: null, snoozed_until: null, rotation: null, subtasks: [], created_at: new Date().toISOString() },
  { id: genId(), title: 'Take the bins out', category: 'home', assigned_to: 'rhodri', status: 'todo', due_date: iso(addDays(today, 1)), reminder_minutes: 720, completed: false, recur: 'weekly', completed_at: null, snoozed_until: null, rotation: 'rhodri,becky', subtasks: [], created_at: new Date().toISOString() },
  { id: genId(), title: 'Walk Lana', category: 'health', assigned_to: 'becky', status: 'todo', due_date: iso(today), reminder_minutes: 60, completed: false, recur: 'daily', completed_at: null, snoozed_until: null, rotation: 'rhodri,becky', subtasks: [], created_at: new Date().toISOString() },
  { id: genId(), title: 'Pay rent', category: 'finance', assigned_to: 'both', status: 'in_progress', due_date: iso(addDays(today, 7)), reminder_minutes: 1440, completed: false, recur: 'monthly', completed_at: null, snoozed_until: null, rotation: null, subtasks: [], created_at: new Date().toISOString() },
  { id: genId(), title: "Lana's vet check-up", category: 'health', assigned_to: 'lana', status: 'todo', due_date: iso(addDays(today, 5)), reminder_minutes: 1440, completed: false, recur: 'none', completed_at: null, snoozed_until: null, rotation: null, subtasks: [{ id: genId(), text: 'Bring vaccination record', done: false }, { id: genId(), text: 'Ask about flea treatment', done: false }], created_at: new Date().toISOString() },
  { id: genId(), title: 'Tidy kitchen', category: 'home', assigned_to: 'becky', status: 'done', due_date: iso(addDays(today, -1)), reminder_minutes: null, completed: true, recur: 'none', completed_at: new Date(Date.now() - 86400000).toISOString(), snoozed_until: null, rotation: null, subtasks: [], created_at: new Date().toISOString() },
]

export const DEMO_EVENTS = [
  { id: genId(), title: "Rhodri's Birthday", event_type: 'birthday', assigned_to: 'rhodri', start_date: iso(addDays(today, 12)), end_date: iso(addDays(today, 12)), all_day: true, start_time: null, recur: 'yearly', reminder_minutes: 1440, notes: '', created_at: new Date().toISOString() },
  { id: genId(), title: 'Holiday in India', event_type: 'holiday', assigned_to: 'both', start_date: iso(addDays(today, 20)), end_date: iso(addDays(today, 34)), all_day: true, start_time: null, recur: 'none', reminder_minutes: 10080, notes: 'Flights booked! Remember passports.', created_at: new Date().toISOString() },
]

export const DEMO_NOTES = [
  { id: genId(), text: 'Ideas for weekend trips: Bath, Lake District, Edinburgh', author: 'becky', created_at: new Date().toISOString() },
]

export const DEMO_TEMPLATES = [
  { id: genId(), name: 'Weekly food shop', items: [
    { title: 'Plan meals for the week', category: 'home', assigned_to: 'both' },
    { title: 'Check fridge & cupboards', category: 'home', assigned_to: 'becky' },
    { title: 'Do the food shop', category: 'errands', assigned_to: 'rhodri' },
  ], created_at: new Date().toISOString() },
  { id: genId(), name: 'Pre-holiday prep', items: [
    { title: 'Check passports in date', category: 'errands', assigned_to: 'both' },
    { title: 'Pack chargers & adapters', category: 'home', assigned_to: 'rhodri' },
    { title: 'Arrange Lana sitter', category: 'health', assigned_to: 'becky' },
    { title: 'Pause the post', category: 'home', assigned_to: 'rhodri' },
  ], created_at: new Date().toISOString() },
]

export const DEMO_SETTINGS = { away: [], emails: [], email_reminders: false }

// ════════════════════════════════════════════════════════════════════════════
// v4 — "Ultra cool" upgrade: relationship pulse, gamification, date-night, AI
// ════════════════════════════════════════════════════════════════════════════

// ─── Relationship pulse levels ────────────────────────────────────────────────
export const MOOD_LEVELS = [
  { level: 1, emoji: '😟', label: 'Rough',   color: '#e05555' },
  { level: 2, emoji: '😕', label: 'Meh',     color: '#e08e3c' },
  { level: 3, emoji: '🙂', label: 'Okay',    color: '#f0c060' },
  { level: 4, emoji: '😊', label: 'Good',     color: '#7ec8e3' },
  { level: 5, emoji: '🥰', label: 'Amazing', color: '#50c878' },
]
export const getMood = lvl => MOOD_LEVELS.find(m => m.level === lvl) || MOOD_LEVELS[2]

// ─── Date-night generator options ─────────────────────────────────────────────
export const DATE_VIBES   = ['Romantic', 'Adventurous', 'Cozy', 'Foodie', 'Cultured', 'Active', 'Spontaneous', 'Chilled']
export const DATE_BUDGETS = ['Free', '£', '££', '£££']
export const DATE_TIMES   = ['Quick (1–2h)', 'Half day', 'Evening', 'Full day']

// ─── XP economy ───────────────────────────────────────────────────────────────
export const XP = { task: 10, ontime: 5, date: 50, pulse: 5 }

// ─── Couple level titles (by level band) ──────────────────────────────────────
export const LEVEL_TITLES = [
  'New Sparks', 'Getting Cosy', 'Finding Rhythm', 'Power Couple', 'Dream Team',
  'In Sync', 'Unstoppable', 'Iconic Duo', 'Legendary', 'Soulmates ✨',
]
export const levelTitle = lvl => LEVEL_TITLES[Math.min(lvl - 1, LEVEL_TITLES.length - 1)] || 'Soulmates ✨'

// ─── Badge / achievement metadata (unlock logic lives in gamification.js) ─────
export const BADGES = [
  { id: 'first_task',  emoji: '✅', label: 'First Steps',   desc: 'Complete your first task' },
  { id: 'roll',        emoji: '🔥', label: 'On a Roll',     desc: 'Hit a 3-day streak' },
  { id: 'week',        emoji: '⚡', label: 'Week Warriors',  desc: 'Hit a 7-day streak' },
  { id: 'team25',      emoji: '🤝', label: 'Team Players',  desc: 'Complete 25 tasks together' },
  { id: 'century',     emoji: '💯', label: 'Centurions',    desc: 'Complete 100 tasks together' },
  { id: 'fair',        emoji: '🤝', label: 'In Sync',       desc: 'A nicely shared week between you both' },
  { id: 'date1',       emoji: '💕', label: 'Romantics',     desc: 'Complete your first date night' },
  { id: 'date5',       emoji: '🥂', label: 'Smitten',       desc: 'Complete 5 date nights' },
  { id: 'pulse7',      emoji: '💓', label: 'In Tune',       desc: 'Log 7 pulse check-ins' },
  { id: 'generous',    emoji: '🎁', label: 'Generous',      desc: 'Create a reward coupon' },
  { id: 'treat',       emoji: '🍫', label: 'Treat Yourself', desc: 'Redeem a reward coupon' },
  { id: 'level5',      emoji: '👑', label: 'High Rollers',  desc: 'Reach couple level 5' },
]

// ─── Demo data for new features ───────────────────────────────────────────────
export const DEMO_MOODS = [
  { id: genId(), person: 'rhodri', level: 4, note: 'Good week, busy though', date: iso(today), created_at: new Date().toISOString() },
  { id: genId(), person: 'becky',  level: 5, note: 'Loved our walk with Lana 🐶', date: iso(today), created_at: new Date().toISOString() },
  { id: genId(), person: 'rhodri', level: 3, note: '', date: iso(addDays(today, -1)), created_at: new Date(Date.now() - 86400000).toISOString() },
]

export const DEMO_REWARDS = [
  { id: genId(), title: 'Breakfast in bed', emoji: '🥞', cost: 100, created_by: 'becky',  redeemed_by: null, redeemed_at: null, created_at: new Date().toISOString() },
  { id: genId(), title: 'You pick the film', emoji: '🎬', cost: 50,  created_by: 'rhodri', redeemed_by: null, redeemed_at: null, created_at: new Date().toISOString() },
  { id: genId(), title: 'Lana walk is on me', emoji: '🐕', cost: 40,  created_by: 'becky',  redeemed_by: null, redeemed_at: null, created_at: new Date().toISOString() },
]

export const DEMO_DATE_IDEAS = [
  { id: genId(), title: 'Sunset picnic in the park', description: 'Grab cheese, wine and a blanket and find a good spot for golden hour.', vibe: 'Romantic', budget: '£', done: false, done_at: null, created_at: new Date().toISOString() },
  { id: genId(), title: 'Cook a country at random', description: 'Spin a globe (or pick blind), cook a dish from wherever you land.', vibe: 'Foodie', budget: '£', done: true, done_at: new Date(Date.now() - 6*86400000).toISOString(), created_at: new Date().toISOString() },
]

export const getBudgetLabel = b => b
