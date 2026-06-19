import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type LatLng = { lat: number; lng: number }

function norm(x: number, y: number, minLon: number, maxLon: number, minLat: number, maxLat: number): LatLng {
  return {
    lng: minLon + Math.max(0, Math.min(1, x)) * (maxLon - minLon),
    lat: maxLat - Math.max(0, Math.min(1, y)) * (maxLat - minLat),
  }
}

function haversineM(a: LatLng, b: LatLng): number {
  const R = 6371000
  const φ1 = (a.lat * Math.PI) / 180
  const φ2 = (b.lat * Math.PI) / 180
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180
  const x = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

function bearingDeg(a: LatLng, b: LatLng): number {
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const dLng  = ((b.lng - a.lng) * Math.PI) / 180
  const x = Math.sin(dLng) * Math.cos(lat2)
  const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return (Math.atan2(x, y) * 180 / Math.PI + 360) % 360
}

function cardinalDir(deg: number): string {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8]
}

// ArrayBuffer → base64, chunked to avoid stack overflow
async function fetchBase64(url: string): Promise<string> {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Mapbox ${resp.status}: ${await resp.text()}`)
  const buf    = new Uint8Array(await resp.arrayBuffer())
  const CHUNK  = 8192
  let binary   = ''
  for (let i = 0; i < buf.length; i += CHUNK)
    binary += String.fromCharCode(...buf.subarray(i, i + CHUNK))
  return btoa(binary)
}

async function claudeVision(b64: string, prompt: string, key: string): Promise<string> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         key,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      'claude-opus-4-8',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
          { type: 'text',  text: prompt },
        ],
      }],
    }),
  })
  if (!resp.ok) throw new Error(`Claude ${resp.status}: ${await resp.text()}`)
  const data = await resp.json() as { content: Array<{ type: string; text: string }> }
  return data.content.find(c => c.type === 'text')?.text ?? ''
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { tee, green, mapboxToken } = await req.json() as {
      tee: LatLng; green: LatLng; mapboxToken: string
    }

    if (!tee || !green || !mapboxToken) {
      return new Response(JSON.stringify({ error: 'tee, green, and mapboxToken required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY secret not set in Supabase')

    const holeLengthM   = haversineM(tee, green)
    const holeLengthYds = Math.round(holeLengthM * 1.09361)
    const bearing       = bearingDeg(tee, green)
    const playDir       = `${cardinalDir(bearing)} (tee) → ${cardinalDir((bearing + 180) % 360)} (green)`

    // ── Pass 1 bbox: tighter padding (~110m) for better zoom detail ──────────
    const P1_LAT = 0.0010
    const P1_LON = 0.0014
    const p1MinLat = Math.min(tee.lat, green.lat) - P1_LAT
    const p1MaxLat = Math.max(tee.lat, green.lat) + P1_LAT
    const p1MinLon = Math.min(tee.lng, green.lng) - P1_LON
    const p1MaxLon = Math.max(tee.lng, green.lng) + P1_LON

    const p1TeeX = (tee.lng   - p1MinLon) / (p1MaxLon - p1MinLon)
    const p1TeeY = (p1MaxLat  - tee.lat)  / (p1MaxLat - p1MinLat)
    const p1GrnX = (green.lng - p1MinLon) / (p1MaxLon - p1MinLon)
    const p1GrnY = (p1MaxLat  - green.lat) / (p1MaxLat - p1MinLat)

    // ── Pass 2 bbox: tight crop around the green only (~65m buffer) ──────────
    const P2_LAT = 0.00060
    const P2_LON = 0.00085
    const p2MinLat = green.lat - P2_LAT
    const p2MaxLat = green.lat + P2_LAT
    const p2MinLon = green.lng - P2_LON
    const p2MaxLon = green.lng + P2_LON

    const p2GrnX = (green.lng - p2MinLon) / (p2MaxLon - p2MinLon)
    const p2GrnY = (p2MaxLat  - green.lat) / (p2MaxLat - p2MinLat)
    // Tee direction clamped to [-0.5, 1.5] so Claude knows which way is "front"
    const p2TeeX = Math.max(-0.5, Math.min(1.5, (tee.lng - p2MinLon) / (p2MaxLon - p2MinLon)))
    const p2TeeY = Math.max(-0.5, Math.min(1.5, (p2MaxLat - tee.lat)  / (p2MaxLat - p2MinLat)))

    // ── Fetch both satellite images in parallel ───────────────────────────────
    const p1ImgUrl = `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/[${p1MinLon},${p1MinLat},${p1MaxLon},${p1MaxLat}]/1280x960?access_token=${mapboxToken}`
    const p2ImgUrl = `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/[${p2MinLon},${p2MinLat},${p2MaxLon},${p2MaxLat}]/1280x1280?access_token=${mapboxToken}`

    const [p1B64, p2B64] = await Promise.all([
      fetchBase64(p1ImgUrl),
      fetchBase64(p2ImgUrl),
    ])

    // ── Pass 1 prompt: full hole features ────────────────────────────────────
    const p1Prompt = `You are mapping a golf hole from a satellite image. North is up.

Image coordinate system:
  x = 0.0 → left (west) edge,  x = 1.0 → right (east) edge
  y = 0.0 → top  (north) edge, y = 1.0 → bottom (south) edge

Known anchor points:
  Tee box center  ≈ [${p1TeeX.toFixed(3)}, ${p1TeeY.toFixed(3)}]
  Green center    ≈ [${p1GrnX.toFixed(3)}, ${p1GrnY.toFixed(3)}]

Hole context:
  Length: ~${holeLengthYds} yards  |  Direction of play: ${playDir}
  Typical fairway width: 30–45 metres (about 2–4% of the image width)

Return these features using [x, y] normalised coordinates:

POLYGONS:
1. fairway     — short-grass corridor from tee to green (16–28 pts, follow actual shape and doglegs)
2. bunkers     — each sand trap separately (bright tan/beige areas); 6–14 pts each
3. water       — each water hazard (dark blue-grey areas); 8–16 pts each
4. avoid_zones — 0-2 danger area polygons (OB, heavy rough beyond hazards); 8–12 pts each; [] if none

SINGLE POINTS:
5. landing_zone — ideal tee-shot landing area center [x, y]

TEXT:
6. tip — 1-2 sentence playing tip for a mid-handicap golfer specific to this hole; null if nothing useful

Rules:
• Fairway outlines BOTH edges of cut grass — do not include the green or tee box.
• If a feature is not clearly visible return [] or null.
• All coordinates between 0.0 and 1.0.

Return ONLY valid JSON:
{
  "fairway":      [[x,y], ...],
  "bunkers":      [[[x,y], ...], ...],
  "water":        [[[x,y], ...], ...],
  "avoid_zones":  [[[x,y], ...], ...],
  "landing_zone": [x, y],
  "tip":          "string or null"
}`

    // ── Pass 2 prompt: green close-up only ───────────────────────────────────
    const p2Prompt = `You are identifying the edges of a golf putting green from a close-up satellite image. North is up.

Image coordinate system:
  x = 0.0 → left (west) edge,  x = 1.0 → right (east) edge
  y = 0.0 → top  (north) edge, y = 1.0 → bottom (south) edge

The putting green is the small, uniformly-cut circular or oval grass surface near the center of this image.
  Approximate green center: [${p2GrnX.toFixed(3)}, ${p2GrnY.toFixed(3)}]
  The fairway approach comes from the direction of [${p2TeeX.toFixed(2)}, ${p2TeeY.toFixed(2)}] (may be outside image).
  "Front" = green edge on the fairway/approach side.
  "Back"  = green edge on the far side from the approach.

Identify exactly 3 points on the boundary of the putting surface:
1. green_front  — edge of the green on the approach/fairway side
2. green_center — geometric center of the putting surface
3. green_back   — far edge of the green (opposite the approach)

Rules:
• The green is the tightest-cut, most uniform grass — NOT the fringe, collar, or surroundings.
• Measure to the actual edge of the closely-mown surface, not the fringe.
• Return null for any point you cannot confidently place.
• All coordinates between 0.0 and 1.0.

Return ONLY valid JSON:
{
  "green_front":  [x, y],
  "green_center": [x, y],
  "green_back":   [x, y]
}`

    // ── Run both Claude calls in parallel ─────────────────────────────────────
    const [p1Text, p2Text] = await Promise.all([
      claudeVision(p1B64, p1Prompt, anthropicKey),
      claudeVision(p2B64, p2Prompt, anthropicKey),
    ])

    // Parse Pass 1
    const p1Match = p1Text.match(/\{[\s\S]*\}/)
    if (!p1Match) throw new Error('Pass 1: Claude returned no JSON')
    const p1 = JSON.parse(p1Match[0]) as {
      fairway:      [number, number][]
      bunkers:      [number, number][][]
      water:        [number, number][][]
      avoid_zones:  [number, number][][]
      landing_zone: [number, number] | null
      tip:          string | null
    }

    // Parse Pass 2
    const p2Match = p2Text.match(/\{[\s\S]*\}/)
    if (!p2Match) throw new Error('Pass 2: Claude returned no JSON')
    const p2 = JSON.parse(p2Match[0]) as {
      green_front:  [number, number] | null
      green_center: [number, number] | null
      green_back:   [number, number] | null
    }

    const n1  = (x: number, y: number) => norm(x, y, p1MinLon, p1MaxLon, p1MinLat, p1MaxLat)
    const n2  = (v: [number, number] | null | undefined) =>
      v ? norm(v[0], v[1], p2MinLon, p2MaxLon, p2MinLat, p2MaxLat) : null

    const result = {
      fairway:     (p1.fairway      ?? []).map(([x, y]) => n1(x, y)),
      bunkers:     (p1.bunkers      ?? []).map(poly => poly.map(([x, y]) => n1(x, y))),
      water:       (p1.water        ?? []).map(poly => poly.map(([x, y]) => n1(x, y))),
      avoidZones:  (p1.avoid_zones  ?? []).map(poly => poly.map(([x, y]) => n1(x, y))),
      landingZone: p1.landing_zone ? n1(p1.landing_zone[0], p1.landing_zone[1]) : null,
      tip:         typeof p1.tip === 'string' ? p1.tip : null,
      green: {
        front:  n2(p2.green_front),
        center: n2(p2.green_center),
        back:   n2(p2.green_back),
      },
    }

    return new Response(JSON.stringify(result), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('trace-hole-ai error:', e)
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
