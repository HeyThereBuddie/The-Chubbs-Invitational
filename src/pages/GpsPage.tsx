import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import Map, { Marker, Source, Layer, type MapRef } from 'react-map-gl/mapbox'
import type { MapMouseEvent } from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Target, Navigation, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { localDb, type LocalScore, type LocalTeam, type LocalProfile } from '../lib/localDb'
import { useAuth } from '../context/AuthContext'
import { useYear } from '../context/YearContext'
import type { CourseGps, HoleGps, LatLng } from '../lib/types'
import { displayName, normalizeFairways } from '../lib/types'
import { resolvePar } from '../lib/pars'
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
function ReticleMarker({ scale = 1 }: { scale?: number }) {
  const cx = 32, cy = 32, outerR = 24, innerR = 9
  const size = 64 * scale
  return (
    <svg width={size} height={size} viewBox="0 0 64 64"
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

// Hole framing padding: clearance below the top chips (green sits here) and
// above the bottom HUD (the player/tee pin sits here).
const HUD_TOP_PAD = 96
const HUD_BOTTOM_PAD = 96

function calcBearing(a: LatLng, b: LatLng): number {
  const lat1 = (a.lat * Math.PI) / 180, lat2 = (b.lat * Math.PI) / 180
  const dLng  = ((b.lng - a.lng) * Math.PI) / 180
  const x = Math.sin(dLng) * Math.cos(lat2)
  const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return (Math.atan2(x, y) * 180 / Math.PI + 360) % 360
}

// ─── Wind helpers ─────────────────────────────────────────────────────────────

interface WindData { speed: number; direction: number; fetchedAt: number }

function windComponents(speedMph: number, windDirDeg: number, shotBearingDeg: number) {
  // windDirDeg is meteorological (the direction the wind blows FROM). Wind coming
  // from the direction you're aiming is a headwind, so decompose against windFrom.
  const rel = ((windDirDeg - shotBearingDeg) * Math.PI) / 180
  return {
    headwind:  speedMph * Math.cos(rel),   // + = into your face (plays longer)
    crosswind: -speedMph * Math.sin(rel),  // + = pushes the ball to the right
  }
}

function windDriftYards(baseYards: number, crosswind: number): number {
  // ≈1 yd drift per 10 mph crosswind per 100 yards of carry
  return Math.round(crosswind * baseYards / 100)
}

// Wind "plays-like": headwind makes a shot play longer, tailwind shorter (a
// tailwind helps less than a headwind hurts). Coefficients are tunable.
function windPlaysLikeYards(headwindMph: number, baseYards: number): number {
  const factor = headwindMph >= 0 ? 0.6 : 0.35
  return Math.round(headwindMph * (baseYards / 100) * factor)
}

// Elevation "plays-like": uphill plays longer, downhill shorter. ~1 yd per 3 ft.
const ELEV_YARDS_PER_FOOT = 1 / 3
const METERS_TO_FEET = 3.28084

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

function scoreToPar(teamId: string, scores: LocalScore[], parOf: (hole: number) => number): number | null {
  const teamScores = scores.filter(s => s.team_id === teamId)
  if (!teamScores.length) return null
  return teamScores.reduce((sum, s) => sum + s.score - parOf(s.hole), 0)
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function GpsPage() {
  const { profile, isAdmin } = useAuth()
  const { effectiveTournamentId } = useYear()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const mapRef = useRef<MapRef>(null)

  const scoring = usePlayerScoring()
  const [sheetOpen, setSheetOpen] = useState(false)

  const [course, setCourse]   = useState<CourseGps | null>(null)
  const [loading, setLoading] = useState(true)
  const [realPosition, setRealPosition] = useState<LatLng | null>(null)
  const [simMode, setSimMode] = useState(false)
  const [simMoveMode, setSimMoveMode] = useState(false)
  const [simPosition, setSimPosition] = useState<LatLng | null>(null)
  const position = simMode ? simPosition : realPosition
  const [elevM, setElevM] = useState<{ player: number | null; target: number | null }>({ player: null, target: null })
  const elevCacheRef = useRef<Record<string, number>>({})
  const [playerBearing, setPlayerBearing] = useState<number | null>(null)
  const [gpsStatus, setGpsStatus] = useState<'acquiring' | 'ok' | 'denied' | 'unavailable'>('acquiring')
  const [selectedHole, setSelectedHole] = useState(() => {
    const urlH = parseInt(searchParams.get('hole') ?? '0')
    if (urlH >= 1 && urlH <= 18) return urlH
    const stored = parseInt(localStorage.getItem('gps_last_hole') ?? '0')
    return stored >= 1 && stored <= 18 ? stored : 1
  })
  const [tapPoint, setTapPoint] = useState<LatLng | null>(null)
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
  const yardageSize  = isNarrow ? 36 : 44
  const panelPadding = isNarrow ? '7px 11px' : '10px 16px'

  // Refs for position publishing and bearing — avoid re-registering the GPS watch
  const lastPublishRef    = useRef<{ lat: number; lng: number; at: number } | null>(null)
  const lastPosRef        = useRef<LatLng | null>(null)
  const followPausedRef   = useRef(false)
  const followPauseTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoOpenedHoleRef = useRef(0)
  const lastTargetPosRef  = useRef<LatLng | null>(null)
  const lastTargetHoleRef = useRef(0)
  const lastElevFetchRef  = useRef(0)
  const publishRef     = useRef<{ profileId: string; tournamentId: string; teamId: string | null } | null>(null)
  publishRef.current = (profile && effectiveTournamentId)
    ? { profileId: profile.id, tournamentId: effectiveTournamentId, teamId: scoring.myTeam?.id ?? null }
    : null

  // ── Data loading ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!effectiveTournamentId) { setLoading(false); return }

    const applyGps = (gps: CourseGps) => {
      setCourse({ ...gps, holes: normalizeFairways(gps.holes ?? []) })
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
        setRealPosition(newPos)
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
    if (!effectiveTournamentId) return
    Promise.all([
      localDb.teams.where('tournament_id').equals(effectiveTournamentId).toArray(),
      localDb.profiles.toArray(),
    ]).then(([teams, profiles]) => {
      const teamIds = new Set(teams.map(t => t.id))
      localDb.scores.toArray().then(scores => {
        setLocalScores(scores.filter(s => teamIds.has(s.team_id)))
        setLocalTeams(teams)
        setLocalProfiles(profiles)
      })
    })
  }, [effectiveTournamentId])

  // ── Wind data (Open-Meteo, refreshes every 10 min) ────────────────────────

  useEffect(() => {
    if (!course?.lat || !course?.lng) return
    const lat = course.lat, lng = course.lng
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const tick = async () => {
      if (stopped) return
      let ok = false
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=mph&timezone=auto`
        const res = await fetch(url)
        if (res.ok) {
          const c = (await res.json()).current
          if (typeof c?.wind_speed_10m === 'number' && typeof c?.wind_direction_10m === 'number') {
            setWind({ speed: Math.round(c.wind_speed_10m), direction: c.wind_direction_10m, fetchedAt: Date.now() })
            ok = true
          }
        }
      } catch { /* offline / transient */ }
      // Refresh every 10 min on success; retry quickly (30 s) after a failure so
      // a transient hiccup doesn't leave the wind chip blank for 10 minutes.
      if (!stopped) timer = setTimeout(tick, ok ? 10 * 60 * 1000 : 30 * 1000)
    }
    tick()
    return () => { stopped = true; if (timer) clearTimeout(timer) }
  }, [course?.lat, course?.lng])

  // ── Derived state ─────────────────────────────────────────────────────────

  const currentHole: HoleGps | undefined = course?.holes.find(h => h.hole === selectedHole)

  const corridorGeoJson = useMemo(() => {
    const fairways = (currentHole?.fairway ?? []).filter(p => p.length >= 3)
    if (fairways.length > 0) {
      return { type: 'FeatureCollection' as const,
        features: fairways.map((poly, i) => {
          const coords = poly.map(p => [p.lng, p.lat] as [number, number])
          return { type: 'Feature' as const, id: i,
            geometry: { type: 'Polygon' as const, coordinates: [[...coords, coords[0]]] }, properties: {} }
        }) }
    }
    const tee = currentHole?.tee, green = currentHole?.green.center
    if (!tee || !green) return null
    return { type: 'FeatureCollection' as const,
      features: [{ type: 'Feature' as const,
        geometry: { type: 'Polygon' as const, coordinates: [buildCorridor(tee, green, calcBearing(tee, green))] },
        properties: {} }] }
  }, [currentHole])


  const landingZoneGeoJson = useMemo(() => {
    const lz = currentHole?.landingZone; if (!lz) return null

    // Collect all fairway polygon coords for containment check (union — any polygon counts)
    let fairwayPolygons: [number, number][][] = []
    if (currentHole.fairway && currentHole.fairway.length > 0) {
      fairwayPolygons = currentHole.fairway.filter(p => p.length >= 3).map(p => p.map(pt => [pt.lng, pt.lat] as [number, number]))
    } else if (currentHole.tee && currentHole.green.center) {
      fairwayPolygons = [buildCorridor(currentHole.tee, currentHole.green.center,
        calcBearing(currentHole.tee, currentHole.green.center))]
    }

    // Ray-casting point-in-polygon test (lng/lat coords are fine at this scale)
    function inPoly(pt: [number, number], poly: [number, number][]): boolean {
      let inside = false
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j]
        if (((yi > pt[1]) !== (yj > pt[1])) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)
          inside = !inside
      }
      return inside
    }
    const inAnyFairway = (pt: [number, number]) => fairwayPolygons.some(poly => inPoly(pt, poly))

    // Binary-search for the largest radius (up to 27m) where all 36 boundary
    // points sit inside any fairway polygon. Floor at 8m; skip if center is outside.
    const MAX_R = 27, MIN_R = 8
    let radius = MAX_R
    if (fairwayPolygons.length > 0) {
      const center: [number, number] = [lz.lng, lz.lat]
      if (inAnyFairway(center)) {
        let lo = MIN_R, hi = MAX_R
        for (let iter = 0; iter < 20; iter++) {
          const mid = (lo + hi) / 2
          const allIn = Array.from({ length: 36 }, (_, i) => {
            const pt = offsetLatLng(lz, (i / 36) * 360, mid)
            return inAnyFairway([pt.lng, pt.lat])
          }).every(Boolean)
          if (allIn) lo = mid; else hi = mid
        }
        radius = lo
      }
    }

    const circle: [number, number][] = []
    for (let i = 0; i <= 36; i++) { const pt = offsetLatLng(lz, (i / 36) * 360, radius); circle.push([pt.lng, pt.lat]) }

    // Label arc: slightly inside circle so text sits within the boundary
    const labelR = Math.max(MIN_R, radius - 5)
    const labelArc: [number, number][] = []
    for (let i = 0; i <= 72; i++) { const pt = offsetLatLng(lz, (i / 72) * 360, labelR); labelArc.push([pt.lng, pt.lat]) }

    return {
      circle: { type: 'Feature' as const, geometry: { type: 'Polygon' as const, coordinates: [circle] }, properties: {} },
      label:  { type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: labelArc }, properties: {} },
    }
  }, [currentHole])

  const aimLineGeoJson = useMemo(() => {
    if (!position) return null
    const target = tapPoint ?? currentHole?.green.center
    if (!target) return null
    return { type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: [[position.lng, position.lat], [target.lng, target.lat]] },
      properties: {} }
  }, [position, tapPoint, currentHole])

  const tapToGreenGeoJson = useMemo(() => {
    const green = currentHole?.green.center; if (!tapPoint || !green) return null
    return { type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: [[tapPoint.lng, tapPoint.lat], [green.lng, green.lat]] },
      properties: {} }
  }, [tapPoint, currentHole])

  const activeOtherPositions = useMemo(() => {
    const now = Date.now()
    return otherPositions.filter(p =>
      p.player_id !== profile?.id &&
      now - new Date(p.updated_at).getTime() < STALE_MS
    )
  }, [otherPositions, profile?.id])

  // ── Map fly-to ────────────────────────────────────────────────────────────

  // Shared hole framing: rotate so the hole points "up" (anchor→green) and fit
  // BOTH the player/tee and the green inside the map area between the top chips
  // and the HUD. fitBounds handles the zoom+center math so both endpoints are
  // always visible regardless of hole length or orientation. Within approach
  // range of the green the camera tilts for a 3D "behind the ball" perspective.
  const frameHole = useCallback((anchor: LatLng, green: LatLng, durationMs: number) => {
    const map = mapRef.current
    if (!map) return
    const bearing = calcBearing(anchor, green)
    // Approach tilt: flat overhead beyond APPROACH_YDS, ramping to MAX_PITCH as
    // the player nears the green. Gives the realistic tilted look on approach shots.
    const distYds = haversineYards(anchor, green)
    const APPROACH_YDS = 200, MAX_PITCH = 48
    const pitch = distYds >= APPROACH_YDS
      ? 0
      : Math.min(MAX_PITCH, Math.round((APPROACH_YDS - distYds) / (APPROACH_YDS - 20) * MAX_PITCH))
    const bounds: [[number, number], [number, number]] = [
      [Math.min(anchor.lng, green.lng), Math.min(anchor.lat, green.lat)],
      [Math.max(anchor.lng, green.lng), Math.max(anchor.lat, green.lat)],
    ]
    map.fitBounds(bounds, {
      bearing,
      pitch,
      // top clears the hole/wind chips (green sits here); bottom clears the HUD
      // (player pin sits here, above Enter Score); sides give the fairway margin.
      // Tilted views need extra top headroom so the green isn't pushed off screen.
      padding: { top: pitch > 0 ? 150 : HUD_TOP_PAD, bottom: HUD_BOTTOM_PAD, left: 48, right: 48 },
      maxZoom: 18.5,
      duration: durationMs,
      essential: false,
    })
  }, [])

  const flyToHole = useCallback((hole: HoleGps) => {
    const green = hole.green.center, tee = hole.tee
    if (!green && !tee) return
    // Always frame the selected hole itself (its own tee → green), regardless of
    // where the player currently is, so selecting a hole always centers on it.
    if (!green || !tee) {
      const only = green ?? tee!
      mapRef.current?.flyTo({ center: [only.lng, only.lat], zoom: 16.5, pitch: 0, duration: 800 })
      return
    }
    frameHole(tee, green, 800)
  }, [frameHole])

  const [mapLoaded, setMapLoaded] = useState(false)
  const initialFlyDone = useRef(false)

  useEffect(() => {
    if (!mapLoaded || !currentHole || initialFlyDone.current) return
    initialFlyDone.current = true
    flyToHole(currentHole)
  }, [mapLoaded, currentHole, flyToHole])

  useEffect(() => {
    if (!initialFlyDone.current || !currentHole) return
    // A prior map pan pauses the follow-cam; selecting a hole should always
    // re-center, so clear the pause and frame the newly selected hole.
    followPausedRef.current = false
    if (followPauseTimer.current) clearTimeout(followPauseTimer.current)
    flyToHole(currentHole)
  }, [selectedHole]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-target the sniper reticle. Beyond 200 yds it sits halfway to the green
  // (your next-shot target); within 200 yds it snaps to the middle of the green.
  // It re-sets on a new hole, after the player advances ~30 yds toward the green
  // (fresh target for the next shot), and when crossing inside 200 yds. Between
  // those, a manual tap to measure a different target sticks.
  useEffect(() => {
    const green = currentHole?.green.center
    const holeChanged = lastTargetHoleRef.current !== selectedHole
    if (!position || !green) {
      // No live position: don't carry a target across holes (falls back to green).
      if (holeChanged) { setTapPoint(null); lastTargetPosRef.current = null; lastTargetHoleRef.current = selectedHole }
      return
    }
    const distToGreen = haversineYards(position, green)
    const last = lastTargetPosRef.current
    const lastDist = last ? haversineYards(last, green) : Infinity
    const movedToward = lastDist - distToGreen
    const crossedInside200 = lastDist > 200 && distToGreen <= 200
    if (holeChanged || last === null || movedToward >= 30 || crossedInside200) {
      const auto = distToGreen > 200
        ? { lat: (position.lat + green.lat) / 2, lng: (position.lng + green.lng) / 2 }
        : green
      setTapPoint(auto)
      lastTargetPosRef.current = position
      lastTargetHoleRef.current = selectedHole
    }
  }, [position, currentHole, selectedHole])

  // Sim mode: lock the sim pin to the current hole's tee. Re-locks (and disarms
  // "Move Location") whenever the selected hole changes so it jumps to the new tee.
  useEffect(() => {
    if (!simMode) return
    const tee = currentHole?.tee ?? currentHole?.green.center
    if (tee) setSimPosition(tee)
    setSimMoveMode(false)
  }, [selectedHole, simMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist last hole so navigation away and back restores the same hole
  useEffect(() => { localStorage.setItem('gps_last_hole', String(selectedHole)) }, [selectedHole])

  // Follow-cam: track live position changes (hole-select framing is flyToHole's
  // job). Depending only on position avoids a stale-position frame the instant
  // the hole changes, which would fight the flyToHole re-center.
  useEffect(() => {
    if (!position || !currentHole?.green.center || followPausedRef.current) return
    frameHole(position, currentHole.green.center, 600)
  }, [position, frameHole]) // eslint-disable-line react-hooks/exhaustive-deps

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
    // In sim mode, only relocate the sim pin while "Move Location" is armed.
    if (simMode && simMoveMode) {
      setSimPosition({ lat: e.lngLat.lat, lng: e.lngLat.lng })
      return
    }
    setTapPoint({ lat: e.lngLat.lat, lng: e.lngLat.lng })
    setSelectedCartPlayerId(null)
    // Restart the auto-reset countdown from here so a manual target sticks until
    // the player walks ~30 yds toward the green.
    if (position) lastTargetPosRef.current = position
  }

  // ── Distances ─────────────────────────────────────────────────────────────

  const frontDist      = dist(position, currentHole?.green.front)
  const centerDist     = dist(position, currentHole?.green.center)
  const backDist       = dist(position, currentHole?.green.back)
  const tapDist        = dist(position, tapPoint)
  const tapToGreenDist = dist(tapPoint, currentHole?.green.center)
  const distToTee      = dist(position, currentHole?.tee)
  // Hide landing zone once player has walked >75 yds from tee (no longer relevant)
  const showLandingZone = !!currentHole?.landingZone && (!position || distToTee === null || distToTee <= 75)

  const aimLineTarget = tapPoint ?? currentHole?.green.center ?? null
  const aimLineDist   = tapPoint ? tapDist : centerDist
  const aimLineMid    = position && aimLineTarget
    ? { lat: (position.lat + aimLineTarget.lat) / 2, lng: (position.lng + aimLineTarget.lng) / 2 } : null
  const tapToGreenMid = tapPoint && currentHole?.green.center
    ? { lat: (tapPoint.lat + currentHole.green.center.lat) / 2, lng: (tapPoint.lng + currentHole.green.center.lng) / 2 } : null

  // Auto-open score sheet once per hole when player reaches the green (~20 yds)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!profile || sheetOpen || centerDist === null || centerDist > 20) return
    if (autoOpenedHoleRef.current === selectedHole) return
    autoOpenedHoleRef.current = selectedHole
    setSheetOpen(true)
  }, [centerDist, selectedHole, profile, sheetOpen])

  // Elevation for the player and the aim target (Open-Meteo, no key). Cached per
  // rounded coordinate so walking around doesn't spam the API; used for the
  // elevation "plays-like" adjustment.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!position || !aimLineTarget) { setElevM({ player: null, target: null }); return }
    const cache = elevCacheRef.current
    const pKey = `${position.lat.toFixed(4)},${position.lng.toFixed(4)}`
    const tKey = `${aimLineTarget.lat.toFixed(5)},${aimLineTarget.lng.toFixed(5)}`
    const apply = () => setElevM({ player: cache[pKey] ?? null, target: cache[tKey] ?? null })

    const need: { key: string; lat: number; lng: number }[] = []
    if (!(pKey in cache)) need.push({ key: pKey, lat: +position.lat.toFixed(4), lng: +position.lng.toFixed(4) })
    if (!(tKey in cache)) need.push({ key: tKey, lat: +aimLineTarget.lat.toFixed(5), lng: +aimLineTarget.lng.toFixed(5) })
    if (need.length === 0) { apply(); return }

    // Throttle network fetches to at most one per 12 s so elevation lookups can't
    // rate-limit the shared Open-Meteo host (which also serves the wind data).
    if (Date.now() - lastElevFetchRef.current < 12000) return
    lastElevFetchRef.current = Date.now()

    let cancelled = false
    ;(async () => {
      try {
        const lats = need.map(n => n.lat).join(',')
        const lngs = need.map(n => n.lng).join(',')
        const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`)
        if (res.ok) {
          const json = await res.json()
          const arr = json?.elevation as number[] | undefined
          if (Array.isArray(arr)) need.forEach((n, i) => { if (typeof arr[i] === 'number') cache[n.key] = arr[i] })
        }
      } catch { /* offline — elevation adjustment just won't show */ }
      if (!cancelled) apply()
    })()
    return () => { cancelled = true }
  }, [position?.lat, position?.lng, aimLineTarget?.lat, aimLineTarget?.lng])

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

  // Prefer the course's own par (set in admin GPS setup) over the default table.
  const parOf = (holeNum: number) => resolvePar(holeNum, course.holes)
  const parForHole = parOf(selectedHole)
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

  // ── "Plays like" — wind + elevation adjustment on the shot to the aim target ─
  const validAim = aimLineDist !== null && aimLineDist <= 9999
  const shotBearing = (position && aimLineTarget) ? calcBearing(position, aimLineTarget) : holeBearing
  const shotHeadwind = (wind && shotBearing !== null)
    ? windComponents(wind.speed, wind.direction, shotBearing).headwind : 0
  const windAdjYds = (wind && validAim) ? windPlaysLikeYards(shotHeadwind, aimLineDist!) : 0
  const elevDeltaFt = (elevM.player !== null && elevM.target !== null)
    ? (elevM.target - elevM.player) * METERS_TO_FEET : null
  const elevAdjYds = elevDeltaFt !== null ? Math.round(elevDeltaFt * ELEV_YARDS_PER_FOOT) : 0
  const playsLikeYds = validAim ? Math.max(1, aimLineDist! + windAdjYds + elevAdjYds) : null
  const playsLikeDelta = playsLikeYds !== null ? playsLikeYds - aimLineDist! : 0

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0,
      bottom: 'env(safe-area-inset-bottom, 0px)',
      display: 'flex', flexDirection: 'column',
      zIndex: 60, background: 'var(--bg)', overscrollBehavior: 'none',
    }}>
      {/* Hole selector strip */}
      <div style={{ background: 'var(--panel)', borderBottom: '1px solid var(--bdr)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', gap: 4 }}>
          <button className="pressable" onClick={() => navigate('/')} style={{
            padding: '4px 8px', background: 'none', border: 'none',
            color: 'var(--tx3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 12, flexShrink: 0,
          }}>
            <X size={16} />
          </button>
          <button className="pressable" onClick={() => setSelectedHole(h => Math.max(1, h - 1))} disabled={selectedHole === 1}
            style={{ padding: 4, background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', opacity: selectedHole === 1 ? 0.3 : 1 }}>
            <ChevronLeft size={18} />
          </button>

          <div style={{ flex: 1, overflowX: 'auto', scrollbarWidth: 'none' }}>
            <div style={{ display: 'flex', gap: 4, paddingBottom: 4 }}>
              {Array.from({ length: 18 }, (_, i) => i + 1).map(hole => {
                const active = selectedHole === hole, hasData = holeHasData(hole)
                return (
                  <button key={hole} className="pressable" onClick={() => setSelectedHole(hole)} style={{
                    minWidth: isNarrow ? 32 : 38, height: isNarrow ? 28 : 38, borderRadius: 10, flexShrink: 0,
                    border: active ? '1px solid var(--gold)' : '1px solid var(--bdr)',
                    background: active
                      ? 'linear-gradient(180deg, var(--gold-25), var(--gold-15))'
                      : 'var(--surf)',
                    boxShadow: active ? '0 0 10px var(--gold-25), var(--elev-1)' : 'none',
                    cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                    transform: active ? 'scale(1.08)' : 'scale(1)',
                    transition: 'transform 0.15s var(--spring), border-color 0.15s, background 0.15s, box-shadow 0.15s',
                    opacity: hasData ? 1 : 0.5,
                  }}>
                    <span style={{ fontSize: isNarrow ? 10 : 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: active ? 'var(--gold)' : 'var(--tx2)', lineHeight: 1 }}>{hole}</span>
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: hasData ? '#22c55e' : 'var(--bdr)', flexShrink: 0 }} />
                  </button>
                )
              })}
            </div>
          </div>

          <button className="pressable" onClick={() => setSelectedHole(h => Math.min(18, h + 1))} disabled={selectedHole === 18}
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
          mapStyle="mapbox://styles/mapbox/satellite-v9"
          onLoad={() => setMapLoaded(true)}
          onClick={handleMapClick}
          onDragStart={() => {
            followPausedRef.current = true
            if (followPauseTimer.current) clearTimeout(followPauseTimer.current)
          }}
          onDragEnd={() => {
            followPauseTimer.current = setTimeout(() => { followPausedRef.current = false }, 8000)
          }}
        >
          {/* Fairway corridor */}
          {corridorGeoJson && (
            <Source id="corridor" type="geojson" data={corridorGeoJson}>
              <Layer id="corridor-fill" type="fill" paint={{ 'fill-color': 'rgba(255,255,255,0.05)' }} />
              <Layer id="corridor-outline" type="line"
                paint={{ 'line-color': 'rgba(255,255,255,0.40)', 'line-width': 1.5, 'line-dasharray': [5, 5] }} />
            </Source>
          )}

          {/* Landing zone */}
          {showLandingZone && landingZoneGeoJson && (
            <>
              <Source id="landing-zone" type="geojson" data={landingZoneGeoJson.circle}>
                <Layer id="landing-zone-fill" type="fill" paint={{ 'fill-color': 'rgba(74,222,128,0.18)' }} />
                <Layer id="landing-zone-outline" type="line"
                  paint={{ 'line-color': 'rgba(74,222,128,0.80)', 'line-width': 2, 'line-dasharray': [6, 3] }} />
              </Source>
              <Source id="landing-zone-label" type="geojson" data={landingZoneGeoJson.label}>
                <Layer
                  id="landing-zone-label-text"
                  type="symbol"
                  layout={{
                    'symbol-placement': 'line',
                    'text-field': 'SUGGESTED LANDING ZONE',
                    'text-size': 10,
                    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                    'text-letter-spacing': 0.1,
                    'symbol-spacing': 250,
                  }}
                  paint={{
                    'text-color': 'rgba(74,222,128,0.85)',
                    'text-halo-color': 'rgba(0,0,0,0.5)',
                    'text-halo-width': 1,
                  }}
                />
              </Source>
            </>
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
          {position && !simMode && (
            <Marker longitude={position.lng} latitude={position.lat} anchor="center">
              <PlayerDot bearing={playerBearing} />
            </Marker>
          )}

          {/* Sim mode: draggable player pin */}
          {simMode && simPosition && (
            <Marker longitude={simPosition.lng} latitude={simPosition.lat} anchor="center">
              <div style={{
                width: 34, height: 34, borderRadius: '50%',
                background: 'rgba(251,191,36,0.25)',
                border: '2.5px dashed #fbbf24',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, pointerEvents: 'none',
                boxShadow: '0 0 12px rgba(251,191,36,0.5)',
              }}>📍</div>
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
          {showLandingZone && currentHole?.landingZone && (
            <Marker longitude={currentHole.landingZone.lng} latitude={currentHole.landingZone.lat} anchor="center">
              <div style={{
                width: 18, height: 18, borderRadius: '50%',
                background: 'rgba(74,222,128,0.30)', border: '2px solid rgba(74,222,128,0.90)',
                boxShadow: '0 0 8px rgba(74,222,128,0.6)',
              }} />
            </Marker>
          )}

          {/* Sniper reticle — at tap point if set, otherwise at green center.
              Shrinks within 200 yds of the green (approach range). */}
          {position && aimLineTarget && (
            <Marker longitude={aimLineTarget.lng} latitude={aimLineTarget.lat} anchor="center">
              <ReticleMarker scale={centerDist !== null && centerDist <= 200 ? 0.7 : 1} />
            </Marker>
          )}

          {/* Aim line distance label (+ plays-like for wind & elevation) */}
          {aimLineMid && aimLineDist !== null && aimLineDist <= 9999 && (
            <Marker longitude={aimLineMid.lng} latitude={aimLineMid.lat} anchor="center">
              <div style={{
                background: 'rgba(8,8,12,0.82)', backdropFilter: 'blur(10px)',
                color: '#ffffff', borderRadius: 18, padding: '5px 13px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                border: '1px solid rgba(255,255,255,0.22)',
                boxShadow: '0 0 16px rgba(255,255,255,0.12), 0 2px 10px rgba(0,0,0,0.65)',
                whiteSpace: 'nowrap', pointerEvents: 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontFamily: 'Bebas Neue', fontSize: 28, letterSpacing: 0.5, lineHeight: 1 }}>{aimLineDist}</span>
                  <span style={{ fontSize: 10, opacity: 0.55, fontWeight: 600, letterSpacing: 0.5 }}>YDS</span>
                </div>
                {playsLikeYds !== null && Math.abs(playsLikeDelta) >= 2 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 1 }}>
                    <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color: 'rgba(255,255,255,0.45)' }}>PLAYS</span>
                    <span style={{ fontFamily: 'Bebas Neue', fontSize: 18, lineHeight: 1, letterSpacing: 0.5, color: playsLikeDelta > 0 ? '#f87171' : '#4ade80' }}>{playsLikeYds}</span>
                    <span style={{ fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.3 }}>
                      {[windAdjYds ? `W${windAdjYds > 0 ? '+' : ''}${windAdjYds}` : '', elevAdjYds ? `E${elevAdjYds > 0 ? '+' : ''}${elevAdjYds}` : ''].filter(Boolean).join(' ')}
                    </span>
                  </div>
                )}
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

        {/* Top-right badges: GPS status + sim mode toggle */}
        <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
          {gpsStatus !== 'ok' && !simMode && (
            <div style={{
              background: gpsStatus === 'acquiring' ? 'rgba(8,8,12,0.72)' : 'rgba(239,68,68,0.88)',
              color: 'white', padding: '5px 12px', borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.14)', boxShadow: 'var(--elev-1)',
              fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Navigation size={12} />
              {gpsStatus === 'acquiring' ? 'Acquiring GPS…' : gpsStatus === 'denied' ? 'GPS permission denied' : 'GPS unavailable'}
            </div>
          )}

          {/* Sim mode controls — admins only */}
          {isAdmin && (
            <>
              <button
                onClick={() => {
                  if (simMode) {
                    setSimMode(false)
                    setSimMoveMode(false)
                    setSimPosition(null)
                  } else {
                    // Lock to the current hole's tee; the hole-change effect keeps it there.
                    const startPos = currentHole?.tee
                      ?? (currentHole?.green.center)
                      ?? { lat: viewState.latitude, lng: viewState.longitude }
                    setSimPosition(startPos)
                    setSimMoveMode(false)
                    setSimMode(true)
                  }
                }}
                className="pressable"
                style={{
                  padding: '5px 11px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                  background: simMode ? 'rgba(251,191,36,0.88)' : 'rgba(8,8,12,0.62)',
                  color: simMode ? '#000' : 'rgba(255,255,255,0.78)',
                  border: simMode ? '1.5px solid rgba(251,191,36,0.5)' : '1px solid rgba(255,255,255,0.14)',
                  backdropFilter: 'blur(8px)',
                  boxShadow: 'var(--elev-1)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                  letterSpacing: 0.8, textTransform: 'uppercase',
                }}
              >
                📍 {simMode ? 'Exit Sim' : 'Sim GPS'}
              </button>

              {simMode && (
                <button
                  onClick={() => setSimMoveMode(v => !v)}
                  className="pressable"
                  style={{
                    padding: '5px 11px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                    background: simMoveMode ? 'rgba(96,165,250,0.90)' : 'rgba(8,8,12,0.62)',
                    color: simMoveMode ? '#000' : 'rgba(255,255,255,0.78)',
                    border: simMoveMode ? '1.5px solid rgba(96,165,250,0.5)' : '1px solid rgba(255,255,255,0.14)',
                    backdropFilter: 'blur(8px)',
                    boxShadow: 'var(--elev-1)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                    letterSpacing: 0.8, textTransform: 'uppercase',
                  }}
                >
                  {simMoveMode ? '✓ Done Moving' : '✋ Move Location'}
                </button>
              )}

              {simMode && (
                <div style={{
                  padding: '4px 10px', borderRadius: 8, fontSize: 11,
                  background: simMoveMode ? 'rgba(96,165,250,0.14)' : 'rgba(251,191,36,0.12)',
                  color: simMoveMode ? '#60a5fa' : '#fbbf24',
                  border: `1px solid ${simMoveMode ? 'rgba(96,165,250,0.30)' : 'rgba(251,191,36,0.25)'}`,
                  backdropFilter: 'blur(8px)', textAlign: 'center', maxWidth: 160,
                }}>
                  {simMoveMode ? 'Tap map to move the sim pin' : `Locked to hole ${selectedHole} tee`}
                </div>
              )}
            </>
          )}
        </div>

        {/* Tap hint */}
        {!tapPoint && position && (
          <div style={{
            position: 'absolute', bottom: aboveHudCalc, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(10,10,15,0.7)', color: 'rgba(255,255,255,0.6)',
            padding: '4px 12px', borderRadius: 20, fontSize: 11,
            whiteSpace: 'nowrap', pointerEvents: 'none',
          }}>
            Tap map to measure distance
          </div>
        )}

        {/* Cart player popup */}
        {(() => {
          if (!selectedCartPlayerId) return null
          const pos = activeOtherPositions.find(p => p.player_id === selectedCartPlayerId)
          if (!pos) return null
          const player  = localProfiles.find(p => p.id === selectedCartPlayerId)
          const team    = pos.team_id ? localTeams.find(t => t.id === pos.team_id) : null
          const toPar   = pos.team_id ? scoreToPar(pos.team_id, localScores, parOf) : null
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

        {/* Hole chip + recenter button — top left column */}
        {(() => {
          let totalVsPar = 0
          let holesPlayed = 0
          for (let h = 1; h <= 18; h++) {
            const s = scoring.myScores[h]
            if (s) { totalVsPar += s.score - parOf(h); holesPlayed++ }
          }
          const scorLabel = holesPlayed === 0 ? 'E' : totalVsPar === 0 ? 'E' : totalVsPar > 0 ? `+${totalVsPar}` : `${totalVsPar}`
          const scorColor = totalVsPar < 0 ? '#22c55e' : totalVsPar > 0 ? '#ef4444' : 'rgba(255,255,255,0.5)'
          // Leaderboard position
          const ranked = localTeams
            .map(t => ({ id: t.id, toPar: scoreToPar(t.id, localScores, parOf) }))
            .filter((t): t is { id: string; toPar: number } => t.toPar !== null)
            .sort((a, b) => a.toPar - b.toPar)
          const myTeamId = scoring.myTeam?.id
          const myToPar  = myTeamId ? scoreToPar(myTeamId, localScores, parOf) : null
          let posLabel: string | null = null
          if (myTeamId && myToPar !== null) {
            const posIdx = ranked.findIndex(t => t.id === myTeamId)
            if (posIdx >= 0) {
              const pos  = posIdx + 1
              const tied = ranked.filter(t => t.toPar === myToPar).length > 1
              const sfx  = pos === 1 ? 'st' : pos === 2 ? 'nd' : pos === 3 ? 'rd' : 'th'
              posLabel   = `${tied ? 'T' : ''}${pos}${sfx}`
            }
          }
          return (
            <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* Hole + Currently chip */}
              <div style={{
                background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12,
                padding: isNarrow ? '6px 8px' : '8px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center',
                boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
              }}>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: holeNumSize, letterSpacing: 1, lineHeight: 1, color: '#D4A53A' }}>{selectedHole}</div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Par {parForHole}</div>
                <div style={{ width: '100%', height: 1, background: 'rgba(255,255,255,0.15)', margin: '5px 0' }} />
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.8, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>Currently</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
                  <div style={{ fontFamily: 'Bebas Neue', fontSize: scoreNumSize, lineHeight: 1, letterSpacing: 0.5, color: scorColor }}>{scorLabel}</div>
                  {posLabel && (
                    <>
                      <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.2)', margin: '2px 0' }} />
                      <div style={{ fontFamily: 'Bebas Neue', fontSize: scoreNumSize, lineHeight: 1, letterSpacing: 0.5, color: 'rgba(255,255,255,0.65)' }}>{posLabel}</div>
                    </>
                  )}
                </div>
              </div>
              {/* Recenter button — separate, below chip */}
              {currentHole && (
                <button onClick={() => flyToHole(currentHole)} style={{
                  background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
                  border: '1px solid rgba(255,255,255,0.14)', color: 'white',
                  borderRadius: 12, padding: isNarrow ? '7px 10px' : '10px 14px', fontSize: 12, fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, cursor: 'pointer',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
                }}>
                  <Target size={14} color="#D4A53A" />
                  Hole
                </button>
              )}
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
            {/* Arrow points the way the wind is blowing TO, rotated into the map's
                frame so it aligns with the satellite view (which rotates hole-up). */}
            <div style={{ transform: `rotate(${wind.direction + 180 - viewState.bearing}deg)`, display: 'flex', lineHeight: 1 }}>
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
                    {headwind > 0 ? '▲' : '▼'}{Math.abs(Math.round(headwind))}
                  </span>
                )}
                {Math.abs(driftYards) >= 1 && (
                  <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, lineHeight: 1.2, color: '#60a5fa' }}>
                    {driftYards > 0 ? '→' : '←'}{Math.abs(driftYards)}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Bottom HUD — single flex row: yardage | enter score | chulligans/drives */}
        <div style={{
          position: 'absolute', bottom: navBase, left: 8, right: 8, zIndex: 10,
          display: 'flex', alignItems: 'flex-end', gap: 6,
        }}>
          {/* Left: yardage stack */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
            {[
              { label: 'Back', yards: backDist,   color: '#ef4444' },
              { label: 'Ctr',  yards: centerDist, color: '#D4A53A' },
              { label: 'Frt',  yards: frontDist,  color: '#22c55e' },
            ].map(({ label, yards, color }) => {
              const raw = yards !== null && yards <= 9999 ? yards : null
              const display = raw ?? '—'
              return (
                <div key={label} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
                  border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12,
                  padding: panelPadding, minWidth: isNarrow ? 110 : 150,
                }}>
                  <span style={{ fontSize: isNarrow ? 10 : 12, fontWeight: 700, letterSpacing: 1.2, color, textTransform: 'uppercase' }}>{label}</span>
                  <span style={{ fontFamily: 'Bebas Neue', fontSize: yardageSize, lineHeight: 1, color: raw !== null ? 'white' : 'rgba(255,255,255,0.25)', letterSpacing: 0.5, marginLeft: 'auto' }}>{display}</span>
                </div>
              )
            })}
          </div>

          {/* Center: Enter Score — same height as one yardage tile, fills available width */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end' }}>
            {profile && (
              <button onClick={() => setSheetOpen(true)} style={{
                flex: 1,
                height: isNarrow ? 50 : 64,
                background: 'rgba(212,165,58,0.88)', backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.15)', color: '#000',
                borderRadius: 10,
                fontSize: isNarrow ? 14 : 16,
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
                padding: isNarrow ? '7px 10px' : '10px 14px', minWidth: isNarrow ? 110 : 150,
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
                      const driveFrom = selectedHole <= 9 ? 1 : 10
                      const driveTo   = selectedHole <= 9 ? 9 : 18
                      const drivesUsed = scoring.countDrives(player.id, driveFrom, driveTo)
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
