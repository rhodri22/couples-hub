import { useState, useEffect } from 'react'
import {
  Plus, X, Check, List, Columns, Bell, BellOff, ChevronLeft, ChevronRight, Palette,
  RefreshCw, AlertCircle, Pencil, Trash2, Clock, Heart, CalendarDays, StickyNote,
  CalendarHeart, AlarmClock, Flame, Trophy, Plane, LayoutTemplate,
  Sparkles, Repeat, Users, MoreHorizontal, CalendarPlus, Wallet,
  Wand2, Award, Star, Gift, HeartPulse, Wine, Crown, Lock, Send, Loader2,
  TrendingUp, Gem, Mail, Download, Copy, Mic, Luggage
} from 'lucide-react'
import { supabase, HOUSEHOLD_ID } from './supabase'
import {
  requestNotificationPermission, scheduleNotification, cancelNotification,
  scheduleEventNotification, cancelEventNotification, rescheduleAll, updateBadge
} from './notifications'
import { subscribeToPush, ensurePushSubscribed } from './push'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday,
  addMonths, subMonths, parseISO, isBefore, startOfDay, isWithinInterval,
  differenceInCalendarDays, addHours, addDays
} from 'date-fns'
import {
  PEOPLE, CATEGORIES, EVENT_TYPES, KANBAN_COLS, REMINDER_OPTIONS, RECUR_OPTIONS,
  getCat, getPerson, getEventType, genId, ASSIGNABLE, getAssignees, assigneeIds, primaryPerson, normalizeAssign,
  DEMO_TASKS, DEMO_EVENTS, DEMO_NOTES, DEMO_TEMPLATES, DEMO_SETTINGS,
  MOOD_LEVELS, getMood, DATE_VIBES, DATE_BUDGETS, DATE_TIMES, BADGES, levelTitle,
  DEMO_MOODS, DEMO_REWARDS, DEMO_DATE_IDEAS
} from './constants'
import { parseTaskText, describeParse } from './nlp'
import { buildNextInstance, isPaused, nextAssignee } from './recurrence'
import { computeStreak, computePoints, weeklyLeaderboard } from './stats'
import { earnedXP, spentXP, coupleLevel, unlockedBadges, localDateIdeas } from './gamification'
import { addEventToCalendar, emailEvent } from './ics'
import './App.css'

export default function App() {
  const [tasks, setTasks]       = useState(DEMO_TASKS)
  const [events, setEvents]     = useState(DEMO_EVENTS)
  const [notes, setNotes]       = useState(DEMO_NOTES)
  const [templates, setTemplates] = useState(DEMO_TEMPLATES)
  const [settings, setSettings] = useState(DEMO_SETTINGS)
  const [moods, setMoods]       = useState(DEMO_MOODS)
  const [rewards, setRewards]   = useState(DEMO_REWARDS)
  const [dateIdeas, setDateIdeas] = useState(DEMO_DATE_IDEAS)
  const [expenses, setExpenses] = useState([])
  const [view, setView]         = useState(() => {
    try { const v = new URLSearchParams(window.location.search).get('view'); if (['home', 'tasks', 'calendar', 'expenses', 'notes', 'us'].includes(v)) return v } catch {}
    return 'calendar'
  })
  const [taskLayout, setTaskLayout] = useState('list')
  const [whoami, setWhoami]     = useState(() => { try { return localStorage.getItem('hub-whoami') || '' } catch { return '' } })
  const [showWelcome, setShowWelcome] = useState(() => { try { return !localStorage.getItem('hub-welcomed') } catch { return true } })
  const [moreSheet, setMoreSheet]   = useState(false)
  const [taskModal, setTaskModal]   = useState(null)
  const [eventModal, setEventModal] = useState(null)
  const [tplModal, setTplModal]     = useState(false)
  const [awayModal, setAwayModal]   = useState(false)
  const [subscribeModal, setSubscribeModal] = useState(false)
  const [emailModal, setEmailModal]   = useState(false)
  const [aiModal, setAiModal]       = useState(false)
  const [voiceModal, setVoiceModal] = useState(false)
  const [travelModal, setTravelModal] = useState(false)
  const [toast, setToast]           = useState(null)
  const [syncStatus, setSyncStatus] = useState('idle')
  const [notifPerm, setNotifPerm]   = useState(typeof Notification !== 'undefined' ? Notification.permission : 'default')
  const [filterPerson, setFilterPerson] = useState('all')
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('hub-theme') || 'lightgreen' } catch { return 'lightgreen' } })
  const [themeMenu, setThemeMenu] = useState(false)
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); try { localStorage.setItem('hub-theme', theme) } catch {} }, [theme])
  const THEMES = [
    { id: 'lightgreen', label: 'Light green', sw: 'linear-gradient(135deg,#7cc24a,#e85d8a)' },
    { id: 'whimsical',  label: 'Whimsical',   sw: 'linear-gradient(135deg,#8a5fd6,#ff77b5)' },
    { id: 'doggy',      label: 'Doggy',        sw: 'linear-gradient(135deg,#c8842b,#e8744f)' },
  ]
  const [filterCat, setFilterCat] = useState('all')
  const [calMonth, setCalMonth] = useState(new Date())

  const away = settings?.away || []

  // ── Load + realtime ──
  useEffect(() => {
    if (!supabase) { rescheduleAll(tasks, events); return }
    loadAll()
    const ch = supabase.channel('hub')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks',     filter: `household_id=eq.${HOUSEHOLD_ID}` }, loadTasks)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events',    filter: `household_id=eq.${HOUSEHOLD_ID}` }, loadEvents)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes',     filter: `household_id=eq.${HOUSEHOLD_ID}` }, loadNotes)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'templates', filter: `household_id=eq.${HOUSEHOLD_ID}` }, loadTemplates)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings',  filter: `household_id=eq.${HOUSEHOLD_ID}` }, loadSettings)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'moods',      filter: `household_id=eq.${HOUSEHOLD_ID}` }, loadMoods)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rewards',    filter: `household_id=eq.${HOUSEHOLD_ID}` }, loadRewards)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'date_ideas', filter: `household_id=eq.${HOUSEHOLD_ID}` }, loadDateIdeas)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses',  filter: `household_id=eq.${HOUSEHOLD_ID}` }, loadExpenses)
      .subscribe(status => { if (status === 'SUBSCRIBED') loadAll() })
    return () => supabase.removeChannel(ch)
  }, [])

  // Refetch when the app returns to the foreground / reconnects, so a device
  // waking from sleep never shows stale data (iOS drops the realtime socket).
  useEffect(() => {
    if (!supabase) return
    const refetch = () => { if (document.visibilityState === 'visible') loadAll() }
    document.addEventListener('visibilitychange', refetch)
    window.addEventListener('focus', refetch)
    window.addEventListener('online', refetch)
    return () => {
      document.removeEventListener('visibilitychange', refetch)
      window.removeEventListener('focus', refetch)
      window.removeEventListener('online', refetch)
    }
  }, [])

  // Keep this device subscribed to background push once permission is granted.
  useEffect(() => { if (whoami && notifPerm === 'granted') ensurePushSubscribed(whoami) }, [whoami, notifPerm])

  async function loadAll() { await Promise.all([loadTasks(), loadEvents(), loadNotes(), loadTemplates(), loadSettings(), loadMoods(), loadRewards(), loadDateIdeas(), loadExpenses()]) }
  function flash() { setSyncStatus('synced'); setTimeout(() => setSyncStatus('idle'), 1400) }
  function chooseWhoami(id) { setWhoami(id); try { localStorage.setItem('hub-whoami', id) } catch {} }
  function finishWelcome() { setShowWelcome(false); try { localStorage.setItem('hub-welcomed', '1') } catch {} }
  function clearSampleData() {
    if (supabase) return // live data is the couple's own; nothing to clear
    setTasks([]); setEvents([]); setNotes([]); setMoods([]); setRewards([]); setDateIdeas([])
  }
  function showError(msg) { setToast({ type: 'error', msg }); setTimeout(() => setToast(t => (t && t.msg === msg ? null : t)), 7000) }
  function showInfo(msg)  { setToast({ type: 'info', msg }); setTimeout(() => setToast(t => (t && t.msg === msg ? null : t)), 3500) }

  async function loadTasks() {
    if (!supabase) return
    const { data, error } = await supabase.from('tasks').select('*').eq('household_id', HOUSEHOLD_ID).order('created_at', { ascending: false })
    if (error) return setSyncStatus('offline')
    const norm = data.map(t => ({ ...t, subtasks: t.subtasks || [] }))
    setTasks(norm); rescheduleAll(norm, []); updateBadge(norm.filter(t => !t.completed).length); flash()
  }
  async function loadEvents() {
    if (!supabase) return
    const { data, error } = await supabase.from('events').select('*').eq('household_id', HOUSEHOLD_ID).order('start_date')
    if (error) return setSyncStatus('offline')
    setEvents(data); rescheduleAll([], data); flash()
  }
  async function loadNotes()     { if (!supabase) return; const { data, error } = await supabase.from('notes').select('*').eq('household_id', HOUSEHOLD_ID).order('created_at', { ascending: false }); if (!error) { setNotes(data); flash() } }
  async function loadTemplates() { if (!supabase) return; const { data, error } = await supabase.from('templates').select('*').eq('household_id', HOUSEHOLD_ID).order('created_at'); if (!error) { setTemplates(data); flash() } }
  async function loadSettings()  { if (!supabase) return; const { data, error } = await supabase.from('settings').select('*').eq('household_id', HOUSEHOLD_ID).maybeSingle(); if (!error && data) setSettings(data) }
  async function loadMoods()     { if (!supabase) return; const { data, error } = await supabase.from('moods').select('*').eq('household_id', HOUSEHOLD_ID).order('created_at', { ascending: false }); if (!error) { setMoods(data); flash() } }
  async function loadRewards()   { if (!supabase) return; const { data, error } = await supabase.from('rewards').select('*').eq('household_id', HOUSEHOLD_ID).order('created_at', { ascending: false }); if (!error) { setRewards(data); flash() } }
  async function loadDateIdeas() { if (!supabase) return; const { data, error } = await supabase.from('date_ideas').select('*').eq('household_id', HOUSEHOLD_ID).order('created_at', { ascending: false }); if (!error) { setDateIdeas(data); flash() } }
  async function loadExpenses()  { if (!supabase) return; const { data, error } = await supabase.from('expenses').select('*').eq('household_id', HOUSEHOLD_ID).order('created_at', { ascending: false }); if (!error) { setExpenses(data); flash() } }

  // ── Task CRUD ──
  async function saveTask(task, opts = {}) {
    setSyncStatus('syncing')
    const row = normalizeAssign({ ...task, household_id: HOUSEHOLD_ID })
    if (!row.due_date) row.due_date = null   // undated tasks stay undated (no phantom deadline)
    if (supabase) {
      const r = await resilientUpsert('tasks', row)
      if (!r.ok) { setSyncStatus('offline'); showError(`Couldn't save task — ${r.message}`); return }
      if (r.dropped.includes('assignees') && !_migrateNudged) { _migrateNudged = true; showError('Saved — but with a single assignee only. To assign several people, run the latest database update (schema.sql) in Supabase → SQL Editor.') }
    }
    const isNew = tasks.findIndex(t => t.id === row.id) < 0
    setTasks(prev => { const i = prev.findIndex(t => t.id === row.id); if (i >= 0) { const n = [...prev]; n[i] = row; return n } return [row, ...prev] })
    scheduleNotification(row); flash()
    if (!opts.silent) enqueuePartnerNudge('task', row, isNew)
  }
  async function deleteTask(id) {
    cancelNotification(id)
    if (supabase) { const { error } = await supabase.from('tasks').delete().eq('id', id); if (error) { showError(`Couldn't delete task — ${error.message}`); return } }
    setTasks(prev => prev.filter(t => t.id !== id))
  }
  async function saveExpense(exp) {
    const row = { ...exp, household_id: HOUSEHOLD_ID }
    if (supabase) { const r = await resilientUpsert('expenses', row); if (!r.ok) { showError(`Couldn't save expense — ${r.message}`); return } }
    setExpenses(prev => { const i = prev.findIndex(e => e.id === row.id); if (i >= 0) { const n = [...prev]; n[i] = row; return n } return [row, ...prev] })
    flash()
  }
  async function toggleSettle(exp) { await saveExpense({ ...exp, settled: !exp.settled, settled_at: !exp.settled ? new Date().toISOString() : null }) }
  async function deleteExpense(id) {
    if (supabase) { const { error } = await supabase.from('expenses').delete().eq('id', id); if (error) { showError(`Couldn't delete expense — ${error.message}`); return } }
    setExpenses(prev => prev.filter(e => e.id !== id))
  }
  async function settleAll() { for (const e of expenses.filter(x => !x.settled)) await saveExpense({ ...e, settled: true, settled_at: new Date().toISOString() }) }
  // Spawn the next instance of a recurring task — but only if an identical
  // upcoming instance doesn't already exist. This stops duplicates piling up
  // when a recurring task is un-ticked and re-ticked.
  async function spawnNextIfNeeded(task) {
    if (!task.recur || task.recur === 'none') return
    const next = buildNextInstance(task, away)
    if (!next) return
    const dupe = tasks.some(t => t.id !== task.id && !t.completed && t.title === next.title && t.due_date === next.due_date && t.recur === next.recur)
    if (dupe) return
    await saveTask(next, { silent: true })
  }
  async function toggleComplete(task) {
    const nowDone = !task.completed
    const updated = { ...task, completed: nowDone, status: nowDone ? 'done' : 'todo', completed_at: nowDone ? new Date().toISOString() : null }
    await saveTask(updated)
    if (nowDone) await spawnNextIfNeeded(task)
  }
  async function setTaskStatus(task, status) {
    const completed = status === 'done'
    const wasDone = task.completed
    await saveTask({ ...task, status, completed, completed_at: completed ? (task.completed_at || new Date().toISOString()) : null })
    if (completed && !wasDone) await spawnNextIfNeeded(task)
  }
  async function moveKanban(task, status) { await saveTask({ ...task, status, completed: status === 'done', completed_at: status === 'done' ? new Date().toISOString() : null }) }
  async function snooze(task, hours) {
    const base = new Date()
    const until = hours >= 24 ? addDays(base, hours / 24) : addHours(base, hours)
    const newDue = format(until, 'yyyy-MM-dd')
    await saveTask({ ...task, due_date: newDue, snoozed_until: until.toISOString() })
  }
  async function toggleSubtask(task, subId) {
    const subtasks = (task.subtasks || []).map(s => s.id === subId ? { ...s, done: !s.done } : s)
    await saveTask({ ...task, subtasks })
  }

  // ── Event CRUD ──
  async function saveEvent(ev, opts = {}) {
    setSyncStatus('syncing')
    const row = normalizeAssign({ ...ev, household_id: HOUSEHOLD_ID })
    if (supabase) {
      const r = await resilientUpsert('events', row)
      if (!r.ok) { setSyncStatus('offline'); showError(`Couldn't save event — ${r.message}`); return { ok: false, message: r.message } }
      if (r.dropped.includes('assignees') && !_migrateNudged) { _migrateNudged = true; showError('Saved — but with a single assignee only. To assign several people, run the latest database update (schema.sql) in Supabase → SQL Editor.') }
    }
    const isNew = events.findIndex(e => e.id === row.id) < 0
    setEvents(prev => { const i = prev.findIndex(e => e.id === row.id); if (i >= 0) { const n = [...prev]; n[i] = row; return n } return [...prev, row] })
    scheduleEventNotification(row); flash()
    if (!opts.silent) enqueuePartnerNudge('event', row, isNew)
    return { ok: true }
  }
  async function deleteEvent(id) {
    cancelEventNotification(id)
    if (supabase) {
      const { error } = await supabase.from('events').delete().eq('id', id)
      if (error) { showError(`Couldn't delete event — ${error.message}`); return { ok: false, message: error.message } }
    }
    setEvents(prev => prev.filter(e => e.id !== id))
    return { ok: true }
  }

  // ── Notes ──
  async function saveNote(n) { setSyncStatus('syncing'); const row = { ...n, household_id: HOUSEHOLD_ID }; if (supabase) { const { error } = await supabase.from('notes').upsert(row); if (error) { setSyncStatus('offline'); showError('Could not save: ' + error.message); return } } setNotes(prev => { const i = prev.findIndex(x => x.id === row.id); if (i >= 0) { const c = [...prev]; c[i] = row; return c } return [row, ...prev] }); flash() }
  async function deleteNote(id) { if (supabase) { const { error } = await supabase.from('notes').delete().eq('id', id); if (error) { showError('Could not delete: ' + error.message); return } } setNotes(prev => prev.filter(n => n.id !== id)) }

  // ── Templates (#8) ──
  async function saveTemplate(tpl) { setSyncStatus('syncing'); const row = { ...tpl, household_id: HOUSEHOLD_ID }; if (supabase) { const { error } = await supabase.from('templates').upsert(row); if (error) { setSyncStatus('offline'); showError('Could not save: ' + error.message); return } } setTemplates(prev => { const i = prev.findIndex(x => x.id === row.id); if (i >= 0) { const c = [...prev]; c[i] = row; return c } return [...prev, row] }); flash() }
  async function deleteTemplate(id) { if (supabase) { const { error } = await supabase.from('templates').delete().eq('id', id); if (error) { showError('Could not delete: ' + error.message); return } } setTemplates(prev => prev.filter(t => t.id !== id)) }
  async function useTemplate(tpl) {
    for (const item of tpl.items) {
      await saveTask({
        id: genId(), title: item.title, category: item.category || 'home', assigned_to: item.assigned_to || 'both',
        status: 'todo', due_date: '', reminder_minutes: null, completed: false, recur: 'none',
        completed_at: null, snoozed_until: null, rotation: null,
        subtasks: (item.subtasks || []).map(s => ({ id: genId(), text: s, done: false })),
        created_at: new Date().toISOString(),
      }, { silent: true })
    }
    setTplModal(false); setView('tasks'); setTaskLayout('board')
  }

  // ── Settings / vacation (#6) ──
  async function saveSettings(next) {
    setSettings(next)
    const row = { ...next, household_id: HOUSEHOLD_ID }
    if (supabase) { const { error } = await supabase.from('settings').upsert(row); if (error) { showError(`Couldn't save settings — ${error.message}`); return { ok: false, message: error.message } } }
    return { ok: true }
  }
  function toggleAway(personId) {
    const set = new Set(away)
    set.has(personId) ? set.delete(personId) : set.add(personId)
    saveSettings({ ...settings, away: [...set] })
  }

  // ── Relationship pulse ──
  async function saveMood(m) {
    setSyncStatus('syncing')
    const row = { ...m, household_id: HOUSEHOLD_ID }
    if (supabase) { const { error } = await supabase.from('moods').upsert(row); if (error) { setSyncStatus('offline'); showError('Could not save: ' + error.message); return } }
    setMoods(prev => { const i = prev.findIndex(x => x.id === row.id); if (i >= 0) { const c = [...prev]; c[i] = row; return c } return [row, ...prev] }); flash()
  }

  // ── Reward coupons ──
  async function saveReward(r) {
    setSyncStatus('syncing')
    const row = { ...r, household_id: HOUSEHOLD_ID }
    if (supabase) { const { error } = await supabase.from('rewards').upsert(row); if (error) { setSyncStatus('offline'); showError('Could not save: ' + error.message); return } }
    setRewards(prev => { const i = prev.findIndex(x => x.id === row.id); if (i >= 0) { const c = [...prev]; c[i] = row; return c } return [row, ...prev] }); flash()
  }
  async function redeemReward(reward, byPerson) { await saveReward({ ...reward, redeemed_by: byPerson, redeemed_at: new Date().toISOString() }) }
  async function deleteReward(id) { if (supabase) { const { error } = await supabase.from('rewards').delete().eq('id', id); if (error) { showError('Could not delete: ' + error.message); return } } setRewards(prev => prev.filter(r => r.id !== id)) }

  // ── Date ideas ──
  async function saveDateIdea(d) {
    setSyncStatus('syncing')
    const row = { ...d, household_id: HOUSEHOLD_ID }
    if (supabase) { const { error } = await supabase.from('date_ideas').upsert(row); if (error) { setSyncStatus('offline'); showError('Could not save: ' + error.message); return } }
    setDateIdeas(prev => { const i = prev.findIndex(x => x.id === row.id); if (i >= 0) { const c = [...prev]; c[i] = row; return c } return [row, ...prev] }); flash()
  }
  async function toggleDateDone(idea) { await saveDateIdea({ ...idea, done: !idea.done, done_at: !idea.done ? new Date().toISOString() : null }) }
  async function deleteDateIdea(id) { if (supabase) { const { error } = await supabase.from('date_ideas').delete().eq('id', id); if (error) { showError('Could not delete: ' + error.message); return } } setDateIdeas(prev => prev.filter(d => d.id !== id)) }
  async function deleteAllMoods() { if (supabase) { const { error } = await supabase.from('moods').delete().eq('household_id', HOUSEHOLD_ID); if (error) { showError('Could not delete: ' + error.message); return } } setMoods([]) }
  async function dateToCalendar(idea) {
    await saveEvent({
      id: genId(), title: idea.title, event_type: 'dates', assigned_to: 'both',
      start_date: format(new Date(), 'yyyy-MM-dd'), end_date: format(new Date(), 'yyyy-MM-dd'),
      all_day: true, start_time: '', recur: 'none', reminder_minutes: 1440,
      notes: idea.description || '', created_at: new Date().toISOString(),
    })
  }

  // ── AI brain (calls /api/ai serverless function) ──
  async function callAI(mode, payload) {
    const headers = { 'content-type': 'application/json' }
    const hubSecret = import.meta.env.VITE_HUB_SECRET
    if (hubSecret) headers['x-hub-secret'] = hubSecret
    const res = await fetch('/api/ai', {
      method: 'POST', headers,
      body: JSON.stringify({ mode, payload }),
    })
    if (!res.ok) { let code = res.status; try { code = (await res.json()).error || code } catch {} throw Object.assign(new Error('ai_failed'), { code }) }
    return res.json()
  }

  // ── Voice / natural-language capture (#3) ──
  const aiContext = () => ({ today: format(new Date(), 'yyyy-MM-dd'), tz: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return 'Europe/Berlin' } })() })
  async function parseSmart(text) {
    const res = await callAI('create_item', { text, ...aiContext() })
    return res.parsed || null
  }
  async function smartCreate(p) {
    if (!p || !p.title) return
    const now = new Date().toISOString()
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    if (p.kind === 'event') {
      const timed = !!p.time && p.all_day === false
      await saveEvent({
        id: genId(), title: p.title, event_type: p.event_type || 'other', assigned_to: p.assignee || 'both',
        start_date: p.date || todayStr, end_date: p.end_date || p.date || todayStr,
        all_day: !timed, start_time: timed ? p.time : '', recur: p.recur || 'none', reminder_minutes: 1440,
        notes: p.notes || '', created_at: now,
      })
    } else {
      await saveTask({
        id: genId(), title: p.title, category: p.category || 'home', assigned_to: p.assignee || 'both',
        status: 'todo', due_date: p.date || '', reminder_minutes: p.date ? 1440 : null,
        completed: false, recur: p.recur || 'none', completed_at: null, snoozed_until: null,
        rotation: null, subtasks: [], created_at: now,
      })
    }
  }

  // ── Travel import (#4) ──
  async function parseTravel(text) {
    const res = await callAI('parse_travel', { text, ...aiContext() })
    return (res.parsed && Array.isArray(res.parsed.events)) ? res.parsed.events : []
  }
  async function addTravelEvents(list) {
    for (const e of list) {
      if (!e || !e.start_date) continue
      await saveEvent({
        id: genId(), title: e.title || 'Trip', event_type: e.event_type || 'holiday', assigned_to: 'both',
        start_date: e.start_date, end_date: e.end_date || e.start_date,
        all_day: e.all_day !== false && !e.start_time, start_time: e.start_time || '',
        recur: 'none', reminder_minutes: 1440, notes: e.notes || '', created_at: new Date().toISOString(),
      }, { silent: true })
    }
  }

  // Apply an AI week-plan suggestion: update existing task (by id) or create new
  async function applySuggestion(s) {
    const existing = s.id && tasks.find(t => t.id === s.id)
    if (existing) { await saveTask({ ...existing, assigned_to: s.assigned_to || existing.assigned_to, due_date: s.date || existing.due_date }) }
    else {
      await saveTask({
        id: genId(), title: s.title, category: 'home', assigned_to: s.assigned_to || 'both',
        status: 'todo', due_date: s.date || '', reminder_minutes: s.date ? 1440 : null,
        completed: false, recur: 'none', completed_at: null, snoozed_until: null,
        rotation: null, subtasks: [], created_at: new Date().toISOString(),
      }, { silent: true })
    }
  }

  async function enableNotifications() {
    const perm = await requestNotificationPermission()
    setNotifPerm(perm)
    if (perm !== 'granted') {
      if (perm === 'denied') showError('Notifications are blocked — turn them on in your browser/site settings, then tap again.')
      else if (perm === 'unsupported') showInfo('On iPhone, add the app to your Home Screen first, then enable notifications from there.')
      return
    }
    const r = await subscribeToPush(whoami)
    if (r.ok) showInfo("Notifications on — you'll be reminded even when the app is closed 🔔")
    else if (r.reason === 'no_vapid_key') showInfo('Notifications on while the app is open. (Background push not set up yet — see PUSH_SETUP.md.)')
    else if (r.reason === 'unsupported') showInfo('This browser can only notify while the app is open. On iPhone, add it to your Home Screen first.')
    else showError(`Couldn't finish enabling background push — ${r.reason || 'unknown error'}`)
  }

  // Nudge the other partner's devices when a new task/event is added.
  async function enqueuePartnerNudge(kind, row, isNew) {
    if (!supabase || !isNew || !whoami) return
    const partner = whoami === 'rhodri' ? 'becky' : whoami === 'becky' ? 'rhodri' : null
    if (!partner) return
    const me = (getPerson(whoami) || {}).label || 'Your partner'
    const title = kind === 'event' ? `📅 ${me} added an event` : `📝 ${me} added a task`
    try {
      await supabase.from('push_outbox').insert({
        household_id: HOUSEHOLD_ID, target_person: partner,
        title, body: row.title || '', url: kind === 'event' ? '/?view=calendar' : '/?view=tasks',
      })
    } catch (e) { /* non-fatal */ }
  }

  // ── Quick add via natural language (#3) ──
  async function quickAdd(text) {
    const p = parseTaskText(text)
    await saveTask({
      id: genId(), title: p.title, category: p.category || 'home', assigned_to: p.assigned_to || 'both',
      status: 'todo', due_date: p.due_date || '', reminder_minutes: p.due_date ? 1440 : null,
      completed: false, recur: p.recur || 'none', completed_at: null, snoozed_until: null,
      rotation: null, subtasks: [], created_at: new Date().toISOString(),
    })
  }

  const filteredTasks = tasks.filter(t =>
    (filterPerson === 'all' || assigneeIds(t).length === 0 || assigneeIds(t).includes(filterPerson)) &&
    (filterCat === 'all' || t.category === filterCat))
  const filteredEvents = events.filter(e => filterPerson === 'all' || assigneeIds(e).length === 0 || assigneeIds(e).includes(filterPerson))
  const pendingCount = tasks.filter(t => !t.completed).length

  function headerAdd() {
    if (view === 'calendar') setEventModal({})
    else if (view === 'notes') {}
    else setTaskModal({})
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <Heart size={20} className="header-heart" />
          <h1 className="app-title">Couple's Hub</h1>
        </div>
        <div className="header-right">
          <div className="theme-wrap">
            <button className="icon-btn" onClick={() => setThemeMenu(m => !m)} title="Theme"><Palette size={16} /></button>
            {themeMenu && (
              <div className="theme-menu">
                {THEMES.map(tm => (
                  <button key={tm.id} className={theme === tm.id ? 'on' : ''} onClick={() => { setTheme(tm.id); setThemeMenu(false) }}>
                    <span className="theme-sw" style={{ background: tm.sw }} />{tm.label}{theme === tm.id && <Check size={14} className="tm-check" />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="icon-btn" onClick={() => setVoiceModal(true)} title="Add by voice">
            <Mic size={16} />
          </button>
          <button className="icon-btn ai-btn" onClick={() => setAiModal(true)} title="AI assistant">
            <Wand2 size={16} />
          </button>
          <button className="icon-btn" onClick={() => setAwayModal(true)} title="Away / vacation mode">
            <Plane size={16} className={away.length ? 'active-away' : ''} />
          </button>
          <button className="icon-btn" onClick={() => setSubscribeModal(true)} title="Subscribe in your calendar">
            <CalendarPlus size={16} />
          </button>
          <button className="icon-btn" onClick={() => setEmailModal(true)} title="Email reminders">
            <Mail size={16} />
          </button>
          <SyncDot status={syncStatus} />
          {notifPerm !== 'granted' && <button className="icon-btn" onClick={enableNotifications} title="Enable notifications"><BellOff size={16} /></button>}
          {pendingCount > 0 && <span className="badge">{pendingCount}</span>}
          {(view === 'home' || view === 'tasks' || view === 'calendar') &&
            <button className="add-btn" onClick={headerAdd} title="Add"><Plus size={20} /></button>}
        </div>
      </header>

      {away.length > 0 && (
        <div className="away-banner">
          <Plane size={14} />
          {away.map(id => getPerson(id).label).join(' & ')} {away.length > 1 ? 'are' : 'is'} away — their recurring chores are paused or reassigned.
          <button onClick={() => setAwayModal(true)}>Manage</button>
        </div>
      )}

      <div className="filters-bar">
        <div className="view-switcher">
          <button className={view === 'home' ? 'active' : ''}     onClick={() => setView('home')}><Heart size={15} />Today</button>
          <button className={view === 'tasks' ? 'active' : ''}    onClick={() => setView('tasks')}><Check size={15} />Tasks</button>
          <button className={view === 'calendar' ? 'active' : ''} onClick={() => setView('calendar')}><CalendarDays size={15} />Calendar</button>
          <button className={view === 'expenses' ? 'active' : ''} onClick={() => setView('expenses')}><Wallet size={15} />Expenses</button>
          <button className={view === 'us' || view === 'notes' ? 'active' : ''} onClick={() => setMoreSheet(true)}><MoreHorizontal size={15} />More</button>
        </div>
        {(view === 'tasks' || view === 'calendar') && (
          <div className="filter-chips">
            <select value={filterPerson} onChange={e => setFilterPerson(e.target.value)} className="filter-select">
              <option value="all">Everyone</option>
              {ASSIGNABLE.map(p => <option key={p.id} value={p.id}>{p.icon} {p.label}</option>)}
            </select>
            {view === 'tasks' && (
              <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="filter-select">
                <option value="all">All categories</option>
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            )}
            {view === 'tasks' && (
              <div className="layout-toggle">
                <button className={taskLayout === 'list' ? 'on' : ''} onClick={() => setTaskLayout('list')} title="List"><List size={14} /></button>
                <button className={taskLayout === 'board' ? 'on' : ''} onClick={() => setTaskLayout('board')} title="Board"><Columns size={14} /></button>
              </div>
            )}
          </div>
        )}
      </div>

      <main className="app-main">
        {view === 'home' && <HomeView whoami={whoami} tasks={tasks} events={events} away={away}
                              onQuickAdd={quickAdd} onTemplates={() => setTplModal(true)}
                              onToggle={toggleComplete} onEditTask={setTaskModal} onEditEvent={setEventModal}
                              onAddEvent={() => setEventModal({})} goto={setView} />}
        {view === 'tasks' && (
          <>
            <OverviewBar tasks={filteredTasks} allTasks={tasks} events={events} away={away} />
            <QuickAdd onAdd={quickAdd} onTemplates={() => setTplModal(true)} />
            {taskLayout === 'board'
              ? <KanbanView tasks={filteredTasks} away={away} onEdit={setTaskModal} onDelete={deleteTask} onToggle={toggleComplete} onMove={moveKanban} onSnooze={snooze} onSubtask={toggleSubtask} />
              : <ListView   tasks={filteredTasks} away={away} onEdit={setTaskModal} onDelete={deleteTask} onToggle={toggleComplete} onSnooze={snooze} onSubtask={toggleSubtask} onSetStatus={setTaskStatus} />}
          </>
        )}
        {view === 'calendar' && <CalendarView events={filteredEvents} tasks={filteredTasks} month={calMonth} setMonth={setCalMonth} onEditEvent={setEventModal} onAddOnDate={d => setEventModal({ start_date: format(d, 'yyyy-MM-dd'), end_date: format(d, 'yyyy-MM-dd') })} onQuickDelete={deleteEvent} onAddToCalendar={addEventToCalendar} />}
        {view === 'us'       && <UsView tasks={tasks} dateIdeas={dateIdeas} moods={moods} rewards={rewards} whoami={whoami}
                                  onSaveMood={saveMood} onDeleteMoods={deleteAllMoods} onSaveReward={saveReward} onRedeem={redeemReward} onDeleteReward={deleteReward}
                                  onSaveDateIdea={saveDateIdea} onToggleDate={toggleDateDone} onDeleteDate={deleteDateIdea} onDateToCalendar={dateToCalendar}
                                  callAI={callAI} />}
        {view === 'notes'    && <NotesView notes={notes} events={events} tasks={tasks} onSave={saveNote} onDelete={deleteNote} />}
        {view === 'expenses' && <ExpensesView expenses={expenses} onSave={saveExpense} onToggleSettle={toggleSettle} onDelete={deleteExpense} onSettleAll={settleAll} />}
      </main>

      {taskModal !== null && <TaskModal task={taskModal} away={away} onSave={async t => { await saveTask(t); setTaskModal(null) }} onClose={() => setTaskModal(null)} />}
      {eventModal !== null && <EventModal event={eventModal} onSave={async e => { const r = await saveEvent(e); if (r.ok) setEventModal(null); return r }} onDelete={async id => { const r = await deleteEvent(id); if (r.ok) setEventModal(null); return r }} onClose={() => setEventModal(null)} />}
      {tplModal && <TemplatesModal templates={templates} onUse={useTemplate} onSave={saveTemplate} onDelete={deleteTemplate} onClose={() => setTplModal(false)} />}
      {awayModal && <AwayModal away={away} onToggle={toggleAway} onClose={() => setAwayModal(false)} />}
      {subscribeModal && <SubscribeModal onClose={() => setSubscribeModal(false)} />}
      {emailModal && <EmailModal settings={settings} onSave={saveSettings} onError={showError} onClose={() => setEmailModal(false)} />}
      {moreSheet && <MoreSheet onClose={() => setMoreSheet(false)} goto={v => { setView(v); setMoreSheet(false) }}
                      open={{ ai: () => { setAiModal(true); setMoreSheet(false) }, voice: () => { setVoiceModal(true); setMoreSheet(false) }, travel: () => { setTravelModal(true); setMoreSheet(false) }, templates: () => { setTplModal(true); setMoreSheet(false) }, away: () => { setAwayModal(true); setMoreSheet(false) }, email: () => { setEmailModal(true); setMoreSheet(false) }, subscribe: () => { setSubscribeModal(true); setMoreSheet(false) }, welcome: () => { setShowWelcome(true); setMoreSheet(false) } }}
                      whoami={whoami} away={away} />}
      {showWelcome && <WelcomeModal whoami={whoami} onChoose={chooseWhoami} onClearSample={clearSampleData} onClose={finishWelcome} demo={!supabase} />}
      {aiModal && <AiModal tasks={tasks} events={events} away={away} moods={moods} callAI={callAI} onApply={applySuggestion} onClose={() => setAiModal(false)} />}
      {voiceModal && <VoiceAddModal onParse={parseSmart} onCreate={smartCreate} onClose={() => setVoiceModal(false)} />}
      {travelModal && <TravelModal onParse={parseTravel} onAdd={addTravelEvents} onClose={() => setTravelModal(false)} />}

      {toast && (
        <div className={`toast toast-${toast.type}`} onClick={() => setToast(null)} role="status">
          {toast.type === 'error' ? <AlertCircle size={16} /> : <Check size={16} />}
          <span>{toast.msg}</span>
          <button className="toast-x" onClick={() => setToast(null)}><X size={13} /></button>
        </div>
      )}
    </div>
  )
}

// ─── Sync dot ─────────────────────────────────────────────────────────────────
function SyncDot({ status }) {
  const cls = { idle: '', syncing: 'spinning', synced: 'synced', offline: 'offline' }[status]
  const title = { idle: 'Synced', syncing: 'Syncing…', synced: 'Synced', offline: 'Offline — changes saved locally' }[status]
  return <div className={`sync-dot ${cls}`} title={title}>{status === 'syncing' && <RefreshCw size={10} />}{status === 'synced' && <Check size={10} />}{status === 'offline' && <AlertCircle size={10} />}</div>
}

// ─── Quick add bar (#3) ───────────────────────────────────────────────────────
function QuickAdd({ onAdd, onTemplates }) {
  const [text, setText] = useState('')
  const parsed = text.trim() ? parseTaskText(text) : null
  const chips = parsed ? describeParse(parsed) : []
  function submit() { if (text.trim()) { onAdd(text); setText('') } }
  return (
    <div className="quick-add">
      <div className="quick-add-row">
        <Sparkles size={16} className="qa-icon" />
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder='Quick add — e.g. "Walk Lana tomorrow 8am every day for becky"'
        />
        <button className="qa-tpl" onClick={onTemplates} title="Templates"><LayoutTemplate size={16} /></button>
        <button className="qa-add" onClick={submit} disabled={!text.trim()}><Plus size={16} /></button>
      </div>
      {chips.length > 0 && (
        <div className="qa-preview">
          {chips.map((c, i) => <span key={i} className="qa-chip">{c}</span>)}
          <span className="qa-title-preview">“{parsed.title}”</span>
        </div>
      )}
    </div>
  )
}

// ─── Overview bar (#3 status, #4 streak/points) ───────────────────────────────
function OverviewBar({ tasks, allTasks, events, away }) {
  const todayStart = startOfDay(new Date())
  const overdue = tasks.filter(t => !t.completed && t.due_date && isBefore(parseISO(t.due_date), todayStart) && !isPaused(t, away))
  const dueToday = tasks.filter(t => !t.completed && t.due_date && isSameDay(parseISO(t.due_date), todayStart))
  const done = tasks.filter(t => t.completed).length
  const total = tasks.length
  const pct = total ? Math.round((done / total) * 100) : 0
  const streak = computeStreak(allTasks)
  const upcoming = [...events].filter(e => !isBefore(parseISO(e.end_date || e.start_date), todayStart)).sort((a, b) => parseISO(a.start_date) - parseISO(b.start_date))[0]
  const daysToEvent = upcoming ? differenceInCalendarDays(parseISO(upcoming.start_date), todayStart) : null

  return (
    <div className="overview-bar">
      <div className="ov-top">
        <div className="ov-stats">
          <div className={`ov-stat ${overdue.length ? 'alert' : ''}`}><span className="ov-num">{overdue.length}</span><span className="ov-label">Overdue</span></div>
          <div className={`ov-stat ${dueToday.length ? 'warn' : ''}`}><span className="ov-num">{dueToday.length}</span><span className="ov-label">Today</span></div>
          <div className="ov-stat"><span className="ov-num">{total - done}</span><span className="ov-label">Open</span></div>
          <div className="ov-stat ok"><span className="ov-num">{done}</span><span className="ov-label">Done</span></div>
        </div>
        {streak > 0 && <div className="ov-streak" title="Consecutive days completing tasks"><Flame size={18} /><span className="streak-num">{streak}</span><span className="streak-label">day streak</span></div>}
      </div>

      <div className="ov-progress-wrap">
        <div className="ov-progress-label">{pct}% complete</div>
        <div className="ov-progress-track"><div className="ov-progress-fill" style={{ width: `${pct}%` }} /></div>
      </div>

      {(overdue.length > 0 || dueToday.length > 0) && (
        <div className="ov-reminders">
          {overdue.length > 0 && <div className="ov-reminder alert"><AlertCircle size={13} /> {overdue.length} overdue{overdue.slice(0, 2).map(t => <span key={t.id} className="ov-chip">{t.title}</span>)}</div>}
          {dueToday.length > 0 && <div className="ov-reminder warn"><AlarmClock size={13} /> {dueToday.length} due today{dueToday.slice(0, 2).map(t => <span key={t.id} className="ov-chip">{t.title}</span>)}</div>}
        </div>
      )}

      {upcoming && daysToEvent >= 0 && (
        <div className="ov-countdown">
          <CalendarHeart size={14} />
          <span>{getEventType(upcoming.event_type).icon} <strong>{upcoming.title}</strong></span>
          <span className="ov-countdown-num">{daysToEvent === 0 ? 'Today!' : daysToEvent === 1 ? 'Tomorrow' : `in ${daysToEvent} days`}</span>
        </div>
      )}
    </div>
  )
}

// ─── Kanban ───────────────────────────────────────────────────────────────────
function KanbanView({ tasks, away, onEdit, onDelete, onToggle, onMove, onSnooze, onSubtask }) {
  return (
    <div className="kanban">
      {KANBAN_COLS.map(col => {
        const colTasks = tasks.filter(t => t.status === col.id)
        return (
          <div key={col.id} className="kanban-col">
            <div className="kanban-col-header" style={{ borderColor: col.color }}>
              <span className="col-title">{col.label}</span>
              <span className="col-count" style={{ background: col.color }}>{colTasks.length}</span>
            </div>
            <div className="kanban-cards">
              {colTasks.map(t => <TaskCard key={t.id} task={t} away={away} onEdit={onEdit} onDelete={onDelete} onToggle={onToggle} onMove={onMove} onSnooze={onSnooze} onSubtask={onSubtask} />)}
              {colTasks.length === 0 && <div className="empty-col">No tasks here</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Task card (#1 recur badge, #2 rotation, #7 snooze, #9 subtasks) ──────────
let _migrateNudged = false
async function resilientUpsert(table, row) {
  let payload = { ...row }
  const dropped = []
  for (let i = 0; i < 6; i++) {
    const { error } = await supabase.from(table).upsert(payload)
    if (!error) return { ok: true, dropped }
    const m = error.message || ''
    const col = m.match(/Could not find the '([^']+)' column/)
    if (col && (col[1] in payload) && !['id', 'household_id', 'title'].includes(col[1])) {
      delete payload[col[1]]; dropped.push(col[1]); continue
    }
    return { ok: false, message: m }
  }
  return { ok: false, message: 'Could not save after several attempts.' }
}

function eventOccursOn(e, day) {
  const s = startOfDay(parseISO(e.start_date))
  const en = startOfDay(parseISO(e.end_date || e.start_date))
  if (isWithinInterval(day, { start: s, end: en }) || isSameDay(day, s)) return true
  const r = e.recur
  if (!r || r === 'none' || isBefore(startOfDay(day), s)) return false
  const D = startOfDay(day)
  if (e.recur_until && format(D, 'yyyy-MM-dd') > e.recur_until) return false   // bounded end date
  if (r === 'daily') return true
  if (r === 'weekly') {
    const days = String(e.recur_days || '').split(',').map(n => parseInt(n, 10)).filter(n => n >= 0 && n <= 6)
    return days.length ? days.includes(D.getDay()) : D.getDay() === s.getDay()  // multi-weekday (Tue & Thu) or same-weekday
  }
  if (r === 'monthly') return D.getDate() === s.getDate()
  if (r === 'yearly') return D.getDate() === s.getDate() && D.getMonth() === s.getMonth()
  return false
}

function AssigneeBadges({ item }) {
  const people = getAssignees(item)
  const show = people.length ? people : [getPerson('both')]
  return <span className="who-stack">{show.map(p => <span key={p.id} className="home-task-who" style={{ background: p.color }} title={p.label}>{p.icon}</span>)}</span>
}

function TaskCard({ task, away, onEdit, onDelete, onToggle, onMove, onSnooze, onSubtask }) {
  const [showSnooze, setShowSnooze] = useState(false)
  const cat = getCat(task.category)
  const person = primaryPerson(task)
  const overdue = task.due_date && isBefore(parseISO(task.due_date), startOfDay(new Date())) && !task.completed
  const paused = isPaused(task, away)
  const subs = task.subtasks || []
  const subsDone = subs.filter(s => s.done).length

  return (
    <div className={`task-card ${task.completed ? 'completed' : ''} ${overdue && !paused ? 'overdue' : ''} ${paused ? 'paused' : ''}`}
         style={{ background: `linear-gradient(135deg, ${person.soft}, var(--bg-3) 60%)`, borderLeft: `4px solid ${person.color}` }}>
      <div className="card-body">
        <div className="card-top">
          <button className={`check-btn ${task.completed ? 'checked' : ''}`} onClick={() => onToggle(task)}>{task.completed && <Check size={12} />}</button>
          <span className="card-title">{task.title}</span>
        </div>
        <div className="card-meta">
          {(getAssignees(task).length ? getAssignees(task) : [getPerson('both')]).map(pp => <span key={pp.id} className="person-pill" style={{ background: pp.color, color: '#fff' }}>{pp.icon} {pp.label}</span>)}
          <span className="cat-pill" style={{ background: cat.color + '22', color: cat.color }}>{cat.label}</span>
          {task.recur && task.recur !== 'none' && <span className="recur-pill"><Repeat size={9} /> {task.recur}</span>}
          {task.rotation && <span className="rotate-pill"><Users size={9} /> rotates</span>}
          {task.due_date && <span className={`due-pill ${overdue && !paused ? 'overdue-text' : ''}`}><Clock size={10} /> {format(parseISO(task.due_date), 'dd MMM')}</span>}
          {paused && <span className="paused-pill"><Plane size={9} /> paused</span>}
        </div>

        {subs.length > 0 && (
          <div className="subtasks">
            <div className="subtask-progress"><div className="subtask-progress-fill" style={{ width: `${(subsDone / subs.length) * 100}%` }} /></div>
            {subs.map(s => (
              <button key={s.id} className={`subtask-row ${s.done ? 'done' : ''}`} onClick={() => onSubtask(task, s.id)}>
                <span className={`subtask-check ${s.done ? 'checked' : ''}`}>{s.done && <Check size={9} />}</span>
                {s.text}
              </button>
            ))}
          </div>
        )}

        <div className="card-actions">
          {task.status !== 'todo'        && <button onClick={() => onMove(task, 'todo')}>← To Do</button>}
          {task.status !== 'in_progress' && <button onClick={() => onMove(task, 'in_progress')}>In Progress</button>}
          {task.status !== 'done'        && <button onClick={() => onMove(task, 'done')}>✓ Done</button>}
          {overdue && !task.completed && (
            <div className="snooze-wrap">
              <button onClick={() => setShowSnooze(s => !s)} title="Snooze"><AlarmClock size={11} /></button>
              {showSnooze && (
                <div className="snooze-menu">
                  <button onClick={() => { onSnooze(task, 24); setShowSnooze(false) }}>Tomorrow</button>
                  <button onClick={() => { onSnooze(task, 72); setShowSnooze(false) }}>In 3 days</button>
                  <button onClick={() => { onSnooze(task, 168); setShowSnooze(false) }}>Next week</button>
                </div>
              )}
            </div>
          )}
          <button onClick={() => onEdit(task)}><Pencil size={11} /></button>
          <button className="del-btn" onClick={() => onDelete(task.id)}><Trash2 size={11} /></button>
        </div>
      </div>
    </div>
  )
}

// ─── List view ────────────────────────────────────────────────────────────────
function ListView({ tasks, away, onEdit, onDelete, onToggle, onSnooze, onSubtask, onSetStatus }) {
  const sorted = [...tasks].sort((a, b) => (!a.due_date ? 1 : !b.due_date ? -1 : new Date(a.due_date) - new Date(b.due_date)))
  const groups = {}
  sorted.forEach(t => { const k = t.due_date ? format(parseISO(t.due_date), 'yyyy-MM-dd') : 'No date'; (groups[k] ||= []).push(t) })
  return (
    <div className="list-view">
      {Object.entries(groups).map(([k, group]) => (
        <div key={k} className="list-group">
          <div className="list-date-header">{k === 'No date' ? 'No due date' : format(parseISO(k), 'EEEE, d MMMM')}{k !== 'No date' && isToday(parseISO(k)) && <span className="today-badge">Today</span>}</div>
          {group.map(task => {
            const cat = getCat(task.category), person = primaryPerson(task)
            const overdue = task.due_date && isBefore(parseISO(task.due_date), startOfDay(new Date())) && !task.completed
            const paused = isPaused(task, away)
            const subs = task.subtasks || []
            return (
              <div key={task.id} className={`list-row ${task.completed ? 'completed' : ''} ${overdue && !paused ? 'overdue' : ''}`} style={{ borderLeft: `4px solid ${person.color}` }}>
                <button className={`check-btn ${task.completed ? 'checked' : ''}`} onClick={() => onToggle(task)}>{task.completed && <Check size={12} />}</button>
                <div className="list-content">
                  <span className="list-title">{task.title}</span>
                  <div className="list-meta">
                    {(getAssignees(task).length ? getAssignees(task) : [getPerson('both')]).map(pp => <span key={pp.id} className="person-pill" style={{ background: pp.color, color: '#fff' }}>{pp.icon} {pp.label}</span>)}
                    <span className="cat-pill" style={{ background: cat.color + '22', color: cat.color }}>{cat.label}</span>
                    {task.recur && task.recur !== 'none' && <span className="recur-pill"><Repeat size={9} /> {task.recur}</span>}
                    {subs.length > 0 && <span className="due-pill">{subs.filter(s => s.done).length}/{subs.length} steps</span>}
                    {paused && <span className="paused-pill"><Plane size={9} /> paused</span>}
                  </div>
                  <div className="status-seg">
                    {KANBAN_COLS.map(col => <button key={col.id} type="button" className={`status-seg-btn ${task.status === col.id ? 'on' : ''}`} style={task.status === col.id ? { '--sc': col.color } : undefined} onClick={() => onSetStatus(task, col.id)}>{col.label}</button>)}
                  </div>
                </div>
                <div className="list-btns">
                  {overdue && <button onClick={() => onSnooze(task, 24)} title="Snooze to tomorrow"><AlarmClock size={13} /></button>}
                  <button onClick={() => onEdit(task)}><Pencil size={13} /></button>
                  <button className="del-btn" onClick={() => onDelete(task.id)}><Trash2 size={13} /></button>
                </div>
              </div>
            )
          })}
        </div>
      ))}
      {tasks.length === 0 && <div className="empty-state"><Heart size={40} /><p>Nothing here yet — add your first task!</p></div>}
    </div>
  )
}

// ─── Calendar (events + multi-day bars) ───────────────────────────────────────
function CalEventRow({ e, onEdit, onQuickDelete, onAddToCalendar, showDate }) {
  const t = getEventType(e.event_type), p = primaryPerson(e)
  const multi = e.end_date && e.end_date !== e.start_date
  async function del(ev) {
    ev.stopPropagation()
    if (typeof window !== 'undefined' && !window.confirm(`Delete "${e.title}"?`)) return
    await onQuickDelete(e.id)
  }
  return (
    <div className="cal-event-row" onClick={() => onEdit(e)} style={{ borderLeft: `4px solid ${p.color}` }}>
      <span className="cal-event-icon">{t.icon}</span>
      <div className="cal-event-info">
        <span className="cal-event-title">{e.title}</span>
        <span className="cal-event-sub">
          {(getAssignees(e).map(x => x.icon + ' ' + x.label).join(', ')) || '👨‍👩‍🦮 Everyone'}
          {showDate && ` · ${format(parseISO(e.start_date), 'd MMM')}`}
          {multi && ` – ${format(parseISO(e.end_date), 'd MMM')}`}
          {!e.all_day && e.start_time && ` · ${e.start_time}`}
          {e.recur && e.recur !== 'none' && ` · repeats ${e.recur}`}
        </span>
      </div>
      <div className="cal-event-actions">
        <button title="Edit" onClick={ev => { ev.stopPropagation(); onEdit(e) }}><Pencil size={13} /></button>
        <button title="Add to phone calendar" onClick={ev => { ev.stopPropagation(); onAddToCalendar(e) }}><Download size={13} /></button>
        <button title="Delete" className="row-del" onClick={del}><Trash2 size={13} /></button>
      </div>
    </div>
  )
}

function CalendarView({ events, tasks, month, setMonth, onEditEvent, onAddOnDate, onQuickDelete, onAddToCalendar }) {
  const [selectedDay, setSelectedDay] = useState(null)
  const monthStart = startOfMonth(month), monthEnd = endOfMonth(month)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const startPad = monthStart.getDay()
  const eventsOnDay = day => events.filter(e => eventOccursOn(e, day))
  const tasksOnDay = day => tasks.filter(t => t.due_date && isSameDay(parseISO(t.due_date), day))
  const selEvents = selectedDay ? eventsOnDay(selectedDay) : []
  const selTasks = selectedDay ? tasksOnDay(selectedDay) : []
  const todayStart = startOfDay(new Date())
  const upcoming = [...events]
    .filter(e => parseISO(e.end_date || e.start_date) >= todayStart)
    .sort((a, b) => parseISO(a.start_date) - parseISO(b.start_date))
    .slice(0, 12)

  return (
    <div className="calendar-view">
      <div className="cal-header">
        <button onClick={() => setMonth(m => subMonths(m, 1))}><ChevronLeft size={18} /></button>
        <h2 className="cal-month">{format(month, 'MMMM yyyy')}</h2>
        <button onClick={() => setMonth(m => addMonths(m, 1))}><ChevronRight size={18} /></button>
      </div>
      <button className="cal-new-event" onClick={() => onAddOnDate(selectedDay || new Date())}>
        <CalendarPlus size={17} /> {selectedDay ? `Add event on ${format(selectedDay, 'd MMM')}` : 'New event'}
      </button>
      <div className="cal-grid">
        {['S','M','T','W','T','F','S'].map((d, i) => <div key={i} className="cal-weekday">{d}</div>)}
        {Array(startPad).fill(null).map((_, i) => <div key={`p${i}`} className="cal-cell empty" />)}
        {days.map(day => {
          const evs = eventsOnDay(day), tks = tasksOnDay(day)
          const sel = selectedDay && isSameDay(day, selectedDay)
          return (
            <div key={format(day, 'yyyy-MM-dd')} className={`cal-cell ${isToday(day) ? 'today' : ''} ${sel ? 'selected' : ''} ${(evs.length || tks.length) ? 'has-items' : ''}`} onClick={() => setSelectedDay(sel ? null : day)}>
              <span className="cal-day-num">{format(day, 'd')}</span>
              <div className="cal-bars">
                {evs.slice(0, 3).map(e => {
                  const t = getEventType(e.event_type), p = primaryPerson(e)
                  const isStart = isSameDay(day, parseISO(e.start_date))
                  const multi = e.end_date && e.end_date !== e.start_date
                  return <div key={e.id} className={`cal-bar ${multi ? 'multi' : ''}`} style={{ background: p.color }} title={e.title}>{(isStart || day.getDay() === 0) && <span className="cal-bar-label">{t.icon} {e.title}</span>}</div>
                })}
                {tks.length > 0 && <div className="cal-task-dots">{tks.slice(0, 4).map(t => <span key={t.id} className="cal-tdot" style={{ background: primaryPerson(t).color }} />)}</div>}
              </div>
            </div>
          )
        })}
      </div>
      <div className="cal-legend">{ASSIGNABLE.map(p => <span key={p.id} className="legend-item"><span className="legend-dot" style={{ background: p.color }} />{p.label}</span>)}</div>

      {selectedDay && (
        <div className="cal-day-panel">
          <div className="cal-panel-header"><span>{format(selectedDay, 'EEEE, d MMMM yyyy')}</span><button className="add-day-btn" onClick={() => onAddOnDate(selectedDay)}><Plus size={14} /> Add event</button></div>
          {selEvents.length === 0 && selTasks.length === 0 && <div className="cal-empty">Nothing scheduled — tap "Add event" to create one.</div>}
          {selEvents.map(e => <CalEventRow key={e.id} e={e} onEdit={onEditEvent} onQuickDelete={onQuickDelete} onAddToCalendar={onAddToCalendar} />)}
          {selTasks.map(t => {
            const person = primaryPerson(t)
            return <div key={t.id} className="cal-event-row task" style={{ borderLeft: `4px solid ${person.color}` }}><span className="cal-event-icon">📋</span><div className="cal-event-info"><span className="cal-event-title">{t.title}</span><span className="cal-event-sub">Task · {(getAssignees(t).map(x => x.icon + ' ' + x.label).join(', ')) || '👨‍👩‍🦮 Everyone'}</span></div></div>
          })}
        </div>
      )}

      <div className="cal-upcoming">
        <div className="cal-upcoming-head"><CalendarDays size={15} /> Upcoming events</div>
        {upcoming.length === 0 && <div className="cal-empty">No upcoming events. Tap "New event" above to add one — birthdays, holidays, date nights and more.</div>}
        {upcoming.map(e => <CalEventRow key={e.id} e={e} onEdit={onEditEvent} onQuickDelete={onQuickDelete} onAddToCalendar={onAddToCalendar} showDate />)}
      </div>
    </div>
  )
}

// ─── Notes view (countdowns #6 idea + leaderboard #2/#4 + notes) ──────────────
function NotesView({ notes, events, tasks, onSave, onDelete }) {
  const [draft, setDraft] = useState('')
  const [author, setAuthor] = useState('rhodri')
  const todayStart = startOfDay(new Date())
  const countdowns = [...events].filter(e => !isBefore(parseISO(e.start_date), todayStart)).sort((a, b) => parseISO(a.start_date) - parseISO(b.start_date)).slice(0, 4)
  const board = weeklyLeaderboard(tasks)
  const points = computePoints(tasks)
  const maxWeek = Math.max(1, ...PEOPLE.map(p => board[p.id] || 0))

  function add() { if (!draft.trim()) return; onSave({ id: genId(), text: draft.trim(), author, created_at: new Date().toISOString() }); setDraft('') }

  return (
    <div className="notes-view">
      {/* Leaderboard / fairness (#2, #4) */}
      <div className="leaderboard-section">
        <h3 className="section-title"><Trophy size={16} /> This Week</h3>
        <div className="leaderboard">
          {PEOPLE.filter(p => p.id !== 'both').map(p => (
            <div key={p.id} className="lb-row">
              <span className="lb-name">{p.icon} {p.label}</span>
              <div className="lb-bar-track"><div className="lb-bar-fill" style={{ width: `${((board[p.id] || 0) / maxWeek) * 100}%`, background: p.color }} /></div>
              <span className="lb-count">{board[p.id] || 0}</span>
              <span className="lb-points" title="All-time points">{points[p.id] || 0} pts</span>
            </div>
          ))}
        </div>
      </div>

      {countdowns.length > 0 && (
        <div className="countdown-section">
          <h3 className="section-title"><CalendarHeart size={16} /> Countdowns</h3>
          <div className="countdown-grid">
            {countdowns.map(e => {
              const days = differenceInCalendarDays(parseISO(e.start_date), todayStart)
              const t = getEventType(e.event_type), p = primaryPerson(e)
              return <div key={e.id} className="countdown-card" style={{ borderTop: `3px solid ${p.color}` }}><span className="cd-icon">{t.icon}</span><span className="cd-days">{days === 0 ? 'Today' : days}</span>{days > 0 && <span className="cd-unit">day{days > 1 ? 's' : ''}</span>}<span className="cd-title">{e.title}</span></div>
            })}
          </div>
        </div>
      )}

      <div className="notes-section">
        <h3 className="section-title"><StickyNote size={16} /> Shared Notes</h3>
        <div className="note-composer">
          <textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder="Jot something down — ideas, reminders, plans…" rows={2} />
          <div className="note-composer-actions">
            <select value={author} onChange={e => setAuthor(e.target.value)} className="filter-select">{PEOPLE.filter(p => p.adult).map(p => <option key={p.id} value={p.id}>{p.icon} {p.label}</option>)}</select>
            <button className="btn-save" onClick={add}><Plus size={14} /> Add note</button>
          </div>
        </div>
        <div className="notes-grid">
          {notes.map(n => { const p = getPerson(n.author); return <div key={n.id} className="note-card" style={{ borderLeft: `4px solid ${p.color}` }}><p className="note-text">{n.text}</p><div className="note-footer"><span className="note-author">{p.icon} {p.label}</span><button className="del-btn" onClick={() => onDelete(n.id)}><Trash2 size={12} /></button></div></div> })}
          {notes.length === 0 && <div className="empty-state"><StickyNote size={40} /><p>No notes yet</p></div>}
        </div>
      </div>
    </div>
  )
}

// ─── Task modal (#1 recur, #2 rotation, #9 subtasks) ──────────────────────────
const WEEKDAYS = [['1', 'Mon'], ['2', 'Tue'], ['3', 'Wed'], ['4', 'Thu'], ['5', 'Fri'], ['6', 'Sat'], ['0', 'Sun']]
// Shared repeat extras: pick specific weekdays (for weekly) + an optional end date.
function RecurExtras({ f, set }) {
  if (!f.recur || f.recur === 'none') return null
  const days = String(f.recur_days || '').split(',').filter(Boolean)
  const toggle = d => { const s = new Set(days); s.has(d) ? s.delete(d) : s.add(d); set('recur_days', [...s].join(',')) }
  return (
    <div className="form-row">
      {f.recur === 'weekly' && (
        <div style={{ marginBottom: 8 }}>
          <span className="form-label">On these days <em className="form-hint">optional — blank keeps the same weekday</em></span>
          <div className="person-grid">{WEEKDAYS.map(([d, l]) => <button key={d} type="button" className={`person-btn ${days.includes(d) ? 'active' : ''}`} onClick={() => toggle(d)}>{l}</button>)}</div>
        </div>
      )}
      <label>Ends <em className="form-hint">optional</em><input type="date" value={f.recur_until || ''} onChange={e => set('recur_until', e.target.value || null)} /></label>
    </div>
  )
}

function TaskModal({ task, away, onSave, onClose }) {
  const isNew = !task?.id
  const [f, setF] = useState({
    id: task?.id || genId(), title: task?.title || '', category: task?.category || 'home',
    assignees: assigneeIds(task), status: task?.status || 'todo',
    due_date: task?.due_date || '', reminder_minutes: task?.reminder_minutes ?? 1440,
    completed: task?.completed || false, recur: task?.recur || 'none',
    recur_days: task?.recur_days || '', recur_until: task?.recur_until || null,
    completed_at: task?.completed_at || null, snoozed_until: task?.snoozed_until || null,
    rotation: task?.rotation || null, subtasks: task?.subtasks || [],
    created_at: task?.created_at || new Date().toISOString(),
  })
  const [newSub, setNewSub] = useState('')
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const rotationList = f.rotation ? f.rotation.split(',').filter(Boolean) : []
  function toggleRotation(id) {
    const set2 = new Set(rotationList)
    set2.has(id) ? set2.delete(id) : set2.add(id)
    set('rotation', set2.size ? [...set2].join(',') : null)
  }
  function addSub() { if (!newSub.trim()) return; set('subtasks', [...f.subtasks, { id: genId(), text: newSub.trim(), done: false }]); setNewSub('') }
  function delSub(id) { set('subtasks', f.subtasks.filter(s => s.id !== id)) }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header"><h2>{isNew ? 'New Task' : 'Edit Task'}</h2><button className="modal-close" onClick={onClose}><X size={18} /></button></div>
        <div className="modal-form">
          <label>Title<input value={f.title} onChange={e => set('title', e.target.value)} placeholder="What needs doing?" autoFocus /></label>

          <div className="form-row"><span className="form-label">Assign to <em className="form-hint">tap one or more</em></span>
            <div className="person-grid">{ASSIGNABLE.map(p => { const on = (f.assignees || []).includes(p.id); return <button key={p.id} type="button" className={`person-btn ${on ? 'active' : ''}`} style={{ '--pc': p.color }} onClick={() => set('assignees', on ? f.assignees.filter(x => x !== p.id) : [...(f.assignees || []), p.id])}>{p.icon} {p.label}{away.includes(p.id) && ' ✈️'}{on && ' ✓'}</button> })}</div>
          </div>

          <div className="form-row"><span className="form-label">Category</span>
            <div className="cat-grid">{CATEGORIES.map(c => <button key={c.id} type="button" className={`cat-btn ${f.category === c.id ? 'active' : ''}`} style={{ '--cat-color': c.color }} onClick={() => set('category', c.id)}>{c.label}</button>)}</div>
          </div>

          <div className="form-row two-col">
            <label>Status<select value={f.status} onChange={e => set('status', e.target.value)}>{KANBAN_COLS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
            <label>Due date<input type="date" value={f.due_date} onChange={e => set('due_date', e.target.value)} /></label>
          </div>

          <div className="form-row two-col">
            <label>Repeat<select value={f.recur} onChange={e => set('recur', e.target.value)}>{RECUR_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select></label>
            {f.due_date && <label>Reminder<select value={f.reminder_minutes ?? ''} onChange={e => set('reminder_minutes', Number(e.target.value))}>{REMINDER_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select></label>}
          </div>

          <RecurExtras f={f} set={set} />

          {f.recur !== 'none' && (
            <div className="form-row"><span className="form-label">Rotate between (optional)</span>
              <div className="person-grid">{PEOPLE.filter(p => p.id !== 'both').map(p => <button key={p.id} type="button" className={`person-btn ${rotationList.includes(p.id) ? 'active' : ''}`} style={{ '--pc': p.color }} onClick={() => toggleRotation(p.id)}>{p.icon} {p.label}</button>)}</div>
              <span className="hint">Each time it's ticked off, the next person takes over.</span>
            </div>
          )}

          <div className="form-row"><span className="form-label">Checklist</span>
            <div className="subtask-editor">
              {f.subtasks.map(s => <div key={s.id} className="subtask-edit-row"><span>{s.text}</span><button onClick={() => delSub(s.id)}><X size={13} /></button></div>)}
              <div className="subtask-add"><input value={newSub} onChange={e => setNewSub(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSub())} placeholder="Add a step…" /><button onClick={addSub} type="button"><Plus size={14} /></button></div>
            </div>
          </div>

          <div className="modal-actions">
            <button className="btn-cancel" onClick={onClose}>Cancel</button>
            <button className="btn-save" onClick={() => f.title.trim() && onSave(f)}>{isNew ? <><Plus size={15} /> Add Task</> : <><Check size={15} /> Save</>}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Event modal ──────────────────────────────────────────────────────────────
function EventModal({ event, onSave, onDelete, onClose }) {
  const isNew = !event?.id
  const [f, setF] = useState({
    id: event?.id || genId(), title: event?.title || '', event_type: event?.event_type || 'other',
    assignees: assigneeIds(event), start_date: event?.start_date || format(new Date(), 'yyyy-MM-dd'),
    end_date: event?.end_date || event?.start_date || format(new Date(), 'yyyy-MM-dd'),
    all_day: event?.all_day ?? true, start_time: event?.start_time || '', recur: event?.recur || 'none',
    recur_days: event?.recur_days || '', recur_until: event?.recur_until || null,
    reminder_minutes: event?.reminder_minutes ?? 1440, notes: event?.notes || '', created_at: event?.created_at || new Date().toISOString(),
  })
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  async function submit() {
    if (!f.title.trim()) { setErr('Please give the event a name first.'); return }
    setSaving(true); setErr('')
    const out = { ...f }
    if (isBefore(parseISO(out.end_date), parseISO(out.start_date))) out.end_date = out.start_date
    const r = await onSave(out)
    setSaving(false)
    if (r && r.ok === false) setErr(`Couldn't save: ${r.message}. If this mentions a column, row-level security, or "relation … does not exist", re-run the repair SQL (in the setup guide), then try again.`)
  }
  async function del() {
    setSaving(true); setErr('')
    const r = await onDelete(f.id)
    setSaving(false)
    if (r && r.ok === false) setErr(`Couldn't delete: ${r.message}. Re-run the repair SQL if it mentions row-level security.`)
  }

  const isMulti = f.end_date && f.end_date !== f.start_date
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header"><h2>{isNew ? 'New Event' : 'Edit Event'}</h2><button className="modal-close" onClick={onClose}><X size={18} /></button></div>
        <div className="modal-form">
          <label>Event<input value={f.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Rhodri's Birthday, Holiday in India" autoFocus /></label>
          <div className="form-row"><span className="form-label">Type</span><div className="cat-grid">{EVENT_TYPES.map(t => <button key={t.id} type="button" className={`cat-btn ${f.event_type === t.id ? 'active' : ''}`} style={{ '--cat-color': t.color }} onClick={() => set('event_type', t.id)}>{t.icon} {t.label}</button>)}</div></div>
          <div className="form-row"><span className="form-label">For <em className="form-hint">tap one or more</em></span><div className="person-grid">{ASSIGNABLE.map(p => { const on = (f.assignees || []).includes(p.id); return <button key={p.id} type="button" className={`person-btn ${on ? 'active' : ''}`} style={{ '--pc': p.color }} onClick={() => set('assignees', on ? f.assignees.filter(x => x !== p.id) : [...(f.assignees || []), p.id])}>{p.icon} {p.label}{on && ' ✓'}</button> })}</div></div>
          <div className="form-row two-col">
            <label>Start date<input type="date" value={f.start_date} onChange={e => { set('start_date', e.target.value); if (isBefore(parseISO(f.end_date), parseISO(e.target.value))) set('end_date', e.target.value) }} /></label>
            <label>End date<input type="date" value={f.end_date} min={f.start_date} onChange={e => set('end_date', e.target.value)} /></label>
          </div>
          {isMulti && <div className="multi-note"><CalendarDays size={13} /> Multi-day · {differenceInCalendarDays(parseISO(f.end_date), parseISO(f.start_date)) + 1} days</div>}
          <label className="checkbox-row"><input type="checkbox" checked={f.all_day} onChange={e => set('all_day', e.target.checked)} /> All-day event</label>
          {!f.all_day && <label>Start time<input type="time" value={f.start_time} onChange={e => set('start_time', e.target.value)} /></label>}
          <div className="form-row two-col">
            <label>Repeat<select value={f.recur} onChange={e => set('recur', e.target.value)}>{RECUR_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select></label>
            <label>Reminder<select value={f.reminder_minutes} onChange={e => set('reminder_minutes', Number(e.target.value))}>{REMINDER_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select></label>
          </div>
          <RecurExtras f={f} set={set} />
          <label>Notes<textarea value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="Details, links, things to remember…" rows={2} /></label>

          {!isNew && (
            <div className="event-export">
              <button type="button" className="btn-outline sm" onClick={() => addEventToCalendar(f)}><Download size={13} /> Add to phone calendar</button>
              <button type="button" className="btn-outline sm" onClick={() => emailEvent(f)}><Mail size={13} /> Email this event</button>
            </div>
          )}

          {err && <div className="ai-error"><AlertCircle size={14} /> {err}</div>}

          <div className="modal-actions">
            {!isNew && <button className="btn-delete" onClick={del} disabled={saving}><Trash2 size={15} /></button>}
            <button className="btn-cancel" onClick={onClose}>Cancel</button>
            <button className="btn-save" onClick={submit} disabled={saving}>{saving ? <><Loader2 size={15} className="ai-spin" /> Saving…</> : isNew ? <><Plus size={15} /> Add Event</> : <><Check size={15} /> Save</>}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Templates modal (#8) ─────────────────────────────────────────────────────
function TemplatesModal({ templates, onUse, onSave, onDelete, onClose }) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [items, setItems] = useState([])
  const [itemTitle, setItemTitle] = useState('')
  const [itemCat, setItemCat] = useState('home')
  const [itemWho, setItemWho] = useState('both')

  function addItem() { if (!itemTitle.trim()) return; setItems([...items, { title: itemTitle.trim(), category: itemCat, assigned_to: itemWho }]); setItemTitle('') }
  function save() { if (!name.trim() || items.length === 0) return; onSave({ id: genId(), name: name.trim(), items, created_at: new Date().toISOString() }); setCreating(false); setName(''); setItems([]) }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header"><h2><LayoutTemplate size={18} style={{ verticalAlign: '-3px', marginRight: 6 }} />Templates</h2><button className="modal-close" onClick={onClose}><X size={18} /></button></div>
        <div className="modal-form">
          {!creating && (
            <>
              {templates.length === 0 && <p className="hint">No templates yet. Create one to spawn a set of tasks with a single tap — great for recurring routines like food shops or holiday prep.</p>}
              {templates.map(tpl => (
                <div key={tpl.id} className="tpl-card">
                  <div className="tpl-head"><span className="tpl-name">{tpl.name}</span><span className="tpl-count">{tpl.items.length} tasks</span></div>
                  <div className="tpl-items">{tpl.items.map((it, i) => <span key={i} className="tpl-item">{getPerson(it.assigned_to).icon} {it.title}</span>)}</div>
                  <div className="tpl-actions"><button className="btn-save sm" onClick={() => onUse(tpl)}><Plus size={13} /> Use</button><button className="del-btn" onClick={() => onDelete(tpl.id)}><Trash2 size={13} /></button></div>
                </div>
              ))}
              <button className="btn-outline" onClick={() => setCreating(true)}><Plus size={15} /> New template</button>
            </>
          )}
          {creating && (
            <>
              <label>Template name<input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Weekly food shop" autoFocus /></label>
              <div className="form-row"><span className="form-label">Tasks in this template</span>
                {items.map((it, i) => <div key={i} className="subtask-edit-row"><span>{getPerson(it.assigned_to).icon} {it.title} <em>· {getCat(it.category).label}</em></span><button onClick={() => setItems(items.filter((_, x) => x !== i))}><X size={13} /></button></div>)}
                <div className="tpl-item-add">
                  <input value={itemTitle} onChange={e => setItemTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addItem())} placeholder="Task title…" />
                  <select value={itemWho} onChange={e => setItemWho(e.target.value)} className="filter-select">{PEOPLE.map(p => <option key={p.id} value={p.id}>{p.icon} {p.label}</option>)}</select>
                  <select value={itemCat} onChange={e => setItemCat(e.target.value)} className="filter-select">{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
                  <button onClick={addItem} type="button" className="qa-add"><Plus size={14} /></button>
                </div>
              </div>
              <div className="modal-actions"><button className="btn-cancel" onClick={() => { setCreating(false); setItems([]); setName('') }}>Cancel</button><button className="btn-save" onClick={save}><Check size={15} /> Save template</button></div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Away / vacation modal (#6) ───────────────────────────────────────────────
function AwayModal({ away, onToggle, onClose }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header"><h2><Plane size={18} style={{ verticalAlign: '-3px', marginRight: 6 }} />Away / Vacation</h2><button className="modal-close" onClick={onClose}><X size={18} /></button></div>
        <div className="modal-form">
          <p className="hint">Mark someone as away while they're travelling. Their recurring chores will pause, and rotated chores skip them until they're back.</p>
          <div className="away-list">
            {PEOPLE.filter(p => p.adult).map(p => (
              <button key={p.id} className={`away-toggle ${away.includes(p.id) ? 'on' : ''}`} style={{ '--pc': p.color }} onClick={() => onToggle(p.id)}>
                <span>{p.icon} {p.label}</span>
                <span className="away-state">{away.includes(p.id) ? '✈️ Away' : 'Home'}</span>
              </button>
            ))}
          </div>
          <div className="modal-actions"><button className="btn-save" onClick={onClose}><Check size={15} /> Done</button></div>
        </div>
      </div>
    </div>
  )
}

// ─── Subscribe modal (#10) ────────────────────────────────────────────────────
function SubscribeModal({ onClose }) {
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  const feedUrl = `${base}/api/calendar?household=${encodeURIComponent(HOUSEHOLD_ID)}`
  const [copied, setCopied] = useState(false)
  function copy() { navigator.clipboard?.writeText(feedUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }) }
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header"><h2><CalendarPlus size={18} style={{ verticalAlign: '-3px', marginRight: 6 }} />Add to your calendar</h2><button className="modal-close" onClick={onClose}><X size={18} /></button></div>
        <div className="modal-form">
          <p className="hint">Subscribe to this link in Google or Apple Calendar and all your Couple's Hub events will appear inside your normal phone calendar automatically.</p>
          <div className="feed-url"><code>{feedUrl}</code><button className="btn-save sm" onClick={copy}>{copied ? <><Check size={13} /> Copied</> : 'Copy'}</button></div>
          <div className="subscribe-steps">
            <strong>Google Calendar (on a computer):</strong>
            <ol><li>Open Google Calendar</li><li>Next to "Other calendars" click + → "From URL"</li><li>Paste the link and click "Add calendar"</li></ol>
            <strong>Apple Calendar (iPhone):</strong>
            <ol><li>Settings → Calendar → Accounts → Add Account → Other</li><li>Tap "Add Subscribed Calendar"</li><li>Paste the link and tap Next</li></ol>
          </div>
          <p className="hint subtle">Note: this is a one-way feed (Hub → your calendar). Events added in Google/Apple won't flow back into the Hub. Calendars also refresh on their own schedule — Apple is usually quick, Google can take a few hours.</p>
          <div className="modal-actions"><button className="btn-save" onClick={onClose}><Check size={15} /> Done</button></div>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// AI ASSISTANT MODAL
// ════════════════════════════════════════════════════════════════════════════
function AiModal({ tasks, events, away, moods, callAI, onApply, onClose }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [plan, setPlan] = useState(null)        // { summary, suggestions: [] }
  const [answer, setAnswer] = useState('')      // free-text reply
  const [applied, setApplied] = useState(new Set())
  const [q, setQ] = useState('')

  const openTasks = tasks.filter(t => !t.completed).map(t => ({
    id: t.id, title: t.title, assigned_to: t.assigned_to, due_date: t.due_date || null, recur: t.recur, category: t.category,
  }))

  function aiErrMsg(e) {
    if (e?.code === 'no_key') return 'No API key found. Add ANTHROPIC_API_KEY in your Vercel settings to switch the AI on (see the setup guide).'
    if (e?.code === 'upstream' || e?.code === 502) return 'The AI service hit a snag — double-check your API key and try again.'
    return 'Could not reach the AI just now. Try again in a moment.'
  }

  async function planWeek() {
    setLoading(true); setError(''); setPlan(null); setAnswer(''); setApplied(new Set())
    try {
      const res = await callAI('week_plan', { today: format(new Date(), 'yyyy-MM-dd'), away, people: PEOPLE.filter(p => p.adult).map(p => ({ id: p.id, label: p.label })), tasks: openTasks })
      if (res?.parsed) setPlan(res.parsed)
      else setError('The AI replied in an unexpected format — try again.')
    } catch (e) { setError(aiErrMsg(e)) }
    setLoading(false)
  }

  async function ask(question) {
    const Q = (question || q).trim()
    if (!Q) return
    setLoading(true); setError(''); setPlan(null); setAnswer('')
    try {
      const ctx = { openTasks: openTasks.length, away, upcomingEvents: events.slice(0, 5).map(e => ({ title: e.title, date: e.start_date, type: e.event_type })) }
      const res = await callAI('suggest', { question: Q, context: ctx })
      setAnswer(res?.text || 'No answer came back — try rephrasing.')
    } catch (e) { setError(aiErrMsg(e)) }
    setLoading(false); setQ('')
  }

  async function applyOne(s, i) { await onApply(s); setApplied(prev => new Set(prev).add(i)) }
  async function applyAll() { for (let i = 0; i < plan.suggestions.length; i++) if (!applied.has(i)) await applyOne(plan.suggestions[i], i) }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal ai-modal">
        <div className="modal-header">
          <h2><Wand2 size={18} style={{ verticalAlign: '-3px', marginRight: 8 }} />AI Assistant</h2>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-form">
          <div className="ai-quick">
            <button className="ai-action" onClick={planWeek} disabled={loading}><Sparkles size={15} /> Plan our week</button>
            <button className="ai-action ghost" onClick={() => ask('In one or two friendly sentences, how are we doing this week and what should we focus on?')} disabled={loading}><HeartPulse size={15} /> How are we doing?</button>
          </div>

          <div className="ai-ask">
            <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && ask()} placeholder="Ask me anything — “suggest a chore split”, “ideas for Becky’s birthday”…" disabled={loading} />
            <button className="ai-send" onClick={() => ask()} disabled={loading || !q.trim()}><Send size={15} /></button>
          </div>

          {loading && <div className="ai-loading"><Loader2 size={20} className="ai-spin" /> Thinking…</div>}
          {error && <div className="ai-error"><AlertCircle size={14} /> {error}</div>}

          {answer && !loading && (
            <div className="ai-answer"><Wand2 size={14} className="ai-answer-icon" /><p>{answer}</p></div>
          )}

          {plan && !loading && (
            <div className="ai-plan">
              {plan.summary && <p className="ai-plan-summary">{plan.summary}</p>}
              {Array.isArray(plan.suggestions) && plan.suggestions.length > 0 && (
                <>
                  <div className="ai-plan-head">
                    <span>{plan.suggestions.length} suggestions</span>
                    <button className="btn-save sm" onClick={applyAll}><Check size={13} /> Apply all</button>
                  </div>
                  {plan.suggestions.map((s, i) => {
                    const p = getPerson(s.assigned_to)
                    const done = applied.has(i)
                    return (
                      <div key={i} className="ai-suggestion" style={{ borderLeft: `3px solid ${p.color}` }}>
                        <div className="ai-sugg-main">
                          <span className="ai-sugg-title">{s.title}</span>
                          <div className="ai-sugg-meta">
                            <span className="person-pill" style={{ background: p.color, color: '#fff' }}>{p.icon} {p.label}</span>
                            {s.date && <span className="due-pill"><Clock size={10} /> {(() => { try { return format(parseISO(s.date), 'EEE d MMM') } catch { return s.date } })()}</span>}
                          </div>
                          {s.note && <span className="ai-sugg-note">{s.note}</span>}
                        </div>
                        <button className={`ai-apply ${done ? 'done' : ''}`} onClick={() => applyOne(s, i)} disabled={done}>
                          {done ? <Check size={14} /> : 'Apply'}
                        </button>
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          )}

          {!loading && !plan && !answer && !error && (
            <p className="hint">Your assistant can balance the week's chores fairly, suggest a plan, or riff on ideas. It uses your Anthropic API key, set in Vercel.</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// "US" — the couple dashboard
// ════════════════════════════════════════════════════════════════════════════
function UsView({ tasks, dateIdeas, moods, rewards, whoami, onSaveMood, onDeleteMoods, onSaveReward, onRedeem, onDeleteReward, onSaveDateIdea, onToggleDate, onDeleteDate, onDateToCalendar, callAI }) {
  const data = { tasks, dateIdeas, moods, rewards }
  const earned = earnedXP(data)
  const spent = spentXP(data)
  const spendable = Math.max(0, earned - spent)
  const lvl = coupleLevel(earned)
  const badges = unlockedBadges(data)
  const streak = computeStreak(tasks)
  const unlockedCount = badges.filter(b => b.unlocked).length

  return (
    <div className="us-view">
      {/* Level card */}
      <div className="level-card">
        <div className="level-glow" />
        <div className="level-top">
          <div className="level-badge"><Crown size={20} /><span>Lv {lvl.level}</span></div>
          <div className="level-title">{levelTitle(lvl.level)}</div>
          {streak > 0 && <div className="level-streak"><Flame size={15} /> {streak}</div>}
        </div>
        <div className="level-xp-row">
          <span className="level-xp-label">{lvl.intoLevel} / {lvl.neededForNext} XP to Lv {lvl.level + 1}</span>
          <span className="level-balance"><Gem size={13} /> {spendable} to spend</span>
        </div>
        <div className="level-bar"><div className="level-bar-fill" style={{ width: `${lvl.pct}%` }} /></div>
        <div className="level-foot"><TrendingUp size={12} /> {earned} XP earned together · {unlockedCount}/{badges.length} badges</div>
      </div>

      {/* Badges */}
      <section className="us-section">
        <h3 className="section-title"><Award size={16} /> Badges</h3>
        <div className="badge-grid">
          {badges.map(b => (
            <div key={b.id} className={`badge ${b.unlocked ? 'on' : 'off'}`} title={b.desc}>
              <span className="badge-emoji">{b.unlocked ? b.emoji : '🔒'}</span>
              <span className="badge-label">{b.label}</span>
              {!b.unlocked && <span className="badge-desc">{b.desc}</span>}
            </div>
          ))}
        </div>
      </section>

      {/* Relationship pulse */}
      <PulseSection moods={moods} onSaveMood={onSaveMood} whoami={whoami} onDeleteMoods={onDeleteMoods} />

      {/* Reward coupons */}
      <CouponsSection rewards={rewards} spendable={spendable} onSave={onSaveReward} onRedeem={onRedeem} onDelete={onDeleteReward} />

      {/* Date-night generator */}
      <DateGenerator dateIdeas={dateIdeas} callAI={callAI} onSave={onSaveDateIdea} onToggle={onToggleDate} onDelete={onDeleteDate} onToCalendar={onDateToCalendar} />
    </div>
  )
}

function PulseSection({ moods, onSaveMood, whoami, onDeleteMoods }) {
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const adults = PEOPLE.filter(p => p.adult)
  const me = adults.find(a => a.id === whoami) || null
  function todayFor(pid) { return moods.find(m => m.person === pid && m.date === todayStr) }
  function logMood(pid, level) {
    const ex = todayFor(pid)
    onSaveMood({ id: ex?.id || genId(), person: pid, level, note: ex?.note || '', date: todayStr, created_at: ex?.created_at || new Date().toISOString() })
  }
  // Mutual: you only see your partner's pulse once you've logged your own
  const meLogged = !me || !!todayFor(me.id)
  const visible = pid => !me || pid === me.id || meLogged

  const todays = adults.map(p => todayFor(p.id)).filter(Boolean)
  const avg = todays.length ? todays.reduce((s, m) => s + m.level, 0) / todays.length : null
  const weather = (avg == null || !meLogged) ? null : getMood(Math.round(avg))
  const history = pid => moods.filter(m => m.person === pid).slice(0, 7).reverse()
  const ordered = me ? [me, ...adults.filter(a => a.id !== me.id)] : adults

  function exportCsv() {
    const rows = [['date', 'person', 'level', 'mood', 'note'], ...moods.map(m => [m.date, getPerson(m.person).label, m.level, getMood(m.level).label, (m.note || '')])]
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'pulse-history.csv'; document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(() => URL.revokeObjectURL(url), 3000)
  }
  function delAll() { if (typeof window !== 'undefined' && window.confirm('Delete all pulse check-ins? This can\'t be undone.')) onDeleteMoods() }

  return (
    <section className="us-section">
      <h3 className="section-title"><HeartPulse size={16} /> Relationship Pulse</h3>
      {weather && (
        <div className="pulse-weather" style={{ '--wc': weather.color }}>
          <span className="pulse-weather-emoji">{weather.emoji}</span>
          <div><strong>Today feels {weather.label.toLowerCase()}</strong><span className="pulse-weather-sub">how you're both doing</span></div>
        </div>
      )}
      <div className="pulse-people">
        {ordered.map(p => {
          const t = todayFor(p.id)
          const isMe = me && p.id === me.id
          if (!visible(p.id)) {
            return (
              <div key={p.id} className="pulse-person locked" style={{ '--pc': p.color }}>
                <div className="pulse-person-head"><span>{p.icon} {p.label}</span></div>
                <div className="pulse-locked-msg"><Lock size={13} /> Log yours to see {p.label}'s — it's mutual 💛</div>
              </div>
            )
          }
          return (
            <div key={p.id} className="pulse-person" style={{ '--pc': p.color }}>
              <div className="pulse-person-head"><span>{p.icon} {p.label}{isMe ? ' (you)' : ''}</span>{t && <span className="pulse-logged">logged {getMood(t.level).emoji}</span>}</div>
              <div className="pulse-scale">
                {MOOD_LEVELS.map(m => (
                  <button key={m.level} className={`pulse-dot ${t?.level === m.level ? 'sel' : ''}`} style={{ '--mc': m.color }} onClick={() => logMood(p.id, m.level)} title={m.label} disabled={me && !isMe}>{m.emoji}</button>
                ))}
              </div>
              <div className="pulse-history">
                {history(p.id).map(m => <span key={m.id} className="pulse-hist-dot" style={{ background: getMood(m.level).color }} title={`${m.date}: ${getMood(m.level).label}`} />)}
              </div>
            </div>
          )
        })}
      </div>
      <div className="pulse-privacy">
        <span>Your check-ins stay in your own private database — just the two of you. No streaks to keep, no nudges if you skip a day.</span>
        <div className="pulse-privacy-actions">
          <button onClick={exportCsv}><Download size={12} /> Export</button>
          {moods.length > 0 && <button className="danger" onClick={delAll}><Trash2 size={12} /> Delete all</button>}
        </div>
      </div>
    </section>
  )
}

function CouponsSection({ rewards, spendable, onSave, onRedeem, onDelete }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [emoji, setEmoji] = useState('🎁')
  const [cost, setCost] = useState(50)
  const [by, setBy] = useState('rhodri')
  const active = rewards.filter(r => !r.redeemed_at)
  const redeemed = rewards.filter(r => r.redeemed_at)
  const partnerOf = pid => (PEOPLE.find(p => p.adult && p.id !== pid)?.id || pid)
  const EMOJIS = ['🎁', '🥞', '🎬', '🐕', '💆', '☕', '🍫', '🍷', '🛁', '🧹']

  function create() {
    if (!title.trim()) return
    onSave({ id: genId(), title: title.trim(), emoji, cost: Number(cost) || 0, created_by: by, redeemed_by: null, redeemed_at: null, created_at: new Date().toISOString() })
    setTitle(''); setCost(50); setOpen(false)
  }

  return (
    <section className="us-section">
      <h3 className="section-title"><Gift size={16} /> Reward Coupons <span className="coupon-balance"><Gem size={12} /> {spendable} to spend</span></h3>
      <div className="coupon-grid">
        {active.map(r => {
          const maker = getPerson(r.created_by)
          const afford = spendable >= r.cost
          return (
            <div key={r.id} className="coupon" style={{ '--cc': maker.color }}>
              <div className="coupon-perf" />
              <span className="coupon-emoji">{r.emoji}</span>
              <span className="coupon-title">{r.title}</span>
              <span className="coupon-from">from {maker.icon} {maker.label}</span>
              <div className="coupon-cost"><Gem size={12} /> {r.cost}</div>
              <button className="coupon-redeem" disabled={!afford} onClick={() => onRedeem(r, partnerOf(r.created_by))}>{afford ? 'Redeem' : 'Not enough XP'}</button>
              <button className="coupon-del" onClick={() => onDelete(r.id)}><Trash2 size={11} /></button>
            </div>
          )
        })}
        <button className="coupon-add" onClick={() => setOpen(o => !o)}><Plus size={18} /><span>New coupon</span></button>
      </div>

      {open && (
        <div className="coupon-composer">
          <div className="coupon-emoji-pick">{EMOJIS.map(e => <button key={e} className={emoji === e ? 'sel' : ''} onClick={() => setEmoji(e)}>{e}</button>)}</div>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Breakfast in bed" className="shop-item-input" />
          <div className="coupon-composer-row">
            <label className="coupon-cost-input"><Gem size={13} /> <input type="number" min="0" step="10" value={cost} onChange={e => setCost(e.target.value)} /> XP</label>
            <select value={by} onChange={e => setBy(e.target.value)} className="filter-select">{PEOPLE.filter(p => p.adult).map(p => <option key={p.id} value={p.id}>from {p.label}</option>)}</select>
            <button className="btn-save sm" onClick={create}><Plus size={13} /> Add</button>
          </div>
        </div>
      )}

      {redeemed.length > 0 && (
        <div className="coupon-redeemed">
          <span className="coupon-redeemed-head">Redeemed</span>
          {redeemed.map(r => <span key={r.id} className="coupon-redeemed-chip">{r.emoji} {r.title} → {getPerson(r.redeemed_by).icon}</span>)}
        </div>
      )}
    </section>
  )
}

function DateGenerator({ dateIdeas, callAI, onSave, onToggle, onDelete, onToCalendar }) {
  const [vibe, setVibe] = useState('Romantic')
  const [budget, setBudget] = useState('£')
  const [time, setTime] = useState('Evening')
  const [ideas, setIdeas] = useState([])
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState('')

  async function generate() {
    setLoading(true); setNote(''); setIdeas([])
    try {
      const res = await callAI('date_ideas', { vibe, budget, time })
      const list = res?.parsed?.ideas
      if (Array.isArray(list) && list.length) setIdeas(list)
      else { setIdeas(localDateIdeas(vibe).map(i => ({ ...i, budget }))); setNote('Used built-in ideas') }
    } catch (e) {
      setIdeas(localDateIdeas(vibe).map(i => ({ ...i, budget })))
      setNote(e?.code === 'no_key' ? 'Add an API key for AI-generated ideas — built-in ideas shown for now' : 'AI unavailable — built-in ideas shown')
    }
    setLoading(false)
  }
  function saveIdea(idea) { onSave({ id: genId(), title: idea.title, description: idea.description || '', vibe: idea.vibe || vibe, budget: idea.budget || budget, done: false, done_at: null, created_at: new Date().toISOString() }) }

  const saved = dateIdeas
  return (
    <section className="us-section">
      <h3 className="section-title"><Wine size={16} /> Date-Night Generator</h3>
      <div className="date-filters">
        <select value={vibe} onChange={e => setVibe(e.target.value)} className="filter-select">{DATE_VIBES.map(v => <option key={v}>{v}</option>)}</select>
        <select value={budget} onChange={e => setBudget(e.target.value)} className="filter-select">{DATE_BUDGETS.map(b => <option key={b}>{b}</option>)}</select>
        <select value={time} onChange={e => setTime(e.target.value)} className="filter-select">{DATE_TIMES.map(t => <option key={t}>{t}</option>)}</select>
        <button className="btn-save sm date-gen-btn" onClick={generate} disabled={loading}>{loading ? <Loader2 size={14} className="ai-spin" /> : <Sparkles size={14} />} Generate</button>
      </div>
      {note && <div className="date-note"><AlertCircle size={12} /> {note}</div>}

      {ideas.length > 0 && (
        <div className="date-ideas">
          {ideas.map((idea, i) => (
            <div key={i} className="date-idea">
              <div className="date-idea-body">
                <span className="date-idea-title">{idea.title}</span>
                <p className="date-idea-desc">{idea.description}</p>
                <div className="date-idea-chips"><span className="qa-chip">{idea.vibe || vibe}</span><span className="qa-chip">{idea.budget || budget}</span></div>
              </div>
              <div className="date-idea-actions">
                <button className="btn-save sm" onClick={() => saveIdea(idea)}><Plus size={12} /> Save</button>
                <button className="btn-outline sm" onClick={() => onToCalendar(idea)}><CalendarPlus size={12} /> Calendar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {saved.length > 0 && (
        <div className="date-saved">
          <span className="date-saved-head">Your date ideas</span>
          {saved.map(d => (
            <div key={d.id} className={`date-saved-row ${d.done ? 'done' : ''}`}>
              <button className={`check-btn ${d.done ? 'checked' : ''}`} onClick={() => onToggle(d)} title={d.done ? 'Done!' : 'Mark done (+50 XP)'}>{d.done && <Check size={12} />}</button>
              <div className="date-saved-info"><span className="date-saved-title">{d.title}</span>{d.description && <span className="date-saved-desc">{d.description}</span>}</div>
              <button className="del-btn" onClick={() => onDelete(d.id)}><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ─── Email reminders / connect modal (v5) ─────────────────────────────────────
function EmailModal({ settings, onSave, onError, onClose }) {
  const adults = PEOPLE.filter(p => p.adult)
  const initial = adults.map((_, i) => (settings?.emails || [])[i] || '')
  const [emails, setEmails] = useState(initial)
  const [reminders, setReminders] = useState(!!settings?.email_reminders)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [test, setTest] = useState('')

  async function save() {
    setSaving(true); setErr('')
    const clean = emails.map(e => e.trim()).filter(Boolean)
    const r = await onSave({ ...settings, emails: clean, email_reminders: reminders })
    setSaving(false)
    if (r && r.ok === false) setErr(`Couldn't save: ${r.message}. If it mentions a column, run the repair SQL (it adds the email fields to your settings table), then try again.`)
    else setTest('Saved ✓')
  }

  async function sendTest() {
    setTest('Sending…'); setErr('')
    try {
      const res = await fetch('/api/email-agenda?test=1')
      const d = await res.json().catch(() => ({}))
      if (d.ok && d.sent) setTest(`Sent to ${(d.to || []).join(', ')} — check your inbox (and spam).`)
      else if (d.reason === 'no_emails') setTest('Add an email above and tap Save first, then test.')
      else if (d.error === 'no_resend_key') setTest('Add RESEND_API_KEY in Vercel → Settings → Environment Variables, then redeploy.')
      else if (d.error === 'no_supabase_env') setTest('The server can’t see your Supabase keys — check the Vercel env vars.')
      else if (d.error === 'resend_failed') setTest('Email service rejected it — if you haven’t set EMAIL_FROM, the test sender only delivers to your own Resend account email.')
      else setTest('Hmm, that didn’t send. ' + (d.error || d.reason || ''))
    } catch { setTest('Could not reach the email service. Is the app deployed to Vercel?') }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header"><h2><Mail size={18} style={{ verticalAlign: '-3px', marginRight: 8 }} />Email reminders</h2><button className="modal-close" onClick={onClose}><X size={18} /></button></div>
        <div className="modal-form">
          <p className="connect-intro">Get a daily email with the day's events and tasks due. Add an address for each of you, flip it on, and you'll both get a morning agenda.</p>

          <div className="connect-section">
            <h3><Users size={15} /> Who gets the email</h3>
            {adults.map((p, i) => (
              <div key={p.id} className="email-row">
                <label>{p.icon} {p.label}'s email<input type="email" value={emails[i]} onChange={e => setEmails(em => em.map((x, ix) => ix === i ? e.target.value : x))} placeholder="name@example.com" /></label>
              </div>
            ))}
            <div className="email-toggle">
              <span>Send the daily agenda</span>
              <button type="button" className={`toggle-sw ${reminders ? 'on' : ''}`} onClick={() => setReminders(r => !r)} aria-label="Toggle email reminders" />
            </div>
          </div>

          {err && <div className="ai-error"><AlertCircle size={14} /> {err}</div>}
          {test && !err && <div className="date-note"><Check size={12} /> {test}</div>}

          <div className="connect-note">
            One-time setup: create a free account at <strong>resend.com</strong>, make an API key, and add it in Vercel as <code>RESEND_API_KEY</code> (then redeploy). The daily email goes out about <strong>7am</strong>. For best delivery, verify a sender domain in Resend and set <code>EMAIL_FROM</code>; otherwise the test sender only reaches your own Resend account email.
          </div>

          <div className="modal-actions">
            <button className="btn-outline" onClick={sendTest}><Send size={14} /> Send test</button>
            <button className="btn-cancel" onClick={onClose}>Close</button>
            <button className="btn-save" onClick={save} disabled={saving}>{saving ? <><Loader2 size={15} className="ai-spin" /> Saving…</> : <><Check size={15} /> Save</>}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// HOME — "Today" + "This week at a glance" (the daily driver)
// ════════════════════════════════════════════════════════════════════════════
function HomeView({ whoami, tasks, events, away, onQuickAdd, onTemplates, onToggle, onEditTask, onEditEvent, onAddEvent, goto }) {
  const now = new Date()
  const today = startOfDay(now)
  const hour = now.getHours()
  const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
  const me = whoami ? getPerson(whoami) : null
  const greeting = `Good ${part}${me && me.adult ? `, ${me.label}` : ''}`

  // Use the same recurrence logic as the calendar (daily/weekly/monthly/yearly
  // + multi-day spans), so repeating events show on Today / "This week" too.
  const eventsOnDay = day => events.filter(e => eventOccursOn(e, day))
  const tasksDueOn = day => tasks.filter(t => !t.completed && t.due_date && isSameDay(parseISO(t.due_date), day))

  const todayEvents = eventsOnDay(today)
  const todayTasks = tasksDueOn(today)
  const overdue = tasks.filter(t => !t.completed && t.due_date && isBefore(parseISO(t.due_date), today))
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i))

  // One gentle, positive nudge
  let nudge = null
  if (overdue.length) nudge = { text: `${overdue.length} thing${overdue.length > 1 ? 's' : ''} slipped past — want to reschedule?`, label: 'Open tasks', go: () => goto('tasks') }
  else if (todayEvents.length === 0 && todayTasks.length === 0) nudge = { text: 'Nothing on today — enjoy the breathing room. ☕', label: null }
  else { const weekEvents = week.slice(1).some(d => eventsOnDay(d).length); if (!weekEvents) nudge = { text: 'Quiet week ahead — fancy planning a date night?', label: 'Date ideas', go: () => goto('us') } }

  const Chip = ({ item }) => {
    const isEvent = !!item.event_type
    const p = primaryPerson(item)
    const icon = isEvent ? getEventType(item.event_type).icon : getCat(item.category).icon || '📋'
    return (
      <button className="hi-chip" style={{ '--cc': p.color }} onClick={() => isEvent ? onEditEvent(item) : onEditTask(item)} title={`${item.title} · ${p.label}`}>
        <span className="hi-chip-dot" /> <span className="hi-chip-icon">{icon}</span> <span className="hi-chip-label">{item.title}</span>
      </button>
    )
  }

  return (
    <div className="home-view">
      <div className="home-greeting">
        <h1>{greeting}{part === 'morning' ? ' ☕' : ''}</h1>
        <span className="home-date">{format(now, 'EEEE, d MMMM')}</span>
      </div>

      <QuickAdd onAdd={onQuickAdd} onTemplates={onTemplates} />

      {nudge && (
        <div className="home-nudge">
          <Sparkles size={15} /> <span>{nudge.text}</span>
          {nudge.label && <button onClick={nudge.go}>{nudge.label}</button>}
        </div>
      )}

      {/* TODAY */}
      <section className="home-card">
        <div className="home-card-head"><h2>Today</h2><button className="home-add-event" onClick={onAddEvent}><Plus size={14} /> Event</button></div>

        {overdue.length > 0 && (
          <div className="home-overdue">
            <span className="home-sub-label">Overdue</span>
            {overdue.slice(0, 4).map(t => (
              <div key={t.id} className="home-task-row overdue" onClick={() => onEditTask(t)}>
                <button className="check-btn" onClick={e => { e.stopPropagation(); onToggle(t) }} />
                <span className="home-task-title">{t.title}</span>
                <AssigneeBadges item={t} />
              </div>
            ))}
          </div>
        )}

        {todayEvents.length === 0 && todayTasks.length === 0 && overdue.length === 0 && (
          <div className="home-empty">Clear day — nice. Add anything above, or enjoy it. 🌿</div>
        )}

        {todayEvents.map(e => {
          const p = primaryPerson(e), t = getEventType(e.event_type)
          return (
            <div key={e.id} className="home-event-row" onClick={() => onEditEvent(e)} style={{ borderLeft: `3px solid ${p.color}` }}>
              <span className="home-event-icon">{t.icon}</span>
              <span className="home-task-title">{e.title}</span>
              <span className="home-task-sub">{!e.all_day && e.start_time ? e.start_time : 'all day'} · {(getAssignees(e).map(x => x.label).join(', ')) || 'Everyone'}</span>
            </div>
          )
        })}
        {todayTasks.map(t => (
          <div key={t.id} className="home-task-row" onClick={() => onEditTask(t)}>
            <button className={`check-btn ${t.completed ? 'checked' : ''}`} onClick={e => { e.stopPropagation(); onToggle(t) }}>{t.completed && <Check size={12} />}</button>
            <span className="home-task-title">{t.title}</span>
            <AssigneeBadges item={t} />
          </div>
        ))}
      </section>

      {/* THIS WEEK */}
      <section className="home-card">
        <div className="home-card-head"><h2>This week at a glance</h2></div>
        <p className="home-week-hint">Who's on what — so you can see who's free to gym, who's got Lana, who's doing the shop.</p>
        <div className="home-week">
          {week.map((day, i) => {
            const items = [...eventsOnDay(day), ...tasksDueOn(day)]
            const awayToday = away.length > 0 && i === 0
            return (
              <div key={i} className={`home-week-row ${isToday(day) ? 'is-today' : ''}`}>
                <div className="home-week-day">
                  <span className="home-week-dow">{i === 0 ? 'Today' : i === 1 ? 'Tmrw' : format(day, 'EEE')}</span>
                  <span className="home-week-num">{format(day, 'd')}</span>
                </div>
                <div className="home-week-items">
                  {items.length === 0 ? <span className="home-week-free">Clear</span> : (
                    <>
                      {items.slice(0, 4).map((it, ix) => <Chip key={it.id || ix} item={it} />)}
                      {items.length > 4 && <button className="hi-more" onClick={() => goto('calendar')}>+{items.length - 4}</button>}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// MORE sheet (progressive disclosure)
// ════════════════════════════════════════════════════════════════════════════
const WHO_OPTS = [{ id: 'both', label: 'Both' }, { id: 'rhodri', label: 'Rhodri' }, { id: 'becky', label: 'Becky' }, { id: 'lana', label: 'Lana' }]
const RECUR_OPTS = [['none', "Doesn't repeat"], ['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly']]

function VoiceAddModal({ onParse, onCreate, onClose }) {
  const [text, setText] = useState('')
  const [rec, setRec] = useState(null)
  const [listening, setListening] = useState(false)
  const [busy, setBusy] = useState(false)
  const [p, setP] = useState(null)
  const [err, setErr] = useState('')
  const setField = (k, v) => setP(prev => ({ ...prev, [k]: v }))

  function toggleMic() {
    const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
    if (!SR) { setErr("This browser can't listen — type it below instead. (On iPhone, use the keyboard mic.)"); return }
    if (listening && rec) { try { rec.stop() } catch {}; return }
    const r = new SR()
    r.lang = 'en-GB'; r.interimResults = true; r.continuous = false
    r.onresult = e => setText(Array.from(e.results).map(x => x[0].transcript).join(''))
    r.onerror = () => setListening(false)
    r.onend = () => setListening(false)
    setRec(r); setErr(''); setListening(true)
    try { r.start() } catch { setListening(false) }
  }

  async function understand() {
    if (!text.trim()) return
    setBusy(true); setErr('')
    try {
      const out = await onParse(text.trim())
      if (out && out.title) setP(out)
      else setErr("Couldn't make sense of that — try rephrasing.")
    } catch (e) {
      setErr(e.code === 'no_key' ? 'Voice needs an ANTHROPIC_API_KEY set in Vercel.' : 'The voice service is unavailable right now.')
    } finally { setBusy(false) }
  }

  async function add() { await onCreate(p); onClose() }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header"><h2><Mic size={18} style={{ verticalAlign: '-3px', marginRight: 6 }} />Add by voice</h2><button className="modal-close" onClick={onClose}><X size={18} /></button></div>
        <div className="modal-form">
          <p style={{ margin: '0 0 10px', color: 'var(--muted, #667)', fontSize: 13 }}>Say or type something like <em>"Walk Lana tomorrow 8am"</em> or <em>"Dentist next Tuesday at 3pm"</em>.</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={2} placeholder="What do you want to add?" style={{ flex: 1, resize: 'vertical' }} />
            <button className="btn-save" onClick={toggleMic} title="Speak" style={{ padding: '0 14px', background: listening ? '#c0453b' : undefined }}><Mic size={18} /></button>
          </div>
          {!p && <div className="modal-actions"><button className="btn-cancel" onClick={onClose}>Cancel</button><button className="btn-save" onClick={understand} disabled={busy || !text.trim()}>{busy ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />} Understand</button></div>}
          {err && <p style={{ color: '#c0453b', fontSize: 13, margin: '8px 0 0' }}>{err}</p>}

          {p && (
            <div style={{ marginTop: 14, borderTop: '1px solid var(--line, #e3e3da)', paddingTop: 14, display: 'grid', gap: 10 }}>
              <label>Title<input value={p.title || ''} onChange={e => setField('title', e.target.value)} /></label>
              <div style={{ display: 'flex', gap: 8 }}>
                <label style={{ flex: 1 }}>Type<select value={p.kind === 'event' ? 'event' : 'task'} onChange={e => setField('kind', e.target.value)}><option value="task">Task</option><option value="event">Event</option></select></label>
                <label style={{ flex: 1 }}>Who<select value={p.assignee || 'both'} onChange={e => setField('assignee', e.target.value)}>{WHO_OPTS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <label style={{ flex: 1 }}>Date<input type="date" value={p.date || ''} onChange={e => setField('date', e.target.value)} /></label>
                <label style={{ flex: 1 }}>Time<input type="time" value={p.time || ''} onChange={e => setField('time', e.target.value ? e.target.value : null)} /></label>
              </div>
              <label>Repeat<select value={p.recur || 'none'} onChange={e => setField('recur', e.target.value)}>{RECUR_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <div className="modal-actions"><button className="btn-cancel" onClick={() => setP(null)}>Back</button><button className="btn-save" onClick={add}><Check size={15} /> Add to hub</button></div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TravelModal({ onParse, onAdd, onClose }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [events, setEvents] = useState(null)
  const [err, setErr] = useState('')

  async function scan() {
    if (!text.trim()) return
    setBusy(true); setErr('')
    try {
      const evs = await onParse(text.trim())
      setEvents(evs)
      if (!evs.length) setErr('No flights, hotels or trains found in that text.')
    } catch (e) {
      setErr(e.code === 'no_key' ? 'Travel import needs an ANTHROPIC_API_KEY set in Vercel.' : 'The travel service is unavailable right now.')
    } finally { setBusy(false) }
  }
  async function addAll() { await onAdd(events); onClose() }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header"><h2><Luggage size={18} style={{ verticalAlign: '-3px', marginRight: 6 }} />Import a trip</h2><button className="modal-close" onClick={onClose}><X size={18} /></button></div>
        <div className="modal-form">
          <p style={{ margin: '0 0 10px', color: 'var(--muted, #667)', fontSize: 13 }}>Paste a flight, hotel or train confirmation email and it'll pull out the dates and add them to your calendar.</p>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={7} placeholder="Paste your booking confirmation here…" style={{ width: '100%', resize: 'vertical' }} />
          {!events && <div className="modal-actions"><button className="btn-cancel" onClick={onClose}>Cancel</button><button className="btn-save" onClick={scan} disabled={busy || !text.trim()}>{busy ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />} Find bookings</button></div>}
          {err && <p style={{ color: '#c0453b', fontSize: 13, margin: '8px 0 0' }}>{err}</p>}

          {events && events.length > 0 && (
            <div style={{ marginTop: 14, borderTop: '1px solid var(--line, #e3e3da)', paddingTop: 14 }}>
              <div style={{ display: 'grid', gap: 8 }}>
                {events.map((e, i) => (
                  <div key={i} style={{ border: '1px solid var(--line, #e3e3da)', borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ fontWeight: 600 }}>{e.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted, #667)' }}>{e.start_date}{e.start_time ? ` · ${e.start_time}` : ''}{e.end_date && e.end_date !== e.start_date ? ` → ${e.end_date}` : ''}</div>
                    {e.notes && <div style={{ fontSize: 12, color: 'var(--muted, #667)', marginTop: 3 }}>{e.notes}</div>}
                  </div>
                ))}
              </div>
              <div className="modal-actions"><button className="btn-cancel" onClick={() => setEvents(null)}>Back</button><button className="btn-save" onClick={addAll}><Check size={15} /> Add {events.length} to calendar</button></div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MoreSheet({ onClose, goto, open, whoami, away }) {
  const me = whoami ? getPerson(whoami) : null
  const Row = ({ icon, label, sub, onClick }) => (
    <button className="more-row" onClick={onClick}>
      <span className="more-row-icon">{icon}</span>
      <span className="more-row-text"><span className="more-row-label">{label}</span>{sub && <span className="more-row-sub">{sub}</span>}</span>
      <ChevronRight size={16} className="more-row-chev" />
    </button>
  )
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal more-sheet">
        <div className="modal-header"><h2>More</h2><button className="modal-close" onClick={onClose}><X size={18} /></button></div>
        <div className="modal-form">
          <div className="more-group">
            <Row icon={<Heart size={17} />} label="Us" sub="Level, badges, pulse, coupons, date night" onClick={() => goto('us')} />
            <Row icon={<StickyNote size={17} />} label="Notes & countdowns" onClick={() => goto('notes')} />
          </div>
          <div className="more-group-label">Tools</div>
          <div className="more-group">
            <Row icon={<Wand2 size={17} />} label="AI assistant" sub="Plan the week, ideas" onClick={open.ai} />
            <Row icon={<Mic size={17} />} label="Add by voice" sub="Speak a task or event" onClick={open.voice} />
            <Row icon={<Luggage size={17} />} label="Import a trip" sub="Paste a flight / hotel confirmation" onClick={open.travel} />
            <Row icon={<LayoutTemplate size={17} />} label="Templates" onClick={open.templates} />
            <Row icon={<Plane size={17} />} label="Away / vacation" sub={away.length ? `${away.map(id => getPerson(id).label).join(' & ')} away` : undefined} onClick={open.away} />
            <Row icon={<Mail size={17} />} label="Email reminders" onClick={open.email} />
            <Row icon={<CalendarPlus size={17} />} label="Subscribe in your calendar" onClick={open.subscribe} />
            <Row icon={<Users size={17} />} label={me && me.adult ? `You're ${me.label} on this phone` : 'Who are you / invite partner'} onClick={open.welcome} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// WELCOME / first run + invite partner
// ════════════════════════════════════════════════════════════════════════════
function WelcomeModal({ whoami, onChoose, onClearSample, onClose, demo }) {
  const adults = PEOPLE.filter(p => p.adult)
  const [copied, setCopied] = useState(false)
  const [cleared, setCleared] = useState(false)
  const url = typeof window !== 'undefined' ? window.location.origin : ''
  const partner = whoami ? adults.find(a => a.id !== whoami) : null

  function copy() {
    const msg = `Here's our Couple's Hub 💕 — open it and tap your name: ${url}`
    try { navigator.clipboard.writeText(msg).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500) }) } catch { setCopied(true) }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal welcome-modal">
        <div className="modal-header"><h2>Welcome to your Hub 💕</h2><button className="modal-close" onClick={onClose}><X size={18} /></button></div>
        <div className="modal-form">
          <p className="connect-intro">A shared home for what's on this week — events, tasks, the dog, the shop. No accounts to make; just tap who you are on this phone.</p>

          <div className="welcome-who">
            {adults.map(p => (
              <button key={p.id} className={`welcome-person ${whoami === p.id ? 'sel' : ''}`} style={{ '--pc': p.color }} onClick={() => onChoose(p.id)}>
                <span className="welcome-person-icon">{p.icon}</span>
                <span>{p.label}</span>
                {whoami === p.id && <Check size={14} className="welcome-check" />}
              </button>
            ))}
            <button className={`welcome-person ${whoami === '' ? '' : ''}`} onClick={() => onChoose('')}>
              <span className="welcome-person-icon">👀</span><span>Just looking</span>
            </button>
          </div>

          {whoami && partner && (
            <div className="connect-section">
              <h3><Users size={15} /> Get {partner.label} on board</h3>
              <p className="connect-intro">Send {partner.label} this link. They open it, tap their name, and they're in — no setup, ever.</p>
              <div className="invite-link"><input readOnly value={url} onFocus={e => e.target.select()} /><button className="btn-save sm" onClick={copy}>{copied ? <><Check size={13} /> Copied</> : 'Copy invite'}</button></div>
            </div>
          )}

          {demo && (
            <div className="connect-note">
              The items in here are just examples to show you around.
              <button className="welcome-clear" onClick={() => { onClearSample(); setCleared(true) }}>{cleared ? '✓ Cleared — all yours now' : 'Start fresh (clear the examples)'}</button>
            </div>
          )}

          <div className="modal-actions">
            <button className="btn-save" onClick={onClose}><Check size={15} /> {whoami ? "Let's go" : 'Continue'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}


function fmtEur(n) { return '\u20AC' + (Number(n) || 0).toFixed(2) }

const EXPENSE_CATS = [
  { id: 'food',      label: 'Food & drink', icon: '🍽️', color: '#e0734f' },
  { id: 'groceries', label: 'Groceries',    icon: '🛒', color: '#4caf72' },
  { id: 'home',      label: 'Home & rent',  icon: '🏠', color: '#3b82c4' },
  { id: 'travel',    label: 'Travel',       icon: '✈️', color: '#9b6be0' },
  { id: 'transport', label: 'Transport',    icon: '🚆', color: '#7ec8e3' },
  { id: 'fun',       label: 'Fun & social', icon: '🎉', color: '#e06b9a' },
  { id: 'health',    label: 'Health',       icon: '💊', color: '#50c878' },
  { id: 'shopping',  label: 'Shopping',     icon: '🛍️', color: '#d99a2e' },
  { id: 'other',     label: 'Other',        icon: '📌', color: '#94a585' },
]
const getExpCat = id => EXPENSE_CATS.find(c => c.id === id) || EXPENSE_CATS[8]
function expShares(e) {
  if (e.split === 'rhodri') return { r: 1, b: 0 }
  if (e.split === 'becky')  return { r: 0, b: 1 }
  if (e.split === 'custom') { const rv = Math.min(100, Math.max(0, Number(e.split_value ?? 50))) / 100; return { r: rv, b: 1 - rv } }
  return { r: 0.5, b: 0.5 }
}

function ExpensesView({ expenses, onSave, onToggleSettle, onDelete, onSettleAll }) {
  const r = getPerson('rhodri'), bk = getPerson('becky')
  const blank = { title: '', amount: '', paid_by: 'rhodri', split: 'even', split_value: 50, category: 'other', date: format(new Date(), 'yyyy-MM-dd'), note: '' }
  const [editing, setEditing] = useState(null)
  const [filter, setFilter] = useState('open')
  const [catFilter, setCatFilter] = useState('all')

  const sorted = [...expenses].sort((a, z) => (z.date || z.created_at || '').localeCompare(a.date || a.created_at || ''))
  const openExp = sorted.filter(e => !e.settled)
  const visible = sorted
    .filter(e => filter === 'all' ? true : filter === 'open' ? !e.settled : e.settled)
    .filter(e => catFilter === 'all' ? true : (e.category || 'other') === catFilter)

  const otherShareOf = e => { const a = Number(e.amount) || 0, sh = expShares(e); return e.paid_by === 'rhodri' ? a * sh.b : a * sh.r }
  let net = 0
  for (const e of openExp) net += e.paid_by === 'rhodri' ? otherShareOf(e) : -otherShareOf(e)
  const level = Math.abs(net) < 0.005
  const debtor = net > 0 ? bk : r, creditor = net > 0 ? r : bk

  const owesLine = e => {
    const payer = getPerson(e.paid_by), other = getPerson(e.paid_by === 'rhodri' ? 'becky' : 'rhodri')
    const os = otherShareOf(e)
    if (os < 0.005) return `${payer.label}'s own expense`
    return `${other.label} owes ${payer.label} ${fmtEur(os)}`
  }

  const ym = format(new Date(), 'yyyy-MM')
  const allAmt = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const monthAmt = expenses.filter(e => (e.date || e.created_at || '').slice(0, 7) === ym).reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const paidR = expenses.filter(e => e.paid_by === 'rhodri').reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const paidB = expenses.filter(e => e.paid_by === 'becky').reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const byCat = EXPENSE_CATS.map(c => ({ ...c, total: expenses.filter(e => (e.category || 'other') === c.id).reduce((s, e) => s + (Number(e.amount) || 0), 0) })).filter(c => c.total > 0).sort((a, z) => z.total - a.total)
  const maxCat = byCat[0]?.total || 1

  const f = editing || blank
  const setF = patch => setEditing(prev => ({ ...(prev || blank), ...patch }))
  const openEdit = e => setEditing({ ...blank, ...e, amount: String(e.amount ?? ''), date: e.date || blank.date, split_value: e.split_value ?? 50, note: e.note || '' })
  const duplicate = e => setEditing({ ...blank, ...e, id: undefined, settled: false, settled_at: null, created_at: undefined, amount: String(e.amount ?? ''), date: blank.date, split_value: e.split_value ?? 50, note: e.note || '' })
  const submit = () => {
    const amt = parseFloat(String(f.amount).replace(',', '.'))
    if (!f.title.trim() || !(amt > 0)) return
    onSave({
      id: f.id || genId(), title: f.title.trim(), amount: amt, paid_by: f.paid_by,
      split: f.split, split_value: f.split === 'custom' ? (Number(f.split_value) || 50) : null,
      category: f.category || 'other', date: f.date || blank.date, note: (f.note || '').trim() || null,
      settled: f.settled || false, settled_at: f.settled_at || null, created_at: f.created_at || new Date().toISOString(),
    })
    setEditing(null)
  }

  const Row = ({ e }) => {
    const c = getExpCat(e.category)
    return (
      <div className={`expense-row ${e.settled ? 'settled' : ''}`}>
        <button className={`check-btn ${e.settled ? 'checked' : ''}`} title={e.settled ? 'Mark unsettled' : 'Mark settled'} onClick={() => onToggleSettle(e)}>{e.settled && <Check size={12} />}</button>
        <span className="expense-cat-ic" style={{ background: c.color + '22' }} title={c.label}>{c.icon}</span>
        <div className="expense-main" onClick={() => openEdit(e)}>
          <div className="expense-top"><span className="expense-title">{e.title}</span><span className="expense-amt">{fmtEur(e.amount)}</span></div>
          <div className="expense-sub">{getPerson(e.paid_by).icon} {getPerson(e.paid_by).label} paid{e.date ? ` · ${format(parseISO(e.date), 'd MMM')}` : ''} · {e.settled ? 'settled' : owesLine(e)}</div>
          {e.note && <div className="expense-note">{e.note}</div>}
        </div>
        <div className="expense-row-btns">
          <button onClick={() => duplicate(e)} title="Duplicate (e.g. next month)"><Copy size={13} /></button>
          <button className="del-btn" onClick={() => onDelete(e.id)}><Trash2 size={13} /></button>
        </div>
      </div>
    )
  }

  return (
    <div className="expenses-view">
      <div className={`balance-card ${level ? 'level' : ''}`}>
        {level ? <div className="balance-main">All settled up 🎉</div> : (<>
          <div className="balance-main"><span style={{ color: debtor.color }}>{debtor.icon} {debtor.label}</span> owes <span style={{ color: creditor.color }}>{creditor.icon} {creditor.label}</span></div>
          <div className="balance-amount">{fmtEur(Math.abs(net))}</div>
        </>)}
        {openExp.length > 0 && <button className="settle-all-btn" onClick={onSettleAll}>{level ? 'Clear settled list' : `Settle up — ${fmtEur(Math.abs(net))}`}</button>}
      </div>

      {editing ? (
        <div className="expense-form">
          <input type="text" placeholder="What was it? e.g. Flights to India" value={f.title} onChange={e => setF({ title: e.target.value })} />
          <div className="exp-form-grid">
            <input type="text" inputMode="decimal" placeholder="Amount €" value={f.amount} onChange={e => setF({ amount: e.target.value })} />
            <input type="date" value={f.date} onChange={e => setF({ date: e.target.value })} />
          </div>
          <div className="exp-seg-label">Category</div>
          <div className="exp-cat-grid">{EXPENSE_CATS.map(c => <button key={c.id} type="button" className={`exp-cat-btn ${f.category === c.id ? 'on' : ''}`} style={f.category === c.id ? { '--sc': c.color } : undefined} onClick={() => setF({ category: c.id })}>{c.icon} {c.label}</button>)}</div>
          <div className="exp-seg-label">Paid by</div>
          <div className="exp-seg">{[r, bk].map(p => <button key={p.id} type="button" className={f.paid_by === p.id ? 'on' : ''} style={f.paid_by === p.id ? { '--sc': p.color } : undefined} onClick={() => setF({ paid_by: p.id })}>{p.icon} {p.label}</button>)}</div>
          <div className="exp-seg-label">Split</div>
          <div className="exp-seg">
            <button type="button" className={f.split === 'even' ? 'on' : ''} onClick={() => setF({ split: 'even' })}>Evenly</button>
            <button type="button" className={f.split === 'rhodri' ? 'on' : ''} style={f.split === 'rhodri' ? { '--sc': r.color } : undefined} onClick={() => setF({ split: 'rhodri' })}>{r.icon} {r.label}'s</button>
            <button type="button" className={f.split === 'becky' ? 'on' : ''} style={f.split === 'becky' ? { '--sc': bk.color } : undefined} onClick={() => setF({ split: 'becky' })}>{bk.icon} {bk.label}'s</button>
            <button type="button" className={f.split === 'custom' ? 'on' : ''} onClick={() => setF({ split: 'custom' })}>Custom %</button>
          </div>
          {f.split === 'custom' && (
            <div className="exp-custom">
              <label>{r.icon} {r.label} pays {Math.round(Number(f.split_value) || 50)}% · {bk.icon} {bk.label} {100 - Math.round(Number(f.split_value) || 50)}%</label>
              <input type="range" min="0" max="100" step="5" value={Number(f.split_value) || 50} onChange={e => setF({ split_value: Number(e.target.value) })} />
            </div>
          )}
          <input type="text" placeholder="Note (optional)" value={f.note} onChange={e => setF({ note: e.target.value })} />
          <div className="exp-form-btns">
            <button className="btn-cancel" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn-save" onClick={submit}><Plus size={14} /> {f.id ? 'Save changes' : 'Add expense'}</button>
          </div>
        </div>
      ) : <button className="add-expense-btn" onClick={() => setEditing({ ...blank })}><Plus size={16} /> Add an expense</button>}

      {expenses.length > 0 && (
        <div className="exp-insights">
          <div className="exp-insight-row">
            <div className="exp-stat"><span className="exp-stat-num">{fmtEur(monthAmt)}</span><span className="exp-stat-lbl">this month</span></div>
            <div className="exp-stat"><span className="exp-stat-num">{fmtEur(allAmt)}</span><span className="exp-stat-lbl">all time</span></div>
            <div className="exp-stat"><span className="exp-stat-num" style={{ color: r.color }}>{fmtEur(paidR)}</span><span className="exp-stat-lbl">{r.label} paid</span></div>
            <div className="exp-stat"><span className="exp-stat-num" style={{ color: bk.color }}>{fmtEur(paidB)}</span><span className="exp-stat-lbl">{bk.label} paid</span></div>
          </div>
          {byCat.length > 0 && <div className="exp-cat-bars">{byCat.slice(0, 6).map(c => (
            <div key={c.id} className="exp-cat-bar"><span className="exp-cat-bar-lbl">{c.icon} {c.label}</span><span className="exp-cat-bar-track"><span className="exp-cat-bar-fill" style={{ width: `${(c.total / maxCat) * 100}%`, background: c.color }} /></span><span className="exp-cat-bar-amt">{fmtEur(c.total)}</span></div>
          ))}</div>}
        </div>
      )}

      {expenses.length > 0 && (
        <div className="exp-filters">
          <div className="exp-filter-seg">{['open', 'settled', 'all'].map(k => <button key={k} type="button" className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{k[0].toUpperCase() + k.slice(1)}</button>)}</div>
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}><option value="all">All categories</option>{EXPENSE_CATS.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}</select>
        </div>
      )}

      <div className="expense-list">
        {visible.map(e => <Row key={e.id} e={e} />)}
        {visible.length === 0 && <div className="expense-empty">{expenses.length === 0 ? 'No expenses yet. Add one when you next pay for something together.' : 'Nothing here with these filters.'}</div>}
      </div>
    </div>
  )
}
