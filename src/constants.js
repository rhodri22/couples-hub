import { format, addDays } from 'date-fns'

// ─── People with per-person colours (requirement #5) ──────────────────────────
export const PEOPLE = [
  { id: 'rhodri', label: 'Rhodri', icon: '👨', color: '#3b82c4', soft: '#3b82c422', text: '#5fa8e8' },
  { id: 'becky',  label: 'Becky',  icon: '👩', color: '#a78bca', soft: '#a78bca22', text: '#c4abe0' },
  { id: 'lana',   label: 'Lana',   icon: '🐶', color: '#e08e3c', soft: '#e08e3c22', text: '#f0a857' },
  { id: 'both',   label: 'All',    icon: '👨‍👩‍🦮', color: '#4caf72', soft: '#4caf7222', text: '#6dca90' },
]

// ─── Task categories ──────────────────────────────────────────────────────────
export const CATEGORIES = [
  { id: 'home',     label: 'Home',     color: '#4a90d9' },
  { id: 'errands',  label: 'Errands',  color: '#7ec8e3' },
  { id: 'social',   label: 'Social',   color: '#1e3a5f' },
  { id: 'dates',    label: 'Dates',    color: '#e06b9a' },
  { id: 'finance',  label: 'Finance',  color: '#2d6a9f' },
  { id: 'health',   label: 'Health',   color: '#50c878' },
]

// ─── Event types (calendar events, requirement #1, #4) ────────────────────────
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
  { value: 'none',   label: 'Does not repeat' },
  { value: 'yearly', label: 'Every year' },
  { value: 'monthly',label: 'Every month' },
  { value: 'weekly', label: 'Every week' },
]

// ─── Lookups ──────────────────────────────────────────────────────────────────
export const getCat      = id => CATEGORIES.find(c => c.id === id) || CATEGORIES[0]
export const getPerson   = id => PEOPLE.find(p => p.id === id) || PEOPLE[3]
export const getEventType= id => EVENT_TYPES.find(e => e.id === id) || EVENT_TYPES[5]

export function genId() { return crypto.randomUUID() }

// ─── Demo data ────────────────────────────────────────────────────────────────
const today = new Date()
export const DEMO_TASKS = [
  { id: genId(), title: 'Book restaurant for anniversary', category: 'dates', assigned_to: 'rhodri', status: 'todo', due_date: format(addDays(today, 3), 'yyyy-MM-dd'), reminder_minutes: 1440, completed: false, created_at: new Date().toISOString() },
  { id: genId(), title: 'Grocery run', category: 'errands', assigned_to: 'becky', status: 'todo', due_date: format(addDays(today, 1), 'yyyy-MM-dd'), reminder_minutes: 60, completed: false, created_at: new Date().toISOString() },
  { id: genId(), title: 'Pay rent', category: 'finance', assigned_to: 'both', status: 'in_progress', due_date: format(addDays(today, 7), 'yyyy-MM-dd'), reminder_minutes: 1440, completed: false, created_at: new Date().toISOString() },
  { id: genId(), title: "Lana's vet check-up", category: 'health', assigned_to: 'lana', status: 'todo', due_date: format(addDays(today, 5), 'yyyy-MM-dd'), reminder_minutes: 1440, completed: false, created_at: new Date().toISOString() },
]

export const DEMO_EVENTS = [
  { id: genId(), title: "Rhodri's Birthday", event_type: 'birthday', assigned_to: 'rhodri', start_date: format(addDays(today, 12), 'yyyy-MM-dd'), end_date: format(addDays(today, 12), 'yyyy-MM-dd'), all_day: true, start_time: null, recur: 'yearly', notes: '', created_at: new Date().toISOString() },
  { id: genId(), title: 'Holiday in India', event_type: 'holiday', assigned_to: 'both', start_date: format(addDays(today, 20), 'yyyy-MM-dd'), end_date: format(addDays(today, 34), 'yyyy-MM-dd'), all_day: true, start_time: null, recur: 'none', notes: 'Flights booked! Remember passports.', created_at: new Date().toISOString() },
]

export const DEMO_NOTES = [
  { id: genId(), text: 'Ideas for weekend trips: Bath, Lake District, Edinburgh', author: 'becky', created_at: new Date().toISOString() },
]
