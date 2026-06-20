import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import Map, { Marker, NavigationControl, Source, Layer, type MapRef } from 'react-map-gl/mapbox'
import type { MapMouseEvent } from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Target, Navigation, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { localDb, type LocalScore, type LocalTeam, type LocalProfile } from '../lib/localDb'
import { useAuth } from '../context/AuthContext'
import { useYear } from '../context/YearContext'
import type { CourseGps, HoleGps, LatLng } from '../lib/types'
import { displayName, HOLE_PARS } from '../lib/types'
import { usePlayerScoring } from '../hooks/usePlayerScoring'
import { ScoreBottomSheet } from '../components/ScoreBottomSheet'
import { useMediaQuery } from '../hooks/useMediaQuery'

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
const STALE_MS = 30 * 60 * 1000

function haversineYards(a: LatLng, b: LatLng): number {
  const R = 6371000
  const φ1 = (a.lat * Math.PI) / 180, φ2 = (b.lat * Math.PI) / 180
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180
  const x = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)) * 1.09361)
}

function dist(pos: LatLng | null, target: LatLng | null | undefined): number | null {
  return pos && target ? haversineYards(pos, target) : null
}

// ─── Map markers ────────────────────────────────────────────────────────────

// Improvement 4: directional arrow that rotates with heading; falls back to dot
function PlayerDot({ bearing }: { bearing: number | null }) {
  return (
    <div style={{ position: 'relative', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="gps-pulse-ring" style={{
        position: 'absolute', width: 44, height: 44, borderRadius: '50%',
        background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)',
      }} />
      {bearing !== null ? (
        <div style={{
          transform: `rotate(${bearing}deg)`, transition: 'transform 0.6s ease',
          zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.6))',
        }}>
          <svg width={22} height={22} viewBox="0 0 22 22">
            {/* Arrow pointing North by default; CSS rotation applies heading */}
            <polygon points="11,1 19,19 11,15 3,19"
              fill="#3b82f6" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        </div>
      ) : (
        <div style={{
          width: 18, height: 18, borderRadius: '50%',
          background: '#3b82f6', border: '3px solid white',
          boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          zIndex: 1, flexShrink: 0,
        }} />
      )}
    </div>
  )
}

function TeePin() {
  return (
    <div style={{
      width: 26, height: 26, borderRadius: 5,
      background: '#1e3a5f', border: '2.5px solid white',
      boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
      color: 'white', fontWeight: 800, fontSize: 10,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Inter, sans-serif', userSelect: 'none',
    }}>T</div>
  )
}

// Improvement 1: tactical sniper reticle replaces the plain ring tap marker
function ReticleMarker() {
  const cx = 32, cy = 32, outerR = 24, innerR = 9
  return (
    <svg width={64} height={64} viewBox="0 0 64 64"
      style={{ overflow: 'visible', filter: 'drop-shadow(0 0 5px rgba(255,255,255,0.35))', pointerEvents: 'none' }}>
      <circle cx={cx} cy={cy} r={outerR} fill="none" stroke="rgba(255,255,255,0.92)" strokeWidth="1.5" />
      {/* Inward ticks from ring — gap in center shows terrain underneath */}
      <line x1={cx}        y1={cy - outerR} x2={cx}        y2={cy - innerR} stroke="rgba(255,255,255,0.92)" strokeWidth="1.5" />
      <line x1={cx}        y1={cy + outerR} x2={cx}        y2={cy + innerR} stroke="rgba(255,255,255,0.92)" strokeWidth="1.5" />
      <line x1={cx + outerR} y1={cy}        x2={cx + innerR} y2={cy}        stroke="rgba(255,255,255,0.92)" strokeWidth="1.5" />
      <line x1={cx - outerR} y1={cy}        x2={cx - innerR} y2={cy}        stroke="rgba(255,255,255,0.92)" strokeWidth="1.5" />
      {/* Gold center dot */}
      <circle cx={cx} cy={cy} r={2.5} fill="#D4A53A" />
    </svg>
  )
}

// Improvement 2: flag pin — the universal golf destination symbol
function FlagPin() {
  return (
    <svg width={22} height={40} viewBox="0 0 22 40"
      style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.75))', pointerEvents: 'none', overflow: 'visible' }}>
      <line x1={11} y1={1} x2={11} y2={38} stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      <polygon points="11,1 22,8 11,15" fill="#D4A53A" />
      <circle cx={11} cy={38} r={3} fill="rgba(212,165,58,0.80)" />
    </svg>
  )
}

// ─── Geometry helpers ────────────────────────────────────────────────────────

function calcBearing(a: LatLng, b: LatLng): number {
  const lat1 = (a.lat * Math.PI) / 180, lat2 = (b.lat * Math.PI) / 180
  const dLng  = ((b.lng - a.lng) * Math.PI) / 180
  const x = Math.sin(dLng) * Math.cos(lat2)
  const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return (Math.atan2(x, y) * 180 / Math.PI + 360) % 360
}

// ─── Wind helpers ─────────────────────────────────────────────────────────────

interface WindData { speed: number; direction: number; fetchedAt: number }

function windComponents(speedMph: number, windDirDeg: number, holeBearingDeg: number) {
  // meteorological: direction wind comes FROM → convert to "going to" by +180
  const windToDeg = (windDirDeg + 180) % 360
  const relRad = ((windToDeg - holeBearingDeg) * Math.PI) / 180
  return {
    headwind:  speedMph * Math.cos(relRad),  // + = into face, - = at back
    crosswind: speedMph * Math.sin(relRad),  // + = pushes right, - = pushes left
  }
}

function windAdjYards(baseYards: number, headwind: number): number {
  // +1 yd per mph headwind; only −0.5 per mph tailwind (ball lands before full assist)
  return Math.round(baseYards + (headwind >= 0 ? headwind : headwind * 0.5))
}

function windDriftYards(baseYards: number, crosswind: number): number {
  // ≈1 yd drift per 10 mph crosswind per 100 yards of carry
  return Math.round(crosswind * baseYards / 100)
}

function cardinalDir(deg: number): string {
  const dirs = ['N','NE','E','SE','S','SW','W','NW']
  return dirs[Math.round(deg / 45) % 8]
}

function offsetLatLng(origin: LatLng, bearingDeg: number, meters: number): LatLng {
  const R = 6371000, d = meters / R, b = (bearingDeg * Math.PI) / 180
  const lat1 = (origin.lat * Math.PI) / 180, lng1 = (origin.lng * Math.PI) / 180
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b))
  const lng2 = lng1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2))
  return { lat: (lat2 * 180) / Math.PI, lng: ((lng2 * 180) / Math.PI + 540) % 360 - 180 }
}

function buildCorridor(tee: LatLng, green: LatLng, bearing: number): [number, number][] {
  const teeBack  = offsetLatLng(tee,   bearing + 180, 6)
  const greenFwd = offsetLatLng(green, bearing,       10)
  const pts = [
    offsetLatLng(teeBack,  bearing - 90, 35),
    offsetLatLng(teeBack,  bearing + 90, 35),
    offsetLatLng(greenFwd, bearing + 90, 22),
    offsetLatLng(greenFwd, bearing - 90, 22),
  ]
  return [...pts.map(p => [p.lng, p.lat] as [number, number]), [pts[0].lng, pts[0].lat]]
}

// Progress along tee→green axis (0=tee, 1=green). Flat-earth OK at hole scale.
function holeProgress(tee: LatLng, green: LatLng, point: LatLng): number {
  const vx = green.lng - tee.lng, vy = green.lat - tee.lat
  const px = point.lng - tee.lng, py = point.lat - tee.lat
  const lenSq = vx * vx + vy * vy
  return lenSq === 0 ? 0 : (px * vx + py * vy) / lenSq
}

// Place a bunker label on the outer side of the bunker (away from fairway).
// Greenside bunkers (last 35% of hole) use "away from green center" because
// their polygon centroid can end up on the wrong side of the straight tee→green
// axis when the bunker wraps a corner. Fairway bunkers use the dual-perpendicular
// method: try both axis perpendiculars and pick whichever is further from the axis.
function bunkerLabelPos(poly: LatLng[], centroid: LatLng, tee: LatLng, green: LatLng): LatLng {
  const dx = green.lng - tee.lng, dy = green.lat - tee.lat
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return centroid
  const len = Math.sqrt(lenSq)
  const gapDeg = 15 * 0.9144 / 111111

  // Projection parameter along tee→green (0=tee, 1=green)
  const t = ((centroid.lng - tee.lng) * dx + (centroid.lat - tee.lat) * dy) / lenSq

  let unitLng: number, unitLat: number
  if (t > 0.65) {
    // Greenside: push directly away from green center
    const dLng = centroid.lng - green.lng, dLat = centroid.lat - green.lat
    const dLen = Math.sqrt(dLng * dLng + dLat * dLat)
    if (dLen === 0) return centroid
    unitLng = dLng / dLen; unitLat = dLat / dLen
  } else {
    // Fairway: try both axis perpendiculars, pick the one further from the axis
    const aLng = -dy / len, aLat = dx / len
    const bLng =  dy / len, bLat = -dx / len
    const bigDeg = 100 * 0.9144 / 111111
    const pA = { lat: centroid.lat + aLat * bigDeg, lng: centroid.lng + aLng * bigDeg }
    const pB = { lat: centroid.lat + bLat * bigDeg, lng: centroid.lng + bLng * bigDeg }
    const cA = Math.abs(dx * (pA.lat - tee.lat) - dy * (pA.lng - tee.lng))
    const cB = Math.abs(dx * (pB.lat - tee.lat) - dy * (pB.lng - tee.lng))
    ;[unitLng, unitLat] = cA > cB ? [aLng, aLat] : [bLng, bLat]
  }

  // Find the furthest polygon vertex in the chosen outward direction, then add gap
  let edgeDeg = 0
  for (const v of poly) {
    const proj = (v.lng - centroid.lng) * unitLng + (v.lat - centroid.lat) * unitLat
    if (proj > edgeDeg) edgeDeg = proj
  }
  return {
    lat: centroid.lat + unitLat * (edgeDeg + gapDeg),
    lng: centroid.lng + unitLng * (edgeDeg + gapDeg),
  }
}

function polygonCentroid(poly: LatLng[]): LatLng {
  return {
    lat: poly.reduce((s, p) => s + p.lat, 0) / poly.length,
    lng: poly.reduce((s, p) => s + p.lng, 0) / poly.length,
  }
}

interface PlayerPosition {
  player_id: string
  team_id: string | null
  lat: number
  lng: number
  updated_at: string
}

function timeAgo(isoString: string): string {
  const mins = Math.floor((Date.now() - new Date(isoString).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins === 1) return '1 min ago'
  return `${mins} mins ago`
}

function scoreToPar(teamId: string, scores: LocalScore[]): number | null {
  const teamScores = scores.filter(s => s.team_id === teamId)
  if (!teamScores.length) return null
  return teamScores.reduce((sum, s) => sum + s.score - (HOLE_PARS[s.hole - 1] ?? 4), 0)
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function GpsPage() {
  const { profile } = useAuth()
  const { effectiveTournamentId } = useYear()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const mapRef = useRef<MapRef>(null)

  const scoring = usePlayerScoring()
  const [sheetOpen, setSheetOpen] = useState(false)

  const [course, setCourse]   = useState<CourseGps | null>(null)
  const [loading, setLoading] = useState(true)
  const [position, setPosition] = useState<LatLng | null>(null)
  const [playerBearing, setPlayerBearing] = useState<number | null>(null)
  const [gpsStatus, setGpsStatus] = useState<'acquiring' | 'ok' | 'denied' | 'unavailable'>('acquiring')
  const [selectedHole, setSelectedHole] = useState(() => {
    const h = parseInt(searchParams.get('hole') ?? '1')
    return h >= 1 && h <= 18 ? h : 1
  })
  const [tapPoint, setTapPoint] = useState<LatLng | null>(null)
  const [tipOpen, setTipOpen]   = useState(false)
  const [viewState, setViewState] = useState({ longitude: -79.0, latitude: 43.85, zoom: 15, bearing: 0, pitch: 0 })

  const [otherPositions, setOtherPositions] = useState<PlayerPosition[]>([])
  const [selectedCartPlayerId, setSelectedCartPlayerId] = useState<string | null>(null)
  const [wind, setWind] = useState<WindData | null>(null)

  const [localScores, setLocalScores]     = useState<LocalScore[]>([])
  const [localTeams, setLocalTeams]       = useState<LocalTeam[]>([])
  const [localProfiles, setLocalProfiles] = useState<LocalProfile[]>([])

  const isNarrow = useMediaQuery('(max-width: 430px)')
  const holeNumSize  = isNarrow ? 32 : 52
  const scoreNumSize = isNarrow ? 22 : 36
  const yardageSize  = isNarrow ? 30 : 38
  const panelPadding = isNarrow ? '5px 9px' : '10px 16px'

  // Refs for position publishing and bearing — avoid re-registering the GPS watch
  const lastPublishRef = useRef<{ lat: number; lng: number; at: number } | null>(null)
  const lastPosRef     = useRef<LatLng | null>(null)
  const publishRef     = useRef<{ profileId: string; tournamentId: string; teamId: string | null } | null>(null)
  publishRef.current = (profile && effectiveTournamentId)
    ? { profileId: profile.id, tournamentId: effectiveTournamentId, teamId: scoring.myTeam?.id ?? null }
    : null

  // ── Data loading ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!effectiveTournamentId) { setLoading(false); return }

    const applyGps = (gps: CourseGps) => {
      setCourse(gps)
      if (gps.lat && gps.lng)
        setViewState(v => ({ ...v, latitude: gps.lat!, longitude: gps.lng!, zoom: 16 }))
    }

    localDb.course_gps.get(effectiveTournamentId).then(cached => {
      if (cached) {
        applyGps({ id: cached.gps_id, name: cached.name ?? '', created_at: '',
          lat: cached.lat, lng: cached.lng, holes: JSON.parse(cached.holes_json) as HoleGps[] })
        setLoading(false)
      }
    })
    ;(async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase.from('tournaments')
          .select('course_gps:course_gps_id(id, name, lat, lng, holes)')
          .eq('id', effectiveTournamentId).single() as unknown as Promise<{ data: any }>)
        const gps = data?.course_gps
        if (gps) {
          applyGps(gps as CourseGps)
          localDb.course_gps.put({ id: effectiveTournamentId, gps_id: gps.id,
            name: gps.name ?? null, lat: gps.lat ?? null, lng: gps.lng ?? null,
            holes_json: JSON.stringify(gps.holes ?? []) }).catch(() => {})
        }
      } catch { /* offline */ }
      setLoading(false)
    })()
  }, [effectiveTournamentId])

  // ── GPS tracking + position publishing ────────────────────────────────────

  useEffect(() => {
    if (!navigator.geolocation) { setGpsStatus('unavailable'); return }
    const id = navigator.geolocation.watchPosition(
      pos => {
        const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setPosition(newPos)
        setGpsStatus('ok')

        // Improvement 4: track heading between updates (>2 yds moved to filter jitter)
        if (lastPosRef.current && haversineYards(lastPosRef.current, newPos) > 2)
          setPlayerBearing(calcBearing(lastPosRef.current, newPos))
        lastPosRef.current = newPos

        // Publish to Supabase when moved >11 yds or >15s since last publish
        const info = publishRef.current
        const last = lastPublishRef.current
        const movedYards = last ? haversineYards(last, newPos) : Infinity
        const ageMs      = last ? Date.now() - last.at : Infinity
        if (info && navigator.onLine && (movedYards > 11 || ageMs > 15000)) {
          lastPublishRef.current = { ...newPos, at: Date.now() }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(supabase as any).from('player_positions').upsert({
            player_id: info.profileId, tournament_id: info.tournamentId,
            team_id: info.teamId, lat: newPos.lat, lng: newPos.lng,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'player_id' }).catch(() => {})
        }
      },
      err => setGpsStatus(err.code === 1 ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 15000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  // ── Other players' live positions ─────────────────────────────────────────

  useEffect(() => {
    if (!effectiveTournamentId) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase as any).from('player_positions')
      .select('player_id, team_id, lat, lng, updated_at')
      .eq('tournament_id', effectiveTournamentId)
      .then(({ data }: { data: PlayerPosition[] | null }) => { if (data) setOtherPositions(data) })

    const channel = supabase.channel(`player-positions-${effectiveTournamentId}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('postgres_changes' as any, {
        event: '*', schema: 'public', table: 'player_positions',
        filter: `tournament_id=eq.${effectiveTournamentId}`,
      }, (payload: { new: PlayerPosition }) => {
        const updated = payload.new
        setOtherPositions(prev => [...prev.filter(p => p.player_id !== updated.player_id), updated])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [effectiveTournamentId])

  // ── Local DB snapshot for score-to-par in cart popups ────────────────────

  useEffect(() => {
    Promise.all([localDb.scores.toArray(), localDb.teams.toArray(), localDb.profiles.toArray()])
      .then(([scores, teams, profiles]) => {
        setLocalScores(scores); setLocalTeams(teams); setLocalProfiles(profiles)
      })
  }, [])

  // ── Wind data (Open-Meteo, refreshes every 10 min) ────────────────────────

  useEffect(() => {
    if (!course?.lat || !course?.lng) return
    const lat = course.lat, lng = course.lng
    const fetchWind = async () => {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=mph&timezone=auto`
        const res = await fetch(url)
        if (!res.ok) return
        const json = await res.json()
        const c = json.current
        if (typeof c?.wind_speed_10m === 'number' && typeof c?.wind_direction_10m === 'number')
          setWind({ speed: Math.round(c.wind_speed_10m), direction: c.wind_direction_10m, fetchedAt: Date.now() })
      } catch { /* offline */ }
    }
    fetchWind()
    const id = setInterval(fetchWind, 10 * 60 * 1000)
    return () => clearInterval(id)
  }, [course?.lat, course?.lng])

  // ── Derived state ─────────────────────────────────────────────────────────

  const currentHole: HoleGps | undefined = course?.holes.find(h => h.hole === selectedHole)

  const corridorGeoJson = useMemo(() => {
    if (currentHole?.fairway && currentHole.fairway.length >= 3) {
      const coords = currentHole.fairway.map(p => [p.lng, p.lat] as [number, number])
      coords.push(coords[0])
      return { type: 'Feature' as const, geometry: { type: 'Polygon' as const, coordinates: [coords] }, properties: {} }
    }
    const tee = currentHole?.tee, green = currentHole?.green.center
    if (!tee || !green) return null
    return { type: 'Feature' as const,
      geometry: { type: 'Polygon' as const, coordinates: [buildCorridor(tee, green, calcBearing(tee, green))] },
      properties: {} }
  }, [currentHole])

  const makePolyCollection = (polys: import('../lib/types').LatLng[][] | null | undefined) => {
    if (!polys?.length) return null
    return { type: 'FeatureCollection' as const,
      features: polys.map((poly, i) => ({
        type: 'Feature' as const, id: i,
        geometry: { type: 'Polygon' as const,
          coordinates: [[...poly.map(p => [p.lng, p.lat] as [number, number]), [poly[0].lng, poly[0].lat]]] },
        properties: {},
      })) }
  }
  const bunkersGeoJson    = useMemo(() => makePolyCollection(currentHole?.bunkers),    [currentHole])
  const waterGeoJson      = useMemo(() => makePolyCollection(currentHole?.water),      [currentHole])
  const avoidZonesGeoJson = useMemo(() => makePolyCollection(currentHole?.avoidZones), [currentHole])

  const landingZoneGeoJson = useMemo(() => {
    const lz = currentHole?.landingZone; if (!lz) return null
    const coords: [number, number][] = []
    for (let i = 0; i <= 36; i++) { const pt = offsetLatLng(lz, (i / 36) * 360, 27); coords.push([pt.lng, pt.lat]) }
    return { type: 'Feature' as const, geometry: { type: 'Polygon' as const, coordinates: [coords] }, properties: {} }
  }, [currentHole])

  const aimLineGeoJson = useMemo(() => {
    if (!position || !tapPoint) return null
    return { type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: [[position.lng, position.lat], [tapPoint.lng, tapPoint.lat]] },
      properties: {} }
  }, [position, tapPoint])

  const tapToGreenGeoJson = useMemo(() => {
    const green = currentHole?.green.center; if (!tapPoint || !green) return null
    return { type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: [[tapPoint.lng, tapPoint.lat], [green.lng, green.lat]] },
      properties: {} }
  }, [tapPoint, currentHole])

  const bunkerLabels = useMemo(() => {
    const bunkers = currentHole?.bunkers, tee = currentHole?.tee, green = currentHole?.green.center
    if (!bunkers?.length || !tee || !green || !position) return []
    const playerT = holeProgress(tee, green, position)
    return bunkers
      .map((poly, idx) => {
        const centroid = polygonCentroid(poly)
        const labelPos = bunkerLabelPos(poly, centroid, tee, green)
        return { idx, centroid, labelPos, bunkerT: holeProgress(tee, green, centroid), yards: haversineYards(position, centroid) }
      })
      .filter(b => playerT <= b.bunkerT)
  }, [currentHole, position])

  const activeOtherPositions = useMemo(() => {
    const now = Date.now()
    return otherPositions.filter(p =>
      p.player_id !== profile?.id &&
      now - new Date(p.updated_at).getTime() < STALE_MS
    )
  }, [otherPositions, profile?.id])

  // ── Map fly-to ────────────────────────────────────────────────────────────

  const flyToHole = useCallback((hole: HoleGps) => {
    const green = hole.green.center, tee = hole.tee
    if (!green && !tee) return
    const bearing = tee && green ? calcBearing(tee, green) : 0
    const center  = tee && green ? { lat: (tee.lat + green.lat) / 2, lng: (tee.lng + green.lng) / 2 } : (green ?? tee!)
    const yds     = tee && green ? haversineYards(tee, green) : 200
    const zoom    = yds > 450 ? 16 : yds > 300 ? 16.5 : yds > 150 ? 17 : 17.5
    mapRef.current?.flyTo({ center: [center.lng, center.lat], zoom, bearing, pitch: 0, duration: 800 })
  }, [])

  const [mapLoaded, setMapLoaded] = useState(false)
  const initialFlyDone = useRef(false)

  useEffect(() => {
    if (!mapLoaded || !currentHole || initialFlyDone.current) return
    initialFlyDone.current = true
    flyToHole(currentHole)
  }, [mapLoaded, currentHole, flyToHole])

  useEffect(() => {
    if (!initialFlyDone.current || !currentHole) return
    flyToHole(currentHole)
  }, [selectedHole]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setTipOpen(false) }, [selectedHole])

  useEffect(() => {
    setTapPoint(course?.holes.find(h => h.hole === selectedHole)?.landingZone ?? null)
  }, [selectedHole, course])

  // Prevent iOS pull-to-refresh on the map
  useEffect(() => {
    let startY = 0
    const onStart = (e: TouchEvent) => { startY = e.touches[0]?.clientY ?? 0 }
    const onMove  = (e: TouchEvent) => {
      if (!e.cancelable) return
      if ((e.touches[0]?.clientY ?? 0) > startY) e.preventDefault()
    }
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove',  onMove,  { passive: false })
    return () => { document.removeEventListener('touchstart', onStart); document.removeEventListener('touchmove', onMove) }
  }, [])

  const handleMapClick = (e: MapMouseEvent) => {
    setTapPoint({ lat: e.lngLat.lat, lng: e.lngLat.lng })
    setSelectedCartPlayerId(null)
  }

  // ── Distances ─────────────────────────────────────────────────────────────

  const frontDist      = dist(position, currentHole?.green.front)
  const centerDist     = dist(position, currentHole?.green.center)
  const backDist       = dist(position, currentHole?.green.back)
  const tapDist        = dist(position, tapPoint)
  const tapToGreenDist = dist(tapPoint, currentHole?.green.center)

  const aimLineMid    = position && tapPoint
    ? { lat: (position.lat + tapPoint.lat) / 2, lng: (position.lng + tapPoint.lng) / 2 } : null
  const tapToGreenMid = tapPoint && currentHole?.green.center
    ? { lat: (tapPoint.lat + currentHole.green.center.lat) / 2, lng: (tapPoint.lng + currentHole.green.center.lng) / 2 } : null

  // ── Early-exit renders ────────────────────────────────────────────────────

  if (!TOKEN) return (
    <div style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>🗺️</div>
      <h2 style={{ fontFamily: 'Bebas Neue', fontSize: 26, color: '#D4A53A', letterSpacing: 3 }}>Mapbox Not Configured</h2>
      <p style={{ color: 'var(--tx3)', fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>
        Add <code style={{ color: '#D4A53A' }}>VITE_MAPBOX_TOKEN</code> to your <code style={{ color: '#D4A53A' }}>.env.local</code>.
      </p>
    </div>
  )

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div className="animate-spin" style={{ width: 32, height: 32, border: '2.5px solid rgba(212,165,58,0.2)', borderTopColor: '#D4A53A', borderRadius: '50%' }} />
    </div>
  )

  if (!course) return (
    <div style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>⛳</div>
      <h2 style={{ fontFamily: 'Bebas Neue', fontSize: 28, color: '#D4A53A', letterSpacing: 3 }}>GPS Not Set Up</h2>
      <p style={{ color: 'var(--tx3)', marginTop: 8, fontSize: 13, lineHeight: 1.6 }}>
        An admin needs to configure the course GPS before distances appear here.
      </p>
    </div>
  )

  const holeHasData = (h: number) => course.holes.some(hd => hd.hole === h && hd.green.center)

  const parForHole = HOLE_PARS[selectedHole - 1] ?? 4
  // Elements above the nav bar sit at this base; tip/hint cards go higher
  const navBase      = `calc(env(safe-area-inset-bottom, 0px) + 68px)`
  const aboveHudCalc = `calc(env(safe-area-inset-bottom, 0px) + 170px)`

  // Wind adjustments for the current hole
  const holeBearing = currentHole?.tee && currentHole?.green.center
    ? calcBearing(currentHole.tee, currentHole.green.center) : null
  const { headwind, crosswind } = (wind && holeBearing !== null)
    ? windComponents(wind.speed, wind.direction, holeBearing)
    : { headwind: 0, crosswind: 0 }
  const driftYards = (wind && centerDist !== null && centerDist <= 9999)
    ? windDriftYards(centerDist, crosswind) : 0

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      position: 'fixed', top: 56, left: 0, right: 0,
      bottom: 'env(safe-area-inset-bottom, 0px)',
      display: 'flex', flexDirection: 'column',
      zIndex: 20, background: 'var(--bg)', overscrollBehavior: 'none',
    }}>
      {/* Hole selector strip */}
      <div style={{ background: 'var(--panel)', borderBottom: '1px solid var(--bdr)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 10px', gap: 6 }}>
          <button onClick={() => navigate('/scores')} style={{
            padding: '4px 8px', background: 'none', border: 'none',
            color: 'var(--tx3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 12, flexShrink: 0,
          }}>
            <X size={16} />
          </button>
          <button onClick={() => setSelectedHole(h => Math.max(1, h - 1))} disabled={selectedHole === 1}
            style={{ padding: 4, background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', opacity: selectedHole === 1 ? 0.3 : 1 }}>
            <ChevronLeft size={18} />
          </button>

          <div style={{ flex: 1, overflowX: 'auto', scrollbarWidth: 'none' }}>
            <div style={{ display: 'flex', gap: 4, paddingBottom: 4 }}>
              {Array.from({ length: 18 }, (_, i) => i + 1).map(hole => {
                const active = selectedHole === hole, hasData = holeHasData(hole)
                return (
                  <button key={hole} onClick={() => setSelectedHole(hole)} style={{
                    minWidth: isNarrow ? 28 : 36, height: isNarrow ? 36 : 44, borderRadius: 7, flexShrink: 0,
                    border: active ? '2px solid #D4A53A' : '1px solid var(--bdr)',
                    background: active ? 'rgba(212,165,58,0.15)' : 'var(--surf)',
                    cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                    transform: active ? 'scale(1.08)' : 'scale(1)',
                    transition: 'transform 0.15s, border-color 0.15s',
                    opacity: hasData ? 1 : 0.5,
                  }}>
                    <span style={{ fontSize: isNarrow ? 10 : 12, fontWeight: 700, color: active ? '#D4A53A' : 'var(--tx2)', lineHeight: 1 }}>{hole}</span>
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: hasData ? '#22c55e' : 'var(--bdr)', flexShrink: 0 }} />
                  </button>
                )
              })}
            </div>
          </div>

          <button onClick={() => setSelectedHole(h => Math.min(18, h + 1))} disabled={selectedHole === 18}
            style={{ padding: 4, background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', opacity: selectedHole === 18 ? 0.3 : 1 }}>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Improvement 3: Map fills entire remaining space; HUD floats over the bottom */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <Map
          ref={mapRef}
          mapboxAccessToken={TOKEN}
          {...viewState}
          onMove={(e: { viewState: typeof viewState }) => setViewState(e.viewState)}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
          onLoad={() => setMapLoaded(true)}
          onClick={handleMapClick}
        >
          <NavigationControl position="top-right" showCompass={false} />

          {/* Fairway corridor */}
          {corridorGeoJson && (
            <Source id="corridor" type="geojson" data={corridorGeoJson}>
              <Layer id="corridor-fill" type="fill" paint={{ 'fill-color': 'rgba(255,255,255,0.05)' }} />
              <Layer id="corridor-outline" type="line"
                paint={{ 'line-color': 'rgba(255,255,255,0.40)', 'line-width': 1.5, 'line-dasharray': [5, 5] }} />
            </Source>
          )}

          {/* Bunkers */}
          {bunkersGeoJson && (
            <Source id="bunkers" type="geojson" data={bunkersGeoJson}>
              <Layer id="bunkers-fill" type="fill" paint={{ 'fill-color': '#D4B483', 'fill-opacity': 0.80 }} />
              <Layer id="bunkers-outline" type="line" paint={{ 'line-color': '#A0845C', 'line-width': 1.5 }} />
            </Source>
          )}

          {/* Bunker distance labels — positioned outside the bunker edge, away from fairway */}
          {bunkerLabels.map(b => (
            <Marker key={`bunk-dist-${b.idx}`} longitude={b.labelPos.lng} latitude={b.labelPos.lat} anchor="center">
              <div style={{
                background: 'rgba(212,180,131,0.92)', backdropFilter: 'blur(4px)',
                color: '#2a1400', borderRadius: 5, padding: '2px 6px',
                fontSize: 11, fontWeight: 700, fontFamily: 'Inter, sans-serif',
                boxShadow: '0 1px 6px rgba(0,0,0,0.55)', border: '1px solid #A0845C',
                whiteSpace: 'nowrap', pointerEvents: 'none',
              }}>{b.yards}</div>
            </Marker>
          ))}

          {/* Water hazards */}
          {waterGeoJson && (
            <Source id="water-hazards" type="geojson" data={waterGeoJson}>
              <Layer id="water-fill" type="fill" paint={{ 'fill-color': 'rgba(59,130,246,0.55)' }} />
              <Layer id="water-outline" type="line" paint={{ 'line-color': 'rgba(37,99,235,0.85)', 'line-width': 1.5 }} />
            </Source>
          )}

          {/* Avoid zones */}
          {avoidZonesGeoJson && (
            <Source id="avoid-zones" type="geojson" data={avoidZonesGeoJson}>
              <Layer id="avoid-zones-fill" type="fill" paint={{ 'fill-color': 'rgba(239,68,68,0.22)' }} />
              <Layer id="avoid-zones-outline" type="line"
                paint={{ 'line-color': 'rgba(239,68,68,0.75)', 'line-width': 1.5, 'line-dasharray': [4, 3] }} />
            </Source>
          )}

          {/* Landing zone */}
          {landingZoneGeoJson && (
            <Source id="landing-zone" type="geojson" data={landingZoneGeoJson}>
              <Layer id="landing-zone-fill" type="fill" paint={{ 'fill-color': 'rgba(74,222,128,0.18)' }} />
              <Layer id="landing-zone-outline" type="line"
                paint={{ 'line-color': 'rgba(74,222,128,0.80)', 'line-width': 2, 'line-dasharray': [6, 3] }} />
            </Source>
          )}

          {/* Aim line: Player → Tap */}
          {aimLineGeoJson && (
            <Source id="aimline" type="geojson" data={aimLineGeoJson}>
              <Layer id="aimline-glow-outer" type="line"
                paint={{ 'line-color': '#ffffff', 'line-width': 16, 'line-opacity': 0.06, 'line-blur': 6 }} />
              <Layer id="aimline-glow-inner" type="line"
                paint={{ 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.18, 'line-blur': 2 }} />
              <Layer id="aimline-core" type="line"
                paint={{ 'line-color': '#ffffff', 'line-width': 2.5, 'line-opacity': 0.95 }} />
            </Source>
          )}

          {/* Tap-to-green line: Tap → Green */}
          {tapToGreenGeoJson && (
            <Source id="tap-to-green" type="geojson" data={tapToGreenGeoJson}>
              <Layer id="tap-to-green-glow-outer" type="line"
                paint={{ 'line-color': '#D4A53A', 'line-width': 14, 'line-opacity': 0.08, 'line-blur': 5 }} />
              <Layer id="tap-to-green-glow-inner" type="line"
                paint={{ 'line-color': '#D4A53A', 'line-width': 6, 'line-opacity': 0.22, 'line-blur': 2 }} />
              <Layer id="tap-to-green-core" type="line"
                paint={{ 'line-color': '#D4A53A', 'line-width': 2, 'line-opacity': 0.92 }} />
            </Source>
          )}

          {/* Player position — Improvement 4: directional arrow */}
          {position && (
            <Marker longitude={position.lng} latitude={position.lat} anchor="center">
              <PlayerDot bearing={playerBearing} />
            </Marker>
          )}

          {/* Improvement 2: Flag pin at green center */}
          {currentHole?.green.center && (
            <Marker longitude={currentHole.green.center.lng} latitude={currentHole.green.center.lat} anchor="bottom">
              <FlagPin />
            </Marker>
          )}

          {/* Tee marker */}
          {currentHole?.tee && (
            <Marker longitude={currentHole.tee.lng} latitude={currentHole.tee.lat} anchor="center">
              <TeePin />
            </Marker>
          )}

          {/* Landing zone center */}
          {currentHole?.landingZone && (
            <Marker longitude={currentHole.landingZone.lng} latitude={currentHole.landingZone.lat} anchor="center">
              <div style={{
                width: 18, height: 18, borderRadius: '50%',
                background: 'rgba(74,222,128,0.30)', border: '2px solid rgba(74,222,128,0.90)',
                boxShadow: '0 0 8px rgba(74,222,128,0.6)',
              }} />
            </Marker>
          )}

          {/* Improvement 1: sniper reticle tap marker */}
          {tapPoint && (
            <Marker longitude={tapPoint.lng} latitude={tapPoint.lat} anchor="center">
              <ReticleMarker />
            </Marker>
          )}

          {/* Improvement 5: larger aim line distance label */}
          {aimLineMid && tapDist !== null && tapDist <= 9999 && (
            <Marker longitude={aimLineMid.lng} latitude={aimLineMid.lat} anchor="center">
              <div style={{
                background: 'rgba(8,8,12,0.82)', backdropFilter: 'blur(10px)',
                color: '#ffffff', borderRadius: 22, padding: '4px 13px',
                display: 'flex', alignItems: 'baseline', gap: 4,
                border: '1px solid rgba(255,255,255,0.22)',
                boxShadow: '0 0 16px rgba(255,255,255,0.12), 0 2px 10px rgba(0,0,0,0.65)',
                whiteSpace: 'nowrap', pointerEvents: 'none',
              }}>
                <span style={{ fontFamily: 'Bebas Neue', fontSize: 28, letterSpacing: 0.5, lineHeight: 1 }}>{tapDist}</span>
                <span style={{ fontSize: 10, opacity: 0.55, fontWeight: 600, letterSpacing: 0.5 }}>YDS</span>
              </div>
            </Marker>
          )}

          {/* Improvement 5: larger tap-to-green label — the "money" number */}
          {tapToGreenMid && tapToGreenDist !== null && (
            <Marker longitude={tapToGreenMid.lng} latitude={tapToGreenMid.lat} anchor="center">
              <div style={{
                background: 'rgba(8,8,12,0.82)', backdropFilter: 'blur(10px)',
                color: '#D4A53A', borderRadius: 22, padding: '5px 15px',
                display: 'flex', alignItems: 'baseline', gap: 4,
                border: '1px solid rgba(212,165,58,0.38)',
                boxShadow: '0 0 20px rgba(212,165,58,0.22), 0 2px 10px rgba(0,0,0,0.65)',
                whiteSpace: 'nowrap', pointerEvents: 'none',
              }}>
                <span style={{ fontFamily: 'Bebas Neue', fontSize: 34, letterSpacing: 0.5, lineHeight: 1, color: '#D4A53A' }}>{tapToGreenDist}</span>
                <span style={{ fontSize: 10, opacity: 0.6, fontWeight: 600, letterSpacing: 0.5, color: '#D4A53A' }}>YDS</span>
              </div>
            </Marker>
          )}

          {/* Other players — gold cart markers */}
          {activeOtherPositions.map(p => (
            <Marker key={p.player_id} longitude={p.lng} latitude={p.lat} anchor="bottom">
              <button
                onClick={e => { e.stopPropagation(); setSelectedCartPlayerId(p.player_id) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  fontSize: 24, lineHeight: 1, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))' }}
              >🛒</button>
            </Marker>
          ))}
        </Map>

        {/* GPS status badge */}
        {gpsStatus !== 'ok' && (
          <div style={{
            position: 'absolute', top: 8, right: 8,
            background: gpsStatus === 'acquiring' ? 'rgba(0,0,0,0.72)' : 'rgba(239,68,68,0.88)',
            color: 'white', padding: '5px 12px', borderRadius: 10,
            fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Navigation size={12} />
            {gpsStatus === 'acquiring' ? 'Acquiring GPS…' : gpsStatus === 'denied' ? 'GPS permission denied' : 'GPS unavailable'}
          </div>
        )}

        {/* Tap hint */}
        {!tapPoint && position && !currentHole?.tip && (
          <div style={{
            position: 'absolute', bottom: aboveHudCalc, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(10,10,15,0.7)', color: 'rgba(255,255,255,0.6)',
            padding: '4px 12px', borderRadius: 20, fontSize: 11,
            whiteSpace: 'nowrap', pointerEvents: 'none',
          }}>
            Tap map to measure distance
          </div>
        )}

        {/* Hole tip card */}
        {currentHole?.tip && (
          <div style={{
            position: 'absolute', bottom: aboveHudCalc, left: 8, right: 8,
            background: 'rgba(8,8,12,0.88)', backdropFilter: 'blur(10px)',
            borderRadius: 12, padding: '9px 12px',
            border: '1px solid rgba(212,165,58,0.28)',
          }}>
            <button onClick={() => setTipOpen(v => !v)} style={{
              width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              display: 'flex', alignItems: 'flex-start', gap: 8, textAlign: 'left',
            }}>
              <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1.4 }}>💡</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.82)', lineHeight: 1.5, flex: 1 }}>
                {tipOpen ? currentHole.tip : currentHole.tip.length > 100 ? currentHole.tip.slice(0, 97) + '…' : currentHole.tip}
              </span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', flexShrink: 0, paddingTop: 3 }}>
                {tipOpen ? '▲' : '▼'}
              </span>
            </button>
          </div>
        )}

        {/* Cart player popup */}
        {(() => {
          if (!selectedCartPlayerId) return null
          const pos = activeOtherPositions.find(p => p.player_id === selectedCartPlayerId)
          if (!pos) return null
          const player  = localProfiles.find(p => p.id === selectedCartPlayerId)
          const team    = pos.team_id ? localTeams.find(t => t.id === pos.team_id) : null
          const toPar   = pos.team_id ? scoreToPar(pos.team_id, localScores) : null
          const toParStr   = toPar == null ? '—' : toPar > 0 ? `+${toPar}` : toPar === 0 ? 'E' : `${toPar}`
          const toParColor = toPar == null ? 'var(--tx3)' : toPar < 0 ? '#22c55e' : toPar > 0 ? '#ef4444' : '#D4A53A'
          return (
            <div onClick={() => setSelectedCartPlayerId(null)} style={{
              position: 'absolute', bottom: `calc(env(safe-area-inset-bottom, 0px) + 136px)`, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(8,8,12,0.92)', backdropFilter: 'blur(12px)',
              border: '1px solid rgba(212,165,58,0.35)', borderRadius: 14, padding: '14px 22px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              cursor: 'pointer', zIndex: 10, minWidth: 170,
              boxShadow: '0 4px 24px rgba(0,0,0,0.7)', whiteSpace: 'nowrap',
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx1)' }}>
                🛒 {player ? (player.nickname?.trim() || player.name || 'Player') : 'Player'}
              </div>
              {team && <div style={{ fontSize: 11, color: 'var(--tx3)' }}>{team.name}</div>}
              <div style={{ fontFamily: 'Bebas Neue', fontSize: 32, letterSpacing: 1, lineHeight: 1.1, color: toParColor }}>
                {toParStr}
              </div>
              <div style={{ fontSize: 10, color: 'var(--tx4)', marginTop: 2 }}>
                {timeAgo(pos.updated_at)} · tap to dismiss
              </div>
            </div>
          )
        })()}

        {/* Hole + Par chip — top left */}
        {(() => {
          let totalVsPar = 0
          let holesPlayed = 0
          for (let h = 1; h <= 18; h++) {
            const s = scoring.myScores[h]
            if (s) { totalVsPar += s.score - (HOLE_PARS[h - 1] ?? 4); holesPlayed++ }
          }
          const scorLabel = holesPlayed === 0 ? 'E' : totalVsPar === 0 ? 'E' : totalVsPar > 0 ? `+${totalVsPar}` : `${totalVsPar}`
          const scorColor = totalVsPar < 0 ? '#22c55e' : totalVsPar > 0 ? '#ef4444' : 'rgba(255,255,255,0.5)'
          return (
            <div style={{
              position: 'absolute', top: 8, left: 8, zIndex: 10,
              background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12,
              padding: isNarrow ? '6px 10px' : '8px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center',
              boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            }}>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: holeNumSize, letterSpacing: 1, lineHeight: 1, color: '#D4A53A' }}>{selectedHole}</div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Par {parForHole}</div>
              <div style={{ marginTop: 6, fontSize: 9, fontWeight: 700, letterSpacing: 1.8, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>Currently</div>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: scoreNumSize, lineHeight: 1, letterSpacing: 0.5, color: scorColor }}>{scorLabel}</div>
            </div>
          )
        })()}

        {/* Wind chip — top center */}
        {wind && (
          <div style={{
            position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 10,
            background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.14)', borderRadius: 11,
            padding: isNarrow ? '5px 10px' : '8px 15px', display: 'flex', alignItems: 'center', gap: isNarrow ? 6 : 10,
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)', whiteSpace: 'nowrap',
          }}>
            {/* Arrow pointing in the direction wind is travelling TO */}
            <div style={{ transform: `rotate(${wind.direction}deg)`, display: 'flex', lineHeight: 1 }}>
              <Navigation size={15} color="#D4A53A" fill="#D4A53A" />
            </div>
            <span style={{ fontFamily: 'Bebas Neue', fontSize: isNarrow ? 18 : 24, lineHeight: 1, color: 'white', letterSpacing: 0.5 }}>
              {wind.speed}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5 }}>
              MPH
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 }}>
              {cardinalDir(wind.direction)}
            </span>
            {/* Head/tail + drift summary relative to this hole */}
            {holeBearing !== null && wind.speed > 0 && (
              <div style={{ display: 'flex', gap: 5, marginLeft: 2, borderLeft: '1px solid rgba(255,255,255,0.12)', paddingLeft: 8 }}>
                {Math.abs(headwind) >= 1 && (
                  <span style={{
                    fontSize: 9, fontWeight: 800, letterSpacing: 0.5, lineHeight: 1.2,
                    color: headwind > 0 ? '#ef4444' : '#22c55e',
                  }}>
                    {headwind > 0 ? '▲' : '▼'}{Math.abs(Math.round(headwind))}y
                  </span>
                )}
                {Math.abs(driftYards) >= 1 && (
                  <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, lineHeight: 1.2, color: '#60a5fa' }}>
                    {driftYards > 0 ? '→' : '←'}{Math.abs(driftYards)}y
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Recenter button — top right */}
        {currentHole && (
          <button onClick={() => flyToHole(currentHole)} style={{
            position: 'absolute', top: 8, right: 8, zIndex: 10,
            background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
            border: '1px solid rgba(255,255,255,0.14)', color: 'white',
            borderRadius: 12, padding: '10px 14px', fontSize: 12, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
            boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
          }}>
            <Target size={14} color="#D4A53A" />
            Hole
          </button>
        )}

        {/* Bottom HUD — single flex row: yardage | enter score | chulligans/drives */}
        <div style={{
          position: 'absolute', bottom: navBase, left: 8, right: 8, zIndex: 10,
          display: 'flex', alignItems: 'flex-end', gap: isNarrow ? 10 : 16,
        }}>
          {/* Left: yardage stack */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
            {[
              { label: 'Back', yards: backDist,   color: '#ef4444' },
              { label: 'Ctr',  yards: centerDist, color: '#D4A53A' },
              { label: 'Frt',  yards: frontDist,  color: '#22c55e' },
            ].map(({ label, yards, color }) => {
              const raw = yards !== null && yards <= 9999 ? yards : null
              const adj = raw !== null && wind ? windAdjYards(raw, headwind) : raw
              const delta = raw !== null && wind ? (windAdjYards(raw, headwind) - raw) : 0
              const display = adj ?? '—'
              return (
                <div key={label} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
                  border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12,
                  padding: panelPadding, minWidth: isNarrow ? 120 : 158, position: 'relative',
                }}>
                  <span style={{ fontSize: isNarrow ? 10 : 12, fontWeight: 700, letterSpacing: 1.2, color, textTransform: 'uppercase', width: isNarrow ? 22 : 28 }}>{label}</span>
                  <span style={{ fontFamily: 'Bebas Neue', fontSize: yardageSize, lineHeight: 1, color: adj !== null ? 'white' : 'rgba(255,255,255,0.25)', letterSpacing: 0.5 }}>{display}</span>
                  {delta !== 0 && (
                    <span style={{
                      position: 'absolute', top: 4, right: 8,
                      fontSize: 9, fontWeight: 800, letterSpacing: 0.3,
                      color: delta > 0 ? '#ef4444' : '#22c55e',
                    }}>
                      {delta > 0 ? '+' : ''}{delta}w
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          {/* Center: Enter Score — flex:1 keeps equal visual gap on both sides */}
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }}>
            {profile && (
              <button onClick={() => setSheetOpen(true)} style={{
                background: 'rgba(212,165,58,0.88)', backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.15)', color: '#000',
                borderRadius: 8,
                padding: isNarrow ? '5px 9px' : '10px 18px',
                fontSize: isNarrow ? 11 : 13,
                fontWeight: 800, letterSpacing: 0.5,
                boxShadow: '0 4px 20px rgba(212,165,58,0.35)', cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}>
                ⛳ Enter Score
              </button>
            )}
          </div>

          {/* Right: chulligans box + drives box */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
            {scoring.myTeam && (() => {
              const p1 = scoring.myTeam!.player1, p2 = scoring.myTeam!.player2
              const players = [p1, p2].filter((p): p is NonNullable<typeof p1> => !!p)
              if (players.length === 0) return null

              const panelStyle: React.CSSProperties = {
                background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
                padding: isNarrow ? '5px 8px' : '7px 10px', minWidth: isNarrow ? 120 : 158,
              }
              const headerStyle: React.CSSProperties = {
                fontSize: 9, fontWeight: 700, letterSpacing: 1.6,
                color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 6,
              }
              const nameStyle: React.CSSProperties = {
                fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.75)',
                width: 46, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }

              return (
                <>
                  {/* Chulligans box */}
                  <div style={panelStyle}>
                    <div style={headerStyle}>🍺 Chulligans</div>
                    {players.map(player => {
                      const ch = scoring.myChulligans.find(c => c.player_id === player.id)
                      const firstName = displayName(player).split(' ')[0]
                      return (
                        <div key={player.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={nameStyle}>{firstName}</span>
                          {/* Beer mug: full = available; tappable faded = used (tap to undo) */}
                          <button
                            onClick={ch ? () => scoring.toggleMyChulligan(player.id, ch.hole) : undefined}
                            style={{
                              position: 'relative', display: 'inline-flex', alignItems: 'center',
                              background: 'none', border: 'none', padding: 0, cursor: ch ? 'pointer' : 'default',
                            }}
                            title={ch ? `Undo chulligan (hole ${ch.hole})` : 'No chulligan used'}
                          >
                            <span style={{
                              fontSize: 16, lineHeight: 1,
                              opacity: ch ? 0.28 : 1,
                              filter: ch ? 'grayscale(1)' : 'none',
                              transition: 'opacity 0.3s, filter 0.3s',
                            }}>🍺</span>
                            {ch ? (
                              /* Used: red badge with hole number — tap the whole button to undo */
                              <span style={{
                                position: 'absolute', top: -5, right: -8,
                                fontSize: 7, fontWeight: 800, lineHeight: 1,
                                background: '#ef4444', color: 'white',
                                borderRadius: 4, padding: '1px 3px',
                                letterSpacing: 0.3,
                              }}>H{ch.hole}</span>
                            ) : (
                              /* Available: green dot */
                              <span style={{
                                position: 'absolute', top: -2, right: -4,
                                width: 5, height: 5, borderRadius: '50%',
                                background: '#22c55e',
                                boxShadow: '0 0 4px rgba(34,197,94,0.8)',
                              }} />
                            )}
                          </button>
                        </div>
                      )
                    })}
                  </div>

                  {/* Drives box */}
                  <div style={panelStyle}>
                    <div style={headerStyle}>🏌️ Drives</div>
                    {players.map(player => {
                      const drivesUsed = scoring.countDrives(player.id, 1, 18)
                      const firstName = displayName(player).split(' ')[0]
                      return (
                        <div key={player.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={nameStyle}>{firstName}</span>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {Array.from({ length: 5 }, (_, i) => (
                              <div key={i} style={{
                                width: 9, height: 9, borderRadius: '50%',
                                background: i < drivesUsed ? '#D4A53A' : 'rgba(255,255,255,0.12)',
                                boxShadow: i < drivesUsed ? '0 0 5px rgba(212,165,58,0.75)' : 'none',
                                border: i < drivesUsed ? 'none' : '1px solid rgba(255,255,255,0.22)',
                                transition: 'background 0.25s, box-shadow 0.25s',
                              }} />
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      </div>

      <ScoreBottomSheet
        open={sheetOpen}
        hole={selectedHole}
        onClose={() => setSheetOpen(false)}
        onNextHole={() => { setSelectedHole(h => Math.min(18, h + 1)); setSheetOpen(false) }}
        myTeam={scoring.myTeam}
        myScores={scoring.myScores}
        myChulligans={scoring.myChulligans}
        saving={scoring.saving}
        adjustMyScore={scoring.adjustMyScore}
        setMyDrive={scoring.setMyDrive}
        setMyPutts={scoring.setMyPutts}
        resetMyScore={scoring.resetMyScore}
        toggleMyChulligan={scoring.toggleMyChulligan}
        countDrives={scoring.countDrives}
      />
    </div>
  )
}
