import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import Map, { Marker, NavigationControl, Source, Layer, type MapRef } from 'react-map-gl/mapbox'
import type { MapMouseEvent } from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Target, Navigation, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useYear } from '../context/YearContext'
import type { CourseGps, HoleGps, LatLng } from '../lib/types'

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined

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

function GreenPin({ label, color }: { label: string; color: string }) {
  return (
    <div style={{
      width: 30, height: 30, borderRadius: '50%',
      background: color, border: '3px solid white',
      boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
      color: 'white', fontWeight: 900, fontSize: 11,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Inter, sans-serif',
      userSelect: 'none',
    }}>{label}</div>
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

export default function GpsPage() {
  const { effectiveTournamentId } = useYear()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const mapRef = useRef<MapRef>(null)

  const [course, setCourse] = useState<CourseGps | null>(null)
  const [loading, setLoading] = useState(true)
  const [position, setPosition] = useState<LatLng | null>(null)
  const [gpsStatus, setGpsStatus] = useState<'acquiring' | 'ok' | 'denied' | 'unavailable'>('acquiring')
  const [selectedHole, setSelectedHole] = useState(() => {
    const h = parseInt(searchParams.get('hole') ?? '1')
    return h >= 1 && h <= 18 ? h : 1
  })
  const [tapPoint, setTapPoint] = useState<LatLng | null>(null)
  const [viewState, setViewState] = useState({ longitude: -79.0, latitude: 43.85, zoom: 15, bearing: 0, pitch: 0 })

  // Load GPS course data for current tournament
  useEffect(() => {
    if (!effectiveTournamentId) { setLoading(false); return }
    supabase
      .from('tournaments')
      .select('course_gps:course_gps_id(id, name, lat, lng, holes)')
      .eq('id', effectiveTournamentId)
      .single()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data }: { data: any }) => {
        const gps = data?.course_gps
        if (gps) {
          setCourse(gps as CourseGps)
          if (gps.lat && gps.lng) {
            setViewState(v => ({ ...v, latitude: gps.lat, longitude: gps.lng, zoom: 16 }))
          }
        }
        setLoading(false)
      })
  }, [effectiveTournamentId])

  // GPS tracking
  useEffect(() => {
    if (!navigator.geolocation) { setGpsStatus('unavailable'); return }
    const id = navigator.geolocation.watchPosition(
      pos => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGpsStatus('ok')
      },
      err => setGpsStatus(err.code === 1 ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 15000 },
    )
    return () => navigator.geolocation.clearWatch(id)
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
  const bunkersGeoJson = useMemo(() => makePolyCollection(currentHole?.bunkers), [currentHole])
  const waterGeoJson   = useMemo(() => makePolyCollection(currentHole?.water),   [currentHole])

  // Aim line: Tee → Player (faded) → Green center (bright)
  const aimLineGeoJson = useMemo(() => {
    const green = currentHole?.green.center
    const tee   = currentHole?.tee
    if (!green) return null
    const coords: [number, number][] = []
    if (tee)      coords.push([tee.lng, tee.lat])
    if (position) coords.push([position.lng, position.lat])
    coords.push([green.lng, green.lat])
    if (coords.length < 2) return null
    return {
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: coords },
      properties: {},
    }
  }, [currentHole, position])

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

  // Prevent iOS Safari pull-to-refresh on this fixed-layout page.
  // CSS overscroll-behavior:none is ignored by older iOS; the touchmove
  // preventDefault is the reliable fallback. We skip events on the Mapbox
  // canvas so pan/zoom still works.
  useEffect(() => {
    let startY = 0
    const onStart = (e: TouchEvent) => { startY = e.touches[0]?.clientY ?? 0 }
    const onMove  = (e: TouchEvent) => {
      if (!e.cancelable) return
      if ((e.target as HTMLElement)?.closest?.('canvas')) return // let Mapbox handle canvas touches
      if ((e.touches[0]?.clientY ?? 0) > startY) e.preventDefault() // downward = pull-to-refresh
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
  }

  const frontDist  = dist(position, currentHole?.green.front)
  const centerDist = dist(position, currentHole?.green.center)
  const backDist   = dist(position, currentHole?.green.back)
  const tapDist    = dist(position, tapPoint)

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

          {/* Aim line: tee → player → green */}
          {aimLineGeoJson && (
            <Source id="aimline" type="geojson" data={aimLineGeoJson}>
              <Layer id="aimline-bg" type="line"
                paint={{ 'line-color': 'rgba(0,0,0,0.4)', 'line-width': 4 }} />
              <Layer id="aimline-fg" type="line"
                paint={{ 'line-color': 'rgba(255,255,255,0.85)', 'line-width': 2, 'line-dasharray': [8, 5] }} />
            </Source>
          )}

          {/* Player position */}
          {position && (
            <Marker longitude={position.lng} latitude={position.lat} anchor="center">
              <PlayerDot />
            </Marker>
          )}

          {/* Green markers for current hole */}
          {currentHole?.green.front && (
            <Marker longitude={currentHole.green.front.lng} latitude={currentHole.green.front.lat} anchor="center">
              <GreenPin label="F" color="#16a34a" />
            </Marker>
          )}
          {currentHole?.green.center && (
            <Marker longitude={currentHole.green.center.lng} latitude={currentHole.green.center.lat} anchor="center">
              <GreenPin label="C" color="#D4A53A" />
            </Marker>
          )}
          {currentHole?.green.back && (
            <Marker longitude={currentHole.green.back.lng} latitude={currentHole.green.back.lat} anchor="center">
              <GreenPin label="B" color="#dc2626" />
            </Marker>
          )}

          {/* Tee marker */}
          {currentHole?.tee && (
            <Marker longitude={currentHole.tee.lng} latitude={currentHole.tee.lat} anchor="center">
              <TeePin />
            </Marker>
          )}

          {/* Tap-to-measure point */}
          {tapPoint && (
            <Marker longitude={tapPoint.lng} latitude={tapPoint.lat} anchor="center">
              <div style={{
                width: 22, height: 22, borderRadius: '50%',
                background: 'rgba(255,255,255,0.92)', border: '2px solid #6b7280',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
              }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#374151' }} />
              </div>
            </Marker>
          )}
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
            <button onClick={() => setTapPoint(null)} style={{
              background: 'rgba(255,255,255,0.12)', border: 'none', color: 'rgba(255,255,255,0.7)',
              cursor: 'pointer', borderRadius: '50%', width: 18, height: 18,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, padding: 0,
            }}>×</button>
          </div>
        )}

        {/* Tap hint — only show when no tap yet */}
        {!tapPoint && position && (
          <div style={{
            position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(10,10,15,0.7)', color: 'rgba(255,255,255,0.6)',
            padding: '4px 12px', borderRadius: 20, fontSize: 11,
            whiteSpace: 'nowrap', pointerEvents: 'none',
          }}>
            Tap map to measure distance
          </div>
        )}
      </div>

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
    </div>
  )
}
