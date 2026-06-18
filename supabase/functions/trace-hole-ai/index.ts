import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type LatLng = { lat: number; lng: number }

// Convert normalised image [x,y] (x=0 left, y=0 top) → lat/lng
function norm(x: number, y: number, minLon: number, maxLon: number, minLat: number, maxLat: number): LatLng {
  return {
    lng: minLon + Math.max(0, Math.min(1, x)) * (maxLon - minLon),
    lat: maxLat - Math.max(0, Math.min(1, y)) * (maxLat - minLat),
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { tee, green, mapboxToken } = await req.json() as {
      tee: LatLng
      green: LatLng
      mapboxToken: string
    }

    if (!tee || !green || !mapboxToken) {
      return new Response(JSON.stringify({ error: 'tee, green, and mapboxToken required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Bounding box with ~200m buffer on each side
    const PAD_LAT = 0.0020
    const PAD_LON = 0.0028
    const minLat = Math.min(tee.lat, green.lat) - PAD_LAT
    const maxLat = Math.max(tee.lat, green.lat) + PAD_LAT
    const minLon = Math.min(tee.lng, green.lng) - PAD_LON
    const maxLon = Math.max(tee.lng, green.lng) + PAD_LON

    // Normalised positions of tee/green in the image (for anchoring Claude)
    const teeX  = (tee.lng  - minLon) / (maxLon - minLon)
    const teeY  = (maxLat   - tee.lat)  / (maxLat - minLat)
    const grnX  = (green.lng - minLon)  / (maxLon - minLon)
    const grnY  = (maxLat   - green.lat) / (maxLat - minLat)

    // Fetch Mapbox satellite image (bbox format, auto-zoom)
    const imgUrl = `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/[${minLon},${minLat},${maxLon},${maxLat}]/1280x960?access_token=${mapboxToken}`
    const imgResp = await fetch(imgUrl)
    if (!imgResp.ok) throw new Error(`Mapbox ${imgResp.status}: ${await imgResp.text()}`)

    // ArrayBuffer → base64 (chunked to avoid stack overflow on large images)
    const buf   = new Uint8Array(await imgResp.arrayBuffer())
    const CHUNK = 8192
    let binary  = ''
    for (let i = 0; i < buf.length; i += CHUNK)
      binary += String.fromCharCode(...buf.subarray(i, i + CHUNK))
    const b64 = btoa(binary)

    // Claude Vision prompt
    const prompt = `You are mapping a golf hole from a satellite image. North is up.

Image coordinate system:
  x = 0.0 → left (west) edge,  x = 1.0 → right (east) edge
  y = 0.0 → top  (north) edge, y = 1.0 → bottom (south) edge

Known anchor points:
  Tee box center  ≈ [${teeX.toFixed(3)}, ${teeY.toFixed(3)}]
  Green center    ≈ [${grnX.toFixed(3)}, ${grnY.toFixed(3)}]

Trace the following features as polygon outlines using [x, y] normalised coordinates:

1. fairway  — the short-grass corridor from tee to green (16–28 points, follow the actual shape including curves and doglegs)
2. bunkers  — each sand trap separately (bright tan/beige patches); 6–14 points each
3. water    — each water hazard / pond / stream separately (dark blue-grey bodies); 8–16 points each

Rules:
• Fairway polygon should outline BOTH edges of the short grass from tee area to green.
• Do NOT include the green or tee box inside the fairway polygon.
• If a feature is not clearly visible, return [] for it.
• All coordinate values must be between 0.0 and 1.0.

Return ONLY valid JSON — no markdown, no explanation:
{
  "fairway": [[x,y], ...],
  "bunkers": [[[x,y], ...], ...],
  "water":   [[[x,y], ...], ...]
}`

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY secret not set in Supabase')

    const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
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

    if (!claudeResp.ok) {
      const err = await claudeResp.text()
      throw new Error(`Claude API ${claudeResp.status}: ${err}`)
    }

    const claudeData = await claudeResp.json() as { content: Array<{ type: string; text: string }> }
    const rawText    = claudeData.content.find(c => c.type === 'text')?.text ?? ''

    // Extract JSON (handle accidental markdown fences)
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Claude returned no JSON')
    const traced = JSON.parse(jsonMatch[0]) as {
      fairway:  [number, number][]
      bunkers:  [number, number][][]
      water:    [number, number][][]
    }

    const result = {
      fairway: (traced.fairway  ?? []).map(([x, y]) => norm(x, y, minLon, maxLon, minLat, maxLat)),
      bunkers: (traced.bunkers  ?? []).map(poly => poly.map(([x, y]) => norm(x, y, minLon, maxLon, minLat, maxLat))),
      water:   (traced.water    ?? []).map(poly => poly.map(([x, y]) => norm(x, y, minLon, maxLon, minLat, maxLat))),
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
