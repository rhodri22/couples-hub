// notifications.js — browser push + in-app badge + persistent reminders

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  const result = await Notification.requestPermission()
  return result
}

if (typeof window !== 'undefined' && !window.__notifTimers) window.__notifTimers = {}

function clearKey(key) {
  if (window.__notifTimers[key]) {
    clearTimeout(window.__notifTimers[key])
    delete window.__notifTimers[key]
  }
}

// ─── Tasks ────────────────────────────────────────────────────────────────────
export function scheduleNotification(task) {
  if (!task.due_date || task.reminder_minutes == null || task.completed) return
  const dueMs = new Date(`${task.due_date}T09:00:00`).getTime()
  const fireMs = dueMs - task.reminder_minutes * 60 * 1000
  const delayMs = fireMs - Date.now()
  const key = `task-${task.id}`
  clearKey(key)
  if (delayMs <= 0) return
  window.__notifTimers[key] = setTimeout(() => fireTaskNotification(task), Math.min(delayMs, 2 ** 31 - 1))
}

function fireTaskNotification(task) {
  if (Notification.permission !== 'granted') return
  const mins = task.reminder_minutes
  const timeLabel = mins >= 1440 ? `${Math.round(mins / 1440)} day(s)` : mins >= 60 ? `${Math.round(mins / 60)} hour(s)` : `${mins} min`
  new Notification(`📋 ${task.title}`, {
    body: `Due in ${timeLabel}`,
    icon: '/icon-192.png', badge: '/icon-192.png',
    tag: `task-${task.id}`, requireInteraction: true,
  })
}

export function cancelNotification(taskId) { clearKey(`task-${taskId}`) }

// ─── Events ───────────────────────────────────────────────────────────────────
export function scheduleEventNotification(ev) {
  if (ev.reminder_minutes == null) return
  const timeStr = ev.all_day ? '09:00:00' : (ev.start_time || '09:00') + ':00'
  const startMs = new Date(`${ev.start_date}T${timeStr}`).getTime()
  const fireMs = startMs - ev.reminder_minutes * 60 * 1000
  const delayMs = fireMs - Date.now()
  const key = `event-${ev.id}`
  clearKey(key)
  if (delayMs <= 0) return
  window.__notifTimers[key] = setTimeout(() => fireEventNotification(ev), Math.min(delayMs, 2 ** 31 - 1))
}

function fireEventNotification(ev) {
  if (Notification.permission !== 'granted') return
  new Notification(`📅 ${ev.title}`, {
    body: ev.all_day ? 'Today' : 'Starting soon',
    icon: '/icon-192.png', badge: '/icon-192.png',
    tag: `event-${ev.id}`, requireInteraction: true,
  })
}

export function cancelEventNotification(id) { clearKey(`event-${id}`) }

// ─── Reschedule everything on load ────────────────────────────────────────────
export function rescheduleAll(tasks = [], events = []) {
  tasks.forEach(t => { if (!t.completed) scheduleNotification(t) })
  events.forEach(e => scheduleEventNotification(e))
}

// ─── App badge ────────────────────────────────────────────────────────────────
export function updateBadge(count) {
  if ('setAppBadge' in navigator) {
    if (count > 0) navigator.setAppBadge(count).catch(() => {})
    else navigator.clearAppBadge().catch(() => {})
  }
}
