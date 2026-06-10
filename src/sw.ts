/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Don't auto-skipWaiting — wait for user to approve via UpdatePrompt
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

// useRegisterSW sends this message when user taps "Reload"
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('push', event => {
  const data = event.data?.json() ?? {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const opts: any = { body: data.body ?? '', icon: '/icons/pwa-192x192.png', tag: 'leaderboard', renotify: true }
  event.waitUntil(self.registration.showNotification(data.title ?? 'Chubbs Memorial', opts))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(list => {
      for (const client of list) {
        if ('focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow('/')
    })
  )
})
