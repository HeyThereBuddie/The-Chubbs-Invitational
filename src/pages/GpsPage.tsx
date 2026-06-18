import { useEffect, useRef, useState, useCallback } from 'react'
import Map, { Marker, NavigationControl, type MapRef } from 'react-map-gl/mapbox'
import type { MapMouseEvent } from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Target, Navigation, ChevronLeft, ChevronRight } from 'lucide-react'
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
    <div style={{
      width: 18, height: 18, borderRadius: '50%',
      background: '#3b82f6', border: '3px solid white',
      boxShadow: '0 0 0 5px rgba(59,130,246,0.25)',
    }} />
  )
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
  const mapRef = useRef<MapRef>(null)

  const [course, setCourse] = useState<CourseGps | null>(null)
  const [loading, setLoading] = useState(true)
  const [position, setPosition] = useState<LatLng | null>(null)
  const [gpsStatus, setGpsStatus] = useState<'acquiring' | 'ok' | 'denied' | 'unavailable'>('acquiring')
  const [selectedHole, setSelectedHole] = useState(1)
  const [tapPoint, setTapPoint] = useState<LatLng | null>(null)
  const [viewState, setViewState] = useState({ longitude: -79.0, latitude: 43.85, zoom: 15 })

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

  // Fly to green center when hole changes
  const flyToHole = useCallback((hole: HoleGps) => {
    const target = hole.green.center ?? hole.tee
    if (target) mapRef.current?.flyTo({ center: [target.lng, target.lat], zoom: 17, duration: 700 })
  }, [])

  useEffect(() => {
    if (currentHole) flyToHole(currentHole)
  }, [selectedHole, course]) // eslint-disable-line react-hooks/exhaustive-deps

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
          onClick={handleMapClick}
        >
          <NavigationControl position="top-right" showCompass={false} />

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
