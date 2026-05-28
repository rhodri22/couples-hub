// notification.js — handles browser push + in-app badge notifications

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  const result = await Notification.requestPermission()
  return result
}

export function scheduleNotification(task) {
  if (!task.due_date || !task.reminder_minutes) return

  const dueMs = new Date(task.due_date).getTime()
  const nowMs = Date.now()
  const fireMs = dueMs - task.reminder_minutes * 60 * 1000

  if (fireMs <= nowMs) return // already passed

  const delayMs = fireMs - nowMs
  const key = `notif-${task.id}-${task.reminder_minutes}`

  // Clear any existing timeout for this task
  const existingId = window.__notifTimers?.[key]
  if (existingId) clearTimeout(existingId)

  if (!window.__notifTimers) window.__notifTimers = {}

  window.__notifTimers[key] = setTimeout(() => {
    fireNotification(task)
  }, delayMs)
}

export function cancelNotification(taskId) {
  if (!window.__notifTimers) return
  Object.keys(window.__notifTimers).forEach(key => {
    if (key.startsWith(`notif-${taskId}-`)) {
      clearTimeout(window.__notifTimers[key])
      delete window.__notifTimers[key]
    }
  })
}

function fireNotification(task) {
  if (Notification.permission !== 'granted') return

  const assignee = task.assigned_to === 'both' ? 'Rhodri & Becky' : task.assigned_to
  const mins = task.reminder_minutes
  const timeLabel = mins >= 1440
    ? `${Math.round(mins / 1440)} day(s)`
    : mins >= 60
    ? `${Math.round(mins / 60)} hour(s)`
    : `${mins} min(s)`

  new Notification(`⏰ Couple's Hub — ${task.title}`, {
    body: `Due in ${timeLabel} · Assigned to ${assignee}`,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: `task-${task.id}`,
    requireInteraction: true,
  })
}

// Reschedule all pending tasks on app load
export function rescheduleAll(tasks) {
  tasks.forEach(task => {
    if (!task.completed) scheduleNotification(task)
  })
}

// Update app badge count
export function updateBadge(count) {
  if ('setAppBadge' in navigator) {
    if (count > 0) navigator.setAppBadge(count).catch(() => {})
    else navigator.clearAppBadge().catch(() => {})
  }
}
