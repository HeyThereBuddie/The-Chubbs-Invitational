import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import Map, { Marker, NavigationControl, Source, Layer, type MapRef } from 'react-map-gl/mapbox'
import type { MapMouseEvent } from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Search, Save, Download, ChevronLeft, ChevronRight, Lock, MapPin, Wand2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../context/ToastContext'
import type { CourseGps, HoleGps, LatLng } from '../../lib/types'
import { normalizeFairways } from '../../lib/types'

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined

interface CourseResult {
  id: number
  name: string
  lat: number
  lng: number
  address?: string
  distanceKm?: number
  bounds?: { minLat: number; maxLat: number; minLon: number; maxLon: number }
}

function kmBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10
}

type PinMode = 'tee' | 'front' | 'center' | 'back' | 'landing'
type DrawType = 'fairway' | 'bunker' | 'water'
type EditTarget = { type: DrawType; index: number }

// Pin placement order: tee first, then front/center/back green pins
const MODES: PinMode[] = ['tee', 'front', 'center', 'back']

const PIN_META: Record<PinMode, { label: string; short: string; color: string; desc: string }> = {
  tee:     { label: 'Tee',     short: 'T',  color: '#6b7280', desc: 'Tee box' },
  front:   { label: 'Front',   short: 'F',  color: '#16a34a', desc: 'Front edge' },
  center:  { label: 'Center',  short: 'C',  color: '#D4A53A', desc: 'Middle of green' },
  back:    { label: 'Back',    short: 'B',  color: '#dc2626', desc: 'Back edge' },
  landing: { label: 'Landing', short: 'LZ', color: '#22c55e', desc: 'Ideal landing zone' },
}

const DRAW_COLORS: Record<DrawType, string> = { fairway: '#22c55e', bunker: '#C4985A', water: '#3b82f6' }

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

type OsmElement = { type: string; id: number; tags: Record<string, string>; center?: { lat: number; lon: number }; geometry?: { lat: number; lon: number }[] }
type BboxObj = { minLat: number; minLon: number; maxLat: number; maxLon: number }
type Pt = { lat: number; lon: number }

// Ray-casting point-in-polygon (horizontal ray, +lon direction)
function pointInPoly(p: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const { lat: iy, lon: ix } = poly[i]
    const { lat: jy, lon: jx } = poly[j]
    if ((iy > p.lat) !== (jy > p.lat))
      if (p.lon < ix + (jx - ix) * (p.lat - iy) / (jy - iy)) inside = !inside
  }
  return inside
}

function segDist2(p: Pt, a: Pt, b: Pt): number {
  const dy = b.lat - a.lat, dx = b.lon - a.lon
  const len2 = dy * dy + dx * dx
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.lat - a.lat) * dy + (p.lon - a.lon) * dx) / len2)) : 0
  return (p.lat - a.lat - t * dy) ** 2 + (p.lon - a.lon - t * dx) ** 2
}

function nearPoly(p: Pt, poly: Pt[], pad: number): boolean {
  const pad2 = pad * pad
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
    if (segDist2(p, poly[i], poly[j]) < pad2) return true
  return false
}

// Parse raw OSM XML into Overpass-compatible {elements:[]} shape (mirrors Edge Function logic)
function parseOsmXml(xml: string): { elements: OsmElement[] } {
  // Can't use Map<> here — 'Map' is shadowed by the react-map-gl import above
  // Pass 1: node id → lat/lon
  const nodePos: Record<string, { lat: number; lon: number }> = {}
  const reNode = /<node\b([^>]*?)(?:\/>|>[\s\S]*?<\/node>)/g
  let m: RegExpExecArray | null
  while ((m = reNode.exec(xml)) !== null) {
    const a = m[1]
    const id  = /\bid="([^"]+)"/.exec(a)?.[1]
    const lat = /\blat="([^"]+)"/.exec(a)?.[1]
    const lon = /\blon="([^"]+)"/.exec(a)?.[1]
    if (id && lat && lon) nodePos[id] = { lat: parseFloat(lat), lon: parseFloat(lon) }
  }

  // Pass 2: parse all ways in one loop
  //   golf=green / golf=tee              → wayMap (centroid)
  //   golf=fairway                       → fairwayMap (full polygon)
  //   golf=bunker                        → bunkerMap (full polygon)
  //   golf=water_hazard / lateral_water  → waterMap (full polygon)
  //   golf=hole                          → holeAnchors (first node≈tee, last node≈green)
  //   leisure=golf_course                → courseBounds (boundary polygons)
  const wayMap: Record<string, { tags: Record<string, string>; center: Pt | null }> = {}
  const fairwayMap: Record<string, { tags: Record<string, string>; polygon: Pt[] }> = {}
  const bunkerMap: Record<string, { tags: Record<string, string>; polygon: Pt[] }> = {}
  const waterMap: Record<string, { tags: Record<string, string>; polygon: Pt[] }> = {}
  const holeAnchors: Array<{ ref: number; teePos: Pt; greenPos: Pt }> = []
  const courseBounds: Array<Pt[]> = []
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
      const pts = ndRefs.map(r => nodePos[r]).filter((n): n is Pt => n != null)
      wayMap[id] = {
        tags,
        center: pts.length
          ? { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length }
          : null,
      }
    } else if (golf === 'fairway') {
      const pts = ndRefs.map(r => nodePos[r]).filter((n): n is Pt => n != null)
      if (pts.length >= 3) fairwayMap[id] = { tags, polygon: pts }
    } else if (golf === 'bunker') {
      const pts = ndRefs.map(r => nodePos[r]).filter((n): n is Pt => n != null)
      if (pts.length >= 3) bunkerMap[id] = { tags, polygon: pts }
    } else if (golf === 'water_hazard' || golf === 'lateral_water_hazard') {
      const pts = ndRefs.map(r => nodePos[r]).filter((n): n is Pt => n != null)
      if (pts.length >= 3) waterMap[id] = { tags, polygon: pts }
    } else if (golf === 'hole') {
      // golf=hole routing ways run tee→green and carry ref=1..18 even when green/tee shapes don't
      const holeNum = parseInt(tags['ref'] ?? '0')
      if (holeNum < 1 || holeNum > 18 || ndRefs.length < 2) continue
      const teePos   = nodePos[ndRefs[0]]
      const greenPos = nodePos[ndRefs[ndRefs.length - 1]]
      if (teePos && greenPos) holeAnchors.push({ ref: holeNum, teePos, greenPos })
    } else if (tags['leisure'] === 'golf_course') {
      const pts = ndRefs.map(r => nodePos[r]).filter((n): n is Pt => n != null)
      if (pts.length >= 3) courseBounds.push(pts)
    }
  }

  // Pass 3: golf=hole relations → map way IDs to hole numbers
  // Many courses tag ref=N on the relation but not on individual tee/green ways
  const wayHoleNum: Record<string, number> = {}
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
      if (ref) wayHoleNum[ref] = holeNum
    }
  }

  // Pass 4a: if multiple courses are in the bbox, filter wayMap/fairwayMap to the course
  // whose boundary polygon contains the most hole anchors — prevents cross-course contamination
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
      const PAD = 0.001  // ~110m to handle approximate course boundaries
      for (const wayId of Object.keys(wayMap)) {
        const c = wayMap[wayId].center
        if (c && !pointInPoly(c, bestBound) && !nearPoly(c, bestBound, PAD)) {
          delete wayMap[wayId]
        }
      }
      for (const fwId of Object.keys(fairwayMap)) {
        const pts = fairwayMap[fwId].polygon
        const centroid = { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length }
        if (!pointInPoly(centroid, bestBound) && !nearPoly(centroid, bestBound, PAD)) delete fairwayMap[fwId]
      }
      for (const bId of Object.keys(bunkerMap)) {
        const pts = bunkerMap[bId].polygon
        const centroid = { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length }
        if (!pointInPoly(centroid, bestBound) && !nearPoly(centroid, bestBound, PAD)) delete bunkerMap[bId]
      }
      for (const wId of Object.keys(waterMap)) {
        const pts = waterMap[wId].polygon
        const centroid = { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length }
        if (!pointInPoly(centroid, bestBound) && !nearPoly(centroid, bestBound, PAD)) delete waterMap[wId]
      }
    }
  }

  // Pass 4b: proximity-match unnumbered greens/tees to golf=hole way endpoints
  // Watson's Glen and many courses put ref=1..18 on the routing line, not on shapes
  // Max distance thresholds reject off-course features (e.g. tees in adjacent farmland)
  const MAX_GREEN_D2 = 0.003 * 0.003  // ~330m
  const MAX_TEE_D2   = 0.004 * 0.004  // ~440m
  for (const anchor of holeAnchors) {
    let bestGreenId = '', bestGreenD = Infinity
    let bestTeeId   = '', bestTeeD   = Infinity
    for (const [wayId, { tags, center }] of Object.entries(wayMap)) {
      if (!center || wayHoleNum[wayId]) continue
      const dg = (center.lat - anchor.greenPos.lat) ** 2 + (center.lon - anchor.greenPos.lon) ** 2
      const dt = (center.lat - anchor.teePos.lat)   ** 2 + (center.lon - anchor.teePos.lon)   ** 2
      if (tags['golf'] === 'green' && dg < bestGreenD) { bestGreenD = dg; bestGreenId = wayId }
      if (tags['golf'] === 'tee'   && dt < bestTeeD)   { bestTeeD   = dt; bestTeeId   = wayId }
    }
    if (bestGreenId && bestGreenD < MAX_GREEN_D2) wayHoleNum[bestGreenId] = anchor.ref
    if (bestTeeId   && bestTeeD   < MAX_TEE_D2)  wayHoleNum[bestTeeId]   = anchor.ref
  }

  // Pass 4c/4d shared helper — nearest anchor match for hazard polygons
  const matchHazardToHole = (polygon: Pt[], tags: Record<string, string>): number => {
    let holeNum = parseInt(tags['ref'] ?? '0')
    if (holeNum >= 1 && holeNum <= 18) return holeNum
    const centroid = { lat: polygon.reduce((s, p) => s + p.lat, 0) / polygon.length, lon: polygon.reduce((s, p) => s + p.lon, 0) / polygon.length }
    let bestD = Infinity
    for (const anchor of holeAnchors) {
      const midLat = (anchor.teePos.lat + anchor.greenPos.lat) / 2
      const midLon = (anchor.teePos.lon + anchor.greenPos.lon) / 2
      const d = (centroid.lat - midLat) ** 2 + (centroid.lon - midLon) ** 2
      if (d < bestD) { bestD = d; holeNum = anchor.ref }
    }
    return bestD < 0.006 * 0.006 ? holeNum : 0
  }

  // Bunker hole assignment
  const bunkerHoleNum: Record<string, number> = {}
  for (const [bId, { tags, polygon }] of Object.entries(bunkerMap)) {
    const n = matchHazardToHole(polygon, tags)
    if (n) bunkerHoleNum[bId] = n
  }
  // Water hole assignment
  const waterHoleNum: Record<string, number> = {}
  for (const [wId, { tags, polygon }] of Object.entries(waterMap)) {
    const n = matchHazardToHole(polygon, tags)
    if (n) waterHoleNum[wId] = n
  }

  // Pass 4c: match fairway polygons to hole numbers
  // Priority: ref tag on fairway → proximity to holeAnchor midpoints
  const fairwayHoleNum: Record<string, number> = {}
  const MAX_FAIRWAY_D2 = 0.007 * 0.007  // ~770m — fairways can be long par-5s
  for (const [fwId, { tags, polygon }] of Object.entries(fairwayMap)) {
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
    if (holeNum >= 1 && holeNum <= 18) fairwayHoleNum[fwId] = holeNum
  }

  // Pass 5: assemble output — prefer relation/anchor hole number over way's own ref tag
  const elements: OsmElement[] = []
  for (const [id, { tags, center }] of Object.entries(wayMap)) {
    if (!center) continue
    const relNum = wayHoleNum[id]
    const effectiveTags = relNum ? { ...tags, ref: String(relNum) } : tags
    elements.push({ type: 'way', id: parseInt(id), tags: effectiveTags, center })
  }
  for (const [id, { tags, polygon }] of Object.entries(fairwayMap)) {
    const holeNum = fairwayHoleNum[id]
    if (!holeNum) continue
    elements.push({ type: 'way', id: parseInt(id), tags: { ...tags, ref: String(holeNum) }, geometry: polygon })
  }
  for (const [id, { polygon }] of Object.entries(bunkerMap)) {
    const holeNum = bunkerHoleNum[id]
    if (!holeNum) continue
    elements.push({ type: 'way', id: parseInt(id), tags: { golf: 'bunker', ref: String(holeNum) }, geometry: polygon })
  }
  for (const [id, { polygon }] of Object.entries(waterMap)) {
    const holeNum = waterHoleNum[id]
    if (!holeNum) continue
    elements.push({ type: 'way', id: parseInt(id), tags: { golf: 'water_hazard', ref: String(holeNum) }, geometry: polygon })
  }
  return { elements }
}

// Direct OSM API fetch — no Overpass dependency
// OSM API /map has a 50k-node limit, so we start tight and shrink on 400
async function fetchOsmApiDirect(bbox: BboxObj): Promise<{ elements: OsmElement[] }> {
  const clat = (bbox.minLat + bbox.maxLat) / 2
  const clon = (bbox.minLon + bbox.maxLon) / 2
  for (const r of [0.014, 0.009, 0.005]) {
    const b = { minLat: clat - r, maxLat: clat + r, minLon: clon - r, maxLon: clon + r }
    const url = `https://api.openstreetmap.org/api/0.6/map?bbox=${b.minLon},${b.minLat},${b.maxLon},${b.maxLat}`
    const res = await fetch(url, { headers: { Accept: 'application/xml' } })
    if (res.ok) return parseOsmXml(await res.text())
    if (res.status !== 400) throw new Error(`OSM API HTTP ${res.status}`)
    // 400 = too many nodes in this area, retry with tighter box
  }
  throw new Error('Area too dense for automatic import — deploy the updated Edge Function or place pins manually')
}

async function overpassQuery(
  q: string,
  timeoutMs = 25000,
  bbox?: BboxObj,
): Promise<unknown> {
  // Primary: Supabase Edge Function proxy (server-side, not subject to browser IP blocks)
  // Passes bbox so the Edge Function can fall back to OSM API if all Overpass mirrors fail
  try {
    const { data, error } = await supabase.functions.invoke('overpass-proxy', { body: { query: q, bbox } })
    if (!error && data && !data.error) return data
  } catch { /* fall through to direct browser requests */ }

  // Fallback: direct browser requests to all mirrors in parallel
  const body = `data=${encodeURIComponent(q)}`
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' }
  const attempt = (endpoint: string) => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    return fetch(endpoint, { method: 'POST', headers, body, signal: ctrl.signal })
      .then(res => { clearTimeout(timer); if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() })
      .catch(err => { clearTimeout(timer); throw err })
  }

  return Promise.any(OVERPASS_ENDPOINTS.map(attempt))
    .catch(() => { throw new Error('overpass-unavailable') })
}

function emptyHoles(): HoleGps[] {
  return Array.from({ length: 18 }, (_, i) => ({
    hole: i + 1,
    tee: null,
    green: { front: null, center: null, back: null },
  }))
}

// Corridor helpers (mirrors GpsPage.tsx)
function calcBearing(a: LatLng, b: LatLng): number {
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const dLng  = ((b.lng - a.lng) * Math.PI) / 180
  const x = Math.sin(dLng) * Math.cos(lat2)
  const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return (Math.atan2(x, y) * 180 / Math.PI + 360) % 360
}

function offsetLatLng(origin: LatLng, bearingDeg: number, meters: number): LatLng {
  const R = 6371000
  const d = meters / R
  const b = (bearingDeg * Math.PI) / 180
  const lat1 = (origin.lat * Math.PI) / 180
  const lng1 = (origin.lng * Math.PI) / 180
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b))
  const lng2 = lng1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2))
  return { lat: (lat2 * 180) / Math.PI, lng: ((lng2 * 180) / Math.PI + 540) % 360 - 180 }
}

function buildCorridor(tee: LatLng, green: LatLng, bearing: number): [number, number][] {
  const teeSideW   = 23
  const greenSideW = 16
  const teeBack    = offsetLatLng(tee,   bearing + 180, 6)
  const greenFwd   = offsetLatLng(green, bearing,       10)
  const pts = [
    offsetLatLng(teeBack,  bearing - 90, teeSideW),
    offsetLatLng(teeBack,  bearing + 90, teeSideW),
    offsetLatLng(greenFwd, bearing + 90, greenSideW),
    offsetLatLng(greenFwd, bearing - 90, greenSideW),
  ]
  return [...pts.map(p => [p.lng, p.lat] as [number, number]), [pts[0].lng, pts[0].lat]]
}

function AdminPin({ short, color, borderRadius = 50 }: { short: string; color: string; borderRadius?: number }) {
  return (
    <div style={{
      width: 28, height: 28,
      borderRadius: borderRadius === 50 ? '50%' : 5,
      background: color, border: '2.5px solid white',
      boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
      color: 'white', fontWeight: 900, fontSize: 11,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      userSelect: 'none', pointerEvents: 'none',
      fontFamily: 'Inter, sans-serif',
    }}>{short}</div>
  )
}

function HoleDot({ num, active, hasCenter, onClick }: { num: number; active: boolean; hasCenter: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      minWidth: 36, height: 44, borderRadius: 9, flexShrink: 0,
      border: active ? '2px solid #D4A53A' : '1px solid var(--bdr)',
      background: active ? 'rgba(212,165,58,0.15)' : 'var(--surf)',
      cursor: 'pointer',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
      transform: active ? 'scale(1.08)' : 'scale(1)',
      transition: 'transform 0.15s, border-color 0.15s',
      opacity: hasCenter ? 1 : 0.5,
    }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: active ? '#D4A53A' : 'var(--tx2)', lineHeight: 1 }}>{num}</span>
      <div style={{ width: 5, height: 5, borderRadius: '50%', background: hasCenter ? '#22c55e' : 'var(--bdr)', flexShrink: 0 }} />
    </button>
  )
}

export default function CourseGpsSetup({ tournamentId, currentGps, onSaved }: {
  tournamentId: string | null
  currentGps: CourseGps | null
  onSaved: (gps: CourseGps) => void
}) {
  const { showToast } = useToast()
  const mapRef = useRef<MapRef>(null)

  const [gpsSubTab, setGpsSubTab] = useState<'selection' | 'setup' | 'pars'>(() => currentGps ? 'setup' : 'selection')
  const [existingCourses, setExistingCourses] = useState<{ id: string; name: string; lat: number | null; lng: number | null }[]>([])

  // Switch to setup tab as soon as the async currentGps prop arrives (DB fetch in AdminPanel
  // completes after the component first renders, so the lazy initializer above isn't enough)
  useEffect(() => {
    if (currentGps) {
      setGpsSubTab('setup')
      setCourseName(currentGps.name)
      setCourseLat(currentGps.lat ?? null)
      setCourseLng(currentGps.lng ?? null)
      setHoles(currentGps.holes?.length ? normalizeFairways(currentGps.holes) : emptyHoles())
      if (currentGps.lat && currentGps.lng) {
        setViewState(v => ({ ...v, latitude: currentGps.lat!, longitude: currentGps.lng!, zoom: 16 }))
      }
    }
  }, [currentGps])

  const [query, setQuery]           = useState('')
  const [results, setResults]       = useState<CourseResult[]>([])
  const [searching, setSearching]   = useState(false)
  const [picked, setPicked]         = useState<CourseResult | null>(null)
  const [courseName, setCourseName] = useState(currentGps?.name ?? '')
  const [courseLat, setCourseLat]   = useState<number | null>(currentGps?.lat ?? null)
  const [courseLng, setCourseLng]   = useState<number | null>(currentGps?.lng ?? null)
  const [manualLat, setManualLat]   = useState('')
  const [manualLng, setManualLng]   = useState('')
  const [showManual, setShowManual] = useState(false)
  const [osmId, setOsmId]           = useState('')
  const [searchingOsmId, setSearchingOsmId] = useState(false)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [nearbyLoading, setNearbyLoading] = useState(false)
  const [holes, setHoles]           = useState<HoleGps[]>(currentGps?.holes?.length ? normalizeFairways(currentGps.holes) : emptyHoles())
  const [editingHole, setEditingHole] = useState(1)
  const [pinMode, setPinMode]       = useState<PinMode>('tee')
  const [saving, setSaving]         = useState(false)
  const [importingOsm, setImportingOsm] = useState(false)
  const [tracingAi,    setTracingAi]    = useState(false)
  const [drawType,   setDrawType]   = useState<DrawType | null>(null)
  const [draftPts,   setDraftPts]   = useState<LatLng[]>([])
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)
  const [viewState, setViewState]   = useState({
    longitude: currentGps?.lng ?? -79.0,
    latitude:  currentGps?.lat ?? 43.85,
    zoom:      currentGps?.lat ? 16 : 4,
  })

  // ── Nominatim fetch ──────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nominatimFetch = async (params: Record<string, string>): Promise<any[]> => {
    const qs = new URLSearchParams({ format: 'json', limit: '20', extratags: '1', addressdetails: '1', ...params })
    const url = `https://nominatim.openstreetmap.org/search?${qs}`
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 10000)
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'ChubbsInvitational/1.0' },
        signal: ctrl.signal,
      })
      clearTimeout(timer)
      if (!res.ok) return []
      return res.json()
    } catch {
      clearTimeout(timer)
      return []
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromNominatim = (r: any, userLat?: number, userLng?: number): CourseResult | null => {
    const tags = r.extratags ?? {}
    const isGolf = tags.leisure === 'golf_course'
      || tags.amenity === 'golf_course'
      || (r.class === 'leisure' && r.type === 'golf_course')
    if (!isGolf) return null
    const lat = parseFloat(r.lat)
    const lng = parseFloat(r.lon)
    const parts = (r.display_name as string).split(',')
    return {
      id: r.place_id,
      name: parts[0].trim(),
      lat, lng,
      address: parts.slice(1, 4).join(',').trim(),
      distanceKm: userLat !== undefined && userLng !== undefined
        ? kmBetween(userLat, userLng, lat, lng) : undefined,
      bounds: r.boundingbox ? {
        minLat: parseFloat(r.boundingbox[0]), maxLat: parseFloat(r.boundingbox[1]),
        minLon: parseFloat(r.boundingbox[2]), maxLon: parseFloat(r.boundingbox[3]),
      } : undefined,
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromOverpassEl = (el: any, userLat?: number, userLng?: number): CourseResult | null => {
    const lat = el.type === 'node' ? el.lat : (el.center?.lat ?? null)
    const lng = el.type === 'node' ? el.lon : (el.center?.lon ?? null)
    if (lat == null || lng == null) return null
    const name = el.tags?.name || 'Unnamed Golf Course'
    return {
      id: el.id,
      name,
      lat, lng,
      address: [el.tags?.['addr:city'], el.tags?.['addr:state']].filter(Boolean).join(', '),
      distanceKm: userLat !== undefined && userLng !== undefined
        ? kmBetween(userLat, userLng, lat, lng) : undefined,
    }
  }

  // ── Load existing courses from DB ────────────────────────────────────────
  useEffect(() => {
    if (currentGps) return
    supabase.from('course_gps').select('id, name, lat, lng').order('created_at', { ascending: false })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data }: { data: any }) => { if (data?.length) setExistingCourses(data) })
  }, [currentGps])

  // ── Get user location + auto-load nearby golf courses ───────────────────
  useEffect(() => {
    if (!navigator.geolocation || currentGps) return
    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude: lat, longitude: lng } = pos.coords
      setUserLocation({ lat, lng })
      setViewState({ longitude: lng, latitude: lat, zoom: 11 })
      setNearbyLoading(true)
      try {
        // No ["name"] filter — so unnamed courses on OSM still appear
        const q = `[out:json][timeout:8];(
          way["leisure"="golf_course"](around:25000,${lat},${lng});
          relation["leisure"="golf_course"](around:25000,${lat},${lng});
        );out center 20;`
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = await overpassQuery(q, 9000) as any
        const mapped = (data.elements as any[])
          .map(el => fromOverpassEl(el, lat, lng))
          .filter((r): r is CourseResult => r !== null)
          .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999))
        setResults(mapped)
      } catch {
        try {
          const delta = 0.45
          const viewbox = `${lng - delta},${lat + delta},${lng + delta},${lat - delta}`
          const data = await nominatimFetch({ q: 'golf course', viewbox, bounded: '1' })
          const mapped = data
            .map(r => fromNominatim(r, lat, lng))
            .filter((r): r is CourseResult => r !== null)
            .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999))
          setResults(mapped)
        } catch { /* silent */ }
      }
      setNearbyLoading(false)
    }, () => { setNearbyLoading(false) }, { timeout: 8000 })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Course name search: Nominatim + Overpass in parallel ─────────────────
  const searchCourse = async () => {
    if (!query.trim()) return
    setSearching(true)
    setResults([])
    try {
      const q = query.trim()
      const safe = q.replace(/[[\](){}.*+?^$|\\]/g, '\\$&')
      const area = userLocation
        ? `(around:150000,${userLocation.lat},${userLocation.lng})`
        : ''

      // Always search with "golf course" suffix in parallel for courses like
      // "Watson's Glen" whose full OSM name is "Watson's Glen Golf Course"
      const hasGolfTerm = /golf|club|links|course/i.test(q)
      const nomQueries = hasGolfTerm ? [q] : [q, `${q} golf course`, `${q} golf club`]

      const [ovpResult, ...nomResults] = await Promise.allSettled([
        (overpassQuery(
          `[out:json][timeout:8];(` +
          `way["leisure"="golf_course"]["name"~"${safe}",i]${area};` +
          `relation["leisure"="golf_course"]["name"~"${safe}",i]${area};` +
          `);out center 15;`,
          9000
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as Promise<any>).then(data =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (data.elements as any[])
            .map(el => fromOverpassEl(el, userLocation?.lat, userLocation?.lng))
            .filter((r): r is CourseResult => r !== null)
        ),
        ...nomQueries.map(nq =>
          nominatimFetch({ q: nq }).then(data =>
            data
              .map(r => fromNominatim(r, userLocation?.lat, userLocation?.lng))
              .filter((r): r is CourseResult => r !== null)
          )
        ),
      ])

      const fromOvp = ovpResult.status === 'fulfilled' ? ovpResult.value : []
      const fromNom = nomResults.flatMap(r => r.status === 'fulfilled' ? r.value : [])

      const all = [...fromOvp, ...fromNom]
      const seen: CourseResult[] = []
      for (const r of all) {
        if (!seen.some(s => kmBetween(s.lat, s.lng, r.lat, r.lng) < 0.5)) seen.push(r)
      }

      seen.sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999))
      setResults(seen)
      if (!seen.length) showToast("No golf courses found — try typing the full name (e.g. \"Watson's Glen Golf Course\") or enter coordinates manually", 'error')
    } catch {
      showToast('Search failed — check your connection', 'error')
    }
    setSearching(false)
  }

  const linkExisting = async (c: { id: string; name: string; lat: number | null; lng: number | null }) => {
    if (!tournamentId) return
    await supabase.from('tournaments').update({ course_gps_id: c.id }).eq('id', tournamentId)
    const { data: gpsRow } = await supabase.from('course_gps').select('*').eq('id', c.id).single()
    if (gpsRow) onSaved(gpsRow as CourseGps)
  }

  const selectResult = async (r: CourseResult) => {
    setPicked(r)
    setCourseName(r.name)
    setCourseLat(r.lat)
    setCourseLng(r.lng)
    setResults([])
    setViewState({ longitude: r.lng, latitude: r.lat, zoom: 16 })
    mapRef.current?.flyTo({ center: [r.lng, r.lat], zoom: 16, duration: 900 })
    setGpsSubTab('setup')

    // Immediately persist the course selection so it survives a refresh.
    // Holes are empty at this point — the user fills them in and hits Save later.
    if (!tournamentId) return
    try {
      const { data: gpsRow } = await supabase
        .from('course_gps')
        .insert({ name: r.name, lat: r.lat, lng: r.lng, holes: [] })
        .select()
        .single()
      if (gpsRow) {
        await supabase.from('tournaments').update({ course_gps_id: gpsRow.id }).eq('id', tournamentId)
        onSaved(gpsRow as CourseGps)
      }
    } catch { /* non-fatal — user can still place pins and Save manually */ }
  }

  const searchByOsmId = async () => {
    const id = osmId.trim().replace(/\D/g, '')
    if (!id) { showToast('Enter an OSM Way or Relation ID', 'error'); return }
    setSearchingOsmId(true)
    try {
      let name = 'Unnamed Golf Course', lat: number | null = null, lng: number | null = null

      // Use /full endpoint — returns the element + all member nodes with coordinates
      for (const type of ['way', 'relation']) {
        try {
          const res = await fetch(`https://api.openstreetmap.org/api/0.6/${type}/${id}/full.json`)
          if (!res.ok) continue
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const json = await res.json() as any
          const els: any[] = json?.elements ?? []
          if (!els.length) continue

          const root = els.find((e: any) => e.type === type && e.id === parseInt(id))
          name = root?.tags?.name || 'Unnamed Golf Course'

          // Average all node coordinates for the center
          const nodes = els.filter((e: any) => e.type === 'node' && e.lat != null)
          if (nodes.length) {
            lat = nodes.reduce((s: number, n: any) => s + n.lat, 0) / nodes.length
            lng = nodes.reduce((s: number, n: any) => s + n.lon, 0) / nodes.length
          }
          break
        } catch { continue }
      }

      if (lat == null || lng == null) {
        showToast('OSM ID not found — double-check the number from openstreetmap.org', 'error')
        setSearchingOsmId(false)
        return
      }
      await selectResult({ id: parseInt(id), name, lat, lng })
    } catch {
      showToast('Lookup failed — check your connection', 'error')
    }
    setSearchingOsmId(false)
  }

  const applyManualCoords = () => {
    const lat = parseFloat(manualLat)
    const lng = parseFloat(manualLng)
    if (isNaN(lat) || isNaN(lng)) { showToast('Enter valid latitude and longitude', 'error'); return }
    const r: CourseResult = { id: Date.now(), name: query || 'My Course', lat, lng }
    selectResult(r)
    setShowManual(false)
  }

  // ── OSM auto-import ──────────────────────────────────────────────────────
  const importFromOsm = async () => {
    const lat = courseLat ?? currentGps?.lat
    const lng = courseLng ?? currentGps?.lng
    if (lat == null || lng == null) { showToast('No course location — select a course first', 'error'); return }
    setImportingOsm(true)
    try {
      const b = (picked as CourseResult | null)?.bounds
      const bboxObj = b
        ? { minLat: b.minLat, minLon: b.minLon, maxLat: b.maxLat, maxLon: b.maxLon }
        : { minLat: lat - 0.03, minLon: lng - 0.05, maxLat: lat + 0.03, maxLon: lng + 0.05 }
      const bboxStr = `${bboxObj.minLat},${bboxObj.minLon},${bboxObj.maxLat},${bboxObj.maxLon}`

      // Two-part query: centroids for green/tee shapes, full geometry for everything else
      const q = `[out:json][timeout:25];(way[golf=green](${bboxStr});way[golf=tee](${bboxStr}););out center;(way[golf=fairway](${bboxStr});way[golf=hole](${bboxStr});way[golf=bunker](${bboxStr});way[golf=water_hazard](${bboxStr});way[golf=lateral_water_hazard](${bboxStr}););out geom;`

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any
      try {
        data = await overpassQuery(q, 30000, bboxObj)
      } catch (overpassErr) {
        // Overpass completely unreachable — fall back to direct OSM API (no Overpass dependency)
        if ((overpassErr as Error).message !== 'overpass-unavailable') throw overpassErr
        data = await fetchOsmApiDirect(bboxObj)
      }

      const elements = (data?.elements ?? []) as Array<{
        tags: Record<string, string>
        center?: { lat: number; lon: number }
        geometry?: { lat: number; lon: number }[]
      }>

      if (!elements.length) {
        showToast('No OSM hole data found for this course — place pins manually', 'error')
        setImportingOsm(false)
        return
      }

      // Build hole anchors from golf=hole routing ways (full geometry — first node=tee, last=green)
      const holeAnchors: Array<{ ref: number; midLat: number; midLon: number }> = []
      // Also store every node along each routing way — used for tighter fairway/hazard matching
      const holeRoutePts: Record<string, { lat: number; lon: number }[]> = {}
      for (const el of elements) {
        if (el.tags?.golf !== 'hole' || !el.geometry || el.geometry.length < 2) continue
        const num = parseInt(el.tags?.ref ?? '0')
        if (num < 1 || num > 18) continue
        const teeG   = el.geometry[0]
        const greenG = el.geometry[el.geometry.length - 1]
        holeAnchors.push({ ref: num, midLat: (teeG.lat + greenG.lat) / 2, midLon: (teeG.lon + greenG.lon) / 2 })
        holeRoutePts[String(num)] = el.geometry
      }

      // Auto-chain unnumbered golf=hole ways when no ref tags exist
      if (holeAnchors.length === 0) {
        const unrefed = elements.filter(el =>
          el.tags?.golf === 'hole' && el.geometry && el.geometry.length >= 2
        )
        if (unrefed.length > 0) {
          // Sort into a chain: each hole's last point (green) → nearest next tee
          const remaining = [...unrefed]
          const chain: typeof remaining = []
          // Start with the hole whose tee is farthest from any other hole's green (most isolated ≈ hole 1)
          let startIdx = 0, maxMinDist = 0
          for (let i = 0; i < remaining.length; i++) {
            const tee = remaining[i].geometry![0]
            let minDist = Infinity
            for (let j = 0; j < remaining.length; j++) {
              if (i === j) continue
              const g = remaining[j].geometry![remaining[j].geometry!.length - 1]
              const d = (tee.lat - g.lat) ** 2 + (tee.lon - g.lon) ** 2
              if (d < minDist) minDist = d
            }
            if (minDist > maxMinDist) { maxMinDist = minDist; startIdx = i }
          }
          chain.push(remaining.splice(startIdx, 1)[0])
          while (remaining.length > 0) {
            const last = chain[chain.length - 1]
            const lastGreen = last.geometry![last.geometry!.length - 1]
            let bestIdx = 0, bestDist = Infinity
            for (let i = 0; i < remaining.length; i++) {
              const tee = remaining[i].geometry![0]
              const d = (lastGreen.lat - tee.lat) ** 2 + (lastGreen.lon - tee.lon) ** 2
              if (d < bestDist) { bestDist = d; bestIdx = i }
            }
            chain.push(remaining.splice(bestIdx, 1)[0])
          }
          chain.forEach((el, idx) => {
            const ref = idx + 1
            const geo = el.geometry!
            holeAnchors.push({ ref, midLat: (geo[0].lat + geo[geo.length - 1].lat) / 2, midLon: (geo[0].lon + geo[geo.length - 1].lon) / 2 })
            holeRoutePts[String(ref)] = geo
          })
        }
      }

      const newHoles = emptyHoles()

      // Seed tee+green from routing way endpoints when anchors were auto-chained
      for (const anchor of holeAnchors) {
        const pts = holeRoutePts[String(anchor.ref)]
        if (!pts || pts.length < 2) continue
        if (!newHoles[anchor.ref - 1].tee)
          newHoles[anchor.ref - 1].tee = { lat: pts[0].lat, lng: pts[0].lon }
        if (!newHoles[anchor.ref - 1].green.center)
          newHoles[anchor.ref - 1].green.center = { lat: pts[pts.length - 1].lat, lng: pts[pts.length - 1].lon }
      }

      // Greens and tees — use ref tag if present, otherwise proximity-match to nearest anchor
      for (const el of elements) {
        if (!el.center) continue
        const c: LatLng = { lat: el.center.lat, lng: el.center.lon }
        const golf = el.tags?.golf
        if (golf !== 'green' && golf !== 'tee') continue
        let num = parseInt(el.tags?.ref ?? '0')
        if ((num < 1 || num > 18) && holeAnchors.length > 0) {
          let bestD = Infinity
          for (const anchor of holeAnchors) {
            const d = (c.lat - anchor.midLat) ** 2 + (c.lng - anchor.midLon) ** 2
            if (d < bestD) { bestD = d; num = anchor.ref }
          }
          if (bestD > 0.004 * 0.004) num = 0 // ~440m — reject if too far
        }
        if (num < 1 || num > 18) continue
        if (golf === 'green') newHoles[num - 1].green.center = c
        else if (golf === 'tee') newHoles[num - 1].tee = c
      }

      // Fairways — have full geometry polygon
      const MAX_FAIRWAY_D2 = 0.007 * 0.007  // ~770m max match distance
      const routeEntries = Object.entries(holeRoutePts)
      for (const el of elements) {
        if (el.tags?.golf !== 'fairway' || !el.geometry || el.geometry.length < 3) continue
        let holeNum = parseInt(el.tags?.ref ?? '0')
        if (holeNum < 1 || holeNum > 18) {
          const centLat = el.geometry.reduce((s, p) => s + p.lat, 0) / el.geometry.length
          const centLon = el.geometry.reduce((s, p) => s + p.lon, 0) / el.geometry.length
          let bestD = Infinity
          if (routeEntries.length > 0) {
            // Match to nearest point on the full hole routing line — much more accurate than
            // midpoint matching, which breaks when courses loop back near other holes' tees
            for (const [refStr, pts] of routeEntries) {
              const ref = parseInt(refStr)
              for (const pt of pts) {
                const d = (centLat - pt.lat) ** 2 + (centLon - pt.lon) ** 2
                if (d < bestD) { bestD = d; holeNum = ref }
              }
            }
          } else {
            // Fall back to midpoints when no route geometry is available
            const sources = holeAnchors.length > 0 ? holeAnchors :
              newHoles.filter(h => h.green.center && h.tee).map(h => ({
                ref: h.hole,
                midLat: (h.green.center!.lat + h.tee!.lat) / 2,
                midLon: (h.green.center!.lng + h.tee!.lng) / 2,
              }))
            for (const src of sources) {
              const d = (centLat - src.midLat) ** 2 + (centLon - src.midLon) ** 2
              if (d < bestD) { bestD = d; holeNum = src.ref }
            }
          }
          if (bestD > MAX_FAIRWAY_D2) holeNum = 0
        }
        if (holeNum >= 1 && holeNum <= 18)
          newHoles[holeNum - 1].fairway = [...(newHoles[holeNum - 1].fairway ?? []), el.geometry.map(p => ({ lat: p.lat, lng: p.lon }))]
      }

      // Bunkers and water hazards — full geometry, multiple per hole
      const MAX_HAZARD_D2 = 0.006 * 0.006  // ~660m
      const matchHazard = (el: typeof elements[0]): number => {
        if (!el.geometry || el.geometry.length < 3) return 0
        let holeNum = parseInt(el.tags?.ref ?? '0')
        if (holeNum >= 1 && holeNum <= 18) return holeNum
        const centLat = el.geometry.reduce((s, p) => s + p.lat, 0) / el.geometry.length
        const centLon = el.geometry.reduce((s, p) => s + p.lon, 0) / el.geometry.length
        let bestD = Infinity
        if (routeEntries.length > 0) {
          for (const [refStr, pts] of routeEntries) {
            const ref = parseInt(refStr)
            for (const pt of pts) {
              const d = (centLat - pt.lat) ** 2 + (centLon - pt.lon) ** 2
              if (d < bestD) { bestD = d; holeNum = ref }
            }
          }
        } else {
          const sources = holeAnchors.length > 0 ? holeAnchors :
            newHoles.filter(h => h.green.center && h.tee).map(h => ({
              ref: h.hole,
              midLat: (h.green.center!.lat + h.tee!.lat) / 2,
              midLon: (h.green.center!.lng + h.tee!.lng) / 2,
            }))
          for (const src of sources) {
            const d = (centLat - src.midLat) ** 2 + (centLon - src.midLon) ** 2
            if (d < bestD) { bestD = d; holeNum = src.ref }
          }
        }
        return bestD < MAX_HAZARD_D2 ? holeNum : 0
      }
      for (const el of elements) {
        if (el.tags?.golf !== 'bunker' || !el.geometry) continue
        const n = matchHazard(el)
        if (!n) continue
        const poly = el.geometry.map(p => ({ lat: p.lat, lng: p.lon }))
        if (!newHoles[n - 1].bunkers) newHoles[n - 1].bunkers = []
        newHoles[n - 1].bunkers!.push(poly)
      }
      for (const el of elements) {
        if (!['water_hazard', 'lateral_water_hazard'].includes(el.tags?.golf ?? '') || !el.geometry) continue
        const n = matchHazard(el)
        if (!n) continue
        const poly = el.geometry.map(p => ({ lat: p.lat, lng: p.lon }))
        if (!newHoles[n - 1].water) newHoles[n - 1].water = []
        newHoles[n - 1].water!.push(poly)
      }

      // Auto-calculate front/back from the tee→green bearing when both are known
      for (const h of newHoles) {
        if (h.tee && h.green.center && !h.green.front && !h.green.back) {
          const bearing = calcBearing(h.tee, h.green.center)
          h.green.front = offsetLatLng(h.green.center, bearing + 180, 5)
          h.green.back  = offsetLatLng(h.green.center, bearing,       5)
        }
      }

      const greensFound   = newHoles.filter(h => h.green.center).length
      const teesFound     = newHoles.filter(h => h.tee).length
      const fairwaysFound = newHoles.filter(h => h.fairway).length
      const bunkersFound  = newHoles.reduce((s, h) => s + (h.bunkers?.length ?? 0), 0)
      const waterFound    = newHoles.reduce((s, h) => s + (h.water?.length ?? 0), 0)
      if (greensFound === 0) {
        // OSM has the shapes but no hole numbers — can't reliably assign
        const hasShapes = elements.length > 0
        showToast(
          hasShapes
            ? `OSM has ${elements.length} golf feature${elements.length !== 1 ? 's' : ''} but no hole numbers (ref tags missing) — place pins manually`
            : 'No golf feature data found in OpenStreetMap for this course — place pins manually',
          'error'
        )
        setImportingOsm(false)
        return
      }
      const autoChained = holeAnchors.length > 0 && !elements.some(el => el.tags?.golf === 'hole' && parseInt(el.tags?.ref ?? '0') >= 1)
      setHoles(newHoles)
      showToast(
        `OSM: ${greensFound}G ${teesFound}T ${fairwaysFound}FW ${bunkersFound}BNK ${waterFound}H₂O` +
        (autoChained ? ' — no ref tags, holes auto-numbered spatially, verify order!' : greensFound < 18 ? ' — set missing holes manually' : '')
      )
    } catch (err) {
      console.error('OSM import error:', err)
      showToast(`OSM import failed — ${(err as Error).message ?? 'check connection'}`, 'error')
    }
    setImportingOsm(false)
  }

  const traceWithAi = async () => {
    const h = holes.find(x => x.hole === editingHole)
    if (!h?.tee || !h.green.center) {
      showToast('Set tee and green center pins first, then AI trace', 'error'); return
    }
    setTracingAi(true)
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/trace-hole-ai`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ tee: h.tee, green: h.green.center, mapboxToken: TOKEN }),
        }
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as {
        fairway:     LatLng[]
        bunkers:     LatLng[][]
        water:       LatLng[][]
        avoidZones:  LatLng[][]
        green: { front: LatLng | null; center: LatLng | null; back: LatLng | null }
        landingZone: LatLng | null
        tip:         string | null
      }
      setHoles(prev => prev.map(hole => hole.hole !== editingHole ? hole : {
        ...hole,
        fairway:     data.fairway?.length     ? [...(hole.fairway ?? []), data.fairway] : hole.fairway,
        bunkers:     data.bunkers?.length     ? data.bunkers     : hole.bunkers,
        water:       data.water?.length       ? data.water       : hole.water,
        avoidZones:  data.avoidZones?.length  ? data.avoidZones  : hole.avoidZones,
        green: {
          front:  data.green?.front  ?? hole.green.front,
          center: data.green?.center ?? hole.green.center,
          back:   data.green?.back   ?? hole.green.back,
        },
        landingZone: data.landingZone ?? hole.landingZone,
        tip:         data.tip         ?? hole.tip,
      }))
      const g = data.green
      const greenSet = [g?.front, g?.center, g?.back].filter(Boolean).length
      const extras = [data.landingZone && 'LZ', data.tip && 'tip'].filter(Boolean).join(' ')
      showToast(`AI traced hole ${editingHole}: fairway, ${data.bunkers?.length ?? 0} bnk, ${data.water?.length ?? 0} H₂O, ${greenSet}/3 pins${extras ? ' · ' + extras : ''}`)
    } catch (err) {
      showToast(`AI trace failed — ${(err as Error).message}`, 'error')
    }
    setTracingAi(false)
  }

  // ── Draw helpers ─────────────────────────────────────────────────────────
  const startDraw = (type: DrawType) => { setEditTarget(null); setDrawType(type); setDraftPts([]) }
  const cancelDraw = () => { setDrawType(null); setDraftPts([]) }

  const closeDraftPoly = () => {
    if (draftPts.length < 3) { showToast('Draw at least 3 points first', 'error'); return }
    const poly = [...draftPts]
    setHoles(prev => prev.map(h => {
      if (h.hole !== editingHole) return h
      if (drawType === 'fairway') return { ...h, fairway: [...(h.fairway ?? []), poly] }
      if (drawType === 'bunker')  return { ...h, bunkers: [...(h.bunkers ?? []), poly] }
      if (drawType === 'water')   return { ...h, water:   [...(h.water   ?? []), poly] }
      return h
    }))
    setDrawType(null); setDraftPts([])
  }

  const startEdit = (type: DrawType, index: number) => { setDrawType(null); setDraftPts([]); setEditTarget({ type, index }) }
  const cancelEdit = () => setEditTarget(null)

  const deleteEditTarget = () => {
    if (!editTarget) return
    setHoles(prev => prev.map(h => {
      if (h.hole !== editingHole) return h
      if (editTarget.type === 'fairway') return { ...h, fairway: (h.fairway ?? []).filter((_, i) => i !== editTarget.index) }
      if (editTarget.type === 'bunker')  return { ...h, bunkers: (h.bunkers ?? []).filter((_, i) => i !== editTarget.index) }
      return { ...h, water: (h.water ?? []).filter((_, i) => i !== editTarget.index) }
    }))
    setEditTarget(null)
  }

  const updateVertex = useCallback((vi: number, latlng: LatLng) => {
    if (!editTarget) return
    setHoles(prev => prev.map(h => {
      if (h.hole !== editingHole) return h
      const upd = (poly: LatLng[]) => poly.map((p, j) => j !== vi ? p : latlng)
      if (editTarget.type === 'fairway') return { ...h, fairway: (h.fairway ?? []).map((poly, i) => i !== editTarget.index ? poly : upd(poly)) }
      if (editTarget.type === 'bunker')  return { ...h, bunkers: (h.bunkers ?? []).map((poly, i) => i !== editTarget.index ? poly : upd(poly)) }
      return { ...h, water: (h.water ?? []).map((poly, i) => i !== editTarget.index ? poly : upd(poly)) }
    }))
  }, [editTarget, editingHole])

  const clearLayer = (type: DrawType) => {
    setHoles(prev => prev.map(h => {
      if (h.hole !== editingHole) return h
      if (type === 'fairway') return { ...h, fairway: null }
      if (type === 'bunker')  return { ...h, bunkers: [] }
      return { ...h, water: [] }
    }))
    if (editTarget?.type === type) setEditTarget(null)
  }

  const setHolePar = (hole: number, par: number) => {
    setHoles(prev => prev.map(h => h.hole === hole ? { ...h, par } : h))
  }

  // Mark a hole as a contest hole (Closest to Pin / Longest Drive), or clear it.
  // A course has at most one CTP and one LD hole active at a time is NOT enforced
  // here — admins can mark several par-3s as CTP if they run it on multiple holes.
  const setHoleContest = (hole: number, contest: 'ctp' | 'ld' | null) => {
    setHoles(prev => prev.map(h => h.hole === hole ? { ...h, contest } : h))
  }

  // ── Map click → place pin, then auto-advance ─────────────────────────────
  const handleMapClick = useCallback((e: MapMouseEvent) => {
    const { lat, lng } = e.lngLat
    if (drawType) { setDraftPts(prev => [...prev, { lat, lng }]); return }
    if (editTarget) return
    setHoles(prev => prev.map(h => {
      if (h.hole !== editingHole) return h
      switch (pinMode) {
        case 'tee':     return { ...h, tee: { lat, lng } }
        case 'front':   return { ...h, green: { ...h.green, front:  { lat, lng } } }
        case 'center':  return { ...h, green: { ...h.green, center: { lat, lng } } }
        case 'back':    return { ...h, green: { ...h.green, back:   { lat, lng } } }
        case 'landing': return { ...h, landingZone: { lat, lng } }
      }
    }))
    const idx = MODES.indexOf(pinMode)
    if (idx !== -1 && idx < MODES.length - 1) setPinMode(MODES[idx + 1])
  }, [editingHole, pinMode, drawType, editTarget])

  const jumpToHole = (h: HoleGps) => {
    setEditingHole(h.hole)
    setPinMode('tee')
    const target = h.tee ?? h.green.center
    if (target) {
      mapRef.current?.flyTo({ center: [target.lng, target.lat], zoom: 18, duration: 500 })
    } else {
      const nearest = holes
        .filter(n => n.hole !== h.hole && (n.green.center ?? n.tee))
        .sort((a, b) => Math.abs(a.hole - h.hole) - Math.abs(b.hole - h.hole))[0]
      const ref = nearest?.green.center ?? nearest?.tee
      if (ref) mapRef.current?.flyTo({ center: [ref.lng, ref.lat], zoom: 16, duration: 500 })
    }
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  const save = async () => {
    if (!tournamentId || !courseName) { showToast('Enter a course name', 'error'); return }
    setSaving(true)

    const payload = { name: courseName, lat: courseLat, lng: courseLng, holes,
      ...(currentGps?.id ? { id: currentGps.id } : {}),
    }

    const { data: gpsRow, error } = await supabase
      .from('course_gps')
      .upsert(payload)
      .select()
      .single()

    if (error || !gpsRow) {
      showToast(error?.message ?? 'Save failed', 'error')
      setSaving(false)
      return
    }

    await supabase.from('tournaments').update({ course_gps_id: gpsRow.id }).eq('id', tournamentId)

    setSaving(false)
    showToast('GPS course saved!')
    onSaved(gpsRow as CourseGps)
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const currentH = holes.find(h => h.hole === editingHole)
  const pinsSet  = holes.filter(h => h.green.center).length
  const mapReady = courseLat !== null && courseLng !== null

  // Corridor polygon for the currently-editing hole
  const corridorGeoJson = useMemo(() => {
    const fairways = (currentH?.fairway ?? []).filter(p => p.length >= 3)
    if (fairways.length > 0) {
      return { type: 'FeatureCollection' as const,
        features: fairways.map((poly, i) => {
          const coords = poly.map(p => [p.lng, p.lat] as [number, number])
          return { type: 'Feature' as const, id: i,
            geometry: { type: 'Polygon' as const, coordinates: [[...coords, coords[0]]] }, properties: {} }
        }) }
    }
    const tee = currentH?.tee, green = currentH?.green.center
    if (!tee || !green) return null
    const bearing = calcBearing(tee, green)
    return { type: 'FeatureCollection' as const,
      features: [{ type: 'Feature' as const,
        geometry: { type: 'Polygon' as const, coordinates: [buildCorridor(tee, green, bearing)] }, properties: {} }] }
  }, [currentH])

  // GeoJSON for all bunkers across all holes (admin map overview)
  const allBunkersGeoJson = useMemo(() => {
    const features = holes.flatMap(h =>
      (h.bunkers ?? []).map((poly, i) => ({
        type: 'Feature' as const, id: `${h.hole}-b${i}`,
        geometry: { type: 'Polygon' as const, coordinates: [[...poly.map(p => [p.lng, p.lat] as [number, number]), [poly[0].lng, poly[0].lat]]] },
        properties: {},
      }))
    )
    return features.length ? { type: 'FeatureCollection' as const, features } : null
  }, [holes])

  const allWaterGeoJson = useMemo(() => {
    const features = holes.flatMap(h =>
      (h.water ?? []).map((poly, i) => ({
        type: 'Feature' as const, id: `${h.hole}-w${i}`,
        geometry: { type: 'Polygon' as const, coordinates: [[...poly.map(p => [p.lng, p.lat] as [number, number]), [poly[0].lng, poly[0].lat]]] },
        properties: {},
      }))
    )
    return features.length ? { type: 'FeatureCollection' as const, features } : null
  }, [holes])

  const draftGeoJson = useMemo(() => {
    if (!drawType || draftPts.length < 2) return null
    if (draftPts.length >= 3) {
      const coords = [...draftPts.map(p => [p.lng, p.lat] as [number, number]), [draftPts[0].lng, draftPts[0].lat]]
      return { type: 'Feature' as const, geometry: { type: 'Polygon' as const, coordinates: [coords] }, properties: {} }
    }
    return { type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: draftPts.map(p => [p.lng, p.lat] as [number, number]) }, properties: {} }
  }, [drawType, draftPts])

  const editTargetGeoJson = useMemo(() => {
    if (!editTarget) return null
    const h = holes.find(x => x.hole === editingHole)
    let poly: LatLng[] | undefined
    if (editTarget.type === 'fairway') poly = h?.fairway?.[editTarget.index]
    else if (editTarget.type === 'bunker') poly = h?.bunkers?.[editTarget.index]
    else poly = h?.water?.[editTarget.index]
    if (!poly || poly.length < 3) return null
    const coords = [...poly.map(p => [p.lng, p.lat] as [number, number]), [poly[0].lng, poly[0].lat]]
    return { type: 'Feature' as const, geometry: { type: 'Polygon' as const, coordinates: [coords] }, properties: {} }
  }, [editTarget, holes, editingHole])

  const editVertices = useMemo(() => {
    if (!editTarget) return []
    const h = holes.find(x => x.hole === editingHole)
    if (editTarget.type === 'fairway') return h?.fairway?.[editTarget.index] ?? []
    if (editTarget.type === 'bunker') return h?.bunkers?.[editTarget.index] ?? []
    return h?.water?.[editTarget.index] ?? []
  }, [editTarget, holes, editingHole])

  // ── No token ──────────────────────────────────────────────────────────────
  if (!TOKEN) return (
    <div className="glass" style={{ padding: 20 }}>
      <p style={{ color: 'var(--tx3)', fontSize: 13 }}>
        Add <code style={{ color: '#D4A53A' }}>VITE_MAPBOX_TOKEN</code> to your{' '}
        <code style={{ color: '#D4A53A' }}>.env.local</code> file to enable GPS course setup.
      </p>
    </div>
  )

  const isLocked = currentGps !== null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Sub-tab strip ── */}
      <div style={{ display: 'flex', gap: 6 }}>
        {([
          { id: 'selection' as const, label: 'Course Selection' },
          { id: 'setup'     as const, label: 'Course Setup' },
          { id: 'pars'      as const, label: 'Pars' },
        ]).map(({ id, label }) => {
          const active = gpsSubTab === id
          return (
            <button key={id} onClick={() => setGpsSubTab(id)} style={{
              padding: '8px 18px', borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              background: active ? 'rgba(212,165,58,0.15)' : 'var(--surf2)',
              border: `1px solid ${active ? 'rgba(212,165,58,0.4)' : 'var(--bdr)'}`,
              color: active ? '#D4A53A' : 'var(--tx2)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {id === 'selection' && isLocked && <Lock size={11} />}
              {id === 'setup' && mapReady && <MapPin size={11} />}
              {label}
            </button>
          )
        })}
      </div>

      {/* ── Course Selection Tab ── */}
      {gpsSubTab === 'selection' && (
        <div className="glass" style={{ padding: '16px 20px' }}>
          {isLocked ? (
            /* Locked state — course is committed to this tournament */
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <Lock size={16} color="#D4A53A" />
                <span style={{ fontFamily: 'Bebas Neue', fontSize: 22, color: '#D4A53A', letterSpacing: 2 }}>
                  {currentGps.name}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: '#4ade80', fontWeight: 600 }}>
                  ✓ {currentGps.holes?.filter(h => h.green?.center).length ?? 0}/18 greens set
                </span>
                {currentGps.lat && (
                  <span style={{ fontSize: 12, color: 'var(--tx4)' }}>
                    · {currentGps.lat.toFixed(4)}, {currentGps.lng?.toFixed(4)}
                  </span>
                )}
              </div>
              <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(212,165,58,0.06)', border: '1px solid rgba(212,165,58,0.2)' }}>
                <div style={{ fontSize: 12, color: 'var(--tx3)', lineHeight: 1.6 }}>
                  <strong style={{ color: '#D4A53A' }}>Course is locked</strong> to this tournament.
                  To switch courses, click <strong style={{ color: 'var(--tx2)' }}>Reset GPS Course</strong> in the
                  Tournament tab → Current Tournament Actions.
                </div>
              </div>
            </div>
          ) : (
            /* Unlocked state — search and select a course */
            <>
              {/* Existing courses already in the database */}
              {existingCourses.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: 'var(--tx3)', textTransform: 'uppercase', marginBottom: 8 }}>
                    Already in database
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {existingCourses.map(c => (
                      <button key={c.id} onClick={() => linkExisting(c)} style={{
                        padding: '9px 12px', borderRadius: 9, textAlign: 'left', width: '100%',
                        background: 'rgba(212,165,58,0.07)', border: '1px solid rgba(212,165,58,0.2)',
                        cursor: 'pointer', color: 'var(--tx1)', fontSize: 13,
                        display: 'flex', alignItems: 'center', gap: 10,
                      }}>
                        <span style={{ fontSize: 16 }}>📋</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {c.name || 'Unnamed Course'}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 1 }}>Tap to link to this tournament</div>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div style={{ height: 1, background: 'var(--bdr)', margin: '16px 0' }} />
                </div>
              )}

              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: 'var(--tx3)', textTransform: 'uppercase', marginBottom: 12 }}>
                Find Course
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchCourse()}
                  placeholder="e.g. Royal Ashburn Golf Club"
                  style={{
                    flex: 1, padding: '10px 14px', borderRadius: 10,
                    background: 'var(--surf2)', border: '1px solid var(--bdr)',
                    color: 'var(--tx1)', fontSize: 14, outline: 'none',
                  }}
                />
                <button onClick={searchCourse} disabled={searching} style={{
                  padding: '10px 14px', borderRadius: 10,
                  background: 'rgba(212,165,58,0.14)', border: '1px solid rgba(212,165,58,0.3)',
                  color: '#D4A53A', cursor: 'pointer', display: 'flex', alignItems: 'center',
                }}>
                  <Search size={17} />
                </button>
              </div>

              {nearbyLoading && (
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="animate-spin" style={{ width: 14, height: 14, border: '2px solid rgba(212,165,58,0.2)', borderTopColor: '#D4A53A', borderRadius: '50%', flexShrink: 0 }} />
                  <span style={{ color: 'var(--tx3)', fontSize: 12 }}>Finding nearby golf courses…</span>
                  <button onClick={() => setNearbyLoading(false)} style={{
                    background: 'none', border: 'none', color: 'var(--tx4)', cursor: 'pointer',
                    fontSize: 11, textDecoration: 'underline', padding: 0,
                  }}>Skip</button>
                </div>
              )}

              {results.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {!query && userLocation && (
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: 'var(--tx4)', textTransform: 'uppercase', padding: '2px 4px' }}>
                      📍 Nearest to you
                    </div>
                  )}
                  {results.map(r => (
                    <button key={r.id} onClick={() => selectResult(r)} style={{
                      padding: '9px 12px', borderRadius: 9, textAlign: 'left', width: '100%',
                      background: 'var(--surf2)', border: '1px solid var(--bdr)',
                      cursor: 'pointer', color: 'var(--tx1)', fontSize: 13,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                        {r.address && <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 1 }}>{r.address}</div>}
                      </div>
                      {r.distanceKm !== undefined && (
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#D4A53A', flexShrink: 0, textAlign: 'right' }}>
                          {r.distanceKm < 1 ? `${Math.round(r.distanceKm * 1000)}m` : `${r.distanceKm} km`}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* OSM ID lookup */}
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 6 }}>
                  Have an OSM Way/Relation ID? (tap the course on openstreetmap.org to find it)
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={osmId}
                    onChange={e => setOsmId(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && searchByOsmId()}
                    placeholder="e.g. 1528332308"
                    style={{ flex: 1, padding: '8px 12px', borderRadius: 8, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--tx1)', fontSize: 13, outline: 'none' }}
                  />
                  <button onClick={searchByOsmId} disabled={searchingOsmId} style={{
                    padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    background: 'rgba(212,165,58,0.14)', border: '1px solid rgba(212,165,58,0.3)', color: '#D4A53A',
                    opacity: searchingOsmId ? 0.6 : 1,
                  }}>
                    {searchingOsmId ? '…' : 'Lookup →'}
                  </button>
                </div>
              </div>

              {/* Manual coordinate fallback */}
              <div style={{ marginTop: 10 }}>
                <button onClick={() => setShowManual(m => !m)} style={{
                  background: 'none', border: 'none', color: 'var(--tx4)', cursor: 'pointer',
                  fontSize: 12, textDecoration: 'underline', padding: 0,
                }}>
                  {showManual ? '▲ Hide' : '▼ Can\'t find your course? Enter coordinates manually'}
                </button>
                {showManual && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 11, color: 'var(--tx3)', lineHeight: 1.5 }}>
                      Open Google Maps, right-click the course → copy the coordinates (e.g. 43.8584, -79.0048)
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input value={manualLat} onChange={e => setManualLat(e.target.value)}
                        placeholder="Latitude (e.g. 43.8584)"
                        style={{ flex: 1, padding: '8px 12px', borderRadius: 8, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--tx1)', fontSize: 13, outline: 'none' }} />
                      <input value={manualLng} onChange={e => setManualLng(e.target.value)}
                        placeholder="Longitude (e.g. -79.0048)"
                        style={{ flex: 1, padding: '8px 12px', borderRadius: 8, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--tx1)', fontSize: 13, outline: 'none' }} />
                    </div>
                    <button onClick={applyManualCoords} style={{
                      padding: '9px 14px', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                      background: 'rgba(212,165,58,0.14)', border: '1px solid rgba(212,165,58,0.3)', color: '#D4A53A',
                    }}>
                      Use These Coordinates →
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Course Setup Tab ── */}
      {gpsSubTab === 'setup' && !mapReady && (
        <div className="glass" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--tx4)' }}>
          <MapPin size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.2 }} />
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No course selected</div>
          <div style={{ fontSize: 13 }}>Search for and select a course in the Course Selection tab first.</div>
        </div>
      )}

      {gpsSubTab === 'setup' && mapReady && (
        <>
          {/* Course name + OSM import */}
          <div className="glass" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              value={courseName}
              onChange={e => setCourseName(e.target.value)}
              placeholder="Course name"
              style={{
                padding: '8px 12px', borderRadius: 8,
                background: 'var(--surf2)', border: '1px solid var(--bdr)',
                color: 'var(--tx1)', fontSize: 13, outline: 'none',
              }}
            />
            {(picked || currentGps) && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={importFromOsm} disabled={importingOsm || tracingAi} style={{
                  flex: 1, padding: '9px 14px', borderRadius: 9, cursor: 'pointer', fontSize: 13,
                  background: 'var(--surf2)', border: '1px solid var(--bdr)',
                  color: 'var(--tx2)', display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <Download size={14} />
                  {importingOsm ? 'Importing…' : 'Import from OpenStreetMap'}
                </button>
                <button onClick={traceWithAi} disabled={tracingAi || importingOsm || !currentH?.tee || !currentH?.green.center} style={{
                  flex: 1, padding: '9px 14px', borderRadius: 9, cursor: 'pointer', fontSize: 13,
                  background: tracingAi ? 'var(--surf2)' : 'linear-gradient(135deg,rgba(99,102,241,0.15),rgba(59,130,246,0.15))',
                  border: '1px solid rgba(99,102,241,0.4)',
                  color: tracingAi ? 'var(--tx3)' : '#818cf8',
                  display: 'flex', alignItems: 'center', gap: 8,
                  opacity: (!currentH?.tee || !currentH?.green.center) ? 0.45 : 1,
                }}>
                  <Wand2 size={14} />
                  {tracingAi ? 'AI Tracing…' : `AI Trace Hole ${editingHole}`}
                </button>
              </div>
            )}
          </div>

          {/* Overlay controls */}
          <div className="glass" style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: 'var(--tx3)', textTransform: 'uppercase', marginBottom: 2 }}>
              Hole {editingHole} Overlays
            </div>
            {(['fairway', 'bunker', 'water'] as DrawType[]).map(type => {
              const color = DRAW_COLORS[type]
              const label = type === 'fairway' ? 'Fairway' : type === 'bunker' ? 'Bunkers' : 'Water'
              const polys: LatLng[][] = type === 'fairway'
                ? (currentH?.fairway ?? [])
                : type === 'bunker' ? (currentH?.bunkers ?? []) : (currentH?.water ?? [])
              return (
                <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <div style={{ width: 8, height: 8, borderRadius: type === 'bunker' ? 2 : '50%', background: color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--tx2)', fontWeight: 600, minWidth: 60 }}>
                    {label}{polys.length > 0 ? ` (${polys.length})` : ''}
                  </span>
                  {polys.map((_, i) => (
                    <button key={i} onClick={() => startEdit(type, i)} style={{
                      padding: '3px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                      background: editTarget?.type === type && editTarget.index === i ? `${color}33` : 'var(--surf2)',
                      border: `1px solid ${editTarget?.type === type && editTarget.index === i ? color : 'var(--bdr)'}`,
                      color: editTarget?.type === type && editTarget.index === i ? color : 'var(--tx3)',
                    }}>
                      {`#${i + 1}`}
                    </button>
                  ))}
                  <button onClick={() => startDraw(type)} disabled={!!(drawType || editTarget)} style={{
                    padding: '3px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                    background: drawType === type ? `${color}20` : 'var(--surf2)',
                    border: `1px dashed ${drawType === type ? color : 'var(--bdr)'}`,
                    color: drawType === type ? color : 'var(--tx3)',
                    opacity: (drawType && drawType !== type) || editTarget ? 0.4 : 1,
                  }}>
                    + Draw
                  </button>
                  {polys.length > 0 && (
                    <button onClick={() => clearLayer(type)} style={{
                      padding: '3px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                      background: 'var(--surf2)', border: '1px solid var(--bdr)', color: '#ef4444',
                    }}>
                      Clear
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {/* Draw / Edit active banner */}
          {(drawType || editTarget) && (
            <div style={{
              padding: '10px 14px', borderRadius: 10,
              background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.35)',
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#818cf8', flexShrink: 0,
                boxShadow: '0 0 6px #818cf8', animation: 'gps-pulse 1.2s ease-in-out infinite' }} />
              {drawType ? (
                <>
                  <span style={{ fontSize: 12, color: '#818cf8', flex: 1 }}>
                    Drawing <strong>{drawType}</strong> — tap map to add points ({draftPts.length} so far)
                  </span>
                  {draftPts.length >= 3 && (
                    <button onClick={closeDraftPoly} style={{
                      padding: '4px 10px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: '#22c55e',
                    }}>✓ Close Shape</button>
                  )}
                  <button onClick={cancelDraw} style={{
                    padding: '4px 10px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
                    background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--tx3)',
                  }}>Cancel</button>
                </>
              ) : editTarget ? (
                <>
                  <span style={{ fontSize: 12, color: '#818cf8', flex: 1 }}>
                    Editing <strong>{editTarget.type}</strong> #{editTarget.index + 1} — drag white handles to adjust
                  </span>
                  <button onClick={deleteEditTarget} style={{
                    padding: '4px 10px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
                    background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#ef4444',
                  }}>Delete</button>
                  <button onClick={cancelEdit} style={{
                    padding: '4px 10px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)', color: '#22c55e',
                  }}>✓ Done</button>
                </>
              ) : null}
            </div>
          )}

          {/* Hole tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => setEditingHole(h => { const nh = Math.max(1, h - 1); jumpToHole(holes.find(x => x.hole === nh)!); return nh })}
              disabled={editingHole === 1}
              style={{ padding: 4, background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', opacity: editingHole === 1 ? 0.3 : 1 }}>
              <ChevronLeft size={18} />
            </button>
            <div style={{ flex: 1, overflowX: 'auto', scrollbarWidth: 'none' }}>
              <div style={{ display: 'flex', gap: 4, paddingBottom: 4 }}>
                {holes.map(h => (
                  <HoleDot key={h.hole} num={h.hole} active={editingHole === h.hole}
                    hasCenter={!!h.green.center} onClick={() => jumpToHole(h)} />
                ))}
              </div>
            </div>
            <button onClick={() => setEditingHole(h => { const nh = Math.min(18, h + 1); jumpToHole(holes.find(x => x.hole === nh)!); return nh })}
              disabled={editingHole === 18}
              style={{ padding: 4, background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', opacity: editingHole === 18 ? 0.3 : 1 }}>
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Pin mode selector — hidden during draw/edit */}
          {!drawType && !editTarget && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {MODES.map(mode => {
                const m = PIN_META[mode]
                const hasPin = mode === 'tee' ? !!currentH?.tee : !!currentH?.green[mode as 'front' | 'center' | 'back']
                const active = pinMode === mode
                return (
                  <button key={mode} onClick={() => setPinMode(mode)} style={{
                    padding: '10px 6px', borderRadius: 10, cursor: 'pointer',
                    border: active ? `2px solid ${m.color}` : '1px solid var(--bdr)',
                    background: active ? `${m.color}1a` : 'var(--surf)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: mode === 'tee' ? 4 : '50%',
                      background: hasPin ? m.color : 'var(--surf2)',
                      border: `2px solid ${hasPin ? m.color : 'var(--bdr)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: hasPin ? 'white' : 'var(--tx4)', fontSize: 10, fontWeight: 800,
                    }}>{m.short}</div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: active ? m.color : 'var(--tx3)' }}>{m.label}</span>
                    <span style={{ fontSize: 9, color: 'var(--tx4)' }}>{hasPin ? '✓ set' : 'tap map'}</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Landing Zone pin — separate from T/F/C/B auto-advance chain */}
          {!drawType && !editTarget && (
            <button onClick={() => setPinMode('landing')} style={{
              padding: '8px 14px', borderRadius: 10, cursor: 'pointer', width: '100%',
              border: pinMode === 'landing' ? '2px solid #22c55e' : '1px solid var(--bdr)',
              background: pinMode === 'landing' ? 'rgba(34,197,94,0.1)' : 'var(--surf)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                background: currentH?.landingZone ? '#22c55e' : 'var(--surf2)',
                border: `2px solid ${currentH?.landingZone ? '#22c55e' : 'var(--bdr)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: currentH?.landingZone ? 'white' : 'var(--tx4)', fontSize: 9, fontWeight: 800,
              }}>LZ</div>
              <span style={{ fontSize: 12, fontWeight: 600, color: pinMode === 'landing' ? '#22c55e' : 'var(--tx3)' }}>Landing Zone</span>
              <span style={{ fontSize: 10, color: 'var(--tx4)', marginLeft: 'auto' }}>
                {currentH?.landingZone ? '✓ set' : 'tap map'}
              </span>
            </button>
          )}

          {/* Map */}
          <div style={{ borderRadius: 14, overflow: 'hidden', height: 'min(640px, 60vh)', minHeight: 460, border: '1px solid var(--bdr)' }}>
            <Map
              ref={mapRef}
              mapboxAccessToken={TOKEN}
              {...viewState}
              onMove={(e: { viewState: typeof viewState }) => setViewState(e.viewState)}
              style={{ width: '100%', height: '100%' }}
              mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
              onClick={handleMapClick}
              cursor={drawType ? 'crosshair' : editTarget ? 'default' : 'crosshair'}
            >
              <NavigationControl position="top-right" showCompass={false} />

              {/* Hole corridor / fairway */}
              {corridorGeoJson && (
                <Source id="setup-corridor" type="geojson" data={corridorGeoJson}>
                  <Layer id="setup-corridor-fill" type="fill"
                    paint={{ 'fill-color': 'rgba(212,165,58,0.07)' }} />
                  <Layer id="setup-corridor-outline" type="line"
                    paint={{ 'line-color': 'rgba(212,165,58,0.55)', 'line-width': 1.5, 'line-dasharray': [5, 5] }} />
                </Source>
              )}
              {/* Bunkers */}
              {allBunkersGeoJson && (
                <Source id="setup-bunkers" type="geojson" data={allBunkersGeoJson}>
                  <Layer id="setup-bunkers-fill" type="fill"
                    paint={{ 'fill-color': '#D4B483', 'fill-opacity': 0.75 }} />
                  <Layer id="setup-bunkers-outline" type="line"
                    paint={{ 'line-color': '#A0845C', 'line-width': 1 }} />
                </Source>
              )}
              {/* Water hazards */}
              {allWaterGeoJson && (
                <Source id="setup-water" type="geojson" data={allWaterGeoJson}>
                  <Layer id="setup-water-fill" type="fill"
                    paint={{ 'fill-color': 'rgba(59,130,246,0.50)' }} />
                  <Layer id="setup-water-outline" type="line"
                    paint={{ 'line-color': 'rgba(37,99,235,0.8)', 'line-width': 1.5 }} />
                </Source>
              )}

              {/* Draft polygon being drawn */}
              {draftGeoJson && drawType && (
                <Source id="setup-draft" type="geojson" data={draftGeoJson}>
                  {draftGeoJson.geometry.type === 'Polygon' && (
                    <Layer id="setup-draft-fill" type="fill"
                      paint={{ 'fill-color': DRAW_COLORS[drawType], 'fill-opacity': 0.15 }} />
                  )}
                  <Layer id="setup-draft-outline" type="line"
                    paint={{ 'line-color': DRAW_COLORS[drawType], 'line-width': 2, 'line-dasharray': [5, 3] }} />
                </Source>
              )}
              {/* Draft vertices */}
              {drawType && draftPts.map((pt, i) => (
                <Marker key={`dv-${i}`} longitude={pt.lng} latitude={pt.lat} anchor="center">
                  <div style={{
                    width: i === 0 && draftPts.length >= 3 ? 14 : 10,
                    height: i === 0 && draftPts.length >= 3 ? 14 : 10,
                    borderRadius: '50%',
                    background: i === 0 ? DRAW_COLORS[drawType] : 'white',
                    border: `2px solid ${DRAW_COLORS[drawType]}`,
                    cursor: i === 0 && draftPts.length >= 3 ? 'pointer' : 'default',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                  }}
                  onClick={i === 0 && draftPts.length >= 3 ? closeDraftPoly : undefined}
                  />
                </Marker>
              ))}
              {/* Edit target highlight */}
              {editTargetGeoJson && editTarget && (
                <Source id="setup-edit-highlight" type="geojson" data={editTargetGeoJson}>
                  <Layer id="setup-edit-highlight-fill" type="fill"
                    paint={{ 'fill-color': DRAW_COLORS[editTarget.type], 'fill-opacity': 0.10 }} />
                  <Layer id="setup-edit-highlight-outline" type="line"
                    paint={{ 'line-color': 'white', 'line-width': 2.5 }} />
                </Source>
              )}
              {/* Draggable edit vertices */}
              {editTarget && editVertices.map((pt, vi) => (
                <Marker key={`ev-${vi}`} longitude={pt.lng} latitude={pt.lat} anchor="center"
                  draggable
                  onDragEnd={e => updateVertex(vi, { lat: e.lngLat.lat, lng: e.lngLat.lng })}
                >
                  <div style={{
                    width: 14, height: 14, borderRadius: '50%',
                    background: 'white', border: '2.5px solid #6366f1',
                    boxShadow: '0 1px 5px rgba(0,0,0,0.5)', cursor: 'grab',
                  }} />
                </Marker>
              ))}

              {/* All holes with green centers — small numbered dots */}
              {holes.filter(h => h.green.center).map(h => (
                <Marker key={`dot-${h.hole}`}
                  longitude={h.green.center!.lng} latitude={h.green.center!.lat} anchor="center">
                  <div onClick={e => { e.stopPropagation(); jumpToHole(h) }} style={{
                    width: 20, height: 20, borderRadius: '50%',
                    background: h.hole === editingHole ? '#D4A53A' : 'rgba(255,255,255,0.85)',
                    border: '1.5px solid rgba(0,0,0,0.4)',
                    fontSize: 9, fontWeight: 800, color: h.hole === editingHole ? 'white' : '#111',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', userSelect: 'none',
                  }}>{h.hole}</div>
                </Marker>
              ))}

              {/* Current hole pins */}
              {currentH?.tee && (
                <Marker longitude={currentH.tee.lng} latitude={currentH.tee.lat} anchor="center">
                  <AdminPin short="T" color="#6b7280" borderRadius={4} />
                </Marker>
              )}
              {currentH?.green.front && (
                <Marker longitude={currentH.green.front.lng} latitude={currentH.green.front.lat} anchor="center">
                  <AdminPin short="F" color="#16a34a" />
                </Marker>
              )}
              {currentH?.green.center && (
                <Marker longitude={currentH.green.center.lng} latitude={currentH.green.center.lat} anchor="center">
                  <AdminPin short="C" color="#D4A53A" />
                </Marker>
              )}
              {currentH?.green.back && (
                <Marker longitude={currentH.green.back.lng} latitude={currentH.green.back.lat} anchor="center">
                  <AdminPin short="B" color="#dc2626" />
                </Marker>
              )}
              {currentH?.landingZone && (
                <Marker longitude={currentH.landingZone.lng} latitude={currentH.landingZone.lat} anchor="center">
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: 'rgba(34,197,94,0.35)', border: '2.5px solid #22c55e',
                    boxShadow: '0 0 10px rgba(34,197,94,0.65)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: 8, fontWeight: 900, userSelect: 'none',
                  }}>LZ</div>
                </Marker>
              )}
            </Map>
          </div>

          {/* Legend */}
          <div style={{ fontSize: 11, color: 'var(--tx4)', textAlign: 'center' }}>
            {drawType
              ? `Drawing ${drawType} — tap map to add points, click first point or "Close Shape" to finish`
              : editTarget
              ? `Editing ${editTarget.type} — drag white handles to adjust vertices`
              : `Tap the map to place the `}
            {!drawType && !editTarget && <strong style={{ color: PIN_META[pinMode].color }}>{PIN_META[pinMode].label}</strong>}
            {!drawType && !editTarget && ` pin on hole ${editingHole}`}
          </div>

          {/* Progress + save */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--tx3)' }}>
              <span style={{ fontWeight: 700, color: pinsSet === 18 ? '#22c55e' : '#D4A53A' }}>{pinsSet}</span>
              <span style={{ color: 'var(--tx4)' }}>/18 greens pinned</span>
            </div>
            <button onClick={save} disabled={saving || pinsSet === 0 || !tournamentId} style={{
              padding: '10px 22px', borderRadius: 10,
              background: pinsSet > 0 ? 'rgba(212,165,58,0.15)' : 'var(--surf2)',
              border: `1px solid ${pinsSet > 0 ? 'rgba(212,165,58,0.4)' : 'var(--bdr)'}`,
              color: pinsSet > 0 ? '#D4A53A' : 'var(--tx4)',
              cursor: saving || pinsSet === 0 ? 'not-allowed' : 'pointer',
              fontWeight: 700, fontSize: 14,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <Save size={15} />
              {saving ? 'Saving…' : 'Save Course GPS'}
            </button>
          </div>
        </>
      )}

      {/* ── Pars Tab ── */}
      {gpsSubTab === 'pars' && (
        <div className="glass" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx1)', marginBottom: 4 }}>Hole Pars</div>
            <div style={{ fontSize: 12, color: 'var(--tx3)', lineHeight: 1.5 }}>
              Set the par for each hole. Useful when OpenStreetMap has no par data. Saved with the course.
            </div>
          </div>

          {([{ label: 'Front 9', from: 1, to: 9 }, { label: 'Back 9', from: 10, to: 18 }]).map(({ label, from, to }) => {
            const nineHoles = holes.filter(h => h.hole >= from && h.hole <= to)
            const nineTotal = nineHoles.reduce((a, h) => a + (h.par ?? 0), 0)
            return (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--tx3)' }}>{label}</span>
                  <span style={{ fontSize: 12, color: 'var(--tx4)' }}>Out {nineTotal || '—'}</span>
                </div>
                {nineHoles.map(h => (
                  <div key={h.hole} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ width: 52, fontSize: 13, fontWeight: 700, color: 'var(--tx2)' }}>Hole {h.hole}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[3, 4, 5, 6].map(n => {
                        const active = h.par === n
                        return (
                          <button key={n} onClick={() => setHolePar(h.hole, n)} style={{
                            width: 40, height: 36, borderRadius: 9, cursor: 'pointer',
                            fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                            background: active ? 'rgba(212,165,58,0.18)' : 'var(--surf2)',
                            border: `1px solid ${active ? 'rgba(212,165,58,0.5)' : 'var(--bdr)'}`,
                            color: active ? '#D4A53A' : 'var(--tx3)',
                          }}>{n}</button>
                        )
                      })}
                    </div>
                    {/* Contest hole marker */}
                    <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                      {([['none', '—'], ['ctp', '🎯'], ['ld', '💥']] as const).map(([val, glyph]) => {
                        const active = (h.contest ?? 'none') === val
                        return (
                          <button
                            key={val}
                            title={val === 'ctp' ? 'Closest to Pin' : val === 'ld' ? 'Longest Drive' : 'Not a contest hole'}
                            onClick={() => setHoleContest(h.hole, val === 'none' ? null : val)}
                            style={{
                              minWidth: 36, height: 36, borderRadius: 9, cursor: 'pointer', fontSize: 14, fontWeight: 700,
                              background: active ? 'rgba(212,165,58,0.18)' : 'var(--surf2)',
                              border: `1px solid ${active ? 'rgba(212,165,58,0.5)' : 'var(--bdr)'}`,
                              color: active ? '#D4A53A' : 'var(--tx4)',
                            }}
                          >{glyph}</button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )
          })}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTop: '1px solid var(--bdr)', paddingTop: 14 }}>
            <div style={{ fontSize: 13, color: 'var(--tx3)' }}>
              Total par{' '}
              <span style={{ fontWeight: 700, color: '#D4A53A' }}>{holes.reduce((a, h) => a + (h.par ?? 0), 0) || '—'}</span>
              <span style={{ color: 'var(--tx4)' }}> · {holes.filter(h => h.par != null).length}/18 set</span>
            </div>
            <button onClick={save} disabled={saving || !tournamentId} style={{
              padding: '10px 22px', borderRadius: 10,
              background: 'rgba(212,165,58,0.15)', border: '1px solid rgba(212,165,58,0.4)',
              color: '#D4A53A', cursor: saving ? 'not-allowed' : 'pointer',
              fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <Save size={15} />
              {saving ? 'Saving…' : 'Save Pars'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
