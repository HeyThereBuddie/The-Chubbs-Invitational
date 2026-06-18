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

type Pt = { lat: number; lon: number }

function pointInPoly(p: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const { lat: iy, lon: ix } = poly[i]; const { lat: jy, lon: jx } = poly[j]
    if ((iy > p.lat) !== (jy > p.lat))
      if (p.lon < ix + (jx - ix) * (p.lat - iy) / (jy - iy)) inside = !inside
  }
  return inside
}
function segDist2(p: Pt, a: Pt, b: Pt): number {
  const dy = b.lat - a.lat, dx = b.lon - a.lon, len2 = dy * dy + dx * dx
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.lat - a.lat) * dy + (p.lon - a.lon) * dx) / len2)) : 0
  return (p.lat - a.lat - t * dy) ** 2 + (p.lon - a.lon - t * dx) ** 2
}
function nearPoly(p: Pt, poly: Pt[], pad: number): boolean {
  const pad2 = pad * pad
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
    if (segDist2(p, poly[i], poly[j]) < pad2) return true
  return false
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
  //   golf=green / golf=tee    → wayMap (centroid)
  //   golf=fairway             → fairwayMap (full polygon)
  //   golf=hole                → holeAnchors (first node≈tee, last node≈green)
  //   leisure=golf_course      → courseBounds (boundary polygons)
  const wayMap = new Map<string, { tags: Record<string, string>; center: Pt | null }>()
  const fairwayMap = new Map<string, { tags: Record<string, string>; polygon: Pt[] }>()
  const holeAnchors: Array<{ ref: number; teePos: Pt; greenPos: Pt }> = []
  const courseBounds: Pt[][] = []
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
      const pts = ndRefs.map(r => nodePos.get(r)).filter((n): n is Pt => n != null)
      wayMap.set(id, {
        tags,
        center: pts.length
          ? { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length }
          : null,
      })
    } else if (golf === 'fairway') {
      const pts = ndRefs.map(r => nodePos.get(r)).filter((n): n is Pt => n != null)
      if (pts.length >= 3) fairwayMap.set(id, { tags, polygon: pts })
    } else if (golf === 'hole') {
      const holeNum = parseInt(tags['ref'] ?? '0')
      if (holeNum < 1 || holeNum > 18 || ndRefs.length < 2) continue
      const teePos   = nodePos.get(ndRefs[0])
      const greenPos = nodePos.get(ndRefs[ndRefs.length - 1])
      if (teePos && greenPos) holeAnchors.push({ ref: holeNum, teePos, greenPos })
    } else if (tags['leisure'] === 'golf_course') {
      const pts = ndRefs.map(r => nodePos.get(r)).filter((n): n is Pt => n != null)
      if (pts.length >= 3) courseBounds.push(pts)
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

  // Pass 4a: filter wayMap/fairwayMap to the course boundary containing the most hole anchors
  if (holeAnchors.length > 0 && courseBounds.length > 0) {
    let bestBound: Pt[] | null = null
    let bestScore = 0
    for (const bound of courseBounds) {
      const score = holeAnchors.filter(a =>
        pointInPoly(a.greenPos, bound) || pointInPoly(a.teePos, bound)
      ).length
      if (score > bestScore) { bestScore = score; bestBound = bound }
    }
    if (bestBound) {
      const PAD = 0.001
      for (const [wayId, { center }] of wayMap) {
        if (center && !pointInPoly(center, bestBound) && !nearPoly(center, bestBound, PAD)) {
          wayMap.delete(wayId)
        }
      }
      for (const [fwId, { polygon }] of fairwayMap) {
        const centroid = { lat: polygon.reduce((s, p) => s + p.lat, 0) / polygon.length, lon: polygon.reduce((s, p) => s + p.lon, 0) / polygon.length }
        if (!pointInPoly(centroid, bestBound) && !nearPoly(centroid, bestBound, PAD)) {
          fairwayMap.delete(fwId)
        }
      }
    }
  }

  // Pass 4b: proximity-match unnumbered greens/tees to golf=hole way endpoints
  // Max distance thresholds reject off-course features (e.g. tees in adjacent farmland)
  const MAX_GREEN_D2 = 0.003 * 0.003  // ~330m
  const MAX_TEE_D2   = 0.004 * 0.004  // ~440m
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
    if (bestGreenId && bestGreenD < MAX_GREEN_D2) wayHoleNum.set(bestGreenId, anchor.ref)
    if (bestTeeId   && bestTeeD   < MAX_TEE_D2)  wayHoleNum.set(bestTeeId,   anchor.ref)
  }

  // Pass 4c: match fairway polygons to hole numbers
  const fairwayHoleNum = new Map<string, number>()
  const MAX_FAIRWAY_D2 = 0.007 * 0.007
  for (const [fwId, { tags, polygon }] of fairwayMap) {
    let holeNum = parseInt(tags['ref'] ?? '0')
    if (holeNum < 1 || holeNum > 18) {
      const centroid = { lat: polygon.reduce((s, p) => s + p.lat, 0) / polygon.length, lon: polygon.reduce((s, p) => s + p.lon, 0) / polygon.length }
      let bestD = Infinity
      for (const anchor of holeAnchors) {
        const midLat = (anchor.teePos.lat + anchor.greenPos.lat) / 2
        const midLon = (anchor.teePos.lon + anchor.greenPos.lon) / 2
        const d = (centroid.lat - midLat) ** 2 + (centroid.lon - midLon) ** 2
        if (d < bestD) { bestD = d; holeNum = anchor.ref }
      }
      if (bestD > MAX_FAIRWAY_D2) holeNum = 0
    }
    if (holeNum >= 1 && holeNum <= 18) fairwayHoleNum.set(fwId, holeNum)
  }

  // Pass 5: assemble output — prefer relation/anchor hole number over way's own ref tag
  const elements: unknown[] = []
  for (const [id, { tags, center }] of wayMap) {
    if (!center) continue
    const relNum = wayHoleNum.get(id)
    const effectiveTags = relNum ? { ...tags, ref: String(relNum) } : tags
    elements.push({ type: 'way', id: parseInt(id), tags: effectiveTags, center })
  }
  for (const [id, { tags, polygon }] of fairwayMap) {
    const holeNum = fairwayHoleNum.get(id)
    if (!holeNum) continue
    elements.push({ type: 'way', id: parseInt(id), tags: { ...tags, ref: String(holeNum) }, geometry: polygon })
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
