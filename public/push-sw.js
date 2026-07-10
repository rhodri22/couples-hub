// push-sw.js — Web Push handlers for Couple's Hub.
//
// This file is imported into the service worker that vite-plugin-pwa generates
// (see `workbox.importScripts` in vite.config.js). It runs in the service-worker
// scope, so it can receive push messages and show notifications even when the
// app (or the whole browser) is closed. The generated SW keeps handling the
// offline caching; this only adds the push + click behaviour.

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = { title: "Couple's Hub", body: event.data ? event.data.text() : '' }
  }

  const title = data.title || "Couple's Hub"
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    requireInteraction: data.requireInteraction !== false,
    data: { url: data.url || '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of wins) {
      // Focus an existing window if one is open, and steer it to the right view.
      if ('focus' in client) {
        try { await client.focus() } catch (e) {}
        if ('navigate' in client && target && target !== '/') {
          try { await client.navigate(target) } catch (e) {}
        }
        return
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target)
  })())
})
