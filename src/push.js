// push.js — client side of Web Push. Turns the browser's push subscription into
// a row in Supabase (`push_subscriptions`) that the /api/send-push serverless
// function later delivers to, so reminders arrive even when the app is closed.
//
// Needs VITE_VAPID_PUBLIC_KEY at build time (see PUSH_SETUP.md). Without it, the
// app still works — it just can't register for background push.

import { supabase, HOUSEHOLD_ID } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

// VAPID keys are URL-safe base64; PushManager wants a Uint8Array.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

// Subscribe this device to push and store the subscription. `person` is the
// current user id ('rhodri' | 'becky') so the sender can target the right phone.
// Returns { ok: true } or { ok: false, reason }.
export async function subscribeToPush(person) {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' }
  if (!VAPID_PUBLIC_KEY) return { ok: false, reason: 'no_vapid_key' }

  if (Notification.permission !== 'granted') {
    const res = await Notification.requestPermission()
    if (res !== 'granted') return { ok: false, reason: res }
  }

  let reg
  try {
    reg = await navigator.serviceWorker.ready
  } catch (e) {
    return { ok: false, reason: 'no_service_worker' }
  }

  let sub
  try {
    sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
    }
  } catch (e) {
    return { ok: false, reason: (e && e.message) || 'subscribe_failed' }
  }

  const json = sub.toJSON()
  if (!json || !json.keys) return { ok: false, reason: 'no_keys' }

  const row = {
    household_id: HOUSEHOLD_ID,
    person: person || null,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    user_agent: (typeof navigator !== 'undefined' ? navigator.userAgent : '').slice(0, 300),
    updated_at: new Date().toISOString(),
  }

  if (supabase) {
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(row, { onConflict: 'endpoint' })
    if (error) return { ok: false, reason: error.message }
  }
  return { ok: true }
}

// Re-affirm the subscription on load (subscriptions can expire or be pruned).
// Safe to call whenever permission is already granted.
export async function ensurePushSubscribed(person) {
  try {
    if (!pushSupported() || Notification.permission !== 'granted') return
    await subscribeToPush(person)
  } catch (e) {
    /* non-fatal */
  }
}

export async function unsubscribeFromPush() {
  if (!pushSupported()) return
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return
    const endpoint = sub.endpoint
    await sub.unsubscribe().catch(() => {})
    if (supabase) await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  } catch (e) {
    /* non-fatal */
  }
}
