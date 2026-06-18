import { useState, useRef, useCallback } from 'react'
import Map, { Marker, NavigationControl, type MapRef } from 'react-map-gl/mapbox'
import type { MapMouseEvent } from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Search, Save, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../context/ToastContext'
import type { CourseGps, HoleGps, LatLng } from '../../lib/types'

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined

interface NominatimResult {
  place_id: number
  display_name: string
  lat: string
  lon: string
  boundingbox: [string, string, string, string]
}

type PinMode = 'center' | 'front' | 'back' | 'tee'

const PIN_META: Record<PinMode, { label: string; short: string; color: string; desc: string }> = {
  center: { label: 'Center',  short: 'C', color: '#D4A53A', desc: 'Middle of green' },
  front:  { label: 'Front',   short: 'F', color: '#16a34a', desc: 'Front edge' },
  back:   { label: 'Back',    short: 'B', color: '#dc2626', desc: 'Back edge' },
  tee:    { label: 'Tee',     short: 'T', color: '#6b7280', desc: 'Tee box' },
}

const MODES: PinMode[] = ['center', 'front', 'back', 'tee']

function emptyHoles(): HoleGps[] {
  return Array.from({ length: 18 }, (_, i) => ({
    hole: i + 1,
    tee: null,
    green: { front: null, center: null, back: null },
  }))
}

function centroid(nodes: { lat: number; lon: number }[]): LatLng {
  return {
    lat: nodes.reduce((s, n) => s + n.lat, 0) / nodes.length,
    lng: nodes.reduce((s, n) => s + n.lon, 0) / nodes.length,
  }
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

  const [query, setQuery]           = useState('')
  const [results, setResults]       = useState<NominatimResult[]>([])
  const [searching, setSearching]   = useState(false)
  const [picked, setPicked]         = useState<NominatimResult | null>(null)
  const [courseName, setCourseName] = useState(currentGps?.name ?? '')
  const [courseLat, setCourseLat]   = useState<number | null>(currentGps?.lat ?? null)
  const [courseLng, setCourseLng]   = useState<number | null>(currentGps?.lng ?? null)
  const [holes, setHoles]           = useState<HoleGps[]>(currentGps?.holes?.length ? currentGps.holes : emptyHoles())
  const [editingHole, setEditingHole] = useState(1)
  const [pinMode, setPinMode]       = useState<PinMode>('center')
  const [saving, setSaving]         = useState(false)
  const [importingOsm, setImportingOsm] = useState(false)
  const [viewState, setViewState]   = useState({
    longitude: currentGps?.lng ?? -79.0,
    latitude:  currentGps?.lat ?? 43.85,
    zoom:      currentGps?.lat ? 16 : 4,
  })

  // ── Course search ────────────────────────────────────────────────────────
  const searchCourse = async () => {
    if (!query.trim()) return
    setSearching(true)
    setResults([])
    try {
      // Search with and without "golf course" appended, merge unique results
      const search = async (q: string) => {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=8&addressdetails=1`
        return fetch(url, { headers: { 'User-Agent': 'ChubbsInvitational/1.0 (contact: golf-app)' } }).then(r => r.json()) as Promise<NominatimResult[]>
      }
      const [r1, r2] = await Promise.all([search(query), search(query + ' golf club')])
      const seen = new Set<number>()
      const data: NominatimResult[] = [...r1, ...r2].filter(r => { if (seen.has(r.place_id)) return false; seen.add(r.place_id); return true }).slice(0, 8)
      setResults(data)
    } catch {
      showToast('Search failed — check your connection', 'error')
    }
    setSearching(false)
  }

  const selectResult = (r: NominatimResult) => {
    const lat = parseFloat(r.lat)
    const lng = parseFloat(r.lon)
    setPicked(r)
    setCourseName(r.display_name.split(',')[0].trim())
    setCourseLat(lat)
    setCourseLng(lng)
    setResults([])
    const next = { longitude: lng, latitude: lat, zoom: 16 }
    setViewState(next)
    mapRef.current?.flyTo({ center: [lng, lat], zoom: 16, duration: 900 })
  }

  // ── OSM auto-import ──────────────────────────────────────────────────────
  const importFromOsm = async () => {
    if (!picked) return
    setImportingOsm(true)
    try {
      const [minLat, maxLat, minLon, maxLon] = picked.boundingbox
      const bbox = `${minLat},${minLon},${maxLat},${maxLon}`
      const q = `[out:json][timeout:30];(way[golf=green](${bbox});way[golf=tee](${bbox}););out geom;`
      const data = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST', body: `data=${encodeURIComponent(q)}`,
      }).then(r => r.json())

      const elements = data.elements as Array<{
        tags: Record<string, string>
        geometry: { lat: number; lon: number }[]
      }>

      if (!elements?.length) {
        showToast('No OSM hole data found for this course — place pins manually', 'error')
        setImportingOsm(false)
        return
      }

      const newHoles = emptyHoles()
      for (const el of elements) {
        const num = parseInt(el.tags?.ref ?? '0')
        if (num < 1 || num > 18 || !el.geometry?.length) continue
        const c = centroid(el.geometry)
        if (el.tags?.golf === 'green') newHoles[num - 1].green.center = c
        else if (el.tags?.golf === 'tee') newHoles[num - 1].tee = c
      }

      const found = newHoles.filter(h => h.green.center).length
      setHoles(newHoles)
      showToast(`Imported ${found}/18 greens from OpenStreetMap${found < 18 ? ' — set missing holes manually' : ''}`)
    } catch {
      showToast('OSM import failed', 'error')
    }
    setImportingOsm(false)
  }

  // ── Map click → place pin ────────────────────────────────────────────────
  const handleMapClick = useCallback((e: MapMouseEvent) => {
    const { lat, lng } = e.lngLat
    setHoles(prev => prev.map(h => {
      if (h.hole !== editingHole) return h
      switch (pinMode) {
        case 'center': return { ...h, green: { ...h.green, center: { lat, lng } } }
        case 'front':  return { ...h, green: { ...h.green, front:  { lat, lng } } }
        case 'back':   return { ...h, green: { ...h.green, back:   { lat, lng } } }
        case 'tee':    return { ...h, tee: { lat, lng } }
      }
    }))
    // Auto-advance through modes
    const idx = MODES.indexOf(pinMode)
    if (idx < MODES.length - 1) setPinMode(MODES[idx + 1])
  }, [editingHole, pinMode])

  const jumpToHole = (h: HoleGps) => {
    setEditingHole(h.hole)
    setPinMode('center')
    const target = h.green.center ?? h.tee
    if (target) mapRef.current?.flyTo({ center: [target.lng, target.lat], zoom: 17, duration: 600 })
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

  // ─────────────────────────────────────────────────────────────────────────
  if (!TOKEN) return (
    <div className="glass" style={{ padding: 20 }}>
      <p style={{ color: 'var(--tx3)', fontSize: 13 }}>
        Add <code style={{ color: '#D4A53A' }}>VITE_MAPBOX_TOKEN</code> to your{' '}
        <code style={{ color: '#D4A53A' }}>.env.local</code> file to enable GPS course setup.
      </p>
    </div>
  )

  const currentH = holes.find(h => h.hole === editingHole)
  const pinsSet  = holes.filter(h => h.green.center).length
  const mapReady = courseLat !== null && courseLng !== null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Course search ── */}
      <div className="glass" style={{ padding: '16px 20px' }}>
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

        {/* Search results */}
        {results.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
            {results.map(r => (
              <button key={r.place_id} onClick={() => selectResult(r)} style={{
                padding: '9px 12px', borderRadius: 9, textAlign: 'left', width: '100%',
                background: 'var(--surf2)', border: '1px solid var(--bdr)',
                cursor: 'pointer', color: 'var(--tx1)', fontSize: 13,
              }}>
                <div style={{ fontWeight: 600 }}>{r.display_name.split(',')[0]}</div>
                <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>
                  {r.display_name.split(',').slice(1).join(',').trim()}
                </div>
                <div style={{ fontSize: 10, color: 'var(--tx4)', marginTop: 2 }}>
                  {parseFloat(r.lat).toFixed(4)}, {parseFloat(r.lon).toFixed(4)}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Course name (editable) + OSM import */}
        {mapReady && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
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
            {picked && (
              <button onClick={importFromOsm} disabled={importingOsm} style={{
                padding: '9px 14px', borderRadius: 9, cursor: 'pointer', fontSize: 13,
                background: 'var(--surf2)', border: '1px solid var(--bdr)',
                color: 'var(--tx2)', display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <Download size={14} />
                {importingOsm ? 'Importing from OpenStreetMap…' : 'Auto-import holes from OpenStreetMap'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Hole editor (only once a course is located) ── */}
      {mapReady && (
        <>
          {/* Hole tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => setEditingHole(h => Math.max(1, h - 1))} disabled={editingHole === 1}
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
            <button onClick={() => setEditingHole(h => Math.min(18, h + 1))} disabled={editingHole === 18}
              style={{ padding: 4, background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', opacity: editingHole === 18 ? 0.3 : 1 }}>
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Pin mode selector */}
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

          {/* Map */}
          <div style={{ borderRadius: 14, overflow: 'hidden', height: 420, border: '1px solid var(--bdr)' }}>
            <Map
              ref={mapRef}
              mapboxAccessToken={TOKEN}
              {...viewState}
              onMove={(e: { viewState: typeof viewState }) => setViewState(e.viewState)}
              style={{ width: '100%', height: '100%' }}
              mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
              onClick={handleMapClick}
              cursor="crosshair"
            >
              <NavigationControl position="top-right" showCompass={false} />

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
              {currentH?.tee && (
                <Marker longitude={currentH.tee.lng} latitude={currentH.tee.lat} anchor="center">
                  <AdminPin short="T" color="#6b7280" borderRadius={4} />
                </Marker>
              )}
            </Map>
          </div>

          {/* Legend */}
          <div style={{ fontSize: 11, color: 'var(--tx4)', textAlign: 'center' }}>
            Select a pin type above, then tap the satellite map to place it on hole {editingHole}
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
    </div>
  )
}
