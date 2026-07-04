import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'

// Server-side proxy for Open-Meteo wind + elevation. Fetching from the server
// (one IP, no CORS) instead of every player's phone avoids per-device CORS and
// per-IP rate limits that were leaving the wind chip blank.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Pt { lat: number; lng: number }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const out: { wind: { speed: number; direction: number } | null; elevations: number[] | null } = {
    wind: null,
    elevations: null,
  }

  try {
    const body = await req.json().catch(() => ({}))

    // ── Wind ──────────────────────────────────────────────────────────────
    const w = body.wind
    if (w && typeof w.lat === 'number' && typeof w.lng === 'number') {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${w.lat}&longitude=${w.lng}&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=mph&timezone=auto`
        const r = await fetch(url)
        if (r.ok) {
          const c = (await r.json()).current
          if (typeof c?.wind_speed_10m === 'number' && typeof c?.wind_direction_10m === 'number')
            out.wind = { speed: Math.round(c.wind_speed_10m), direction: c.wind_direction_10m }
        }
      } catch { /* leave wind null */ }
    }

    // ── Elevation ─────────────────────────────────────────────────────────
    const pts: Pt[] = Array.isArray(body.elevation)
      ? body.elevation.filter((p: Pt) => typeof p?.lat === 'number' && typeof p?.lng === 'number')
      : []
    if (pts.length > 0) {
      try {
        const lats = pts.map(p => p.lat).join(',')
        const lngs = pts.map(p => p.lng).join(',')
        const r = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`)
        if (r.ok) {
          const arr = (await r.json())?.elevation
          if (Array.isArray(arr)) out.elevations = arr
        }
      } catch { /* leave elevations null */ }
    }
  } catch { /* malformed body — return nulls */ }

  return new Response(JSON.stringify(out), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
})
