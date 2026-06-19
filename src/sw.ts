/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Serve cached index.html for all navigation requests so the app loads offline
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))

// Cache Mapbox tiles so the map works offline after the course has been pre-fetched.
//
// Mapbox GL JS appends a per-session `sku` param to every tile request for billing
// tracking. That means a manually pre-fetched tile (no sku) and a tile requested by
// the map (with sku) have different URLs and would never share a cache entry.
//
// Fix: strip `sku` before using the URL as the cache key, so pre-fetched tiles and
// live tile requests resolve to the same cache entry regardless of session.
const MAPBOX_CACHE = 'mapbox-tiles-v1'

registerRoute(
  ({ url }) => url.hostname.endsWith('.mapbox.com') || url.hostname.endsWith('.mapbox.cn'),
  async ({ request }: { request: Request }) => {
    const url = new URL(request.url)
    url.searchParams.delete('sku')
    const normalizedKey = url.toString()

    const cache = await caches.open(MAPBOX_CACHE)
    const cached = await cache.match(normalizedKey)
    if (cached) return cached

    try {
      const response = await fetch(request)
      if (response.status === 200 || response.status === 0) {
        // Evict the oldest entry once cache exceeds 700 tiles (~25 MB satellite)
        const keys = await cache.keys()
        if (keys.length >= 700) await cache.delete(keys[0])
        cache.put(normalizedKey, response.clone())
      }
      return response
    } catch {
      return new Response('', { status: 503 })
    }
  }
)

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

self.addEventListener('push', event => {
  const data = event.data?.json() ?? {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const opts: any = { body: data.body ?? '', icon: '/icons/pwa-192x192.png', tag: 'leaderboard', renotify: true }
  event.waitUntil(self.registration.showNotification(data.title ?? 'Chubbs Memorial', opts))
})

// Background Sync: retry pending writes when connectivity is restored
// Chrome/Android only — Safari ignores this event gracefully
self.addEventListener('sync', event => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const syncEvent = event as any
  if (syncEvent.tag === 'drain-write-queue') {
    syncEvent.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
        clients.forEach(c => c.postMessage({ type: 'SW_SYNC_QUEUE' }))
      })
    )
  }
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
