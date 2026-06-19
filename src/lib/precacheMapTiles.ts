import type { HoleGps } from './types'

function toTileXY(lng: number, lat: number, z: number): { x: number; y: number } {
  const n = 1 << z
  const x = Math.floor((lng + 180) / 360 * n)
  const r = (lat * Math.PI) / 180
  const y = Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n)
  return { x, y }
}

/**
 * Pre-fetch Mapbox satellite raster tiles for the golf course bounding box at
 * zoom levels 15–17. The service worker intercepts these fetches, strips the
 * `sku` param, and stores them under the normalized URL so they're served from
 * cache when Mapbox GL JS requests the same tiles offline.
 *
 * Typically ~80 tiles (~3 MB). Safe to call on every sync — cached tiles are
 * served instantly from the SW cache with no network round-trip.
 */
export async function precacheMapTiles(
  courseLat: number,
  courseLng: number,
  holesJson: string,
  token: string,
): Promise<void> {
  if (!('serviceWorker' in navigator) || !navigator.onLine) return

  // Build tight bounding box from actual hole coordinates
  let minLat = courseLat, maxLat = courseLat
  let minLng = courseLng, maxLng = courseLng

  try {
    const holes = JSON.parse(holesJson) as HoleGps[]
    for (const h of holes) {
      const pts = [h.tee, h.green?.center, h.green?.front, h.green?.back].filter(Boolean) as { lat: number; lng: number }[]
      for (const p of pts) {
        if (p.lat < minLat) minLat = p.lat; if (p.lat > maxLat) maxLat = p.lat
        if (p.lng < minLng) minLng = p.lng; if (p.lng > maxLng) maxLng = p.lng
      }
    }
  } catch { return }

  // ~400 m buffer so fairway edges and greens near the boundary aren't clipped
  const pad = 0.004
  const b = { minLat: minLat - pad, maxLat: maxLat + pad, minLng: minLng - pad, maxLng: maxLng + pad }

  const fetches: Promise<unknown>[] = []

  // Z15 = course overview (~4 tiles), Z16 = hole-level detail (~16 tiles).
  // Z17 is intentionally excluded — ~60 more tiles for marginal gain; those
  // load and cache naturally when the user opens the GPS page while online.
  for (const z of [15, 16]) {
    const { x: x0, y: y0 } = toTileXY(b.minLng, b.maxLat, z)
    const { x: x1, y: y1 } = toTileXY(b.maxLng, b.minLat, z)
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        // Fetch without `sku` — the SW handler stores tiles under this normalized key.
        const url = `https://api.mapbox.com/v4/mapbox.satellite/${z}/${x}/${y}@2x.jpg90?access_token=${token}`
        fetches.push(fetch(url).catch(() => {}))
      }
    }
  }

  await Promise.allSettled(fetches)
}
