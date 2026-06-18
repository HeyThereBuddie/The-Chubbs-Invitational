import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
]

type Bbox = { minLat: number; minLon: number; maxLat: number; maxLon: number }

// Try all Overpass mirrors simultaneously via both POST and GET
async function tryOverpass(query: string): Promise<unknown | null> {
  const body = `data=${encodeURIComponent(query)}`
  const fh = { 'Content-Type': 'application/x-www-form-urlencoded' }

  const tryOne = async (mirror: string): Promise<unknown> => {
    try {
      const r = await fetch(mirror, { method: 'POST', headers: fh, body })
      if (r.ok) return r.json()
    } catch { /* fall through to GET */ }
    const r = await fetch(`${mirror}?data=${encodeURIComponent(query)}`)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  }

  return Promise.any(MIRRORS.map(tryOne)).catch(() => null)
}

// Direct OSM API fallback — completely separate from Overpass
async function tryOsmApi(bbox: Bbox): Promise<unknown | null> {
  const { minLat, minLon, maxLat, maxLon } = bbox
  const url = `https://api.openstreetmap.org/api/0.6/map?bbox=${minLon},${minLat},${maxLon},${maxLat}`
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'ChubbsGolfApp/1.0' } })
    if (!r.ok) return null
    return parseGolfXml(await r.text())
  } catch {
    return null
  }
}

// Parse raw OSM XML into Overpass-compatible {elements:[]} shape
function parseGolfXml(xml: string): { elements: unknown[] } {
  // Build node id → lat/lon map
  const nodes = new Map<string, { lat: number; lon: number }>()
  const reNode = /<node\b([^>]*?)(?:\/>|>[\s\S]*?<\/node>)/g
  let m: RegExpExecArray | null
  while ((m = reNode.exec(xml)) !== null) {
    const a = m[1]
    const id  = /\bid="([^"]+)"/.exec(a)?.[1]
    const lat = /\blat="([^"]+)"/.exec(a)?.[1]
    const lon = /\blon="([^"]+)"/.exec(a)?.[1]
    if (id && lat && lon) nodes.set(id, { lat: parseFloat(lat), lon: parseFloat(lon) })
  }

  const elements: unknown[] = []
  const reWay = /<way\b([^>]*)>([\s\S]*?)<\/way>/g
  while ((m = reWay.exec(xml)) !== null) {
    const [, attrs, body] = m
    const id = /\bid="([^"]+)"/.exec(attrs)?.[1]

    const tags: Record<string, string> = {}
    const reTag = /<tag\s+k="([^"]+)"\s+v="([^"]+)"/g
    let t: RegExpExecArray | null
    while ((t = reTag.exec(body)) !== null) tags[t[1]] = t[2]

    const golf = tags['golf']
    if (golf !== 'green' && golf !== 'tee') continue

    const refs = [...body.matchAll(/<nd\s+ref="(\d+)"/g)].map(x => x[1])
    const pts = refs.map(r => nodes.get(r)).filter((n): n is { lat: number; lon: number } => n != null)
    if (!pts.length) continue

    const lat = pts.reduce((s, p) => s + p.lat, 0) / pts.length
    const lon = pts.reduce((s, p) => s + p.lon, 0) / pts.length

    elements.push({ type: 'way', id: id ? parseInt(id) : 0, tags, center: { lat, lon } })
  }

  return { elements }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { query, bbox } = await req.json() as { query?: string; bbox?: Bbox }

    let data: unknown = null

    // 1. Overpass (all mirrors in parallel, POST + GET)
    if (query) data = await tryOverpass(query)

    // 2. OSM API direct — completely independent fallback
    if (!data && bbox) data = await tryOsmApi(bbox)

    if (!data) {
      return new Response(JSON.stringify({ error: 'All sources failed' }), {
        status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify(data), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
