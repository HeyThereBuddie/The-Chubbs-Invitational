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
  // Pass 1: node id → lat/lon
  const nodePos = new Map<string, { lat: number; lon: number }>()
  const reNode = /<node\b([^>]*?)(?:\/>|>[\s\S]*?<\/node>)/g
  let m: RegExpExecArray | null
  while ((m = reNode.exec(xml)) !== null) {
    const a = m[1]
    const id  = /\bid="([^"]+)"/.exec(a)?.[1]
    const lat = /\blat="([^"]+)"/.exec(a)?.[1]
    const lon = /\blon="([^"]+)"/.exec(a)?.[1]
    if (id && lat && lon) nodePos.set(id, { lat: parseFloat(lat), lon: parseFloat(lon) })
  }

  // Pass 2: parse all ways in one loop
  //   golf=green / golf=tee → wayMap (centroid)
  //   golf=hole             → holeAnchors (first node≈tee, last node≈green)
  const wayMap = new Map<string, { tags: Record<string, string>; center: { lat: number; lon: number } | null }>()
  const holeAnchors: Array<{ ref: number; teePos: { lat: number; lon: number }; greenPos: { lat: number; lon: number } }> = []
  const reWay = /<way\b([^>]*)>([\s\S]*?)<\/way>/g
  while ((m = reWay.exec(xml)) !== null) {
    const [, attrs, body] = m
    const id = /\bid="([^"]+)"/.exec(attrs)?.[1]
    if (!id) continue
    const tags: Record<string, string> = {}
    const reTag = /<tag\s+k="([^"]+)"\s+v="([^"]+)"/g
    let t: RegExpExecArray | null
    while ((t = reTag.exec(body)) !== null) tags[t[1]] = t[2]
    const golf = tags['golf']
    const ndRefs = [...body.matchAll(/<nd\s+ref="(\d+)"/g)].map(x => x[1])

    if (golf === 'green' || golf === 'tee') {
      const pts = ndRefs.map(r => nodePos.get(r)).filter((n): n is { lat: number; lon: number } => n != null)
      wayMap.set(id, {
        tags,
        center: pts.length
          ? { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length }
          : null,
      })
    } else if (golf === 'hole') {
      const holeNum = parseInt(tags['ref'] ?? '0')
      if (holeNum < 1 || holeNum > 18 || ndRefs.length < 2) continue
      const teePos   = nodePos.get(ndRefs[0])
      const greenPos = nodePos.get(ndRefs[ndRefs.length - 1])
      if (teePos && greenPos) holeAnchors.push({ ref: holeNum, teePos, greenPos })
    }
  }

  // Pass 3: golf=hole relations → map way IDs to hole numbers
  const wayHoleNum = new Map<string, number>()
  const reRelation = /<relation\b[^>]*>([\s\S]*?)<\/relation>/g
  while ((m = reRelation.exec(xml)) !== null) {
    const body = m[1]
    const tags: Record<string, string> = {}
    const reTag = /<tag\s+k="([^"]+)"\s+v="([^"]+)"/g
    let t: RegExpExecArray | null
    while ((t = reTag.exec(body)) !== null) tags[t[1]] = t[2]
    if (tags['golf'] !== 'hole') continue
    const holeNum = parseInt(tags['ref'] ?? '0')
    if (holeNum < 1 || holeNum > 18) continue
    const reMember = /<member\b([^>]*?)(?:\/>|>)/g
    let mem: RegExpExecArray | null
    while ((mem = reMember.exec(body)) !== null) {
      const ma = mem[1]
      if (!ma.includes('type="way"')) continue
      const ref = /\bref="(\d+)"/.exec(ma)?.[1]
      if (ref) wayHoleNum.set(ref, holeNum)
    }
  }

  // Pass 4: proximity-match unnumbered greens/tees to golf=hole way endpoints
  for (const anchor of holeAnchors) {
    let bestGreenId = '', bestGreenD = Infinity
    let bestTeeId   = '', bestTeeD   = Infinity
    for (const [wayId, { tags, center }] of wayMap) {
      if (!center || wayHoleNum.has(wayId)) continue
      const dg = (center.lat - anchor.greenPos.lat) ** 2 + (center.lon - anchor.greenPos.lon) ** 2
      const dt = (center.lat - anchor.teePos.lat)   ** 2 + (center.lon - anchor.teePos.lon)   ** 2
      if (tags['golf'] === 'green' && dg < bestGreenD) { bestGreenD = dg; bestGreenId = wayId }
      if (tags['golf'] === 'tee'   && dt < bestTeeD)   { bestTeeD   = dt; bestTeeId   = wayId }
    }
    if (bestGreenId) wayHoleNum.set(bestGreenId, anchor.ref)
    if (bestTeeId)   wayHoleNum.set(bestTeeId,   anchor.ref)
  }

  // Pass 5: assemble output — prefer relation/anchor hole number over way's own ref tag
  const elements: unknown[] = []
  for (const [id, { tags, center }] of wayMap) {
    if (!center) continue
    const relNum = wayHoleNum.get(id)
    const effectiveTags = relNum ? { ...tags, ref: String(relNum) } : tags
    elements.push({ type: 'way', id: parseInt(id), tags: effectiveTags, center })
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
