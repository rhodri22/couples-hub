import { useState, useEffect } from 'react'
import {
  Plus, X, Check, List, Columns, Bell, BellOff, ChevronLeft, ChevronRight,
  RefreshCw, AlertCircle, Pencil, Trash2, Clock, Heart, CalendarDays, StickyNote,
  CalendarHeart, AlarmClock, ShoppingCart, Flame, Trophy, Plane, LayoutTemplate,
  Sparkles, Repeat, Users, MoreHorizontal, CalendarPlus,
  Wand2, Award, Star, Gift, HeartPulse, Wine, Crown, Lock, Send, Loader2,
  TrendingUp, Gem
} from 'lucide-react'
import { supabase, HOUSEHOLD_ID } from './supabase'
import {
  requestNotificationPermission, scheduleNotification, cancelNotification,
  scheduleEventNotification, cancelEventNotification, rescheduleAll, updateBadge
} from './notifications'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday,
  addMonths, subMonths, parseISO, isBefore, startOfDay, isWithinInterval,
  differenceInCalendarDays, addHours, addDays
} from 'date-fns'
import {
  PEOPLE, CATEGORIES, EVENT_TYPES, KANBAN_COLS, REMINDER_OPTIONS, RECUR_OPTIONS,
  SHOP_CATEGORIES, getCat, getPerson, getEventType, getShopCat, genId,
  DEMO_TASKS, DEMO_EVENTS, DEMO_NOTES, DEMO_SHOPPING, DEMO_TEMPLATES, DEMO_SETTINGS,
  MOOD_LEVELS, getMood, DATE_VIBES, DATE_BUDGETS, DATE_TIMES, BADGES, levelTitle,
  DEMO_MOODS, DEMO_REWARDS, DEMO_DATE_IDEAS
} from './constants'
import { parseTaskText, describeParse } from './nlp'
import { buildNextInstance, isPaused, nextAssignee } from './recurrence'
import { computeStreak, computePoints, weeklyLeaderboard } from './stats'
import { earnedXP, spentXP, coupleLevel, unlockedBadges, localDateIdeas } from './gamification'
import './App.css'

export default function App() {
  const [tasks, setTasks]       = useState(DEMO_TASKS)
  const [events, setEvents]     = useState(DEMO_EVENTS)
  const [notes, setNotes]       = useState(DEMO_NOTES)
  const [shopping, setShopping] = useState(DEMO_SHOPPING)
  const [templates, setTemplates] = useState(DEMO_TEMPLATES)
  const [settings, setSettings] = useState(DEMO_SETTINGS)
  const [moods, setMoods]       = useState(DEMO_MOODS)
  const [rewards, setRewards]   = useState(DEMO_REWARDS)
  const [dateIdeas, setDateIdeas] = useState(DEMO_DATE_IDEAS)
  const [view, setView]         = useState('kanban')
  const [taskModal, setTaskModal]   = useState(null)
  const [eventModal, setEventModal] = useState(null)
  const [tplModal, setTplModal]     = useState(false)
  const [awayModal, setAwayModal]   = useState(false)
  const [subscribeModal, setSubscribeModal] = useState(false)
  const [aiModal, setAiModal]       = useState(false)
  const [syncStatus, setSyncStatus] = useState('idle')
  const [notifPerm, setNotifPerm]   = useState(typeof Notification !== 'undefined' ? Notification.permission : 'default')
  const [filterPerson, setFilterPerson] = useState('all')
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping',  filter: `household_id=eq.${HOUSEHOLD_ID}` }, loadShopping)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'templates', filter: `household_id=eq.${HOUSEHOLD_ID}` }, loadTemplates)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings',  filter: `household_id=eq.${HOUSEHOLD_ID}` }, loadSettings)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'moods',      filter: `household_id=eq.${HOUSEHOLD_ID}` }, loadMoods)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rewards',    filter: `household_id=eq.${HOUSEHOLD_ID}` }, loadRewards)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'date_ideas', filter: `household_id=eq.${HOUSEHOLD_ID}` }, loadDateIdeas)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  async function loadAll() { await Promise.all([loadTasks(), loadEvents(), loadNotes(), loadShopping(), loadTemplates(), loadSettings(), loadMoods(), loadRewards(), loadDateIdeas()]) }
  function flash() { setSyncStatus('synced'); setTimeout(() => setSyncStatus('idle'), 1400) }

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
  async function loadShopping()  { if (!supabase) return; const { data, error } = await supabase.from('shopping').select('*').eq('household_id', HOUSEHOLD_ID).order('created_at', { ascending: false }); if (!error) { setShopping(data); flash() } }
  async function loadTemplates() { if (!supabase) return; const { data, error } = await supabase.from('templates').select('*').eq('household_id', HOUSEHOLD_ID).order('created_at'); if (!error) { setTemplates(data); flash() } }
  async function loadSettings()  { if (!supabase) return; const { data, error } = await supabase.from('settings').select('*').eq('household_id', HOUSEHOLD_ID).maybeSingle(); if (!error && data) setSettings(data) }
  async function loadMoods()     { if (!supabase) return; const { data, error } = await supabase.from('moods').select('*').eq('household_id', HOUSEHOLD_ID).order('created_at', { ascending: false }); if (!error) { setMoods(data); flash() } }
  async function loadRewards()   { if (!supabase) return; const { data, error } = await supabase.from('rewards').select('*').eq('household_id', HOUSEHOLD_ID).order('created_at', { ascending: false }); if (!error) { setRewards(data); flash() } }
  async function loadDateIdeas() { if (!supabase) return; const { data, error } = await supabase.from('date_ideas').select('*').eq('household_id', HOUSEHOLD_ID).order('created_at', { ascending: false }); if (!error) { setDateIdeas(data); flash() } }

  // ── Task CRUD ──
  async function saveTask(task) {
    setSyncStatus('syncing')
    const row = { ...task, household_id: HOUSEHOLD_ID }
    if (supabase) { const { error } = await supabase.from('tasks').upsert(row); if (error) return setSyncStatus('offline') }
    setTasks(prev => { const i = prev.findIndex(t => t.id === row.id); if (i >= 0) { const n = [...prev]; n[i] = row; return n } return [row, ...prev] })
    scheduleNotification(row); flash()
  }
  async function deleteTask(id) {
    cancelNotification(id)
    if (supabase) await supabase.from('tasks').delete().eq('id', id)
    setTasks(prev => prev.filter(t => t.id !== id))
  }
  async function toggleComplete(task) {
    const nowDone = !task.completed
    const updated = { ...task, completed: nowDone, status: nowDone ? 'done' : 'todo', completed_at: nowDone ? new Date().toISOString() : null }
    await saveTask(updated)
    // Recurring: spawn next instance when completed (#1, #2, #6)
    if (nowDone && task.recur && task.recur !== 'none') {
      const next = buildNextInstance(task, away)
      if (next) await saveTask(next)
    }
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
  async function saveEvent(ev) {
    setSyncStatus('syncing')
    const row = { ...ev, household_id: HOUSEHOLD_ID }
    if (supabase) { const { error } = await supabase.from('events').upsert(row); if (error) return setSyncStatus('offline') }
    setEvents(prev => { const i = prev.findIndex(e => e.id === row.id); if (i >= 0) { const n = [...prev]; n[i] = row; return n } return [...prev, row] })
    scheduleEventNotification(row); flash()
  }
  async function deleteEvent(id) {
    cancelEventNotification(id)
    if (supabase) await supabase.from('events').delete().eq('id', id)
    setEvents(prev => prev.filter(e => e.id !== id))
  }

  // ── Notes ──
  async function saveNote(n) { setSyncStatus('syncing'); const row = { ...n, household_id: HOUSEHOLD_ID }; if (supabase) { const { error } = await supabase.from('notes').upsert(row); if (error) return setSyncStatus('offline') } setNotes(prev => { const i = prev.findIndex(x => x.id === row.id); if (i >= 0) { const c = [...prev]; c[i] = row; return c } return [row, ...prev] }); flash() }
  async function deleteNote(id) { if (supabase) await supabase.from('notes').delete().eq('id', id); setNotes(prev => prev.filter(n => n.id !== id)) }

  // ── Shopping (#5) ──
  async function saveShop(item) { setSyncStatus('syncing'); const row = { ...item, household_id: HOUSEHOLD_ID }; if (supabase) { const { error } = await supabase.from('shopping').upsert(row); if (error) return setSyncStatus('offline') } setShopping(prev => { const i = prev.findIndex(x => x.id === row.id); if (i >= 0) { const c = [...prev]; c[i] = row; return c } return [row, ...prev] }); flash() }
  async function deleteShop(id) { if (supabase) await supabase.from('shopping').delete().eq('id', id); setShopping(prev => prev.filter(s => s.id !== id)) }
  async function clearCheckedShop() {
    const checked = shopping.filter(s => s.checked)
    if (supabase) await supabase.from('shopping').delete().in('id', checked.map(s => s.id))
    setShopping(prev => prev.filter(s => !s.checked))
  }

  // ── Templates (#8) ──
  async function saveTemplate(tpl) { setSyncStatus('syncing'); const row = { ...tpl, household_id: HOUSEHOLD_ID }; if (supabase) { const { error } = await supabase.from('templates').upsert(row); if (error) return setSyncStatus('offline') } setTemplates(prev => { const i = prev.findIndex(x => x.id === row.id); if (i >= 0) { const c = [...prev]; c[i] = row; return c } return [...prev, row] }); flash() }
  async function deleteTemplate(id) { if (supabase) await supabase.from('templates').delete().eq('id', id); setTemplates(prev => prev.filter(t => t.id !== id)) }
  async function useTemplate(tpl) {
    for (const item of tpl.items) {
      await saveTask({
        id: genId(), title: item.title, category: item.category || 'home', assigned_to: item.assigned_to || 'both',
        status: 'todo', due_date: '', reminder_minutes: null, completed: false, recur: 'none',
        completed_at: null, snoozed_until: null, rotation: null,
        subtasks: (item.subtasks || []).map(s => ({ id: genId(), text: s, done: false })),
        created_at: new Date().toISOString(),
      })
    }
    setTplModal(false); setView('kanban')
  }

  // ── Settings / vacation (#6) ──
  async function saveSettings(next) {
    setSettings(next)
    const row = { ...next, household_id: HOUSEHOLD_ID }
    if (supabase) await supabase.from('settings').upsert(row)
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
    if (supabase) { const { error } = await supabase.from('moods').upsert(row); if (error) return setSyncStatus('offline') }
    setMoods(prev => { const i = prev.findIndex(x => x.id === row.id); if (i >= 0) { const c = [...prev]; c[i] = row; return c } return [row, ...prev] }); flash()
  }

  // ── Reward coupons ──
  async function saveReward(r) {
    setSyncStatus('syncing')
    const row = { ...r, household_id: HOUSEHOLD_ID }
    if (supabase) { const { error } = await supabase.from('rewards').upsert(row); if (error) return setSyncStatus('offline') }
    setRewards(prev => { const i = prev.findIndex(x => x.id === row.id); if (i >= 0) { const c = [...prev]; c[i] = row; return c } return [row, ...prev] }); flash()
  }
  async function redeemReward(reward, byPerson) { await saveReward({ ...reward, redeemed_by: byPerson, redeemed_at: new Date().toISOString() }) }
  async function deleteReward(id) { if (supabase) await supabase.from('rewards').delete().eq('id', id); setRewards(prev => prev.filter(r => r.id !== id)) }

  // ── Date ideas ──
  async function saveDateIdea(d) {
    setSyncStatus('syncing')
    const row = { ...d, household_id: HOUSEHOLD_ID }
    if (supabase) { const { error } = await supabase.from('date_ideas').upsert(row); if (error) return setSyncStatus('offline') }
    setDateIdeas(prev => { const i = prev.findIndex(x => x.id === row.id); if (i >= 0) { const c = [...prev]; c[i] = row; return c } return [row, ...prev] }); flash()
  }
  async function toggleDateDone(idea) { await saveDateIdea({ ...idea, done: !idea.done, done_at: !idea.done ? new Date().toISOString() : null }) }
  async function deleteDateIdea(id) { if (supabase) await supabase.from('date_ideas').delete().eq('id', id); setDateIdeas(prev => prev.filter(d => d.id !== id)) }
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
    const res = await fetch('/api/ai', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode, payload }),
    })
    if (!res.ok) { let code = res.status; try { code = (await res.json()).error || code } catch {} throw Object.assign(new Error('ai_failed'), { code }) }
    return res.json()
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
      })
    }
  }

  async function enableNotifications() { setNotifPerm(await requestNotificationPermission()) }

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
    (filterPerson === 'all' || t.assigned_to === filterPerson) &&
    (filterCat === 'all' || t.category === filterCat))
  const filteredEvents = events.filter(e => filterPerson === 'all' || e.assigned_to === filterPerson)
  const pendingCount = tasks.filter(t => !t.completed).length

  function headerAdd() {
    if (view === 'calendar') setEventModal({})
    else if (view === 'shopping') {} // shopping has its own inline add
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
          <button className="icon-btn ai-btn" onClick={() => setAiModal(true)} title="AI assistant">
            <Wand2 size={16} />
          </button>
          <button className="icon-btn" onClick={() => setAwayModal(true)} title="Away / vacation mode">
            <Plane size={16} className={away.length ? 'active-away' : ''} />
          </button>
          <button className="icon-btn" onClick={() => setSubscribeModal(true)} title="Subscribe in your calendar">
            <CalendarPlus size={16} />
          </button>
          <SyncDot status={syncStatus} />
          {notifPerm !== 'granted' && <button className="icon-btn" onClick={enableNotifications} title="Enable notifications"><BellOff size={16} /></button>}
          {pendingCount > 0 && <span className="badge">{pendingCount}</span>}
          {(view === 'kanban' || view === 'list' || view === 'calendar') &&
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
          <button className={view === 'kanban' ? 'active' : ''}   onClick={() => setView('kanban')}><Columns size={15} />Board</button>
          <button className={view === 'list' ? 'active' : ''}     onClick={() => setView('list')}><List size={15} />List</button>
          <button className={view === 'calendar' ? 'active' : ''} onClick={() => setView('calendar')}><CalendarDays size={15} />Calendar</button>
          <button className={view === 'shopping' ? 'active' : ''} onClick={() => setView('shopping')}><ShoppingCart size={15} />Shopping</button>
          <button className={view === 'us' ? 'active' : ''}       onClick={() => setView('us')}><Heart size={15} />Us</button>
          <button className={view === 'notes' ? 'active' : ''}    onClick={() => setView('notes')}><StickyNote size={15} />Notes</button>
        </div>
        {(view === 'kanban' || view === 'list' || view === 'calendar') && (
          <div className="filter-chips">
            <select value={filterPerson} onChange={e => setFilterPerson(e.target.value)} className="filter-select">
              <option value="all">Everyone</option>
              {PEOPLE.map(p => <option key={p.id} value={p.id}>{p.icon} {p.label}</option>)}
            </select>
            {(view === 'kanban' || view === 'list') && (
              <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="filter-select">
                <option value="all">All categories</option>
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            )}
          </div>
        )}
      </div>

      <main className="app-main">
        {(view === 'kanban' || view === 'list') && (
          <>
            <OverviewBar tasks={filteredTasks} allTasks={tasks} events={events} away={away} />
            <QuickAdd onAdd={quickAdd} onTemplates={() => setTplModal(true)} />
          </>
        )}
        {view === 'kanban'   && <KanbanView tasks={filteredTasks} away={away} onEdit={setTaskModal} onDelete={deleteTask} onToggle={toggleComplete} onMove={moveKanban} onSnooze={snooze} onSubtask={toggleSubtask} />}
        {view === 'list'     && <ListView   tasks={filteredTasks} away={away} onEdit={setTaskModal} onDelete={deleteTask} onToggle={toggleComplete} onSnooze={snooze} onSubtask={toggleSubtask} />}
        {view === 'calendar' && <CalendarView events={filteredEvents} tasks={filteredTasks} month={calMonth} setMonth={setCalMonth} onEditEvent={setEventModal} onAddOnDate={d => setEventModal({ start_date: format(d, 'yyyy-MM-dd'), end_date: format(d, 'yyyy-MM-dd') })} />}
        {view === 'shopping' && <ShoppingView shopping={shopping} onSave={saveShop} onDelete={deleteShop} onClearChecked={clearCheckedShop} />}
        {view === 'us'       && <UsView tasks={tasks} dateIdeas={dateIdeas} moods={moods} rewards={rewards}
                                  onSaveMood={saveMood} onSaveReward={saveReward} onRedeem={redeemReward} onDeleteReward={deleteReward}
                                  onSaveDateIdea={saveDateIdea} onToggleDate={toggleDateDone} onDeleteDate={deleteDateIdea} onDateToCalendar={dateToCalendar}
                                  callAI={callAI} />}
        {view === 'notes'    && <NotesView notes={notes} events={events} tasks={tasks} onSave={saveNote} onDelete={deleteNote} />}
      </main>

      {taskModal !== null && <TaskModal task={taskModal} away={away} onSave={async t => { await saveTask(t); setTaskModal(null) }} onClose={() => setTaskModal(null)} />}
      {eventModal !== null && <EventModal event={eventModal} onSave={async e => { await saveEvent(e); setEventModal(null) }} onDelete={async id => { await deleteEvent(id); setEventModal(null) }} onClose={() => setEventModal(null)} />}
      {tplModal && <TemplatesModal templates={templates} onUse={useTemplate} onSave={saveTemplate} onDelete={deleteTemplate} onClose={() => setTplModal(false)} />}
      {awayModal && <AwayModal away={away} onToggle={toggleAway} onClose={() => setAwayModal(false)} />}
      {subscribeModal && <SubscribeModal onClose={() => setSubscribeModal(false)} />}
      {aiModal && <AiModal tasks={tasks} events={events} away={away} moods={moods} callAI={callAI} onApply={applySuggestion} onClose={() => setAiModal(false)} />}
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
function TaskCard({ task, away, onEdit, onDelete, onToggle, onMove, onSnooze, onSubtask }) {
  const [showSnooze, setShowSnooze] = useState(false)
  const cat = getCat(task.category)
  const person = getPerson(task.assigned_to)
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
          <span className="person-pill" style={{ background: person.color, color: '#fff' }}>{person.icon} {person.label}</span>
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
function ListView({ tasks, away, onEdit, onDelete, onToggle, onSnooze, onSubtask }) {
  const sorted = [...tasks].sort((a, b) => (!a.due_date ? 1 : !b.due_date ? -1 : new Date(a.due_date) - new Date(b.due_date)))
  const groups = {}
  sorted.forEach(t => { const k = t.due_date ? format(parseISO(t.due_date), 'yyyy-MM-dd') : 'No date'; (groups[k] ||= []).push(t) })
  return (
    <div className="list-view">
      {Object.entries(groups).map(([k, group]) => (
        <div key={k} className="list-group">
          <div className="list-date-header">{k === 'No date' ? 'No due date' : format(parseISO(k), 'EEEE, d MMMM')}{k !== 'No date' && isToday(parseISO(k)) && <span className="today-badge">Today</span>}</div>
          {group.map(task => {
            const cat = getCat(task.category), person = getPerson(task.assigned_to)
            const overdue = task.due_date && isBefore(parseISO(task.due_date), startOfDay(new Date())) && !task.completed
            const paused = isPaused(task, away)
            const subs = task.subtasks || []
            return (
              <div key={task.id} className={`list-row ${task.completed ? 'completed' : ''} ${overdue && !paused ? 'overdue' : ''}`} style={{ borderLeft: `4px solid ${person.color}` }}>
                <button className={`check-btn ${task.completed ? 'checked' : ''}`} onClick={() => onToggle(task)}>{task.completed && <Check size={12} />}</button>
                <div className="list-content">
                  <span className="list-title">{task.title}</span>
                  <div className="list-meta">
                    <span className="person-pill" style={{ background: person.color, color: '#fff' }}>{person.icon} {person.label}</span>
                    <span className="cat-pill" style={{ background: cat.color + '22', color: cat.color }}>{cat.label}</span>
                    {task.recur && task.recur !== 'none' && <span className="recur-pill"><Repeat size={9} /> {task.recur}</span>}
                    {subs.length > 0 && <span className="due-pill">{subs.filter(s => s.done).length}/{subs.length} steps</span>}
                    {paused && <span className="paused-pill"><Plane size={9} /> paused</span>}
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
function CalendarView({ events, tasks, month, setMonth, onEditEvent, onAddOnDate }) {
  const [selectedDay, setSelectedDay] = useState(null)
  const monthStart = startOfMonth(month), monthEnd = endOfMonth(month)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const startPad = monthStart.getDay()
  const eventsOnDay = day => events.filter(e => { const s = parseISO(e.start_date), en = parseISO(e.end_date || e.start_date); return isWithinInterval(day, { start: startOfDay(s), end: startOfDay(en) }) || isSameDay(day, s) })
  const tasksOnDay = day => tasks.filter(t => t.due_date && isSameDay(parseISO(t.due_date), day))
  const selEvents = selectedDay ? eventsOnDay(selectedDay) : []
  const selTasks = selectedDay ? tasksOnDay(selectedDay) : []

  return (
    <div className="calendar-view">
      <div className="cal-header">
        <button onClick={() => setMonth(m => subMonths(m, 1))}><ChevronLeft size={18} /></button>
        <h2 className="cal-month">{format(month, 'MMMM yyyy')}</h2>
        <button onClick={() => setMonth(m => addMonths(m, 1))}><ChevronRight size={18} /></button>
      </div>
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
                  const t = getEventType(e.event_type), p = getPerson(e.assigned_to)
                  const isStart = isSameDay(day, parseISO(e.start_date))
                  const multi = e.end_date && e.end_date !== e.start_date
                  return <div key={e.id} className={`cal-bar ${multi ? 'multi' : ''}`} style={{ background: p.color }} title={e.title}>{(isStart || day.getDay() === 0) && <span className="cal-bar-label">{t.icon} {e.title}</span>}</div>
                })}
                {tks.length > 0 && <div className="cal-task-dots">{tks.slice(0, 4).map(t => <span key={t.id} className="cal-tdot" style={{ background: getPerson(t.assigned_to).color }} />)}</div>}
              </div>
            </div>
          )
        })}
      </div>
      <div className="cal-legend">{PEOPLE.map(p => <span key={p.id} className="legend-item"><span className="legend-dot" style={{ background: p.color }} />{p.label}</span>)}</div>

      {selectedDay && (
        <div className="cal-day-panel">
          <div className="cal-panel-header"><span>{format(selectedDay, 'EEEE, d MMMM yyyy')}</span><button className="add-day-btn" onClick={() => onAddOnDate(selectedDay)}><Plus size={14} /> Add event</button></div>
          {selEvents.length === 0 && selTasks.length === 0 && <div className="cal-empty">Nothing scheduled — tap "Add event" to create one.</div>}
          {selEvents.map(e => {
            const t = getEventType(e.event_type), p = getPerson(e.assigned_to)
            const multi = e.end_date && e.end_date !== e.start_date
            return (
              <div key={e.id} className="cal-event-row" onClick={() => onEditEvent(e)} style={{ borderLeft: `4px solid ${p.color}` }}>
                <span className="cal-event-icon">{t.icon}</span>
                <div className="cal-event-info"><span className="cal-event-title">{e.title}</span><span className="cal-event-sub">{p.icon} {p.label}{multi && ` · ${format(parseISO(e.start_date), 'd MMM')} – ${format(parseISO(e.end_date), 'd MMM')}`}{!e.all_day && e.start_time && ` · ${e.start_time}`}{e.recur && e.recur !== 'none' && ` · repeats ${e.recur}`}</span></div>
                <Pencil size={13} className="cal-event-edit" />
              </div>
            )
          })}
          {selTasks.map(t => {
            const person = getPerson(t.assigned_to)
            return <div key={t.id} className="cal-event-row task" style={{ borderLeft: `4px solid ${person.color}` }}><span className="cal-event-icon">📋</span><div className="cal-event-info"><span className="cal-event-title">{t.title}</span><span className="cal-event-sub">Task · {person.icon} {person.label}</span></div></div>
          })}
        </div>
      )}
    </div>
  )
}

// ─── Shopping view (#5) ───────────────────────────────────────────────────────
function ShoppingView({ shopping, onSave, onDelete, onClearChecked }) {
  const [item, setItem] = useState('')
  const [qty, setQty] = useState('')
  const [cat, setCat] = useState('other')
  const [by, setBy] = useState('rhodri')

  function add() {
    if (!item.trim()) return
    onSave({ id: genId(), item: item.trim(), qty: qty.trim(), category: cat, checked: false, added_by: by, created_at: new Date().toISOString() })
    setItem(''); setQty('')
  }
  const grouped = {}
  shopping.filter(s => !s.checked).forEach(s => { (grouped[s.category] ||= []).push(s) })
  const checkedItems = shopping.filter(s => s.checked)

  return (
    <div className="shopping-view">
      <h3 className="section-title"><ShoppingCart size={16} /> Shopping List</h3>
      <div className="shop-composer">
        <div className="shop-composer-main">
          <input value={item} onChange={e => setItem(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Add an item…" className="shop-item-input" />
          <input value={qty} onChange={e => setQty(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Qty" className="shop-qty-input" />
        </div>
        <div className="shop-composer-actions">
          <select value={cat} onChange={e => setCat(e.target.value)} className="filter-select">{SHOP_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}</select>
          <select value={by} onChange={e => setBy(e.target.value)} className="filter-select">{PEOPLE.filter(p => p.adult).map(p => <option key={p.id} value={p.id}>{p.icon} {p.label}</option>)}</select>
          <button className="btn-save" onClick={add}><Plus size={14} /> Add</button>
        </div>
      </div>

      {Object.keys(grouped).length === 0 && checkedItems.length === 0 && <div className="empty-state"><ShoppingCart size={40} /><p>List is empty — add something above!</p></div>}

      {SHOP_CATEGORIES.filter(c => grouped[c.id]).map(c => (
        <div key={c.id} className="shop-group">
          <div className="shop-group-header">{c.icon} {c.label}</div>
          {grouped[c.id].map(s => {
            const p = getPerson(s.added_by)
            return (
              <div key={s.id} className="shop-row">
                <button className="check-btn" onClick={() => onSave({ ...s, checked: true })} />
                <span className="shop-item-name">{s.item}{s.qty && <span className="shop-qty"> · {s.qty}</span>}</span>
                <span className="shop-by" style={{ color: p.color }} title={`Added by ${p.label}`}>{p.icon}</span>
                <button className="del-btn" onClick={() => onDelete(s.id)}><Trash2 size={12} /></button>
              </div>
            )
          })}
        </div>
      ))}

      {checkedItems.length > 0 && (
        <div className="shop-checked-section">
          <div className="shop-checked-header"><span>In the basket ({checkedItems.length})</span><button onClick={onClearChecked} className="clear-btn"><Trash2 size={12} /> Clear</button></div>
          {checkedItems.map(s => (
            <div key={s.id} className="shop-row checked">
              <button className="check-btn checked" onClick={() => onSave({ ...s, checked: false })}><Check size={12} /></button>
              <span className="shop-item-name">{s.item}{s.qty && <span className="shop-qty"> · {s.qty}</span>}</span>
            </div>
          ))}
        </div>
      )}
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
              const t = getEventType(e.event_type), p = getPerson(e.assigned_to)
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
function TaskModal({ task, away, onSave, onClose }) {
  const isNew = !task?.id
  const [f, setF] = useState({
    id: task?.id || genId(), title: task?.title || '', category: task?.category || 'home',
    assigned_to: task?.assigned_to || 'both', status: task?.status || 'todo',
    due_date: task?.due_date || '', reminder_minutes: task?.reminder_minutes ?? 1440,
    completed: task?.completed || false, recur: task?.recur || 'none',
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

          <div className="form-row"><span className="form-label">Assign to</span>
            <div className="person-grid">{PEOPLE.map(p => <button key={p.id} type="button" className={`person-btn ${f.assigned_to === p.id ? 'active' : ''}`} style={{ '--pc': p.color }} onClick={() => set('assigned_to', p.id)}>{p.icon} {p.label}{away.includes(p.id) && ' ✈️'}</button>)}</div>
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
    assigned_to: event?.assigned_to || 'both', start_date: event?.start_date || format(new Date(), 'yyyy-MM-dd'),
    end_date: event?.end_date || event?.start_date || format(new Date(), 'yyyy-MM-dd'),
    all_day: event?.all_day ?? true, start_time: event?.start_time || '', recur: event?.recur || 'none',
    reminder_minutes: event?.reminder_minutes ?? 1440, notes: event?.notes || '', created_at: event?.created_at || new Date().toISOString(),
  })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  function submit() { if (!f.title.trim()) return; const out = { ...f }; if (isBefore(parseISO(out.end_date), parseISO(out.start_date))) out.end_date = out.start_date; onSave(out) }
  const isMulti = f.end_date && f.end_date !== f.start_date
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header"><h2>{isNew ? 'New Event' : 'Edit Event'}</h2><button className="modal-close" onClick={onClose}><X size={18} /></button></div>
        <div className="modal-form">
          <label>Event<input value={f.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Rhodri's Birthday, Holiday in India" autoFocus /></label>
          <div className="form-row"><span className="form-label">Type</span><div className="cat-grid">{EVENT_TYPES.map(t => <button key={t.id} type="button" className={`cat-btn ${f.event_type === t.id ? 'active' : ''}`} style={{ '--cat-color': t.color }} onClick={() => set('event_type', t.id)}>{t.icon} {t.label}</button>)}</div></div>
          <div className="form-row"><span className="form-label">For</span><div className="person-grid">{PEOPLE.map(p => <button key={p.id} type="button" className={`person-btn ${f.assigned_to === p.id ? 'active' : ''}`} style={{ '--pc': p.color }} onClick={() => set('assigned_to', p.id)}>{p.icon} {p.label}</button>)}</div></div>
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
          <label>Notes<textarea value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="Details, links, things to remember…" rows={2} /></label>
          <div className="modal-actions">
            {!isNew && <button className="btn-delete" onClick={() => onDelete(f.id)}><Trash2 size={15} /></button>}
            <button className="btn-cancel" onClick={onClose}>Cancel</button>
            <button className="btn-save" onClick={submit}>{isNew ? <><Plus size={15} /> Add Event</> : <><Check size={15} /> Save</>}</button>
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
function UsView({ tasks, dateIdeas, moods, rewards, onSaveMood, onSaveReward, onRedeem, onDeleteReward, onSaveDateIdea, onToggleDate, onDeleteDate, onDateToCalendar, callAI }) {
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
      <PulseSection moods={moods} onSaveMood={onSaveMood} />

      {/* Reward coupons */}
      <CouponsSection rewards={rewards} spendable={spendable} onSave={onSaveReward} onRedeem={onRedeem} onDelete={onDeleteReward} />

      {/* Date-night generator */}
      <DateGenerator dateIdeas={dateIdeas} callAI={callAI} onSave={onSaveDateIdea} onToggle={onToggleDate} onDelete={onDeleteDate} onToCalendar={onDateToCalendar} />
    </div>
  )
}

function PulseSection({ moods, onSaveMood }) {
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const adults = PEOPLE.filter(p => p.adult)
  function todayFor(pid) { return moods.find(m => m.person === pid && m.date === todayStr) }
  function logMood(pid, level) {
    const ex = todayFor(pid)
    onSaveMood({ id: ex?.id || genId(), person: pid, level, note: ex?.note || '', date: todayStr, created_at: ex?.created_at || new Date().toISOString() })
  }
  // combined "weather" from today's logged moods
  const todays = adults.map(p => todayFor(p.id)).filter(Boolean)
  const avg = todays.length ? todays.reduce((s, m) => s + m.level, 0) / todays.length : null
  const weather = avg == null ? null : getMood(Math.round(avg))

  // recent history (last 7 entries per person, oldest→newest for the strip)
  const history = pid => moods.filter(m => m.person === pid).slice(0, 7).reverse()

  return (
    <section className="us-section">
      <h3 className="section-title"><HeartPulse size={16} /> Relationship Pulse</h3>
      {weather && (
        <div className="pulse-weather" style={{ '--wc': weather.color }}>
          <span className="pulse-weather-emoji">{weather.emoji}</span>
          <div><strong>Today feels {weather.label.toLowerCase()}</strong><span className="pulse-weather-sub">based on your check-ins</span></div>
        </div>
      )}
      <div className="pulse-people">
        {adults.map(p => {
          const t = todayFor(p.id)
          return (
            <div key={p.id} className="pulse-person" style={{ '--pc': p.color }}>
              <div className="pulse-person-head"><span>{p.icon} {p.label}</span>{t && <span className="pulse-logged">logged {getMood(t.level).emoji}</span>}</div>
              <div className="pulse-scale">
                {MOOD_LEVELS.map(m => (
                  <button key={m.level} className={`pulse-dot ${t?.level === m.level ? 'sel' : ''}`} style={{ '--mc': m.color }} onClick={() => logMood(p.id, m.level)} title={m.label}>{m.emoji}</button>
                ))}
              </div>
              <div className="pulse-history">
                {history(p.id).map(m => <span key={m.id} className="pulse-hist-dot" style={{ background: getMood(m.level).color }} title={`${m.date}: ${getMood(m.level).label}`} />)}
              </div>
            </div>
          )
        })}
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
