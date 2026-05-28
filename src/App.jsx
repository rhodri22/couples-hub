import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Plus, X, Check, Calendar, List, Columns, Bell, BellOff,
  ChevronLeft, ChevronRight, RefreshCw, AlertCircle, Pencil,
  Trash2, User, Users, Clock, Tag, Heart
} from 'lucide-react'
import { supabase, HOUSEHOLD_ID } from './supabase'
import {
  requestNotificationPermission, scheduleNotification,
  cancelNotification, rescheduleAll, updateBadge
} from './notifications'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameDay, isToday, addMonths, subMonths, parseISO,
  isBefore, startOfDay, addDays
} from 'date-fns'
import './App.css'

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: 'home',     label: 'Home',     color: '#4a90d9' },
  { id: 'errands',  label: 'Errands',  color: '#7ec8e3' },
  { id: 'social',   label: 'Social',   color: '#1e3a5f' },
  { id: 'dates',    label: 'Dates',    color: '#e06b9a' },
  { id: 'finance',  label: 'Finance',  color: '#2d6a9f' },
  { id: 'health',   label: 'Health',   color: '#50c878' },
]

const ASSIGNEES = [
  { id: 'rhodri', label: 'Rhodri', icon: '👨' },
  { id: 'becky',  label: 'Becky',  icon: '👩' },
  { id: 'lana',   label: 'Lana',   icon: '🐶' },
  { id: 'both',   label: 'All',    icon: '👨‍👩‍🦮' },
]

const KANBAN_COLS = [
  { id: 'todo',        label: 'To Do',       color: '#2d6a9f' },
  { id: 'in_progress', label: 'In Progress', color: '#4a90d9' },
  { id: 'done',        label: 'Done',        color: '#50c878' },
]

const REMINDER_OPTIONS = [
  { value: 15,   label: '15 minutes before' },
  { value: 30,   label: '30 minutes before' },
  { value: 60,   label: '1 hour before' },
  { value: 180,  label: '3 hours before' },
  { value: 360,  label: '6 hours before' },
  { value: 720,  label: '12 hours before' },
  { value: 1440, label: '24 hours before' },
  { value: 2880, label: '2 days before' },
  { value: 10080,label: '1 week before' },
]

const getCat = id => CATEGORIES.find(c => c.id === id) || CATEGORIES[0]
const getAssignee = id => ASSIGNEES.find(a => a.id === id) || ASSIGNEES[2]

function genId() { return crypto.randomUUID() }

// ─── Default demo tasks ───────────────────────────────────────────────────────
const DEMO_TASKS = [
  { id: genId(), household_id: HOUSEHOLD_ID, title: 'Book restaurant for anniversary', category: 'dates', assigned_to: 'rhodri', status: 'todo', due_date: format(addDays(new Date(), 3), 'yyyy-MM-dd'), reminder_minutes: 1440, completed: false, created_at: new Date().toISOString() },
  { id: genId(), household_id: HOUSEHOLD_ID, title: 'Grocery run', category: 'errands', assigned_to: 'becky', status: 'todo', due_date: format(addDays(new Date(), 1), 'yyyy-MM-dd'), reminder_minutes: 60, completed: false, created_at: new Date().toISOString() },
  { id: genId(), household_id: HOUSEHOLD_ID, title: 'Pay rent', category: 'finance', assigned_to: 'both', status: 'in_progress', due_date: format(addDays(new Date(), 7), 'yyyy-MM-dd'), reminder_minutes: 1440, completed: false, created_at: new Date().toISOString() },
  { id: genId(), household_id: HOUSEHOLD_ID, title: "Lana's vet check-up", category: 'health', assigned_to: 'lana', status: 'todo', due_date: format(addDays(new Date(), 5), 'yyyy-MM-dd'), reminder_minutes: 1440, completed: false, created_at: new Date().toISOString() },
]

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tasks, setTasks]           = useState(DEMO_TASKS)
  const [view, setView]             = useState('kanban') // kanban | calendar | list
  const [showModal, setShowModal]   = useState(false)
  const [editTask, setEditTask]     = useState(null)
  const [syncStatus, setSyncStatus] = useState('idle') // idle | syncing | synced | offline
  const [notifPerm, setNotifPerm]   = useState(Notification?.permission || 'default')
  const [filterAssignee, setFilterAssignee] = useState('all')
  const [filterCat, setFilterCat]   = useState('all')
  const [calMonth, setCalMonth]     = useState(new Date())
  const channelRef = useRef(null)

  // ── Supabase load ──
  useEffect(() => {
    if (!supabase) { rescheduleAll(tasks); return }
    loadTasks()
    const channel = supabase
      .channel('tasks-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `household_id=eq.${HOUSEHOLD_ID}` }, () => loadTasks())
      .subscribe()
    channelRef.current = channel
    return () => supabase.removeChannel(channel)
  }, [])

  async function loadTasks() {
    if (!supabase) return
    setSyncStatus('syncing')
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('household_id', HOUSEHOLD_ID)
      .order('created_at', { ascending: false })
    if (error) { setSyncStatus('offline'); return }
    setTasks(data)
    setSyncStatus('synced')
    rescheduleAll(data)
    const pending = data.filter(t => !t.completed).length
    updateBadge(pending)
    setTimeout(() => setSyncStatus('idle'), 2000)
  }

  async function saveTask(task) {
    setSyncStatus('syncing')
    if (supabase) {
      const { error } = await supabase.from('tasks').upsert(task)
      if (error) { setSyncStatus('offline'); return }
    }
    setTasks(prev => {
      const existing = prev.findIndex(t => t.id === task.id)
      if (existing >= 0) { const n = [...prev]; n[existing] = task; return n }
      return [task, ...prev]
    })
    scheduleNotification(task)
    setSyncStatus('synced')
    setTimeout(() => setSyncStatus('idle'), 2000)
  }

  async function deleteTask(id) {
    cancelNotification(id)
    if (supabase) await supabase.from('tasks').delete().eq('id', id)
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  async function toggleComplete(task) {
    const updated = { ...task, completed: !task.completed, status: !task.completed ? 'done' : 'todo' }
    await saveTask(updated)
    const pending = tasks.filter(t => !t.completed && t.id !== task.id).length + (updated.completed ? 0 : 1)
    updateBadge(pending)
  }

  async function moveKanban(task, newStatus) {
    await saveTask({ ...task, status: newStatus, completed: newStatus === 'done' })
  }

  function openNew() { setEditTask(null); setShowModal(true) }
  function openEdit(task) { setEditTask(task); setShowModal(true) }

  async function enableNotifications() {
    const perm = await requestNotificationPermission()
    setNotifPerm(perm)
  }

  const filteredTasks = tasks.filter(t => {
    if (filterAssignee !== 'all' && t.assigned_to !== filterAssignee) return false
    if (filterCat !== 'all' && t.category !== filterCat) return false
    return true
  })

  const pendingCount = tasks.filter(t => !t.completed).length

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
            <button className="notif-btn" onClick={enableNotifications} title="Enable notifications">
              <BellOff size={16} />
            </button>
          )}
          {pendingCount > 0 && <span className="badge">{pendingCount}</span>}
          <button className="add-btn" onClick={openNew}><Plus size={20} /></button>
        </div>
      </header>

      <div className="filters-bar">
        <div className="view-switcher">
          <button className={view === 'kanban' ? 'active' : ''} onClick={() => setView('kanban')}><Columns size={15} />Board</button>
          <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}><List size={15} />List</button>
          <button className={view === 'calendar' ? 'active' : ''} onClick={() => setView('calendar')}><Calendar size={15} />Calendar</button>
        </div>
        <div className="filter-chips">
          <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} className="filter-select">
            <option value="all">Everyone</option>
            {ASSIGNEES.map(a => <option key={a.id} value={a.id}>{a.icon} {a.label}</option>)}
          </select>
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="filter-select">
            <option value="all">All categories</option>
            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
      </div>

      <main className="app-main">
        {view === 'kanban'   && <KanbanView tasks={filteredTasks} onEdit={openEdit} onDelete={deleteTask} onToggle={toggleComplete} onMove={moveKanban} />}
        {view === 'list'     && <ListView   tasks={filteredTasks} onEdit={openEdit} onDelete={deleteTask} onToggle={toggleComplete} />}
        {view === 'calendar' && <CalendarView tasks={filteredTasks} month={calMonth} setMonth={setCalMonth} onEdit={openEdit} onNewOnDate={date => { setEditTask({ due_date: format(date, 'yyyy-MM-dd') }); setShowModal(true) }} />}
      </main>

      {showModal && (
        <TaskModal
          task={editTask}
          onSave={async task => { await saveTask(task); setShowModal(false) }}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}

// ─── Sync dot ─────────────────────────────────────────────────────────────────
function SyncDot({ status }) {
  const map = { idle: '', syncing: 'spinning', synced: 'synced', offline: 'offline' }
  const titles = { idle: 'Synced', syncing: 'Syncing…', synced: 'Synced ✓', offline: 'Offline' }
  return (
    <div className={`sync-dot ${map[status]}`} title={titles[status]}>
      {status === 'syncing' && <RefreshCw size={10} />}
      {status === 'synced'  && <Check size={10} />}
      {status === 'offline' && <AlertCircle size={10} />}
    </div>
  )
}

// ─── Kanban View ──────────────────────────────────────────────────────────────
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
              {colTasks.map(task => (
                <TaskCard key={task.id} task={task} onEdit={onEdit} onDelete={onDelete} onToggle={onToggle} onMove={onMove} />
              ))}
              {colTasks.length === 0 && <div className="empty-col">No tasks here</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Task Card ────────────────────────────────────────────────────────────────
function TaskCard({ task, onEdit, onDelete, onToggle, onMove }) {
  const cat = getCat(task.category)
  const assignee = getAssignee(task.assigned_to)
  const isOverdue = task.due_date && isBefore(parseISO(task.due_date), startOfDay(new Date())) && !task.completed

  return (
    <div className={`task-card ${task.completed ? 'completed' : ''} ${isOverdue ? 'overdue' : ''}`}>
      <div className="card-cat-bar" style={{ background: cat.color }} />
      <div className="card-body">
        <div className="card-top">
          <button className={`check-btn ${task.completed ? 'checked' : ''}`} onClick={() => onToggle(task)}>
            {task.completed && <Check size={12} />}
          </button>
          <span className="card-title">{task.title}</span>
        </div>
        <div className="card-meta">
          <span className="cat-pill" style={{ background: cat.color + '22', color: cat.color }}>
            {cat.label}
          </span>
          <span className="assignee-pill">{assignee.icon} {assignee.label}</span>
          {task.due_date && (
            <span className={`due-pill ${isOverdue ? 'overdue-text' : ''}`}>
              <Clock size={10} /> {format(parseISO(task.due_date), 'dd MMM')}
            </span>
          )}
        </div>
        <div className="card-actions">
          {task.status !== 'todo'        && <button onClick={() => onMove(task, 'todo')}>← To Do</button>}
          {task.status !== 'in_progress' && <button onClick={() => onMove(task, 'in_progress')}>→ In Progress</button>}
          {task.status !== 'done'        && <button onClick={() => onMove(task, 'done')}>✓ Done</button>}
          <button onClick={() => onEdit(task)}><Pencil size={11} /></button>
          <button className="del-btn" onClick={() => onDelete(task.id)}><Trash2 size={11} /></button>
        </div>
      </div>
    </div>
  )
}

// ─── List View ────────────────────────────────────────────────────────────────
function ListView({ tasks, onEdit, onDelete, onToggle }) {
  const sorted = [...tasks].sort((a, b) => {
    if (!a.due_date) return 1
    if (!b.due_date) return -1
    return new Date(a.due_date) - new Date(b.due_date)
  })

  const groups = {}
  sorted.forEach(t => {
    const key = t.due_date ? format(parseISO(t.due_date), 'yyyy-MM-dd') : 'No date'
    if (!groups[key]) groups[key] = []
    groups[key].push(t)
  })

  return (
    <div className="list-view">
      {Object.entries(groups).map(([dateKey, group]) => (
        <div key={dateKey} className="list-group">
          <div className="list-date-header">
            {dateKey === 'No date' ? 'No due date' : format(parseISO(dateKey), 'EEEE, d MMMM')}
            {dateKey !== 'No date' && isToday(parseISO(dateKey)) && <span className="today-badge">Today</span>}
          </div>
          {group.map(task => {
            const cat = getCat(task.category)
            const assignee = getAssignee(task.assigned_to)
            const isOverdue = task.due_date && isBefore(parseISO(task.due_date), startOfDay(new Date())) && !task.completed
            return (
              <div key={task.id} className={`list-row ${task.completed ? 'completed' : ''} ${isOverdue ? 'overdue' : ''}`}>
                <div className="list-color" style={{ background: cat.color }} />
                <button className={`check-btn ${task.completed ? 'checked' : ''}`} onClick={() => onToggle(task)}>
                  {task.completed && <Check size={12} />}
                </button>
                <div className="list-content">
                  <span className="list-title">{task.title}</span>
                  <div className="list-meta">
                    <span className="cat-pill" style={{ background: cat.color + '22', color: cat.color }}>{cat.label}</span>
                    <span className="assignee-pill">{assignee.icon} {assignee.label}</span>
                    {task.reminder_minutes && <span className="due-pill"><Bell size={10} /> {REMINDER_OPTIONS.find(r => r.value === task.reminder_minutes)?.label || 'Reminder set'}</span>}
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

// ─── Calendar View ────────────────────────────────────────────────────────────
function CalendarView({ tasks, month, setMonth, onEdit, onNewOnDate }) {
  const [selectedDay, setSelectedDay] = useState(null)
  const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) })
  const startPad = startOfMonth(month).getDay() // 0=Sun

  const tasksByDay = {}
  tasks.forEach(t => {
    if (!t.due_date) return
    const key = format(parseISO(t.due_date), 'yyyy-MM-dd')
    if (!tasksByDay[key]) tasksByDay[key] = []
    tasksByDay[key].push(t)
  })

  const selectedKey = selectedDay ? format(selectedDay, 'yyyy-MM-dd') : null
  const selectedTasks = selectedKey ? (tasksByDay[selectedKey] || []) : []

  return (
    <div className="calendar-view">
      <div className="cal-header">
        <button onClick={() => setMonth(m => subMonths(m, 1))}><ChevronLeft size={18} /></button>
        <h2 className="cal-month">{format(month, 'MMMM yyyy')}</h2>
        <button onClick={() => setMonth(m => addMonths(m, 1))}><ChevronRight size={18} /></button>
      </div>

      <div className="cal-grid">
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <div key={i} className="cal-weekday">{d}</div>
        ))}
        {Array(startPad).fill(null).map((_, i) => <div key={`pad-${i}`} className="cal-cell empty" />)}
        {days.map(day => {
          const key = format(day, 'yyyy-MM-dd')
          const dayTasks = tasksByDay[key] || []
          const isSel = selectedDay && isSameDay(day, selectedDay)
          const hasOverdue = dayTasks.some(t => !t.completed && isBefore(day, startOfDay(new Date())))
          return (
            <div
              key={key}
              className={`cal-cell ${isToday(day) ? 'today' : ''} ${isSel ? 'selected' : ''} ${dayTasks.length ? 'has-tasks' : ''}`}
              onClick={() => setSelectedDay(isSel ? null : day)}
            >
              <span className="cal-day-num">{format(day, 'd')}</span>
              <div className="cal-dots">
                {dayTasks.slice(0, 3).map(t => (
                  <span key={t.id} className="cal-dot" style={{ background: getCat(t.category).color }} />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {selectedDay && (
        <div className="cal-day-panel">
          <div className="cal-panel-header">
            <span>{format(selectedDay, 'EEEE, d MMMM')}</span>
            <button className="add-day-btn" onClick={() => onNewOnDate(selectedDay)}><Plus size={14} /> Add task</button>
          </div>
          {selectedTasks.length === 0
            ? <div className="cal-empty">No tasks this day</div>
            : selectedTasks.map(task => {
                const cat = getCat(task.category)
                const assignee = getAssignee(task.assigned_to)
                return (
                  <div key={task.id} className={`cal-task-row ${task.completed ? 'completed' : ''}`} onClick={() => onEdit(task)}>
                    <span className="cal-dot-big" style={{ background: cat.color }} />
                    <span className="cal-task-title">{task.title}</span>
                    <span className="assignee-pill small">{assignee.icon}</span>
                  </div>
                )
              })
          }
        </div>
      )}
    </div>
  )
}

// ─── Task Modal ───────────────────────────────────────────────────────────────
function TaskModal({ task, onSave, onClose }) {
  const isNew = !task?.id
  const [form, setForm] = useState({
    id:               task?.id || genId(),
    household_id:     HOUSEHOLD_ID,
    title:            task?.title || '',
    category:         task?.category || 'home',
    assigned_to:      task?.assigned_to || 'both',
    status:           task?.status || 'todo',
    due_date:         task?.due_date || '',
    reminder_minutes: task?.reminder_minutes || 1440,
    completed:        task?.completed || false,
    created_at:       task?.created_at || new Date().toISOString(),
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    onSave(form)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>{isNew ? 'New Task' : 'Edit Task'}</h2>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <label>Title
            <input
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="What needs doing?"
              autoFocus
              required
            />
          </label>

          <div className="form-row">
            <label>Category
              <div className="cat-grid">
                {CATEGORIES.map(c => (
                  <button
                    type="button" key={c.id}
                    className={`cat-btn ${form.category === c.id ? 'active' : ''}`}
                    style={{ '--cat-color': c.color }}
                    onClick={() => set('category', c.id)}
                  >{c.label}</button>
                ))}
              </div>
            </label>
          </div>

          <div className="form-row">
            <label>Assign to
              <div className="assignee-grid">
                {ASSIGNEES.map(a => (
                  <button
                    type="button" key={a.id}
                    className={`assignee-btn ${form.assigned_to === a.id ? 'active' : ''}`}
                    onClick={() => set('assigned_to', a.id)}
                  >{a.icon} {a.label}</button>
                ))}
              </div>
            </label>
          </div>

          <div className="form-row two-col">
            <label>Status
              <select value={form.status} onChange={e => set('status', e.target.value)}>
                {KANBAN_COLS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
            <label>Due date
              <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
            </label>
          </div>

          {form.due_date && (
            <label>Reminder
              <select value={form.reminder_minutes} onChange={e => set('reminder_minutes', Number(e.target.value))}>
                {REMINDER_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </label>
          )}

          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-save">
              {isNew ? <><Plus size={15} /> Add Task</> : <><Check size={15} /> Save</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
