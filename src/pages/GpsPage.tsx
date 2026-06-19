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

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
const STALE_MS = 30 * 60 * 1000 // hide markers older than 30 minutes

function haversineYards(a: LatLng, b: LatLng): number {
  const R = 6371000
  const φ1 = (a.lat * Math.PI) / 180
  const φ2 = (b.lat * Math.PI) / 180
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180
  const x = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)) * 1.09361)
}

function dist(pos: LatLng | null, target: LatLng | null | undefined): number | null {
  return pos && target ? haversineYards(pos, target) : null
}

function TeePin() {
  return (
    <div style={{
      width: 26, height: 26, borderRadius: 5,
      background: '#1e3a5f', border: '2.5px solid white',
      boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
      color: 'white', fontWeight: 800, fontSize: 10,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Inter, sans-serif',
      userSelect: 'none',
    }}>T</div>
  )
}

function PlayerDot() {
  return (
    <div style={{ position: 'relative', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Pulsing accuracy ring */}
      <div className="gps-pulse-ring" style={{
        position: 'absolute', width: 44, height: 44, borderRadius: '50%',
        background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)',
      }} />
      {/* Blue dot */}
      <div style={{
        width: 18, height: 18, borderRadius: '50%',
        background: '#3b82f6', border: '3px solid white',
        boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
        zIndex: 1, flexShrink: 0,
      }} />
    </div>
  )
}

// Bearing in degrees (0=N, 90=E) from point a to point b
function calcBearing(a: LatLng, b: LatLng): number {
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const dLng  = ((b.lng - a.lng) * Math.PI) / 180
  const x = Math.sin(dLng) * Math.cos(lat2)
  const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return (Math.atan2(x, y) * 180 / Math.PI + 360) % 360
}

// Move a point <meters> in <bearingDeg> direction
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

// Build a GeoJSON polygon coordinate ring for the hole corridor (fallback when no OSM fairway)
function buildCorridor(tee: LatLng, green: LatLng, bearing: number): [number, number][] {
  const teeSideW   = 35  // metres from centreline at tee end (~38 yds) — wider Option 3 fallback
  const greenSideW = 22  // narrower at the green end (~24 yds)
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

function YardagePanel({ label, yards, color }: { label: string; yards: number | null; color: string }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color, textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
      <div style={{
        fontFamily: 'Bebas Neue', fontSize: 36, letterSpacing: 1, lineHeight: 1,
        color: yards !== null ? 'var(--tx1)' : 'var(--tx5)',
      }}>{yards ?? '—'}</div>
      <div style={{ fontSize: 9, color: 'var(--tx4)', marginTop: 2 }}>yds</div>
    </div>
  )
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

export default function GpsPage() {
  const { profile } = useAuth()
  const { effectiveTournamentId } = useYear()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const mapRef = useRef<MapRef>(null)

  const scoring = usePlayerScoring()
  const [sheetOpen, setSheetOpen] = useState(false)

  const [course, setCourse] = useState<CourseGps | null>(null)
  const [loading, setLoading] = useState(true)
  const [position, setPosition] = useState<LatLng | null>(null)
  const [gpsStatus, setGpsStatus] = useState<'acquiring' | 'ok' | 'denied' | 'unavailable'>('acquiring')
  const [selectedHole, setSelectedHole] = useState(() => {
    const h = parseInt(searchParams.get('hole') ?? '1')
    return h >= 1 && h <= 18 ? h : 1
  })
  const [tapPoint, setTapPoint] = useState<LatLng | null>(null)
  const [tipOpen, setTipOpen]   = useState(false)
  const [viewState, setViewState] = useState({ longitude: -79.0, latitude: 43.85, zoom: 15, bearing: 0, pitch: 0 })

  // Other players' live positions
  const [otherPositions, setOtherPositions] = useState<PlayerPosition[]>([])
  const [selectedCartPlayerId, setSelectedCartPlayerId] = useState<string | null>(null)

  // Local DB snapshots for computing score-to-par in the popup (already cached by syncAll)
  const [localScores, setLocalScores] = useState<LocalScore[]>([])
  const [localTeams, setLocalTeams] = useState<LocalTeam[]>([])
  const [localProfiles, setLocalProfiles] = useState<LocalProfile[]>([])

  // Refs for position publishing — avoids re-registering the GPS watch when profile/tournament changes
  const lastPublishRef = useRef<{ lat: number; lng: number; at: number } | null>(null)
  const publishRef = useRef<{ profileId: string; tournamentId: string; teamId: string | null } | null>(null)
  // Keep publishRef fresh on every render (cheap — just a ref assignment)
  publishRef.current = (profile && effectiveTournamentId)
    ? { profileId: profile.id, tournamentId: effectiveTournamentId, teamId: scoring.myTeam?.id ?? null }
    : null

  // Load GPS course data — cache first (works offline), then refresh from network
  useEffect(() => {
    if (!effectiveTournamentId) { setLoading(false); return }

    const applyGps = (gps: CourseGps) => {
      setCourse(gps)
      if (gps.lat && gps.lng) {
        setViewState(v => ({ ...v, latitude: gps.lat!, longitude: gps.lng!, zoom: 16 }))
      }
    }

    // Step 1: show cached data immediately so the page works offline
    localDb.course_gps.get(effectiveTournamentId).then(cached => {
      if (cached) {
        applyGps({
          id: cached.gps_id, name: cached.name ?? '', created_at: '',
          lat: cached.lat, lng: cached.lng,
          holes: JSON.parse(cached.holes_json) as HoleGps[],
        })
        setLoading(false)
      }
    })

    // Step 2: refresh from Supabase in background; update cache with latest data
    ;(async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase
          .from('tournaments')
          .select('course_gps:course_gps_id(id, name, lat, lng, holes)')
          .eq('id', effectiveTournamentId)
          .single() as unknown as Promise<{ data: any }>)
        const gps = data?.course_gps
        if (gps) {
          applyGps(gps as CourseGps)
          localDb.course_gps.put({
            id: effectiveTournamentId,
            gps_id: gps.id,
            name: gps.name ?? null,
            lat: gps.lat ?? null,
            lng: gps.lng ?? null,
            holes_json: JSON.stringify(gps.holes ?? []),
          }).catch(() => {})
        }
      } catch { /* offline — cached data already shown */ }
      setLoading(false)
    })()
  }, [effectiveTournamentId])

  // GPS tracking + position publishing
  useEffect(() => {
    if (!navigator.geolocation) { setGpsStatus('unavailable'); return }
    const id = navigator.geolocation.watchPosition(
      pos => {
        const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setPosition(newPos)
        setGpsStatus('ok')

        // Publish to player_positions: only when moved >11 yards (~10m) or >15s since last publish
        const info = publishRef.current
        const last = lastPublishRef.current
        const movedYards = last ? haversineYards(last, newPos) : Infinity
        const ageMs = last ? Date.now() - last.at : Infinity
        if (info && navigator.onLine && (movedYards > 11 || ageMs > 15000)) {
          lastPublishRef.current = { ...newPos, at: Date.now() }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(supabase as any).from('player_positions').upsert({
            player_id: info.profileId,
            tournament_id: info.tournamentId,
            team_id: info.teamId,
            lat: newPos.lat,
            lng: newPos.lng,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'player_id' }).catch(() => {})
        }
      },
      err => setGpsStatus(err.code === 1 ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 15000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, []) // uses publishRef for latest profile/tournament — no re-registration needed

  // Load other players' positions + subscribe to realtime updates
  useEffect(() => {
    if (!effectiveTournamentId) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase as any)
      .from('player_positions')
      .select('player_id, team_id, lat, lng, updated_at')
      .eq('tournament_id', effectiveTournamentId)
      .then(({ data }: { data: PlayerPosition[] | null }) => {
        if (data) setOtherPositions(data)
      })

    const channel = supabase
      .channel(`player-positions-${effectiveTournamentId}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('postgres_changes' as any, {
        event: '*', schema: 'public', table: 'player_positions',
        filter: `tournament_id=eq.${effectiveTournamentId}`,
      }, (payload: { new: PlayerPosition }) => {
        const updated = payload.new
        setOtherPositions(prev => [
          ...prev.filter(p => p.player_id !== updated.player_id),
          updated,
        ])
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [effectiveTournamentId])

  // Load cached scores/teams/profiles for the popup score-to-par computation
  useEffect(() => {
    Promise.all([
      localDb.scores.toArray(),
      localDb.teams.toArray(),
      localDb.profiles.toArray(),
    ]).then(([scores, teams, profiles]) => {
      setLocalScores(scores)
      setLocalTeams(teams)
      setLocalProfiles(profiles)
    })
  }, [])

  const currentHole: HoleGps | undefined = course?.holes.find(h => h.hole === selectedHole)

  // Hole corridor polygon: use actual OSM fairway polygon if available, else computed trapezoid
  const corridorGeoJson = useMemo(() => {
    if (currentHole?.fairway && currentHole.fairway.length >= 3) {
      const coords = currentHole.fairway.map(p => [p.lng, p.lat] as [number, number])
      coords.push(coords[0])  // close the ring
      return { type: 'Feature' as const, geometry: { type: 'Polygon' as const, coordinates: [coords] }, properties: {} }
    }
    const tee   = currentHole?.tee
    const green = currentHole?.green.center
    if (!tee || !green) return null
    const bearing = calcBearing(tee, green)
    return {
      type: 'Feature' as const,
      geometry: { type: 'Polygon' as const, coordinates: [buildCorridor(tee, green, bearing)] },
      properties: {},
    }
  }, [currentHole])

  const makePolyCollection = (polys: import('../lib/types').LatLng[][] | null | undefined) => {
    if (!polys?.length) return null
    return {
      type: 'FeatureCollection' as const,
      features: polys.map((poly, i) => ({
        type: 'Feature' as const, id: i,
        geometry: { type: 'Polygon' as const, coordinates: [[...poly.map(p => [p.lng, p.lat] as [number, number]), [poly[0].lng, poly[0].lat]]] },
        properties: {},
      })),
    }
  }
  const bunkersGeoJson = useMemo(() => makePolyCollection(currentHole?.bunkers),    [currentHole])
  const waterGeoJson   = useMemo(() => makePolyCollection(currentHole?.water),      [currentHole])
  const avoidZonesGeoJson = useMemo(() => makePolyCollection(currentHole?.avoidZones), [currentHole])

  // Landing zone — approximate 30-yard radius circle as a polygon
  const landingZoneGeoJson = useMemo(() => {
    const lz = currentHole?.landingZone
    if (!lz) return null
    const steps = 36
    const radiusM = 27  // ~30 yards
    const coords: [number, number][] = []
    for (let i = 0; i <= steps; i++) {
      const pt = offsetLatLng(lz, (i / steps) * 360, radiusM)
      coords.push([pt.lng, pt.lat])
    }
    return {
      type: 'Feature' as const,
      geometry: { type: 'Polygon' as const, coordinates: [coords] },
      properties: {},
    }
  }, [currentHole])

  // Aim line: Player → Tap point (pre-set to landing zone if available)
  const aimLineGeoJson = useMemo(() => {
    if (!position || !tapPoint) return null
    return {
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: [[position.lng, position.lat], [tapPoint.lng, tapPoint.lat]] },
      properties: {},
    }
  }, [position, tapPoint])

  // Tap-to-green line: Tap point → Green center (remaining distance to flag)
  const tapToGreenGeoJson = useMemo(() => {
    const green = currentHole?.green.center
    if (!tapPoint || !green) return null
    return {
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: [[tapPoint.lng, tapPoint.lat], [green.lng, green.lat]] },
      properties: {},
    }
  }, [tapPoint, currentHole])

  // Other players filtered to non-stale, non-self
  const activeOtherPositions = useMemo(() => {
    const now = Date.now()
    return otherPositions.filter(p =>
      p.player_id !== profile?.id &&
      now - new Date(p.updated_at).getTime() < STALE_MS
    )
  }, [otherPositions, profile?.id])

  // Orient the map so tee is at bottom, green at top (like 18Birdies)
  const flyToHole = useCallback((hole: HoleGps) => {
    const green  = hole.green.center
    const tee    = hole.tee
    if (!green && !tee) return

    // Bearing from tee → green so that direction points "up" on screen
    const bearing = tee && green ? calcBearing(tee, green) : 0

    // Center on midpoint so both tee and green are visible
    const center = tee && green
      ? { lat: (tee.lat + green.lat) / 2, lng: (tee.lng + green.lng) / 2 }
      : (green ?? tee!)

    // Scale zoom to hole length: longer holes need a wider view
    const yds = tee && green ? haversineYards(tee, green) : 200
    const zoom = yds > 450 ? 16 : yds > 300 ? 16.5 : yds > 150 ? 17 : 17.5

    mapRef.current?.flyTo({
      center: [center.lng, center.lat],
      zoom,
      bearing,
      pitch: 0,
      duration: 800,
    })
  }, [])

  const [mapLoaded, setMapLoaded] = useState(false)
  const initialFlyDone = useRef(false)

  // Wait until BOTH map style is loaded AND course data is ready, then fly once.
  // flyTo is silently ignored by Mapbox before the style finishes loading, so we
  // must gate on mapLoaded rather than just waiting for course data.
  useEffect(() => {
    if (!mapLoaded || !currentHole || initialFlyDone.current) return
    initialFlyDone.current = true
    flyToHole(currentHole)
  }, [mapLoaded, currentHole, flyToHole])

  // Fly on subsequent hole-strip taps (map is already loaded by this point)
  useEffect(() => {
    if (!initialFlyDone.current || !currentHole) return
    flyToHole(currentHole)
  }, [selectedHole]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset tip state when switching holes
  useEffect(() => { setTipOpen(false) }, [selectedHole])

  // Pre-set tap point to the hole's designated landing zone (or clear it)
  useEffect(() => {
    const hole = course?.holes.find(h => h.hole === selectedHole)
    setTapPoint(hole?.landingZone ?? null)
  }, [selectedHole, course])

  // Prevent iOS Safari pull-to-refresh on this fixed-layout page.
  // The canvas carve-out was the bug: downward drags on the Mapbox canvas
  // were passed through, letting iOS intercept them as a refresh gesture.
  // Calling preventDefault() here does NOT block Mapbox panning — Mapbox's
  // own touchmove listener on the canvas fires independently of this one.
  useEffect(() => {
    let startY = 0
    const onStart = (e: TouchEvent) => { startY = e.touches[0]?.clientY ?? 0 }
    const onMove  = (e: TouchEvent) => {
      if (!e.cancelable) return
      if ((e.touches[0]?.clientY ?? 0) > startY) e.preventDefault() // block pull-to-refresh everywhere
    }
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove',  onMove,  { passive: false })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove',  onMove)
    }
  }, [])

  const handleMapClick = (e: MapMouseEvent) => {
    setTapPoint({ lat: e.lngLat.lat, lng: e.lngLat.lng })
    setSelectedCartPlayerId(null)
  }

  const frontDist      = dist(position, currentHole?.green.front)
  const centerDist     = dist(position, currentHole?.green.center)
  const backDist       = dist(position, currentHole?.green.back)
  const tapDist        = dist(position, tapPoint)
  const tapToGreenDist = dist(tapPoint, currentHole?.green.center)

  const aimLineMid = position && tapPoint
    ? { lat: (position.lat + tapPoint.lat) / 2, lng: (position.lng + tapPoint.lng) / 2 }
    : null
  const tapToGreenMid = tapPoint && currentHole?.green.center
    ? { lat: (tapPoint.lat + currentHole.green.center.lat) / 2, lng: (tapPoint.lng + currentHole.green.center.lng) / 2 }
    : null

  // ── No token configured ─────────────────────────────────────────────────
  if (!TOKEN) return (
    <div style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>🗺️</div>
      <h2 style={{ fontFamily: 'Bebas Neue', fontSize: 26, color: '#D4A53A', letterSpacing: 3 }}>Mapbox Not Configured</h2>
      <p style={{ color: 'var(--tx3)', fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>
        Add your Mapbox public token to <code style={{ color: '#D4A53A' }}>VITE_MAPBOX_TOKEN</code> in your <code style={{ color: '#D4A53A' }}>.env.local</code> file.
      </p>
    </div>
  )

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div className="animate-spin" style={{ width: 32, height: 32, border: '2.5px solid rgba(212,165,58,0.2)', borderTopColor: '#D4A53A', borderRadius: '50%' }} />
    </div>
  )

  // ── No course set up ─────────────────────────────────────────────────────
  if (!course) return (
    <div style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>⛳</div>
      <h2 style={{ fontFamily: 'Bebas Neue', fontSize: 28, color: '#D4A53A', letterSpacing: 3 }}>GPS Not Set Up</h2>
      <p style={{ color: 'var(--tx3)', marginTop: 8, fontSize: 13, lineHeight: 1.6 }}>
        An admin needs to set up the course GPS in the Admin panel before distances will show here.
      </p>
    </div>
  )

  const holeHasData = (h: number) => course.holes.some(hd => hd.hole === h && hd.green.center)

  return (
    // Full-screen layout: escape Layout's padding via fixed positioning
    <div style={{
      position: 'fixed', top: 56, left: 0, right: 0,
      bottom: 'env(safe-area-inset-bottom, 0px)',
      display: 'flex', flexDirection: 'column',
      zIndex: 20, background: 'var(--bg)',
      overscrollBehavior: 'none',
    }}>
      {/* Hole selector strip */}
      <div style={{ background: 'var(--panel)', borderBottom: '1px solid var(--bdr)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 10px', gap: 6 }}>
          {/* Back to scores */}
          <button onClick={() => navigate('/scores')} style={{
            padding: '4px 8px', background: 'none', border: 'none',
            color: 'var(--tx3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 12, flexShrink: 0,
          }}>
            <X size={16} />
          </button>
          <button onClick={() => setSelectedHole(h => Math.max(1, h - 1))}
            disabled={selectedHole === 1}
            style={{ padding: 4, background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', opacity: selectedHole === 1 ? 0.3 : 1 }}>
            <ChevronLeft size={18} />
          </button>

          <div style={{ flex: 1, overflowX: 'auto', scrollbarWidth: 'none' }}>
            <div style={{ display: 'flex', gap: 4, paddingBottom: 4 }}>
              {Array.from({ length: 18 }, (_, i) => i + 1).map(hole => {
                const active = selectedHole === hole
                const hasData = holeHasData(hole)
                return (
                  <button key={hole} onClick={() => setSelectedHole(hole)} style={{
                    minWidth: 36, height: 44, borderRadius: 9, flexShrink: 0,
                    border: active ? '2px solid #D4A53A' : '1px solid var(--bdr)',
                    background: active ? 'rgba(212,165,58,0.15)' : 'var(--surf)',
                    cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                    transform: active ? 'scale(1.08)' : 'scale(1)',
                    transition: 'transform 0.15s, border-color 0.15s',
                    opacity: hasData ? 1 : 0.5,
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: active ? '#D4A53A' : 'var(--tx2)', lineHeight: 1 }}>{hole}</span>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: hasData ? '#22c55e' : 'var(--bdr)', flexShrink: 0 }} />
                  </button>
                )
              })}
            </div>
          </div>

          <button onClick={() => setSelectedHole(h => Math.min(18, h + 1))}
            disabled={selectedHole === 18}
            style={{ padding: 4, background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', opacity: selectedHole === 18 ? 0.3 : 1 }}>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Map */}
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

          {/* Fairway / hole corridor */}
          {corridorGeoJson && (
            <Source id="corridor" type="geojson" data={corridorGeoJson}>
              <Layer id="corridor-fill" type="fill"
                paint={{ 'fill-color': 'rgba(255,255,255,0.05)' }} />
              <Layer id="corridor-outline" type="line"
                paint={{ 'line-color': 'rgba(255,255,255,0.40)', 'line-width': 1.5, 'line-dasharray': [5, 5] }} />
            </Source>
          )}

          {/* Bunkers — sand fills */}
          {bunkersGeoJson && (
            <Source id="bunkers" type="geojson" data={bunkersGeoJson}>
              <Layer id="bunkers-fill" type="fill"
                paint={{ 'fill-color': '#D4B483', 'fill-opacity': 0.80 }} />
              <Layer id="bunkers-outline" type="line"
                paint={{ 'line-color': '#A0845C', 'line-width': 1.5 }} />
            </Source>
          )}

          {/* Water hazards */}
          {waterGeoJson && (
            <Source id="water-hazards" type="geojson" data={waterGeoJson}>
              <Layer id="water-fill" type="fill"
                paint={{ 'fill-color': 'rgba(59,130,246,0.55)' }} />
              <Layer id="water-outline" type="line"
                paint={{ 'line-color': 'rgba(37,99,235,0.85)', 'line-width': 1.5 }} />
            </Source>
          )}

          {/* Avoid zones — red danger overlays */}
          {avoidZonesGeoJson && (
            <Source id="avoid-zones" type="geojson" data={avoidZonesGeoJson}>
              <Layer id="avoid-zones-fill" type="fill"
                paint={{ 'fill-color': 'rgba(239,68,68,0.22)' }} />
              <Layer id="avoid-zones-outline" type="line"
                paint={{ 'line-color': 'rgba(239,68,68,0.75)', 'line-width': 1.5, 'line-dasharray': [4, 3] }} />
            </Source>
          )}

          {/* Landing zone — green glow circle */}
          {landingZoneGeoJson && (
            <Source id="landing-zone" type="geojson" data={landingZoneGeoJson}>
              <Layer id="landing-zone-fill" type="fill"
                paint={{ 'fill-color': 'rgba(74,222,128,0.18)' }} />
              <Layer id="landing-zone-outline" type="line"
                paint={{ 'line-color': 'rgba(74,222,128,0.80)', 'line-width': 2, 'line-dasharray': [6, 3] }} />
            </Source>
          )}

          {/* Aim line: Player → Tap point — neon white glow */}
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

          {/* Tap-to-green line: Tap point → Green center — neon gold glow */}
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

          {/* Player position */}
          {position && (
            <Marker longitude={position.lng} latitude={position.lat} anchor="center">
              <PlayerDot />
            </Marker>
          )}

          {/* Green center marker — flag destination for the gold line */}
          {currentHole?.green.center && (
            <Marker longitude={currentHole.green.center.lng} latitude={currentHole.green.center.lat} anchor="center">
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'rgba(212,165,58,0.25)',
                border: '2.5px solid #D4A53A',
                boxShadow: '0 0 12px rgba(212,165,58,0.45), 0 2px 6px rgba(0,0,0,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#D4A53A' }} />
              </div>
            </Marker>
          )}

          {/* Tee marker */}
          {currentHole?.tee && (
            <Marker longitude={currentHole.tee.lng} latitude={currentHole.tee.lat} anchor="center">
              <TeePin />
            </Marker>
          )}

          {/* Landing zone center marker */}
          {currentHole?.landingZone && (
            <Marker longitude={currentHole.landingZone.lng} latitude={currentHole.landingZone.lat} anchor="center">
              <div style={{
                width: 18, height: 18, borderRadius: '50%',
                background: 'rgba(74,222,128,0.30)', border: '2px solid rgba(74,222,128,0.90)',
                boxShadow: '0 0 8px rgba(74,222,128,0.6)',
              }} />
            </Marker>
          )}

          {/* Tap-to-measure point — crosshair ring */}
          {tapPoint && (
            <Marker longitude={tapPoint.lng} latitude={tapPoint.lat} anchor="center">
              <div style={{ position: 'relative', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {/* Outer ring */}
                <div style={{
                  position: 'absolute', width: 28, height: 28, borderRadius: '50%',
                  border: '2px solid rgba(255,255,255,0.95)',
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.4), 0 0 10px rgba(255,255,255,0.4)',
                }} />
                {/* Center dot */}
                <div style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: '#ffffff',
                  boxShadow: '0 0 4px rgba(255,255,255,0.8)',
                }} />
              </div>
            </Marker>
          )}

          {/* Aim line distance label — midpoint of player → tap point */}
          {aimLineMid && tapDist !== null && (
            <Marker longitude={aimLineMid.lng} latitude={aimLineMid.lat} anchor="center">
              <div style={{
                background: 'rgba(8,8,12,0.78)', backdropFilter: 'blur(8px)',
                color: '#ffffff', borderRadius: 20, padding: '3px 10px',
                display: 'flex', alignItems: 'baseline', gap: 3,
                border: '1px solid rgba(255,255,255,0.22)',
                boxShadow: '0 0 12px rgba(255,255,255,0.12), 0 2px 8px rgba(0,0,0,0.6)',
                whiteSpace: 'nowrap', pointerEvents: 'none',
              }}>
                <span style={{ fontFamily: 'Bebas Neue', fontSize: 17, letterSpacing: 0.5, lineHeight: 1 }}>{tapDist}</span>
                <span style={{ fontSize: 9, opacity: 0.6, fontWeight: 600, letterSpacing: 0.5 }}>YDS</span>
              </div>
            </Marker>
          )}

          {/* Tap-to-green distance label — midpoint of tap point → green center */}
          {tapToGreenMid && tapToGreenDist !== null && (
            <Marker longitude={tapToGreenMid.lng} latitude={tapToGreenMid.lat} anchor="center">
              <div style={{
                background: 'rgba(8,8,12,0.78)', backdropFilter: 'blur(8px)',
                color: '#D4A53A', borderRadius: 20, padding: '3px 10px',
                display: 'flex', alignItems: 'baseline', gap: 3,
                border: '1px solid rgba(212,165,58,0.30)',
                boxShadow: '0 0 12px rgba(212,165,58,0.15), 0 2px 8px rgba(0,0,0,0.6)',
                whiteSpace: 'nowrap', pointerEvents: 'none',
              }}>
                <span style={{ fontFamily: 'Bebas Neue', fontSize: 17, letterSpacing: 0.5, lineHeight: 1 }}>{tapToGreenDist}</span>
                <span style={{ fontSize: 9, opacity: 0.6, fontWeight: 600, letterSpacing: 0.5, color: '#D4A53A' }}>YDS</span>
              </div>
            </Marker>
          )}

          {/* Other players — gold cart emoji markers */}
          {activeOtherPositions.map(p => (
            <Marker key={p.player_id} longitude={p.lng} latitude={p.lat} anchor="bottom">
              <button
                onClick={e => { e.stopPropagation(); setSelectedCartPlayerId(p.player_id) }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  fontSize: 24, lineHeight: 1,
                  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))',
                }}
              >
                🛒
              </button>
            </Marker>
          ))}
        </Map>

        {/* GPS status badge */}
        {gpsStatus !== 'ok' && (
          <div style={{
            position: 'absolute', top: 8, left: 8,
            background: gpsStatus === 'acquiring' ? 'rgba(0,0,0,0.72)' : 'rgba(239,68,68,0.88)',
            color: 'white', padding: '5px 12px', borderRadius: 10,
            fontSize: 12, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Navigation size={12} />
            {gpsStatus === 'acquiring' ? 'Acquiring GPS…' : gpsStatus === 'denied' ? 'GPS permission denied' : 'GPS unavailable'}
          </div>
        )}

        {/* Tap distance bubble */}
        {tapDist !== null && (
          <div style={{
            position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(10,10,15,0.85)', backdropFilter: 'blur(8px)',
            color: 'white', padding: '6px 14px 6px 10px', borderRadius: 24,
            fontSize: 14, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 8,
            border: '1px solid rgba(255,255,255,0.12)',
          }}>
            <Target size={14} color="#D4A53A" />
            <span style={{ fontFamily: 'Bebas Neue', fontSize: 20, letterSpacing: 1 }}>{tapDist}</span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: 400 }}>yds</span>
            <button onClick={() => setTapPoint(currentHole?.landingZone ?? null)} style={{
              background: 'rgba(255,255,255,0.12)', border: 'none', color: 'rgba(255,255,255,0.7)',
              cursor: 'pointer', borderRadius: '50%', width: 18, height: 18,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, padding: 0,
            }}>×</button>
          </div>
        )}

        {/* Tap hint — only show when no tap yet and no tip card */}
        {!tapPoint && position && !currentHole?.tip && (
          <div style={{
            position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
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
            position: 'absolute', bottom: 8, left: 8, right: 8,
            background: 'rgba(8,8,12,0.88)', backdropFilter: 'blur(10px)',
            borderRadius: 12, padding: '9px 12px',
            border: '1px solid rgba(212,165,58,0.28)',
          }}>
            <button
              onClick={() => setTipOpen(v => !v)}
              style={{
                width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                display: 'flex', alignItems: 'flex-start', gap: 8, textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1.4 }}>💡</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.82)', lineHeight: 1.5, flex: 1 }}>
                {tipOpen
                  ? currentHole.tip
                  : currentHole.tip.length > 100
                    ? currentHole.tip.slice(0, 97) + '…'
                    : currentHole.tip}
              </span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', flexShrink: 0, paddingTop: 3 }}>
                {tipOpen ? '▲' : '▼'}
              </span>
            </button>
          </div>
        )}

        {/* Recenter button — flies back to the current hole's framed view */}
        {currentHole && (
          <button
            onClick={() => flyToHole(currentHole)}
            style={{
              position: 'absolute', bottom: 16, left: 16,
              zIndex: 10,
              background: 'rgba(8,8,12,0.80)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'white',
              borderRadius: 12,
              padding: '10px 14px',
              fontSize: 13,
              fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
              cursor: 'pointer',
            }}
          >
            <Target size={14} color="#D4A53A" />
            Hole
          </button>
        )}

        {/* Enter Score FAB — shown to any logged-in user */}
        {profile && (
          <button
            onClick={() => setSheetOpen(true)}
            style={{
              position: 'absolute', bottom: 16, right: 16,
              zIndex: 10,
              background: 'rgba(212,165,58,0.92)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#000',
              borderRadius: 14,
              padding: '12px 20px',
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: 0.5,
              boxShadow: '0 4px 20px rgba(212,165,58,0.4)',
              cursor: 'pointer',
            }}
          >
            ⛳ Enter Score
          </button>
        )}

        {/* Cart player info popup — shown when a cart marker is tapped */}
        {(() => {
          if (!selectedCartPlayerId) return null
          const pos = activeOtherPositions.find(p => p.player_id === selectedCartPlayerId)
          if (!pos) return null
          const player = localProfiles.find(p => p.id === selectedCartPlayerId)
          const team = pos.team_id ? localTeams.find(t => t.id === pos.team_id) : null
          const toPar = pos.team_id ? scoreToPar(pos.team_id, localScores) : null
          const toParStr = toPar == null ? '—' : toPar > 0 ? `+${toPar}` : toPar === 0 ? 'E' : `${toPar}`
          const toParColor = toPar == null ? 'var(--tx3)' : toPar < 0 ? '#22c55e' : toPar > 0 ? '#ef4444' : '#D4A53A'
          return (
            <div
              onClick={() => setSelectedCartPlayerId(null)}
              style={{
                position: 'absolute', bottom: 70, left: '50%', transform: 'translateX(-50%)',
                background: 'rgba(8,8,12,0.92)', backdropFilter: 'blur(12px)',
                border: '1px solid rgba(212,165,58,0.35)',
                borderRadius: 14, padding: '14px 22px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                cursor: 'pointer', zIndex: 10, minWidth: 170,
                boxShadow: '0 4px 24px rgba(0,0,0,0.7)',
                whiteSpace: 'nowrap',
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx1)' }}>
                🛒 {player ? (player.nickname?.trim() || player.name || 'Player') : 'Player'}
              </div>
              {team && (
                <div style={{ fontSize: 11, color: 'var(--tx3)' }}>{team.name}</div>
              )}
              <div style={{
                fontFamily: 'Bebas Neue', fontSize: 32, letterSpacing: 1, lineHeight: 1.1,
                color: toParColor,
              }}>
                {toParStr}
              </div>
              <div style={{ fontSize: 10, color: 'var(--tx4)', marginTop: 2 }}>
                {timeAgo(pos.updated_at)} · tap to dismiss
              </div>
            </div>
          )
        })()}
      </div>

      {/* Round stats strip — drives + chulligans */}
      {scoring.myTeam && (() => {
        const p1 = scoring.myTeam!.player1
        const p2 = scoring.myTeam!.player2
        const players = [p1, p2].filter((p): p is NonNullable<typeof p1> => !!p)
        if (players.length === 0) return null
        return (
          <div style={{
            background: 'var(--panel)', borderTop: '1px solid var(--bdr)',
            padding: '10px 14px', flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            {players.map((player, idx) => {
              const f9 = scoring.countDrives(player.id, 1, 9)
              const b9 = scoring.countDrives(player.id, 10, 18)
              const chulligan = scoring.myChulligans.find(c => c.player_id === player.id)
              return (
                <>
                  {idx > 0 && <div key={`div-${player.id}`} style={{ width: 1, alignSelf: 'stretch', background: 'var(--bdr)' }} />}
                  <div key={player.id} style={{ flex: 1, minWidth: 0 }}>
                    {/* Name + chulligan */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {displayName(player)}
                      </span>
                      <div style={{
                        fontSize: 12, padding: '2px 8px', borderRadius: 8, flexShrink: 0, marginLeft: 8,
                        background: chulligan ? 'rgba(212,165,58,0.15)' : 'rgba(255,255,255,0.05)',
                        color: chulligan ? '#D4A53A' : 'var(--tx4)',
                        border: `1px solid ${chulligan ? 'rgba(212,165,58,0.3)' : 'var(--bdr)'}`,
                      }}>
                        {chulligan ? `🍺 H${chulligan.hole}` : '🍺 —'}
                      </div>
                    </div>
                    {/* Drive dots */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3)', width: 16 }}>F9</span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {Array.from({ length: 5 }, (_, i) => (
                          <div key={i} style={{
                            width: 9, height: 9, borderRadius: '50%',
                            background: i < f9 ? '#D4A53A' : 'var(--surf3)',
                            boxShadow: i < f9 ? '0 0 5px rgba(212,165,58,0.55)' : 'none',
                          }} />
                        ))}
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3)', width: 16, marginLeft: 4 }}>B9</span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {Array.from({ length: 5 }, (_, i) => (
                          <div key={i} style={{
                            width: 9, height: 9, borderRadius: '50%',
                            background: i < b9 ? '#D4A53A' : 'var(--surf3)',
                            boxShadow: i < b9 ? '0 0 5px rgba(212,165,58,0.55)' : 'none',
                          }} />
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )
            })}
          </div>
        )
      })()}

      {/* Distance readout panel */}
      <div style={{
        background: 'var(--panel)', borderTop: '1px solid var(--bdr)',
        padding: '14px 8px 14px',
        display: 'flex', alignItems: 'center',
        flexShrink: 0,
        paddingBottom: 'max(14px, calc(env(safe-area-inset-bottom, 0px) + 60px))',
      }}>
        <YardagePanel label="Front"  yards={frontDist}  color="#22c55e" />
        <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--bdr)', margin: '0 4px' }} />
        <YardagePanel label="Center" yards={centerDist} color="#D4A53A" />
        <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--bdr)', margin: '0 4px' }} />
        <YardagePanel label="Back"   yards={backDist}   color="#dc2626" />
        <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--bdr)', margin: '0 4px' }} />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: 'var(--tx4)', textTransform: 'uppercase', marginBottom: 3 }}>Hole</div>
          <div style={{ fontFamily: 'Bebas Neue', fontSize: 36, letterSpacing: 1, lineHeight: 1, color: '#D4A53A' }}>{selectedHole}</div>
          <div style={{ fontSize: 9, color: 'var(--tx4)', marginTop: 2 }}>of 18</div>
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
