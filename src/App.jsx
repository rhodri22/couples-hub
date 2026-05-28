import { useState, useEffect, useRef } from 'react'
import {
  Plus, X, Check, Calendar, List, Columns, Bell, BellOff,
  ChevronLeft, ChevronRight, RefreshCw, AlertCircle, Pencil,
  Trash2, Clock, Heart, CalendarDays, StickyNote, CalendarHeart,
  AlarmClock, Repeat, MapPin
} from 'lucide-react'
import { supabase, HOUSEHOLD_ID } from './supabase'
import {
  requestNotificationPermission, scheduleNotification, cancelNotification,
  scheduleEventNotification, cancelEventNotification, rescheduleAll, updateBadge
} from './notifications'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday,
  addMonths, subMonths, parseISO, isBefore, startOfDay, isWithinInterval,
  differenceInCalendarDays, isAfter
} from 'date-fns'
import {
  PEOPLE, CATEGORIES, EVENT_TYPES, KANBAN_COLS, REMINDER_OPTIONS, RECUR_OPTIONS,
  getCat, getPerson, getEventType, genId, DEMO_TASKS, DEMO_EVENTS, DEMO_NOTES
} from './constants'
import './App.css'

export default function App() {
  const [tasks, setTasks]     = useState(DEMO_TASKS)
  const [events, setEvents]   = useState(DEMO_EVENTS)
  const [notes, setNotes]     = useState(DEMO_NOTES)
  const [view, setView]       = useState('kanban') // kanban | list | calendar | notes
  const [taskModal, setTaskModal]   = useState(null)   // task obj or {} for new, null = closed
  const [eventModal, setEventModal] = useState(null)
  const [syncStatus, setSyncStatus] = useState('idle')
  const [notifPerm, setNotifPerm]   = useState(typeof Notification !== 'undefined' ? Notification.permission : 'default')
  const [filterPerson, setFilterPerson] = useState('all')
  const [filterCat, setFilterCat] = useState('all')
  const [calMonth, setCalMonth] = useState(new Date())

  // ── Supabase load + realtime ──
  useEffect(() => {
    if (!supabase) { rescheduleAll(tasks, events); return }
    loadAll()
    const ch = supabase.channel('hub-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks',  filter: `household_id=eq.${HOUSEHOLD_ID}` }, loadTasks)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `household_id=eq.${HOUSEHOLD_ID}` }, loadEvents)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes',  filter: `household_id=eq.${HOUSEHOLD_ID}` }, loadNotes)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  async function loadAll() { await Promise.all([loadTasks(), loadEvents(), loadNotes()]) }

  async function loadTasks() {
    if (!supabase) return
    const { data, error } = await supabase.from('tasks').select('*').eq('household_id', HOUSEHOLD_ID).order('created_at', { ascending: false })
    if (error) { setSyncStatus('offline'); return }
    setTasks(data); rescheduleAll(data, []); updateBadge(data.filter(t => !t.completed).length)
    flashSynced()
  }
  async function loadEvents() {
    if (!supabase) return
    const { data, error } = await supabase.from('events').select('*').eq('household_id', HOUSEHOLD_ID).order('start_date', { ascending: true })
    if (error) { setSyncStatus('offline'); return }
    setEvents(data); rescheduleAll([], data); flashSynced()
  }
  async function loadNotes() {
    if (!supabase) return
    const { data, error } = await supabase.from('notes').select('*').eq('household_id', HOUSEHOLD_ID).order('created_at', { ascending: false })
    if (error) { setSyncStatus('offline'); return }
    setNotes(data); flashSynced()
  }

  function flashSynced() { setSyncStatus('synced'); setTimeout(() => setSyncStatus('idle'), 1500) }

  // ── Task CRUD ──
  async function saveTask(task) {
    setSyncStatus('syncing')
    const row = { ...task, household_id: HOUSEHOLD_ID }
    if (supabase) { const { error } = await supabase.from('tasks').upsert(row); if (error) { setSyncStatus('offline'); return } }
    setTasks(prev => { const i = prev.findIndex(t => t.id === row.id); if (i >= 0) { const n = [...prev]; n[i] = row; return n } return [row, ...prev] })
    scheduleNotification(row); flashSynced()
  }
  async function deleteTask(id) {
    cancelNotification(id)
    if (supabase) await supabase.from('tasks').delete().eq('id', id)
    setTasks(prev => prev.filter(t => t.id !== id))
  }
  async function toggleComplete(task) {
    await saveTask({ ...task, completed: !task.completed, status: !task.completed ? 'done' : 'todo' })
  }
  async function moveKanban(task, status) { await saveTask({ ...task, status, completed: status === 'done' }) }

  // ── Event CRUD ──
  async function saveEvent(ev) {
    setSyncStatus('syncing')
    const row = { ...ev, household_id: HOUSEHOLD_ID }
    if (supabase) { const { error } = await supabase.from('events').upsert(row); if (error) { setSyncStatus('offline'); return } }
    setEvents(prev => { const i = prev.findIndex(e => e.id === row.id); if (i >= 0) { const n = [...prev]; n[i] = row; return n } return [...prev, row] })
    scheduleEventNotification(row); flashSynced()
  }
  async function deleteEvent(id) {
    cancelEventNotification(id)
    if (supabase) await supabase.from('events').delete().eq('id', id)
    setEvents(prev => prev.filter(e => e.id !== id))
  }

  // ── Notes CRUD ──
  async function saveNote(note) {
    setSyncStatus('syncing')
    const row = { ...note, household_id: HOUSEHOLD_ID }
    if (supabase) { const { error } = await supabase.from('notes').upsert(row); if (error) { setSyncStatus('offline'); return } }
    setNotes(prev => { const i = prev.findIndex(n => n.id === row.id); if (i >= 0) { const c = [...prev]; c[i] = row; return c } return [row, ...prev] })
    flashSynced()
  }
  async function deleteNote(id) {
    if (supabase) await supabase.from('notes').delete().eq('id', id)
    setNotes(prev => prev.filter(n => n.id !== id))
  }

  async function enableNotifications() { setNotifPerm(await requestNotificationPermission()) }

  const filteredTasks = tasks.filter(t =>
    (filterPerson === 'all' || t.assigned_to === filterPerson) &&
    (filterCat === 'all' || t.category === filterCat))
  const filteredEvents = events.filter(e => filterPerson === 'all' || e.assigned_to === filterPerson)

  const pendingCount = tasks.filter(t => !t.completed).length

  function addEventOnDate(date) {
    setEventModal({ start_date: format(date, 'yyyy-MM-dd'), end_date: format(date, 'yyyy-MM-dd') })
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <Heart size={20} className="header-heart" />
          <h1 className="app-title">Couple's Hub</h1>
        </div>
        <div className="header-right">
          <SyncDot status={syncStatus} />
          {notifPerm !== 'granted' && (
            <button className="notif-btn" onClick={enableNotifications} title="Enable notifications"><BellOff size={16} /></button>
          )}
          {pendingCount > 0 && <span className="badge">{pendingCount}</span>}
          <button className="add-btn" onClick={() => view === 'calendar' ? setEventModal({}) : view === 'notes' ? setTaskModal(null) : setTaskModal({})} title="Add">
            <Plus size={20} />
          </button>
        </div>
      </header>

      <div className="filters-bar">
        <div className="view-switcher">
          <button className={view === 'kanban' ? 'active' : ''}   onClick={() => setView('kanban')}><Columns size={15} />Board</button>
          <button className={view === 'list' ? 'active' : ''}     onClick={() => setView('list')}><List size={15} />List</button>
          <button className={view === 'calendar' ? 'active' : ''} onClick={() => setView('calendar')}><CalendarDays size={15} />Calendar</button>
          <button className={view === 'notes' ? 'active' : ''}    onClick={() => setView('notes')}><StickyNote size={15} />Notes</button>
        </div>
        {view !== 'notes' && (
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
          <OverviewBar tasks={filteredTasks} events={events} />
        )}
        {view === 'kanban'   && <KanbanView tasks={filteredTasks} onEdit={setTaskModal} onDelete={deleteTask} onToggle={toggleComplete} onMove={moveKanban} />}
        {view === 'list'     && <ListView   tasks={filteredTasks} onEdit={setTaskModal} onDelete={deleteTask} onToggle={toggleComplete} />}
        {view === 'calendar' && <CalendarView events={filteredEvents} tasks={filteredTasks} month={calMonth} setMonth={setCalMonth} onEditEvent={setEventModal} onAddOnDate={addEventOnDate} />}
        {view === 'notes'    && <NotesView notes={notes} events={events} onSave={saveNote} onDelete={deleteNote} />}
      </main>

      {taskModal !== null && (
        <TaskModal task={taskModal} onSave={async t => { await saveTask(t); setTaskModal(null) }} onClose={() => setTaskModal(null)} />
      )}
      {eventModal !== null && (
        <EventModal event={eventModal} onSave={async e => { await saveEvent(e); setEventModal(null) }} onDelete={async id => { await deleteEvent(id); setEventModal(null) }} onClose={() => setEventModal(null)} />
      )}
    </div>
  )
}

// ─── Sync dot ─────────────────────────────────────────────────────────────────
function SyncDot({ status }) {
  const cls = { idle: '', syncing: 'spinning', synced: 'synced', offline: 'offline' }[status]
  const title = { idle: 'Synced', syncing: 'Syncing…', synced: 'Synced', offline: 'Offline — changes saved locally' }[status]
  return (
    <div className={`sync-dot ${cls}`} title={title}>
      {status === 'syncing' && <RefreshCw size={10} />}
      {status === 'synced'  && <Check size={10} />}
      {status === 'offline' && <AlertCircle size={10} />}
    </div>
  )
}

// ─── Overview bar (requirement #3) ────────────────────────────────────────────
function OverviewBar({ tasks, events }) {
  const todayStart = startOfDay(new Date())
  const overdue = tasks.filter(t => !t.completed && t.due_date && isBefore(parseISO(t.due_date), todayStart))
  const dueToday = tasks.filter(t => !t.completed && t.due_date && isSameDay(parseISO(t.due_date), todayStart))
  const done = tasks.filter(t => t.completed).length
  const total = tasks.length
  const pct = total ? Math.round((done / total) * 100) : 0

  // Next upcoming event countdown (requirement #6 countdown teaser)
  const upcoming = [...events]
    .filter(e => !isBefore(parseISO(e.end_date || e.start_date), todayStart))
    .sort((a, b) => parseISO(a.start_date) - parseISO(b.start_date))[0]
  const daysToEvent = upcoming ? differenceInCalendarDays(parseISO(upcoming.start_date), todayStart) : null

  return (
    <div className="overview-bar">
      <div className="ov-stats">
        <div className={`ov-stat ${overdue.length ? 'alert' : ''}`}>
          <span className="ov-num">{overdue.length}</span>
          <span className="ov-label">Overdue</span>
        </div>
        <div className={`ov-stat ${dueToday.length ? 'warn' : ''}`}>
          <span className="ov-num">{dueToday.length}</span>
          <span className="ov-label">Due today</span>
        </div>
        <div className="ov-stat">
          <span className="ov-num">{total - done}</span>
          <span className="ov-label">Open</span>
        </div>
        <div className="ov-stat ok">
          <span className="ov-num">{done}</span>
          <span className="ov-label">Done</span>
        </div>
      </div>

      <div className="ov-progress-wrap">
        <div className="ov-progress-label">{pct}% complete</div>
        <div className="ov-progress-track"><div className="ov-progress-fill" style={{ width: `${pct}%` }} /></div>
      </div>

      {(overdue.length > 0 || dueToday.length > 0) && (
        <div className="ov-reminders">
          {overdue.length > 0 && (
            <div className="ov-reminder alert">
              <AlertCircle size={13} /> {overdue.length} task{overdue.length > 1 ? 's' : ''} overdue
              {overdue.slice(0, 2).map(t => <span key={t.id} className="ov-chip">{t.title}</span>)}
            </div>
          )}
          {dueToday.length > 0 && (
            <div className="ov-reminder warn">
              <AlarmClock size={13} /> {dueToday.length} due today
              {dueToday.slice(0, 2).map(t => <span key={t.id} className="ov-chip">{t.title}</span>)}
            </div>
          )}
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
function KanbanView({ tasks, onEdit, onDelete, onToggle, onMove }) {
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
              {colTasks.map(t => <TaskCard key={t.id} task={t} onEdit={onEdit} onDelete={onDelete} onToggle={onToggle} onMove={onMove} />)}
              {colTasks.length === 0 && <div className="empty-col">No tasks here</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Task card with per-person colour panel (requirement #5) ──────────────────
function TaskCard({ task, onEdit, onDelete, onToggle, onMove }) {
  const cat = getCat(task.category)
  const person = getPerson(task.assigned_to)
  const overdue = task.due_date && isBefore(parseISO(task.due_date), startOfDay(new Date())) && !task.completed
  return (
    <div className={`task-card ${task.completed ? 'completed' : ''} ${overdue ? 'overdue' : ''}`}
         style={{ background: `linear-gradient(135deg, ${person.soft}, var(--bg-3) 60%)`, borderLeft: `4px solid ${person.color}` }}>
      <div className="card-body">
        <div className="card-top">
          <button className={`check-btn ${task.completed ? 'checked' : ''}`} onClick={() => onToggle(task)}>{task.completed && <Check size={12} />}</button>
          <span className="card-title">{task.title}</span>
        </div>
        <div className="card-meta">
          <span className="person-pill" style={{ background: person.color, color: '#fff' }}>{person.icon} {person.label}</span>
          <span className="cat-pill" style={{ background: cat.color + '22', color: cat.color }}>{cat.label}</span>
          {task.due_date && <span className={`due-pill ${overdue ? 'overdue-text' : ''}`}><Clock size={10} /> {format(parseISO(task.due_date), 'dd MMM')}</span>}
        </div>
        <div className="card-actions">
          {task.status !== 'todo'        && <button onClick={() => onMove(task, 'todo')}>← To Do</button>}
          {task.status !== 'in_progress' && <button onClick={() => onMove(task, 'in_progress')}>In Progress</button>}
          {task.status !== 'done'        && <button onClick={() => onMove(task, 'done')}>✓ Done</button>}
          <button onClick={() => onEdit(task)}><Pencil size={11} /></button>
          <button className="del-btn" onClick={() => onDelete(task.id)}><Trash2 size={11} /></button>
        </div>
      </div>
    </div>
  )
}

// ─── List view ────────────────────────────────────────────────────────────────
function ListView({ tasks, onEdit, onDelete, onToggle }) {
  const sorted = [...tasks].sort((a, b) => (!a.due_date ? 1 : !b.due_date ? -1 : new Date(a.due_date) - new Date(b.due_date)))
  const groups = {}
  sorted.forEach(t => { const k = t.due_date ? format(parseISO(t.due_date), 'yyyy-MM-dd') : 'No date'; (groups[k] ||= []).push(t) })
  return (
    <div className="list-view">
      {Object.entries(groups).map(([k, group]) => (
        <div key={k} className="list-group">
          <div className="list-date-header">
            {k === 'No date' ? 'No due date' : format(parseISO(k), 'EEEE, d MMMM')}
            {k !== 'No date' && isToday(parseISO(k)) && <span className="today-badge">Today</span>}
          </div>
          {group.map(task => {
            const cat = getCat(task.category), person = getPerson(task.assigned_to)
            const overdue = task.due_date && isBefore(parseISO(task.due_date), startOfDay(new Date())) && !task.completed
            return (
              <div key={task.id} className={`list-row ${task.completed ? 'completed' : ''} ${overdue ? 'overdue' : ''}`} style={{ borderLeft: `4px solid ${person.color}` }}>
                <button className={`check-btn ${task.completed ? 'checked' : ''}`} onClick={() => onToggle(task)}>{task.completed && <Check size={12} />}</button>
                <div className="list-content">
                  <span className="list-title">{task.title}</span>
                  <div className="list-meta">
                    <span className="person-pill" style={{ background: person.color, color: '#fff' }}>{person.icon} {person.label}</span>
                    <span className="cat-pill" style={{ background: cat.color + '22', color: cat.color }}>{cat.label}</span>
                    {task.reminder_minutes != null && <span className="due-pill"><Bell size={10} /> {REMINDER_OPTIONS.find(r => r.value === task.reminder_minutes)?.label}</span>}
                  </div>
                </div>
                <div className="list-btns">
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

// ─── Calendar with events + multi-day bars (requirements #1, #2) ──────────────
function CalendarView({ events, tasks, month, setMonth, onEditEvent, onAddOnDate }) {
  const [selectedDay, setSelectedDay] = useState(null)
  const monthStart = startOfMonth(month), monthEnd = endOfMonth(month)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const startPad = monthStart.getDay()

  function eventsOnDay(day) {
    return events.filter(e => {
      const s = parseISO(e.start_date), en = parseISO(e.end_date || e.start_date)
      return isWithinInterval(day, { start: startOfDay(s), end: startOfDay(en) }) || isSameDay(day, s)
    })
  }
  function tasksOnDay(day) { return tasks.filter(t => t.due_date && isSameDay(parseISO(t.due_date), day)) }

  const selEvents = selectedDay ? eventsOnDay(selectedDay) : []
  const selTasks  = selectedDay ? tasksOnDay(selectedDay) : []

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
            <div key={format(day, 'yyyy-MM-dd')}
                 className={`cal-cell ${isToday(day) ? 'today' : ''} ${sel ? 'selected' : ''} ${(evs.length || tks.length) ? 'has-items' : ''}`}
                 onClick={() => setSelectedDay(sel ? null : day)}>
              <span className="cal-day-num">{format(day, 'd')}</span>
              <div className="cal-bars">
                {evs.slice(0, 3).map(e => {
                  const t = getEventType(e.event_type), p = getPerson(e.assigned_to)
                  const isStart = isSameDay(day, parseISO(e.start_date))
                  const multi = e.end_date && e.end_date !== e.start_date
                  return (
                    <div key={e.id} className={`cal-bar ${multi ? 'multi' : ''}`} style={{ background: p.color }} title={e.title}>
                      {(isStart || day.getDay() === 0) && <span className="cal-bar-label">{t.icon} {e.title}</span>}
                    </div>
                  )
                })}
                {tks.length > 0 && (
                  <div className="cal-task-dots">
                    {tks.slice(0, 4).map(t => <span key={t.id} className="cal-tdot" style={{ background: getPerson(t.assigned_to).color }} />)}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="cal-legend">
        {PEOPLE.map(p => <span key={p.id} className="legend-item"><span className="legend-dot" style={{ background: p.color }} />{p.label}</span>)}
      </div>

      {selectedDay && (
        <div className="cal-day-panel">
          <div className="cal-panel-header">
            <span>{format(selectedDay, 'EEEE, d MMMM yyyy')}</span>
            <button className="add-day-btn" onClick={() => onAddOnDate(selectedDay)}><Plus size={14} /> Add event</button>
          </div>
          {selEvents.length === 0 && selTasks.length === 0 && <div className="cal-empty">Nothing scheduled — tap "Add event" to create one.</div>}
          {selEvents.map(e => {
            const t = getEventType(e.event_type), p = getPerson(e.assigned_to)
            const multi = e.end_date && e.end_date !== e.start_date
            return (
              <div key={e.id} className="cal-event-row" onClick={() => onEditEvent(e)} style={{ borderLeft: `4px solid ${p.color}` }}>
                <span className="cal-event-icon">{t.icon}</span>
                <div className="cal-event-info">
                  <span className="cal-event-title">{e.title}</span>
                  <span className="cal-event-sub">
                    {p.icon} {p.label}
                    {multi && ` · ${format(parseISO(e.start_date), 'd MMM')} – ${format(parseISO(e.end_date), 'd MMM')}`}
                    {!e.all_day && e.start_time && ` · ${e.start_time}`}
                    {e.recur && e.recur !== 'none' && ` · repeats ${e.recur}`}
                  </span>
                </div>
                <Pencil size={13} className="cal-event-edit" />
              </div>
            )
          })}
          {selTasks.map(t => {
            const person = getPerson(t.assigned_to)
            return (
              <div key={t.id} className="cal-event-row task" style={{ borderLeft: `4px solid ${person.color}` }}>
                <span className="cal-event-icon">📋</span>
                <div className="cal-event-info">
                  <span className="cal-event-title">{t.title}</span>
                  <span className="cal-event-sub">Task · {person.icon} {person.label}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Notes board (requirement #6) ─────────────────────────────────────────────
function NotesView({ notes, events, onSave, onDelete }) {
  const [draft, setDraft] = useState('')
  const [author, setAuthor] = useState('rhodri')
  const todayStart = startOfDay(new Date())

  // Countdowns for all upcoming events
  const countdowns = [...events]
    .filter(e => !isBefore(parseISO(e.start_date), todayStart))
    .sort((a, b) => parseISO(a.start_date) - parseISO(b.start_date))
    .slice(0, 4)

  function add() {
    if (!draft.trim()) return
    onSave({ id: genId(), text: draft.trim(), author, created_at: new Date().toISOString() })
    setDraft('')
  }

  return (
    <div className="notes-view">
      {countdowns.length > 0 && (
        <div className="countdown-section">
          <h3 className="section-title"><CalendarHeart size={16} /> Countdowns</h3>
          <div className="countdown-grid">
            {countdowns.map(e => {
              const days = differenceInCalendarDays(parseISO(e.start_date), todayStart)
              const t = getEventType(e.event_type), p = getPerson(e.assigned_to)
              return (
                <div key={e.id} className="countdown-card" style={{ borderTop: `3px solid ${p.color}` }}>
                  <span className="cd-icon">{t.icon}</span>
                  <span className="cd-days">{days === 0 ? 'Today' : days}</span>
                  {days > 0 && <span className="cd-unit">day{days > 1 ? 's' : ''}</span>}
                  <span className="cd-title">{e.title}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="notes-section">
        <h3 className="section-title"><StickyNote size={16} /> Shared Notes</h3>
        <div className="note-composer">
          <textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder="Jot something down — ideas, reminders, shopping…" rows={2} />
          <div className="note-composer-actions">
            <select value={author} onChange={e => setAuthor(e.target.value)} className="filter-select">
              {PEOPLE.filter(p => p.id !== 'both').map(p => <option key={p.id} value={p.id}>{p.icon} {p.label}</option>)}
            </select>
            <button className="btn-save" onClick={add}><Plus size={14} /> Add note</button>
          </div>
        </div>

        <div className="notes-grid">
          {notes.map(n => {
            const p = getPerson(n.author)
            return (
              <div key={n.id} className="note-card" style={{ borderLeft: `4px solid ${p.color}` }}>
                <p className="note-text">{n.text}</p>
                <div className="note-footer">
                  <span className="note-author">{p.icon} {p.label}</span>
                  <button className="del-btn" onClick={() => onDelete(n.id)}><Trash2 size={12} /></button>
                </div>
              </div>
            )
          })}
          {notes.length === 0 && <div className="empty-state"><StickyNote size={40} /><p>No notes yet</p></div>}
        </div>
      </div>
    </div>
  )
}

// ─── Task modal ───────────────────────────────────────────────────────────────
function TaskModal({ task, onSave, onClose }) {
  const isNew = !task?.id
  const [f, setF] = useState({
    id: task?.id || genId(), title: task?.title || '', category: task?.category || 'home',
    assigned_to: task?.assigned_to || 'both', status: task?.status || 'todo',
    due_date: task?.due_date || '', reminder_minutes: task?.reminder_minutes ?? 1440,
    completed: task?.completed || false, created_at: task?.created_at || new Date().toISOString(),
  })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header"><h2>{isNew ? 'New Task' : 'Edit Task'}</h2><button className="modal-close" onClick={onClose}><X size={18} /></button></div>
        <div className="modal-form">
          <label>Title<input value={f.title} onChange={e => set('title', e.target.value)} placeholder="What needs doing?" autoFocus /></label>
          <div className="form-row"><span className="form-label">Assign to</span>
            <div className="person-grid">
              {PEOPLE.map(p => (
                <button key={p.id} type="button" className={`person-btn ${f.assigned_to === p.id ? 'active' : ''}`}
                        style={{ '--pc': p.color }} onClick={() => set('assigned_to', p.id)}>{p.icon} {p.label}</button>
              ))}
            </div>
          </div>
          <div className="form-row"><span className="form-label">Category</span>
            <div className="cat-grid">
              {CATEGORIES.map(c => (
                <button key={c.id} type="button" className={`cat-btn ${f.category === c.id ? 'active' : ''}`}
                        style={{ '--cat-color': c.color }} onClick={() => set('category', c.id)}>{c.label}</button>
              ))}
            </div>
          </div>
          <div className="form-row two-col">
            <label>Status<select value={f.status} onChange={e => set('status', e.target.value)}>{KANBAN_COLS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
            <label>Due date<input type="date" value={f.due_date} onChange={e => set('due_date', e.target.value)} /></label>
          </div>
          {f.due_date && (
            <label>Reminder<select value={f.reminder_minutes} onChange={e => set('reminder_minutes', Number(e.target.value))}>{REMINDER_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select></label>
          )}
          <div className="modal-actions">
            <button className="btn-cancel" onClick={onClose}>Cancel</button>
            <button className="btn-save" onClick={() => f.title.trim() && onSave(f)}>{isNew ? <><Plus size={15} /> Add Task</> : <><Check size={15} /> Save</>}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Event modal (requirements #1, #2, #4) ────────────────────────────────────
function EventModal({ event, onSave, onDelete, onClose }) {
  const isNew = !event?.id
  const [f, setF] = useState({
    id: event?.id || genId(), title: event?.title || '', event_type: event?.event_type || 'other',
    assigned_to: event?.assigned_to || 'both',
    start_date: event?.start_date || format(new Date(), 'yyyy-MM-dd'),
    end_date: event?.end_date || event?.start_date || format(new Date(), 'yyyy-MM-dd'),
    all_day: event?.all_day ?? true, start_time: event?.start_time || '',
    recur: event?.recur || 'none', reminder_minutes: event?.reminder_minutes ?? 1440,
    notes: event?.notes || '', created_at: event?.created_at || new Date().toISOString(),
  })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  function submit() {
    if (!f.title.trim()) return
    const out = { ...f }
    if (isBefore(parseISO(out.end_date), parseISO(out.start_date))) out.end_date = out.start_date
    onSave(out)
  }
  const isMulti = f.end_date && f.end_date !== f.start_date

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header"><h2>{isNew ? 'New Event' : 'Edit Event'}</h2><button className="modal-close" onClick={onClose}><X size={18} /></button></div>
        <div className="modal-form">
          <label>Event<input value={f.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Rhodri's Birthday, Holiday in India" autoFocus /></label>

          <div className="form-row"><span className="form-label">Type</span>
            <div className="cat-grid">
              {EVENT_TYPES.map(t => (
                <button key={t.id} type="button" className={`cat-btn ${f.event_type === t.id ? 'active' : ''}`}
                        style={{ '--cat-color': t.color }} onClick={() => set('event_type', t.id)}>{t.icon} {t.label}</button>
              ))}
            </div>
          </div>

          <div className="form-row"><span className="form-label">For</span>
            <div className="person-grid">
              {PEOPLE.map(p => (
                <button key={p.id} type="button" className={`person-btn ${f.assigned_to === p.id ? 'active' : ''}`}
                        style={{ '--pc': p.color }} onClick={() => set('assigned_to', p.id)}>{p.icon} {p.label}</button>
              ))}
            </div>
          </div>

          <div className="form-row two-col">
            <label>Start date<input type="date" value={f.start_date} onChange={e => { set('start_date', e.target.value); if (isBefore(parseISO(f.end_date), parseISO(e.target.value))) set('end_date', e.target.value) }} /></label>
            <label>End date<input type="date" value={f.end_date} min={f.start_date} onChange={e => set('end_date', e.target.value)} /></label>
          </div>
          {isMulti && <div className="multi-note"><CalendarDays size={13} /> Multi-day event · {differenceInCalendarDays(parseISO(f.end_date), parseISO(f.start_date)) + 1} days</div>}

          <label className="checkbox-row">
            <input type="checkbox" checked={f.all_day} onChange={e => set('all_day', e.target.checked)} /> All-day event
          </label>
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
