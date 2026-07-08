import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import Map, { Marker, Source, Layer, type MapRef } from 'react-map-gl/mapbox'
import type { MapMouseEvent } from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Navigation, ChevronDown, X, Compass, Camera, Flag } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { localDb, type LocalScore, type LocalTeam, type LocalProfile } from '../lib/localDb'
import { useAuth } from '../context/AuthContext'
import { useYear } from '../context/YearContext'
import type { CourseGps, HoleGps, LatLng } from '../lib/types'
import { displayName, normalizeFairways } from '../lib/types'
import { resolvePar } from '../lib/pars'
import { resolveBag, recommendClub } from '../lib/clubs'
import { type Shot, shotQuality } from '../lib/shots'
import { usePlayerScoring } from '../hooks/usePlayerScoring'
import { ScoreBottomSheet } from '../components/ScoreBottomSheet'
import { CaddieSheet, type CaddieContext } from '../components/CaddieSheet'
import { useMediaQuery } from '../hooks/useMediaQuery'

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
const STALE_MS = 30 * 60 * 1000
const CHUBBS_IMG = 'https://static.wikia.nocookie.net/sandlerverse/images/8/81/Chubbs_Peterson_in_Happy_Gilmore.webp'

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

// Scope / sniper crosshair icon for the green-view button
function ScopeIcon() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" style={{ pointerEvents: 'none' }}>
      <circle cx={12} cy={12} r={8} fill="none" stroke="#fff" strokeWidth={1.6} />
      <line x1={12} y1={1}  x2={12} y2={5}  stroke="#fff" strokeWidth={1.6} strokeLinecap="round" />
      <line x1={12} y1={19} x2={12} y2={23} stroke="#fff" strokeWidth={1.6} strokeLinecap="round" />
      <line x1={1}  y1={12} x2={5}  y2={12} stroke="#fff" strokeWidth={1.6} strokeLinecap="round" />
      <line x1={19} y1={12} x2={23} y2={12} stroke="#fff" strokeWidth={1.6} strokeLinecap="round" />
      <circle cx={12} cy={12} r={1.7} fill="#fff" />
    </svg>
  )
}

// Simple club-head silhouette per club category — a "picture" for each club.
function clubCategory(club: string): 'driver' | 'wood' | 'hybrid' | 'iron' | 'wedge' {
  if (club === 'Dr') return 'driver'
  if (/^\dW$/.test(club)) return 'wood'
  if (club === 'Hyb') return 'hybrid'
  if (['PW', 'GW', 'SW', 'LW'].includes(club)) return 'wedge'
  return 'iron'
}

function ClubIcon({ club, size = 32 }: { club: string; size?: number }) {
  const cat = clubCategory(club)
  const HEAD = '#e9d9a8', STEEL = '#c9cdd2', GRIP = '#2c2c2c', shade = 'rgba(0,0,0,0.28)'
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" style={{ pointerEvents: 'none' }}>
      {/* steel shaft */}
      <line x1={41} y1={5} x2={19.5} y2={31} stroke={STEEL} strokeWidth={2.2} strokeLinecap="round" />
      {/* rubber grip + highlight */}
      <line x1={41.5} y1={4.5} x2={35} y2={12.3} stroke={GRIP} strokeWidth={5} strokeLinecap="round" />
      <line x1={40} y1={6.2} x2={36.2} y2={10.8} stroke="rgba(255,255,255,0.25)" strokeWidth={1} strokeLinecap="round" />

      {cat === 'driver' && (
        <>
          <path d="M20 28 Q24 31 22.4 37 Q20 44 11.5 44 Q3.5 44 2.6 36 Q2 30 8.6 28.4 Q15 27 20 28 Z" fill={HEAD} />
          <path d="M6 40.5 Q3.6 36 5.4 31.2" stroke={shade} strokeWidth={1.2} fill="none" strokeLinecap="round" />
        </>
      )}
      {cat === 'wood' && (
        <>
          <path d="M20 29 Q23 32 21.6 37 Q19.4 43 12 43 Q5 43 4.2 36.4 Q3.8 31 9 29.6 Q15 28.4 20 29 Z" fill={HEAD} />
          <path d="M7 39.6 Q5 35.6 6.6 31.6" stroke={shade} strokeWidth={1.1} fill="none" strokeLinecap="round" />
        </>
      )}
      {cat === 'hybrid' && (
        <>
          <path d="M20.4 30 Q22.6 33 21 37.4 Q19 42.4 12.6 42.4 Q6.4 42.4 5.4 37 Q5 32.4 10 31 Q15.6 30 20.4 30 Z" fill={HEAD} />
          <path d="M8 39 Q6.4 35.6 7.8 32.2" stroke={shade} strokeWidth={1.1} fill="none" strokeLinecap="round" />
        </>
      )}
      {cat === 'iron' && (
        <>
          <path d="M21.5 29.6 L24 32.6 L20.6 35.6 L18 32.6 Z" fill={STEEL} />
          <path d="M4 44 L20.5 31 L23.4 34.2 L8.2 45.4 Q4.6 46 4 44 Z" fill={HEAD} />
          <g stroke={shade} strokeWidth={0.85} strokeLinecap="round">
            <line x1={7.4} y1={41.6} x2={19.2} y2={32.4} />
            <line x1={9.2} y1={43.4} x2={21} y2={34.2} />
          </g>
        </>
      )}
      {cat === 'wedge' && (
        <>
          <path d="M21.2 29 L23.8 32 L20.4 35.2 L17.8 32 Z" fill={STEEL} />
          <path d="M3 45 L20 30.4 L23 33.6 L7.4 46.6 Q3.6 47.2 3 45 Z" fill={HEAD} />
          <g stroke={shade} strokeWidth={0.85} strokeLinecap="round">
            <line x1={6.4} y1={42.6} x2={18.6} y2={32} />
            <line x1={8.2} y1={44.2} x2={20.2} y2={33.8} />
            <line x1={10} y1={45.8} x2={21.6} y2={35.4} />
          </g>
        </>
      )}
    </svg>
  )
}

// Small bunker glyph (amber) for the bunker callout tags.
function SandIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ pointerEvents: 'none' }}>
      <path d="M2 9 Q2 5 6 5 Q9 4.5 11 6 Q14 6.5 14 9.5 Q14 12 10 12 Q6 12.5 4 11.5 Q2 11 2 9 Z" fill="#e6c877" opacity={0.95} />
      <circle cx={6} cy={8.6} r={0.8} fill="#2c2109" />
      <circle cx={9} cy={9} r={0.8} fill="#2c2109" />
      <circle cx={11} cy={8} r={0.7} fill="#2c2109" />
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

// Ray-casting point-in-polygon (lng/lat is fine at hole scale).
function pointInPolygon(pt: LatLng, poly: LatLng[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].lng, yi = poly[i].lat, xj = poly[j].lng, yj = poly[j].lat
    if (((yi > pt.lat) !== (yj > pt.lat)) && pt.lng < (xj - xi) * (pt.lat - yi) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

// ─── Blind-shot compass ───────────────────────────────────────────────────────
// Reads the device magnetometer (true-north heading) so a player can physically
// aim at a target they can't see. iOS needs a one-time permission from a tap.
type CompassPerm = 'unknown' | 'granted' | 'denied' | 'unsupported'

function useCompassHeading(active: boolean) {
  const [heading, setHeading] = useState<number | null>(null)
  const [permission, setPermission] = useState<CompassPerm>('unknown')

  const request = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const DOE: any = typeof window !== 'undefined' ? (window as any).DeviceOrientationEvent : undefined
    if (!DOE) { setPermission('unsupported'); return }
    if (typeof DOE.requestPermission === 'function') {
      try { setPermission((await DOE.requestPermission()) === 'granted' ? 'granted' : 'denied') }
      catch { setPermission('denied') }
    } else {
      setPermission('granted')
    }
  }, [])

  useEffect(() => {
    if (!active || permission !== 'granted') return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = (e: any) => {
      let h: number | null = null
      if (typeof e.webkitCompassHeading === 'number' && !Number.isNaN(e.webkitCompassHeading)) {
        h = e.webkitCompassHeading            // iOS: clockwise from true/magnetic north
      } else if (e.absolute && typeof e.alpha === 'number') {
        h = (360 - e.alpha) % 360             // spec alpha is counter-clockwise from north
      }
      if (h === null) return
      // Low-pass smoothing over the shortest arc to steady the arrow (wrap-safe).
      setHeading(prev => prev === null ? h! : (prev + normDeg(h! - prev) * 0.2 + 360) % 360)
    }
    window.addEventListener('deviceorientationabsolute', handler, true)
    window.addEventListener('deviceorientation', handler, true)
    return () => {
      window.removeEventListener('deviceorientationabsolute', handler, true)
      window.removeEventListener('deviceorientation', handler, true)
    }
  }, [active, permission])

  return { heading, permission, request }
}

const normDeg = (d: number) => ((d % 360) + 540) % 360 - 180 // → [-180, 180)

function BlindShotCompass({
  targetBearing, distance, playsLike, club, heading, headingOffset, calibrated,
  permission, onRequest, onCalibrate, onResetCalibration, onClose,
}: {
  targetBearing: number | null
  distance: number | null
  playsLike: number | null
  club: { club: string; note?: string } | null
  heading: number | null
  headingOffset: number
  calibrated: boolean
  permission: CompassPerm
  onRequest: () => void
  onCalibrate: () => void
  onResetCalibration: () => void
  onClose: () => void
}) {
  // Apply the field-calibration offset so the magnetic reading lines up with the
  // true-north bearing we compute from GPS.
  const corrected = heading !== null ? (heading + headingOffset + 360) % 360 : null
  const delta = (corrected !== null && targetBearing !== null) ? normDeg(targetBearing - corrected) : null
  const aligned = delta !== null && Math.abs(delta) <= 5
  const gold = '#D4A53A', green = '#4ade80'
  const ring = aligned ? green : gold

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 3000,
      background: 'rgba(6,10,8,0.92)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: 'max(20px, env(safe-area-inset-top)) 20px calc(env(safe-area-inset-bottom,0px) + 80px)',
      color: '#fff',
    }}>
      {/* Header */}
      <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontFamily: 'Bebas Neue', fontSize: 26, letterSpacing: 1, color: gold }}>BLIND SHOT</span>
        <button onClick={onClose} className="pressable" style={{
          width: 40, height: 40, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.5)',
          background: 'rgba(0,0,0,0.4)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}><X size={20} /></button>
      </div>

      {permission !== 'granted' ? (
        <div style={{ marginTop: 40, textAlign: 'center', maxWidth: 320 }}>
          {permission === 'denied' ? (
            <p style={{ fontSize: 15, lineHeight: 1.5, opacity: 0.85 }}>
              Compass access was blocked. Enable <b>Motion &amp; Orientation Access</b> in your browser settings, then reopen Blind Shot.
            </p>
          ) : permission === 'unsupported' ? (
            <p style={{ fontSize: 15, lineHeight: 1.5, opacity: 0.85 }}>
              This device doesn’t expose a compass to the browser. Blind Shot needs a phone with a magnetometer.
            </p>
          ) : (
            <>
              <p style={{ fontSize: 15, lineHeight: 1.5, opacity: 0.85, marginBottom: 20 }}>
                Blind Shot uses your phone’s compass to point you at a target you can’t see. Tap below to enable it.
              </p>
              <button onClick={onRequest} className="pressable" style={{
                padding: '12px 24px', borderRadius: 999, border: 'none', cursor: 'pointer',
                background: gold, color: '#1a1206', fontWeight: 800, fontSize: 15,
              }}>Enable Compass</button>
            </>
          )}
        </div>
      ) : targetBearing === null ? (
        <p style={{ marginTop: 60, textAlign: 'center', opacity: 0.85, maxWidth: 300 }}>
          Set your target on the map first (tap the fairway or green), then reopen Blind Shot.
        </p>
      ) : (
        <>
          {/* Compass dial */}
          <div style={{ position: 'relative', width: 260, height: 260, marginTop: 18 }}>
            {/* Fixed reference: the phone's aim direction (top of dial) */}
            <div style={{ position: 'absolute', top: -2, left: '50%', transform: 'translateX(-50%)', zIndex: 3 }}>
              <div style={{ width: 0, height: 0, borderLeft: '9px solid transparent', borderRight: '9px solid transparent', borderTop: `13px solid ${ring}` }} />
            </div>
            <svg width={260} height={260} viewBox="0 0 260 260" style={{ display: 'block' }}>
              <circle cx={130} cy={130} r={122} fill="rgba(255,255,255,0.04)" stroke={ring} strokeWidth={3} />
              <circle cx={130} cy={130} r={104} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={1} />
              {/* Rotating target arrow: 0° = pointing straight up = aligned */}
              <g transform={`rotate(${delta ?? 0} 130 130)`} style={{ transition: 'transform 0.12s linear' }}>
                <line x1={130} y1={130} x2={130} y2={26} stroke="#ef4444" strokeWidth={5} strokeLinecap="round" />
                <polygon points="130,14 120,34 140,34" fill="#ef4444" />
              </g>
              <circle cx={130} cy={130} r={7} fill="#fff" />
            </svg>
            {/* Center readout */}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <div style={{ marginTop: 34, fontFamily: 'Bebas Neue', fontSize: 22, letterSpacing: 1, color: aligned ? green : '#fff' }}>
                {aligned ? 'ALIGNED' : delta !== null ? (delta > 0 ? 'TURN RIGHT →' : '← TURN LEFT') : '…'}
              </div>
              {delta !== null && !aligned && (
                <div style={{ fontSize: 13, opacity: 0.7 }}>{Math.abs(Math.round(delta))}°</div>
              )}
            </div>
          </div>

          {/* Distances */}
          <div style={{ display: 'flex', gap: 14, marginTop: 26 }}>
            <div style={{ textAlign: 'center', minWidth: 96, padding: '10px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, opacity: 0.6 }}>DISTANCE</div>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: 34, lineHeight: 1 }}>{distance ?? '--'}<span style={{ fontSize: 15, opacity: 0.7 }}> y</span></div>
            </div>
            <div style={{ textAlign: 'center', minWidth: 96, padding: '10px 14px', borderRadius: 14, background: 'rgba(212,165,58,0.14)', border: `1px solid ${gold}55` }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, color: gold }}>PLAYS LIKE</div>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: 34, lineHeight: 1, color: gold }}>{playsLike ?? '--'}<span style={{ fontSize: 15, opacity: 0.7 }}> y</span></div>
            </div>
            {club && (
              <div style={{ textAlign: 'center', minWidth: 84, padding: '10px 14px', borderRadius: 14, background: 'rgba(74,222,128,0.14)', border: `1px solid ${green}55` }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, color: green }}>CLUB</div>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: 34, lineHeight: 1, color: green }}>{club.club}</div>
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 2 }}><ClubIcon club={club.club} size={34} /></div>
                {club.note && <div style={{ fontSize: 10, opacity: 0.65 }}>{club.note}</div>}
              </div>
            )}
          </div>

          {/* Calibration — cancels magnetic declination + device bias in one tap */}
          <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <button onClick={onCalibrate} disabled={heading === null} className="pressable" style={{
              padding: '10px 20px', borderRadius: 999, cursor: heading === null ? 'default' : 'pointer',
              border: `1.5px solid ${gold}`, background: 'rgba(212,165,58,0.12)', color: gold,
              fontWeight: 800, fontSize: 14, opacity: heading === null ? 0.4 : 1,
            }}>Calibrate to visible target</button>
            {calibrated ? (
              <button onClick={onResetCalibration} style={{ background: 'none', border: 'none', color: green, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                ✓ Calibrated ({headingOffset > 0 ? '+' : ''}{Math.round(headingOffset)}°) — tap to reset
              </button>
            ) : (
              <span style={{ fontSize: 11, opacity: 0.55, maxWidth: 280, textAlign: 'center' }}>
                Aim the phone at a target you can see, then tap Calibrate for accurate bearings.
              </span>
            )}
          </div>

          {/* Instructions */}
          <p style={{ marginTop: 18, textAlign: 'center', fontSize: 13, lineHeight: 1.5, opacity: 0.72, maxWidth: 300 }}>
            Lay your phone <b>flat on the ground</b> behind the ball, top edge pointing down your line. Rotate until the arrow locks at the top — that’s your aim.
          </p>
        </>
      )}
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
  const [elevM, setElevM] = useState<{ player: number | null; target: number | null; green: number | null }>({ player: null, target: null, green: null })
  const [elevCacheVersion, setElevCacheVersion] = useState(0)
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
  const [holePickerOpen, setHolePickerOpen] = useState(false)
  const [scopeMode, setScopeMode] = useState(false)
  const [blindShot, setBlindShot] = useState(false)
  const [wind, setWind] = useState<WindData | null>(null)
  // Shared pin placement per hole (tournament-wide, live). pinEditMode drives the
  // set-pin flow; pinDraft is the provisional spot before saving.
  const [pins, setPins] = useState<Record<number, LatLng>>({})
  const [pinEditMode, setPinEditMode] = useState(false)
  const [pinDraft, setPinDraft] = useState<LatLng | null>(null)
  const [caddieOpen, setCaddieOpen] = useState(false)
  // Shot tracking
  const [trackingShot, setTrackingShot] = useState<{ club: string; start: LatLng; aim: LatLng | null; hole: number } | null>(null)
  const [clubPickerOpen, setClubPickerOpen] = useState(false)
  const [lastShot, setLastShot] = useState<Shot | null>(null)
  const [shotToast, setShotToast] = useState<string | null>(null)

  const [localScores, setLocalScores]     = useState<LocalScore[]>([])
  const [localTeams, setLocalTeams]       = useState<LocalTeam[]>([])
  const [localProfiles, setLocalProfiles] = useState<LocalProfile[]>([])

  const compass = useCompassHeading(blindShot)
  const bag = useMemo(() => resolveBag(profile?.club_distances), [profile?.club_distances])
  const [headingOffset, setHeadingOffset] = useState<number>(() => {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem('bsHeadingOffset') : null
    return v ? parseFloat(v) || 0 : 0
  })
  const [calibrated, setCalibrated] = useState<boolean>(() =>
    typeof localStorage !== 'undefined' && localStorage.getItem('bsHeadingOffset') !== null)

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
  const reachedGreenHoleRef = useRef(0)
  const lastTargetPosRef  = useRef<LatLng | null>(null)
  const lastTargetHoleRef = useRef(0)
  const lastCenterKeyRef  = useRef('')
  // Camera state captured on entering scope/pin mode, restored on exit.
  const preModeCamRef = useRef<{ center: [number, number]; zoom: number; bearing: number; pitch: number; followPaused: boolean; hole: number } | null>(null)
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

  // ── Shared pin placements (tournament-wide, live) ─────────────────────────

  useEffect(() => {
    if (!effectiveTournamentId) { setPins({}); return }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase as any).from('hole_pins')
      .select('hole, lat, lng')
      .eq('tournament_id', effectiveTournamentId)
      .then(({ data }: { data: { hole: number; lat: number; lng: number }[] | null }) => {
        if (data) setPins(Object.fromEntries(data.map(r => [r.hole, { lat: r.lat, lng: r.lng }])))
      })

    const channel = supabase.channel(`hole-pins-${effectiveTournamentId}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('postgres_changes' as any, {
        event: '*', schema: 'public', table: 'hole_pins',
        filter: `tournament_id=eq.${effectiveTournamentId}`,
      }, (payload: { eventType: string; new: { hole: number; lat: number; lng: number }; old: { hole: number } }) => {
        if (payload.eventType === 'DELETE') {
          setPins(prev => { const n = { ...prev }; delete n[payload.old.hole]; return n })
        } else {
          const r = payload.new
          setPins(prev => ({ ...prev, [r.hole]: { lat: r.lat, lng: r.lng } }))
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [effectiveTournamentId])

  // Most recent tracked shot (so Chubbs can rib the player on a bad one).
  useEffect(() => {
    if (!profile?.id) { setLastShot(null); return }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase as any).from('shots')
      .select('*').eq('player_id', profile.id).order('created_at', { ascending: false }).limit(1)
      .then(({ data }: { data: Shot[] | null }) => setLastShot(data?.[0] ?? null))
  }, [profile?.id, effectiveTournamentId])

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

  // ── Wind data ─────────────────────────────────────────────────────────────
  // Location: the course center, else the first hole with a green (so wind still
  // works even if the course center coordinate was never saved).
  const weatherLat = course ? (course.lat ?? course.holes.find(h => h.green.center)?.green.center?.lat ?? null) : null
  const weatherLng = course ? (course.lng ?? course.holes.find(h => h.green.center)?.green.center?.lng ?? null) : null

  useEffect(() => {
    if (weatherLat == null || weatherLng == null) return
    const lat = weatherLat, lng = weatherLng
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const tick = async () => {
      if (stopped) return
      let ok = false
      try {
        let result: { speed: number; direction: number } | null = null
        // 1. Prefer the server-side proxy (works even if the phone can't reach
        //    Open-Meteo directly — CORS / per-IP rate limits).
        try {
          const { data } = await supabase.functions.invoke('weather-', { body: { wind: { lat, lng } } })
          if (data?.wind && typeof data.wind.speed === 'number') result = data.wind
        } catch { /* proxy not deployed / errored — fall through to direct */ }
        // 2. Fall back to a direct fetch.
        if (!result) {
          const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=mph&timezone=auto`)
          if (res.ok) {
            const c = (await res.json()).current
            if (typeof c?.wind_speed_10m === 'number' && typeof c?.wind_direction_10m === 'number')
              result = { speed: Math.round(c.wind_speed_10m), direction: c.wind_direction_10m }
          }
        }
        if (result) { setWind({ ...result, fetchedAt: Date.now() }); ok = true }
      } catch { /* offline / transient */ }
      // Refresh every 10 min on success; retry every 30 s after a failure.
      if (!stopped) timer = setTimeout(tick, ok ? 10 * 60 * 1000 : 30 * 1000)
    }
    tick()
    return () => { stopped = true; if (timer) clearTimeout(timer) }
  }, [weatherLat, weatherLng])

  // ── Derived state ─────────────────────────────────────────────────────────

  const currentHole: HoleGps | undefined = course?.holes.find(h => h.hole === selectedHole)

  // Shared pin for this hole (if anyone has set one). It overrides the green
  // center as the "center" distance / aim target; front & back stay green edges.
  const pinForHole = pins[selectedHole] ?? null
  const effectiveCenter = pinForHole ?? currentHole?.green.center ?? null

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

  // Bunker carry distances: for each mapped bunker that's ahead of the player and
  // within the shot corridor, the reach (near edge) and carry (far edge) yards.
  const bunkerLabels = useMemo(() => {
    const green = currentHole?.green.center
    const bunkers = currentHole?.bunkers
    if (!position || !green || !bunkers?.length) return []
    const aimBearing = calcBearing(position, green)
    const playerToGreen = haversineYards(position, green)
    // The hole centerline (tee → green) defines "inside/outside" the hole, so the
    // pill always lands on the outer flank of the bunker regardless of where the
    // player stands. Falls back to the player's line if the tee isn't mapped.
    const tee = currentHole?.tee ?? null
    const centerBearing = tee ? calcBearing(tee, green) : aimBearing
    const centerAnchor = tee ?? position
    const out: { id: number; lat: number; lng: number; front: number; side: number }[] = []
    bunkers.forEach((poly, i) => {
      if (!poly || poly.length < 2) return
      const clat = poly.reduce((s, p) => s + p.lat, 0) / poly.length
      const clng = poly.reduce((s, p) => s + p.lng, 0) / poly.length
      const centroid = { lat: clat, lng: clng }
      // Ahead of the player (closer to the green than we are).
      if (haversineYards(centroid, green) >= playerToGreen) return
      // Within ~40 yds of the line of play (lateral offset from the aim bearing).
      const distToCentroid = haversineYards(position, centroid)
      const rel = normDeg(calcBearing(position, centroid) - aimBearing)
      if (distToCentroid * Math.sin(Math.abs(rel) * Math.PI / 180) > 40) return
      // Reach (nearest vertex), carry (farthest — for the skip test), radius.
      let front = Infinity, carry = 0, radius = 0
      poly.forEach(p => {
        const d = haversineYards(position, p); if (d < front) front = d; if (d > carry) carry = d
        const r = haversineYards(centroid, p); if (r > radius) radius = r
      })
      if (carry < 15) return // essentially at your feet / already passed
      // Which flank of the hole centerline the bunker sits on, then push the pill
      // that way (outward, away from the fairway) past the bunker edge.
      const side = normDeg(calcBearing(centerAnchor, centroid) - centerBearing) >= 0 ? 1 : -1
      const lp = offsetLatLng(centroid, centerBearing + side * 90, (radius + 11) * 0.9144)
      out.push({ id: i, lat: lp.lat, lng: lp.lng, front, side })
    })
    return out
  }, [position, currentHole])

  const aimLineGeoJson = useMemo(() => {
    if (!position) return null
    const target = tapPoint ?? currentHole?.green.center
    if (!target) return null
    return { type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: [[position.lng, position.lat], [target.lng, target.lat]] },
      properties: {} }
  }, [position, tapPoint, currentHole])

  const tapToGreenGeoJson = useMemo(() => {
    const green = effectiveCenter; if (!tapPoint || !green) return null
    return { type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: [[tapPoint.lng, tapPoint.lat], [green.lng, green.lat]] },
      properties: {} }
  }, [tapPoint, effectiveCenter?.lat, effectiveCenter?.lng])

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
    const APPROACH_YDS = 150, MAX_PITCH = 70
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
      padding: { top: pitch >= 40 ? 175 : pitch > 0 ? 150 : HUD_TOP_PAD, bottom: HUD_BOTTOM_PAD, left: 48, right: 48 },
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

  // Snapshot the camera + follow state before entering scope/pin mode, so exiting
  // returns the player to exactly where they were (Me view or whole-hole), rather
  // than force-zooming to the whole hole.
  const captureCam = () => {
    const m = mapRef.current
    if (!m) { preModeCamRef.current = null; return }
    const c = m.getCenter()
    preModeCamRef.current = {
      center: [c.lng, c.lat], zoom: m.getZoom(), bearing: m.getBearing(), pitch: m.getPitch(),
      followPaused: followPausedRef.current, hole: selectedHole,
    }
  }
  const restoreCam = () => {
    const snap = preModeCamRef.current
    preModeCamRef.current = null
    // Hole changed while in the mode → the snapshot is stale; frame the new hole.
    if (!snap || snap.hole !== selectedHole) { if (currentHole) flyToHole(currentHole); return }
    followPausedRef.current = snap.followPaused
    mapRef.current?.easeTo({
      center: snap.center, zoom: snap.zoom, bearing: snap.bearing, pitch: snap.pitch,
      duration: 600, essential: false,
    })
  }

  // Recenter around the player: frame from where they are on the hole to the
  // green, and resume the follow-cam so it keeps tracking.
  const recenterOnPlayer = useCallback(() => {
    const green = currentHole?.green.center
    if (!position || !green) return
    followPausedRef.current = false
    if (followPauseTimer.current) clearTimeout(followPauseTimer.current)
    frameHole(position, green, 800)
  }, [position, currentHole, frameHole])

  // ── Shared pin editing ────────────────────────────────────────────────────
  const enterPinEdit = () => {
    const g = currentHole?.green.center
    if (!g) return
    captureCam()
    setScopeMode(false); setBlindShot(false)
    setPinEditMode(true)
    setPinDraft(pinForHole)
    followPausedRef.current = true
    if (followPauseTimer.current) clearTimeout(followPauseTimer.current)
    const bearing = currentHole?.tee ? calcBearing(currentHole.tee, g) : 0
    mapRef.current?.easeTo({ center: [g.lng, g.lat], zoom: 19.2, pitch: 0, bearing, duration: 600 })
  }
  const exitPinEdit = () => {
    setPinEditMode(false)
    setPinDraft(null)
    restoreCam()
  }
  const savePin = async () => {
    if (!pinDraft || !effectiveTournamentId) { exitPinEdit(); return }
    const p = pinDraft
    setPins(prev => ({ ...prev, [selectedHole]: p }))       // optimistic
    exitPinEdit()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('hole_pins').upsert({
      tournament_id: effectiveTournamentId, hole: selectedHole,
      lat: p.lat, lng: p.lng, set_by: profile?.id ?? null, updated_at: new Date().toISOString(),
    }, { onConflict: 'tournament_id,hole' })
  }
  const clearPin = async () => {
    if (!effectiveTournamentId) { exitPinEdit(); return }
    setPins(prev => { const n = { ...prev }; delete n[selectedHole]; return n })  // optimistic
    exitPinEdit()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('hole_pins').delete()
      .eq('tournament_id', effectiveTournamentId).eq('hole', selectedHole)
  }

  // ── Shot tracking ─────────────────────────────────────────────────────────
  const startTracking = (club: string) => {
    if (!position) return
    setClubPickerOpen(false)
    setTrackingShot({ club, start: position, aim: aimLineTarget, hole: selectedHole })
  }
  const cancelTracking = () => setTrackingShot(null)
  const markBall = async () => {
    const t = trackingShot
    if (!t || !position) return
    const distance = haversineYards(t.start, position)
    let offline: number | null = null
    if (t.aim) {
      const ang = normDeg(calcBearing(t.start, position) - calcBearing(t.start, t.aim))
      offline = Math.round(distance * Math.sin(ang * Math.PI / 180))
    }
    setTrackingShot(null)
    setShotToast(`${t.club}: ${distance}y${offline != null && Math.abs(offline) >= 3 ? ` · ${Math.abs(offline)}y ${offline > 0 ? 'right' : 'left'}` : ''}`)
    setTimeout(() => setShotToast(null), 4000)
    const row = {
      tournament_id: effectiveTournamentId, player_id: profile?.id, hole: t.hole, club: t.club,
      start_lat: t.start.lat, start_lng: t.start.lng, end_lat: position.lat, end_lng: position.lng,
      distance_yds: distance, offline_yds: offline, created_at: new Date().toISOString(),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).from('shots').insert(row).select().single()
    setLastShot((data as Shot) ?? { id: 'local', ...row } as Shot)
  }

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

  // Auto-target the sniper reticle:
  //  • Inside 210 yds of the green → aim at the green (highest priority).
  //  • Par 3 → always the middle of the green.
  //  • Par 4/5 tee shot → the mapped landing zone (while it's still ahead).
  //  • Otherwise → halfway to the green (a middle-of-the-fairway layup, so the
  //    player→sniper and sniper→green yardages are equal).
  // It re-sets on a new hole, after advancing ~20 yds toward the green (fresh
  // target for the next shot), and when crossing inside 210 yds. Between those,
  // a manual tap to measure a different target sticks.
  useEffect(() => {
    const green = effectiveCenter
    const holeChanged = lastTargetHoleRef.current !== selectedHole
    const centerKey = green ? `${green.lat.toFixed(6)},${green.lng.toFixed(6)}` : ''
    const centerChanged = lastCenterKeyRef.current !== centerKey
    lastCenterKeyRef.current = centerKey
    if (!position || !green) {
      // No live position: don't carry a target across holes (falls back to green).
      if (holeChanged) { setTapPoint(null); lastTargetPosRef.current = null; lastTargetHoleRef.current = selectedHole }
      return
    }
    const distToGreen = haversineYards(position, green)
    const last = lastTargetPosRef.current
    const lastDist = last ? haversineYards(last, green) : Infinity
    const movedToward = lastDist - distToGreen
    const crossedInside210 = lastDist > 210 && distToGreen <= 210
    // centerChanged fires when a pin is set/moved/cleared — re-snap to it.
    if (holeChanged || centerChanged || last === null || movedToward >= 20 || crossedInside210) {
      const par = resolvePar(selectedHole, course?.holes)
      const lz = currentHole?.landingZone ?? null
      let auto: LatLng
      if (distToGreen <= 210) {
        // Within approach range: aim at the green (takes priority over the layup).
        auto = green
      } else if (par <= 3) {
        // Par 3: always aim at the middle of the green.
        auto = green
      } else if (lz && haversineYards(lz, green) < distToGreen - 10) {
        // Par 4/5 tee shot: the mapped landing zone while it's still ahead.
        auto = lz
      } else {
        // Layup: halfway to the green, in the middle of the fairway — equal
        // yardages from the player to the sniper and from the sniper to the hole.
        auto = { lat: (position.lat + green.lat) / 2, lng: (position.lng + green.lng) / 2 }
      }
      setTapPoint(auto)
      lastTargetPosRef.current = position
      lastTargetHoleRef.current = selectedHole
    }
  }, [position, currentHole, selectedHole, effectiveCenter?.lat, effectiveCenter?.lng])

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
    // Placing a shared pin: the tap drops the provisional pin, nothing else.
    if (pinEditMode) {
      setPinDraft({ lat: e.lngLat.lat, lng: e.lngLat.lng })
      return
    }
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
  const centerDist     = dist(position, effectiveCenter)
  const backDist       = dist(position, currentHole?.green.back)
  const tapDist        = dist(position, tapPoint)
  const tapToGreenDist = dist(tapPoint, effectiveCenter)
  const distToTee      = dist(position, currentHole?.tee)
  // Hide landing zone once player has walked >75 yds from tee (no longer relevant)
  const showLandingZone = !!currentHole?.landingZone && (!position || distToTee === null || distToTee <= 75)

  const aimLineTarget = tapPoint ?? effectiveCenter ?? null
  const aimLineDist   = tapPoint ? tapDist : centerDist
  const aimLineMid    = position && aimLineTarget
    ? { lat: (position.lat + aimLineTarget.lat) / 2, lng: (position.lng + aimLineTarget.lng) / 2 } : null
  const tapToGreenMid = tapPoint && effectiveCenter
    ? { lat: (tapPoint.lat + effectiveCenter.lat) / 2, lng: (tapPoint.lng + effectiveCenter.lng) / 2 } : null

  // Scope/green-view: carry-distance arcs sweeping across, centred on the PLAYER
  // (so they read as "how far from where I'm hitting"), bracketing the target.
  const scopeArcs = (scopeMode && position && aimLineTarget && aimLineDist !== null && aimLineDist <= 9999) ? (() => {
    const shotBearing = calcBearing(position, aimLineTarget)
    const base = Math.round(aimLineDist)
    const yds = [base - 20, base - 10, base, base + 10, base + 20].filter(y => y > 20)
    // Span each arc by a fixed LATERAL half-width (in yards) rather than a fixed
    // angle, so the band always fits the zoom window instead of ballooning with
    // distance. Convert that half-width to a per-ring angle via asin(w / r).
    const halfYds = Math.min(22, base * 0.18)
    const halfW = halfYds * 0.9144
    const arcCoords = (yd: number): [number, number][] => {
      const r = yd * 0.9144
      const A = Math.asin(Math.min(0.98, halfW / r)) * 180 / Math.PI // deg each side
      const out: [number, number][] = []
      const steps = 24
      for (let i = 0; i <= steps; i++) {
        const a = -A + (2 * A * i) / steps
        const p = offsetLatLng(position, shotBearing + a, r)
        out.push([p.lng, p.lat])
      }
      return out
    }
    const endAngle = (yd: number) =>
      Math.asin(Math.min(0.98, halfW / (yd * 0.9144))) * 180 / Math.PI
    // "Plays like" for each ring: raw carry + wind (scales with distance) + a
    // constant elevation offset (player → target). Wind headwind is along the shot.
    const hw = wind ? windComponents(wind.speed, wind.direction, shotBearing).headwind : 0
    const elevAdj = (elevM.player !== null && elevM.target !== null)
      ? Math.round((elevM.target - elevM.player) * METERS_TO_FEET * ELEV_YARDS_PER_FOOT) : 0
    const playsLike = (yd: number) =>
      Math.max(1, Math.round(yd + (wind ? windPlaysLikeYards(hw, yd) : 0) + elevAdj))
    return {
      geojson: {
        type: 'FeatureCollection' as const,
        features: yds.map((yd, i) => ({
          type: 'Feature' as const, id: i,
          geometry: { type: 'LineString' as const, coordinates: arcCoords(yd) },
          properties: { base: yd === base },
        })),
      },
      labels: yds.map(yd => {
        const A = endAngle(yd)
        const left = offsetLatLng(position, shotBearing - A, yd * 0.9144)
        const right = offsetLatLng(position, shotBearing + A, yd * 0.9144)
        const pl = playsLike(yd)
        return { yd, pl, club: recommendClub(pl, bag)?.club ?? null, left, right, base: yd === base }
      }),
      // Column headers just beyond the outermost arc: left = actual carry, right = plays like.
      headers: (() => {
        const maxYd = yds[yds.length - 1]
        const A = endAngle(maxYd)
        return {
          left: offsetLatLng(position, shotBearing - A, (maxYd + 16) * 0.9144),
          right: offsetLatLng(position, shotBearing + A, (maxYd + 16) * 0.9144),
        }
      })(),
    }
  })() : null

  // Zoom the map tightly onto the target when scope mode is on (a "sniper" view).
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!scopeMode || !aimLineTarget) return
    followPausedRef.current = true
    const bearing = position ? calcBearing(position, aimLineTarget)
      : (currentHole?.tee && currentHole?.green.center ? calcBearing(currentHole.tee, currentHole.green.center) : 0)
    mapRef.current?.easeTo({
      center: [aimLineTarget.lng, aimLineTarget.lat],
      zoom: 18.4, bearing, pitch: 0,
      padding: { top: 0, bottom: 0, left: 0, right: 0 },
      duration: 600, essential: false,
    })
  }, [scopeMode, aimLineTarget?.lat, aimLineTarget?.lng]) // eslint-disable-line react-hooks/exhaustive-deps

  // Enter scope mode: snapshot the camera first so we can return to it on exit.
  const enterScope = () => {
    captureCam()
    setScopeMode(true)
  }
  // Leave scope mode: return to wherever the player was before entering.
  const exitScope = () => {
    setScopeMode(false)
    restoreCam()
  }


  // Auto-open the score sheet once per hole — but only after the player has
  // finished putting and WALKED AWAY from the green (toward the next tee), so it
  // never interrupts putts. We note when they reach the green (~30 yds), then
  // open once they've moved well off it (>55 yds).
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!profile || centerDist === null) return
    if (centerDist <= 30) reachedGreenHoleRef.current = selectedHole
    if (sheetOpen || autoOpenedHoleRef.current === selectedHole) return
    if (reachedGreenHoleRef.current === selectedHole && centerDist > 55) {
      autoOpenedHoleRef.current = selectedHole
      setSheetOpen(true)
    }
  }, [centerDist, selectedHole, profile, sheetOpen])

  // Elevation for the player, the aim target, and the green (Open-Meteo, no key).
  // Cached per rounded coordinate so walking around doesn't spam the API; used
  // for the elevation "plays-like" adjustment on both pills.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const green = currentHole?.green.center ?? null
    if (!position || !aimLineTarget) { setElevM({ player: null, target: null, green: null }); return }
    const cache = elevCacheRef.current
    const pKey = `${position.lat.toFixed(4)},${position.lng.toFixed(4)}`
    const tKey = `${aimLineTarget.lat.toFixed(5)},${aimLineTarget.lng.toFixed(5)}`
    const gKey = green ? `${green.lat.toFixed(5)},${green.lng.toFixed(5)}` : null
    const apply = () => setElevM({
      player: cache[pKey] ?? null,
      target: cache[tKey] ?? null,
      green: gKey ? (cache[gKey] ?? null) : null,
    })

    const need: { key: string; lat: number; lng: number }[] = []
    if (!(pKey in cache)) need.push({ key: pKey, lat: +position.lat.toFixed(4), lng: +position.lng.toFixed(4) })
    if (!(tKey in cache)) need.push({ key: tKey, lat: +aimLineTarget.lat.toFixed(5), lng: +aimLineTarget.lng.toFixed(5) })
    if (gKey && green && !(gKey in cache)) need.push({ key: gKey, lat: +green.lat.toFixed(5), lng: +green.lng.toFixed(5) })
    if (need.length === 0) { apply(); return }

    let cancelled = false
    ;(async () => {
      let arr: number[] | null = null
      // 1. Prefer the server-side proxy (same reasons as wind).
      try {
        const { data } = await supabase.functions.invoke('weather-', {
          body: { elevation: need.map(n => ({ lat: n.lat, lng: n.lng })) },
        })
        if (Array.isArray(data?.elevations)) arr = data.elevations
      } catch { /* proxy not deployed / errored — fall through to direct */ }
      // 2. Fall back to a direct fetch.
      if (!arr) {
        try {
          const lats = need.map(n => n.lat).join(',')
          const lngs = need.map(n => n.lng).join(',')
          const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`)
          if (res.ok) {
            const json = await res.json()
            if (Array.isArray(json?.elevation)) arr = json.elevation
          }
        } catch { /* offline — elevation adjustment just won't show */ }
      }
      if (arr) need.forEach((n, i) => { if (typeof arr![i] === 'number') cache[n.key] = arr![i] })
      if (!cancelled) apply()
    })()
    return () => { cancelled = true }
  }, [position?.lat, position?.lng, aimLineTarget?.lat, aimLineTarget?.lng, currentHole?.green.center?.lat, currentHole?.green.center?.lng, elevCacheVersion])

  // Pre-fetch elevation for every hole's tee, green centre, and landing zone at
  // course load so switching holes shows the elevation instantly (no per-hole
  // network wait). Cached under both the player (4dp) and target (5dp) keys.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const holes = course?.holes
    if (!holes?.length) return
    const cache = elevCacheRef.current
    const seen = new Set<string>()
    const pts: LatLng[] = []
    const add = (p?: LatLng | null) => {
      if (!p) return
      const k = `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`
      if (seen.has(k)) return
      seen.add(k); pts.push(p)
    }
    holes.forEach(h => { add(h.tee); add(h.green.center); add(h.landingZone) })
    const missing = pts.filter(p => !(`${p.lat.toFixed(5)},${p.lng.toFixed(5)}` in cache))
    if (!missing.length) return

    let cancelled = false
    ;(async () => {
      for (let i = 0; i < missing.length && !cancelled; i += 50) {
        const chunk = missing.slice(i, i + 50)
        let arr: number[] | null = null
        try {
          const { data } = await supabase.functions.invoke('weather-', {
            body: { elevation: chunk.map(p => ({ lat: p.lat, lng: p.lng })) },
          })
          if (Array.isArray(data?.elevations)) arr = data.elevations
        } catch { /* proxy unavailable */ }
        if (!arr) {
          try {
            const lats = chunk.map(p => p.lat).join(',')
            const lngs = chunk.map(p => p.lng).join(',')
            const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`)
            if (res.ok) { const j = await res.json(); if (Array.isArray(j?.elevation)) arr = j.elevation }
          } catch { /* offline */ }
        }
        if (arr) chunk.forEach((p, j) => {
          const e = arr![j]
          if (typeof e === 'number') {
            cache[`${p.lat.toFixed(4)},${p.lng.toFixed(4)}`] = e
            cache[`${p.lat.toFixed(5)},${p.lng.toFixed(5)}`] = e
          }
        })
      }
      if (!cancelled) setElevCacheVersion(v => v + 1)
    })()
    return () => { cancelled = true }
  }, [course?.holes])

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
  const aimClub = recommendClub(playsLikeYds ?? aimLineDist, bag)

  // Plays-like for the approach shot (aim target → green)
  const greenCtr = effectiveCenter
  const apValid = tapToGreenDist !== null && tapToGreenDist > 0
  const apBearing = (aimLineTarget && greenCtr) ? calcBearing(aimLineTarget, greenCtr) : null
  const apHeadwind = (wind && apBearing !== null) ? windComponents(wind.speed, wind.direction, apBearing).headwind : 0
  const apWindAdjYds = (wind && apValid) ? windPlaysLikeYards(apHeadwind, tapToGreenDist!) : 0
  const apElevDeltaFt = (elevM.target !== null && elevM.green !== null) ? (elevM.green - elevM.target) * METERS_TO_FEET : null
  const apElevAdjYds = apElevDeltaFt !== null ? Math.round(apElevDeltaFt * ELEV_YARDS_PER_FOOT) : 0
  const apPlaysLike = apValid ? Math.max(1, tapToGreenDist! + apWindAdjYds + apElevAdjYds) : null
  const apPlaysDelta = apPlaysLike !== null ? apPlaysLike - tapToGreenDist! : 0

  // ── AI caddie context ───────────────────────────────────────────────────────
  const surfaceHint = (() => {
    if (!position || !currentHole) return null
    if ((currentHole.bunkers ?? []).some(poly => poly.length >= 3 && pointInPolygon(position, poly))) return 'bunker'
    const fairways = (currentHole.fairway ?? []).filter(p => p.length >= 3)
    if (fairways.some(poly => pointInPolygon(position, poly))) return 'fairway'
    return fairways.length ? 'rough' : null
  })()
  const elevText = (elevM.player !== null && elevM.target !== null)
    ? (() => {
        const ft = Math.round((elevM.target - elevM.player) * METERS_TO_FEET)
        return Math.abs(ft) < 2 ? 'flat to the target' : `target ~${Math.abs(ft)} ft ${ft > 0 ? 'uphill' : 'downhill'}`
      })()
    : null
  const windText = wind
    ? `${wind.speed} mph out of the ${cardinalDir(wind.direction)}` +
      (Math.abs(shotHeadwind) >= 3 ? `, ${shotHeadwind > 0 ? 'into the shot' : 'helping'} (~${Math.abs(Math.round(shotHeadwind))} mph)` : '')
    : null
  const lastShotInfo = lastShot?.distance_yds != null
    ? shotQuality(lastShot, bag.find(c => c.club === lastShot.club)?.carry ?? null)
    : null
  const caddieContext: CaddieContext = {
    hole: selectedHole,
    par: parForHole,
    targetDistanceYds: aimLineDist,
    playsLikeYds,
    windText,
    elevationText: elevText,
    baselineClub: aimClub?.club ?? null,
    bag: bag.filter(c => c.enabled).map(c => ({ club: c.club, carry: c.carry })),
    surfaceHint,
    lastShotNote: lastShotInfo?.note ?? null,
    lastShotBad: lastShotInfo?.bad ?? false,
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0,
      bottom: 'env(safe-area-inset-bottom, 0px)',
      display: 'flex', flexDirection: 'column',
      zIndex: 60, background: 'var(--bg)', overscrollBehavior: 'none',
    }}>
      {/* Improvement 3: Map fills entire remaining space; HUD floats over the bottom */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <Map
          ref={mapRef}
          mapboxAccessToken={TOKEN}
          {...viewState}
          onMove={(e: { viewState: typeof viewState }) => setViewState(e.viewState)}
          style={{ width: '100%', height: '100%' }}
          maxPitch={70}
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

          {/* Flag pin — at the shared pin when set, else the green center */}
          {effectiveCenter && !pinEditMode && (
            <Marker longitude={effectiveCenter.lng} latitude={effectiveCenter.lat} anchor="bottom">
              <FlagPin />
            </Marker>
          )}

          {/* Pin-edit: provisional flag being placed */}
          {pinEditMode && pinDraft && (
            <Marker longitude={pinDraft.lng} latitude={pinDraft.lat} anchor="bottom">
              <div className="pin-draft-bob"><FlagPin /></div>
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

          {/* Bunker carry chips — reach / carry yards, in-play bunkers ahead */}
          {!scopeMode && !blindShot && bunkerLabels.map(b => (
            <Marker key={`bnk-${b.id}`} longitude={b.lng} latitude={b.lat} anchor={b.side === 1 ? 'left' : 'right'} offset={[b.side * 3, 0]}>
              <div style={{
                position: 'relative', display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 9px', borderRadius: 8, whiteSpace: 'nowrap', pointerEvents: 'none',
                background: 'linear-gradient(180deg, rgba(28,28,34,0.96), rgba(10,10,14,0.96))',
                border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 3px 10px rgba(0,0,0,0.55)',
              }}>
                <SandIcon size={11} />
                <span style={{ fontFamily: 'Bebas Neue', fontSize: 17, lineHeight: 1, letterSpacing: 0.5, color: '#e8c766', fontVariantNumeric: 'tabular-nums' }}>
                  {b.front}
                </span>
                {/* pointer aimed inward at the bunker */}
                <div style={{
                  position: 'absolute', top: '50%', transform: 'translateY(-50%)', width: 0, height: 0,
                  borderTop: '6px solid transparent', borderBottom: '6px solid transparent',
                  ...(b.side === 1
                    ? { left: -6, borderRight: '7px solid rgba(15,15,20,0.96)' }
                    : { right: -6, borderLeft: '7px solid rgba(15,15,20,0.96)' }),
                }} />
              </div>
            </Marker>
          ))}

          {/* Scope carry-distance arcs from the player (green-view mode) */}
          {scopeArcs && (
            <Source id="scope-arcs" type="geojson" data={scopeArcs.geojson}>
              <Layer id="scope-arcs-line" type="line"
                paint={{
                  'line-color': ['case', ['get', 'base'], '#D4A53A', 'rgba(255,255,255,0.75)'],
                  'line-width': ['case', ['get', 'base'], 2.4, 1.4],
                }} />
            </Source>
          )}
          {/* Column headers so the two number columns aren't confused */}
          {scopeArcs && (
            <Marker longitude={scopeArcs.headers.left.lng} latitude={scopeArcs.headers.left.lat} anchor="right" offset={[-4, 0]}>
              <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', textShadow: '0 1px 3px rgba(0,0,0,0.9)', pointerEvents: 'none', whiteSpace: 'nowrap' }}>Actual</div>
            </Marker>
          )}
          {scopeArcs && (
            <Marker longitude={scopeArcs.headers.right.lng} latitude={scopeArcs.headers.right.lat} anchor="left" offset={[4, 0]}>
              <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1, color: '#4ade80', textTransform: 'uppercase', textShadow: '0 1px 3px rgba(0,0,0,0.9)', pointerEvents: 'none', whiteSpace: 'nowrap' }}>Plays Like</div>
            </Marker>
          )}
          {/* Left = actual carry yardage; right = plays-like distance */}
          {scopeArcs?.labels.map(l => (
            <Marker key={`yd-${l.yd}`} longitude={l.left.lng} latitude={l.left.lat} anchor="right" offset={[-4, 0]}>
              <div style={{
                fontSize: 12, fontWeight: 800, color: l.base ? '#D4A53A' : '#fff',
                textShadow: '0 1px 3px rgba(0,0,0,0.9)', pointerEvents: 'none', whiteSpace: 'nowrap',
              }}>{l.yd} yrds</div>
            </Marker>
          ))}
          {scopeArcs?.labels.map(l => (
            <Marker key={`pl-${l.yd}`} longitude={l.right.lng} latitude={l.right.lat} anchor="left" offset={[4, 0]}>
              <div style={{
                display: 'flex', alignItems: 'baseline', gap: 4,
                textShadow: '0 1px 3px rgba(0,0,0,0.9)', pointerEvents: 'none', whiteSpace: 'nowrap',
              }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: l.base ? '#D4A53A' : '#4ade80' }}>{l.pl}</span>
                {l.club && <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', opacity: 0.9 }}>{l.club}</span>}
              </div>
            </Marker>
          ))}

          {/* Sniper reticle — at tap point if set, otherwise at green center.
              Shrinks within 210 yds of the green (approach range). */}
          {position && aimLineTarget && (
            <Marker longitude={aimLineTarget.lng} latitude={aimLineTarget.lat} anchor="center">
              <ReticleMarker scale={scopeMode ? 1.15 : (centerDist !== null && centerDist <= 210 ? 0.7 : 1)} />
            </Marker>
          )}

          {/* Tap-to-green "money" number — sporty pill w/ plays-like (hidden at 0) */}
          {tapToGreenMid && tapToGreenDist !== null && tapToGreenDist > 0 && (
            <Marker longitude={tapToGreenMid.lng} latitude={tapToGreenMid.lat} anchor="right" offset={[-12, 0]}>
              <div style={{
                display: 'flex', alignItems: 'stretch', overflow: 'hidden',
                background: 'linear-gradient(180deg, rgba(30,23,6,0.95), rgba(14,10,2,0.95))',
                borderRadius: 12, border: '1px solid rgba(212,165,58,0.45)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.55), 0 0 14px rgba(212,165,58,0.15)',
                whiteSpace: 'nowrap', pointerEvents: 'none',
              }}>
                <div style={{ width: 3, background: 'linear-gradient(180deg,#f2d883,#D4A53A)' }} />
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 1, padding: '4px 11px' }}>
                  <span style={{ fontFamily: 'Bebas Neue', fontSize: 27, lineHeight: 1, letterSpacing: 0.5, color: '#f2cd6c', fontVariantNumeric: 'tabular-nums' }}>{tapToGreenDist}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(242,205,108,0.6)' }}>y</span>
                </div>
                {apPlaysLike !== null && Math.abs(apPlaysDelta) >= 1 && (
                  <div style={{
                    display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2,
                    padding: '3px 11px', borderLeft: '1px solid rgba(212,165,58,0.18)',
                    background: apPlaysDelta > 0 ? 'rgba(255,77,79,0.10)' : 'rgba(74,222,128,0.10)',
                  }}>
                    <span style={{ fontSize: 7.5, fontWeight: 800, letterSpacing: 1.5, color: 'rgba(242,205,108,0.5)', lineHeight: 1 }}>PLAYS LIKE</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontFamily: 'Bebas Neue', fontSize: 22, lineHeight: 0.85, letterSpacing: 0.5, color: apPlaysDelta > 0 ? '#ff6b6b' : '#51e08a', fontVariantNumeric: 'tabular-nums' }}>{apPlaysLike}</span>
                      <div style={{ display: 'flex', gap: 3 }}>
                        {apWindAdjYds ? (
                          <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: 0.2, padding: '1px 4px', borderRadius: 4, background: 'rgba(96,165,250,0.20)', color: '#93c5fd' }}>W{apWindAdjYds > 0 ? '+' : ''}{apWindAdjYds}</span>
                        ) : null}
                        {apElevAdjYds ? (
                          <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: 0.2, padding: '1px 4px', borderRadius: 4, background: 'rgba(212,165,58,0.22)', color: '#e8c766' }}>E{apElevAdjYds > 0 ? '+' : ''}{apElevAdjYds}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Marker>
          )}

          {/* Aim-line distance + plays-like — sporty compact pill beside the line */}
          {aimLineMid && aimLineDist !== null && aimLineDist <= 9999 && (
            <Marker longitude={aimLineMid.lng} latitude={aimLineMid.lat} anchor="right" offset={[-12, 0]}>
              <div style={{
                display: 'flex', alignItems: 'stretch', overflow: 'hidden',
                background: 'linear-gradient(180deg, rgba(26,26,32,0.95), rgba(9,9,13,0.95))',
                borderRadius: 12, border: '1px solid rgba(255,255,255,0.14)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.55)',
                whiteSpace: 'nowrap', pointerEvents: 'none',
              }}>
                {/* leading accent bar */}
                <div style={{ width: 3, background: 'linear-gradient(180deg,#ffffff,rgba(255,255,255,0.35))' }} />
                {/* raw yardage */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 1, padding: '4px 11px' }}>
                  <span style={{ fontFamily: 'Bebas Neue', fontSize: 26, lineHeight: 1, letterSpacing: 0.5, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{aimLineDist}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.42)' }}>y</span>
                </div>
                {/* plays like — only when wind/elevation actually change it */}
                {playsLikeYds !== null && Math.abs(playsLikeDelta) >= 1 && (
                  <div style={{
                    display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2,
                    padding: '3px 11px', borderLeft: '1px solid rgba(255,255,255,0.10)',
                    background: playsLikeDelta > 0 ? 'rgba(255,77,79,0.10)' : 'rgba(74,222,128,0.10)',
                  }}>
                    <span style={{ fontSize: 7.5, fontWeight: 800, letterSpacing: 1.5, color: 'rgba(255,255,255,0.4)', lineHeight: 1 }}>PLAYS LIKE</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontFamily: 'Bebas Neue', fontSize: 22, lineHeight: 0.85, letterSpacing: 0.5, color: playsLikeDelta > 0 ? '#ff6b6b' : '#51e08a', fontVariantNumeric: 'tabular-nums' }}>{playsLikeYds}</span>
                      <div style={{ display: 'flex', gap: 3 }}>
                        {windAdjYds ? (
                          <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: 0.2, padding: '1px 4px', borderRadius: 4, background: 'rgba(96,165,250,0.20)', color: '#93c5fd' }}>W{windAdjYds > 0 ? '+' : ''}{windAdjYds}</span>
                        ) : null}
                        {elevAdjYds ? (
                          <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: 0.2, padding: '1px 4px', borderRadius: 4, background: 'rgba(212,165,58,0.22)', color: '#e8c766' }}>E{elevAdjYds > 0 ? '+' : ''}{elevAdjYds}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}
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

        {/* Right-rail tool buttons — one column, vertically centered as a group so
            it stays centered no matter how many buttons are shown. */}
        <div style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', zIndex: 11,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, pointerEvents: 'none',
        }}>
          {/* Scope / green-view: zooms tight onto the target */}
          {position && aimLineTarget && (
            <button
              onClick={() => scopeMode ? exitScope() : enterScope()}
              className="pressable"
              style={{
                pointerEvents: 'auto', flexShrink: 0,
                width: 46, height: 46, borderRadius: '50%',
                background: scopeMode ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.4)',
                backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
                border: scopeMode ? '1.5px solid #fff' : '1.5px solid rgba(255,255,255,0.7)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                boxShadow: scopeMode ? '0 0 16px rgba(255,255,255,0.5)' : '0 2px 12px rgba(0,0,0,0.5)',
              }}
            >
              {scopeMode ? <X size={20} color="#111" /> : <ScopeIcon />}
            </button>
          )}

          {/* Blind-shot compass */}
          {position && aimLineTarget && (
            <button
              onClick={() => { if (scopeMode) exitScope(); setBlindShot(true); void compass.request() }}
              className="pressable"
              aria-label="Blind shot compass"
              style={{
                pointerEvents: 'auto', flexShrink: 0,
                width: 46, height: 46, borderRadius: '50%',
                background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
                border: '1.5px solid rgba(255,255,255,0.7)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
              }}
            >
              <Compass size={24} color="#fff" />
            </button>
          )}

          {/* Set-pin */}
          {currentHole?.green.center && !pinEditMode && (
            <button
              onClick={enterPinEdit}
              className="pressable"
              aria-label="Set pin location"
              style={{
                pointerEvents: 'auto', flexShrink: 0,
                width: 46, height: 46, borderRadius: '50%',
                background: pinForHole ? 'rgba(212,165,58,0.9)' : 'rgba(0,0,0,0.4)',
                backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
                border: pinForHole ? '1.5px solid #fff' : '1.5px solid rgba(255,255,255,0.7)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                boxShadow: pinForHole ? '0 0 14px rgba(212,165,58,0.5)' : '0 2px 12px rgba(0,0,0,0.5)',
              }}
            >
              <Flag size={22} color={pinForHole ? '#111' : '#fff'} fill={pinForHole ? '#111' : 'none'} />
            </button>
          )}

          {/* AI caddie */}
          {position && aimLineTarget && !pinEditMode && (
            <button
              onClick={() => setCaddieOpen(true)}
              className="pressable"
              aria-label="Ask Chubbs"
              style={{
                pointerEvents: 'auto', flexShrink: 0, padding: 0, overflow: 'hidden',
                width: 46, height: 46, borderRadius: '50%',
                background: 'rgba(0,0,0,0.4)',
                border: '1.5px solid #D4A53A',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                boxShadow: '0 0 12px rgba(212,165,58,0.45)',
              }}
            >
              <img src={CHUBBS_IMG} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </button>
          )}
        </div>

        {blindShot && (
          <BlindShotCompass
            targetBearing={position && aimLineTarget ? calcBearing(position, aimLineTarget) : null}
            distance={aimLineDist}
            playsLike={playsLikeYds}
            club={recommendClub(playsLikeYds, bag)}
            heading={compass.heading}
            headingOffset={headingOffset}
            calibrated={calibrated}
            permission={compass.permission}
            onRequest={() => void compass.request()}
            onCalibrate={() => {
              if (compass.heading === null || !position || !aimLineTarget) return
              const off = normDeg(calcBearing(position, aimLineTarget) - compass.heading)
              setHeadingOffset(off); setCalibrated(true)
              try { localStorage.setItem('bsHeadingOffset', String(off)) } catch { /* ignore */ }
            }}
            onResetCalibration={() => {
              setHeadingOffset(0); setCalibrated(false)
              try { localStorage.removeItem('bsHeadingOffset') } catch { /* ignore */ }
            }}
            onClose={() => setBlindShot(false)}
          />
        )}

        {caddieOpen && <CaddieSheet context={caddieContext} onClose={() => setCaddieOpen(false)} />}

        {/* Club picker — pick the club you're about to hit, then tracking starts */}
        {clubPickerOpen && (
          <div onClick={() => setClubPickerOpen(false)} style={{
            position: 'absolute', inset: 0, zIndex: 45, background: 'rgba(4,6,5,0.6)',
            backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-end',
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              width: '100%', background: 'var(--panel)', borderRadius: '20px 20px 0 0',
              border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 -12px 40px rgba(0,0,0,0.6)',
              marginBottom: navBase, padding: '16px 16px 20px',
            }}>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: 24, letterSpacing: 1, color: '#D4A53A', marginBottom: 12 }}>WHICH CLUB DID YOU HIT?</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {bag.filter(c => c.enabled).map(c => (
                  <button key={c.club} onClick={() => startTracking(c.club)} className="pressable" style={{
                    padding: '12px 4px', borderRadius: 12, cursor: 'pointer',
                    border: `1.5px solid ${aimClub?.club === c.club ? '#D4A53A' : 'rgba(255,255,255,0.14)'}`,
                    background: aimClub?.club === c.club ? 'rgba(212,165,58,0.16)' : 'rgba(255,255,255,0.05)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                  }}>
                    <span style={{ fontFamily: 'Bebas Neue', fontSize: 22, color: aimClub?.club === c.club ? '#e8c766' : 'var(--tx1)' }}>{c.club}</span>
                    <span style={{ fontSize: 9, color: 'var(--tx4)' }}>{c.carry}y</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tracking banner — live distance + Mark ball */}
        {trackingShot && (
          <div style={{
            position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 14px)', left: '50%', transform: 'translateX(-50%)',
            zIndex: 40, display: 'flex', alignItems: 'center', gap: 12,
            background: 'rgba(10,10,15,0.9)', border: '1px solid rgba(212,165,58,0.4)', borderRadius: 14,
            padding: '8px 10px 8px 14px', boxShadow: '0 6px 20px rgba(0,0,0,0.55)', whiteSpace: 'nowrap',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1, color: '#e8c766' }}>TRACKING {trackingShot.club}</span>
              <span style={{ fontFamily: 'Bebas Neue', fontSize: 24, color: '#fff' }}>
                {position ? haversineYards(trackingShot.start, position) : 0}<span style={{ fontSize: 12, opacity: 0.6 }}>y so far</span>
              </span>
            </div>
            <button onClick={markBall} className="pressable" style={{
              padding: '10px 16px', borderRadius: 10, border: 'none', background: '#D4A53A', color: '#1a1206', fontWeight: 800, fontSize: 14, cursor: 'pointer',
            }}>Mark ball</button>
            <button onClick={cancelTracking} style={{
              width: 34, height: 34, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.06)', color: '#fff', cursor: 'pointer', fontSize: 15,
            }}>✕</button>
          </div>
        )}

        {/* Saved-shot toast */}
        {shotToast && (
          <div style={{
            position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 14px)', left: '50%', transform: 'translateX(-50%)',
            zIndex: 41, background: 'rgba(16,45,20,0.95)', border: '1px solid rgba(74,222,128,0.5)', borderRadius: 12,
            padding: '10px 16px', color: '#b9f6c8', fontWeight: 700, fontSize: 14, boxShadow: '0 6px 20px rgba(0,0,0,0.5)', whiteSpace: 'nowrap',
          }}>✓ Shot saved — {shotToast}</div>
        )}

        {/* Pin-edit overlay: instruction banner + Save / Clear / Cancel */}
        {pinEditMode && (
          <>
            <div style={{
              position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 14px)', left: '50%', transform: 'translateX(-50%)',
              zIndex: 40, background: 'rgba(10,10,15,0.85)', color: '#fff', padding: '8px 16px', borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.14)', fontSize: 13, fontWeight: 600, textAlign: 'center',
              whiteSpace: 'nowrap', boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            }}>
              🚩 Tap the green to place the pin — everyone sees it
            </div>
            <div style={{
              position: 'absolute', left: 12, right: 12, bottom: navBase, zIndex: 40,
              background: 'var(--panel)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 16,
              boxShadow: '0 10px 30px rgba(0,0,0,0.55)',
              padding: 16, display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'stretch',
            }}>
              <button onClick={exitPinEdit} className="pressable" style={{
                padding: '15px 22px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.06)', color: 'var(--tx1)', fontWeight: 700, fontSize: 16, cursor: 'pointer',
              }}>Cancel</button>
              {pinForHole && (
                <button onClick={clearPin} className="pressable" style={{
                  padding: '15px 22px', borderRadius: 14, border: '1px solid rgba(255,77,79,0.5)',
                  background: 'rgba(255,77,79,0.12)', color: '#ff6b6b', fontWeight: 700, fontSize: 16, cursor: 'pointer',
                }}>Clear</button>
              )}
              <button onClick={savePin} disabled={!pinDraft} className="pressable" style={{
                flex: 1, maxWidth: 240, padding: '15px 22px', borderRadius: 14, border: 'none',
                background: '#D4A53A', color: '#1a1206', fontWeight: 800, fontSize: 16,
                cursor: pinDraft ? 'pointer' : 'default', opacity: pinDraft ? 1 : 0.45,
              }}>Save pin</button>
            </div>
          </>
        )}

        {/* Hole picker — slides down from the top when the hole number is tapped */}
        {holePickerOpen && (
          <div onClick={() => setHolePickerOpen(false)} style={{
            position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)',
          }} />
        )}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 31,
          background: 'var(--panel)', borderRadius: '0 0 20px 20px',
          boxShadow: '0 10px 34px rgba(0,0,0,0.55)',
          padding: '12px 12px 16px',
          transform: holePickerOpen ? 'translateY(0)' : 'translateY(-115%)',
          transition: 'transform 0.34s cubic-bezier(0.32,0.72,0,1)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, padding: '0 2px' }}>
            <span className="section-label">Select Hole</span>
            <button className="pressable" onClick={() => setHolePickerOpen(false)} style={{
              width: 30, height: 30, borderRadius: '50%', background: 'var(--surf2)', border: '1px solid var(--bdr)',
              color: 'var(--tx3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}><X size={15} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 7 }}>
            {Array.from({ length: 18 }, (_, i) => i + 1).map(hole => {
              const active = selectedHole === hole, hasData = holeHasData(hole)
              return (
                <button key={hole} className="pressable" onClick={() => { setSelectedHole(hole); setHolePickerOpen(false) }} style={{
                  height: 54, borderRadius: 12,
                  border: active ? '1px solid var(--gold)' : '1px solid var(--bdr)',
                  background: active ? 'linear-gradient(180deg, var(--gold-25), var(--gold-15))' : 'var(--surf)',
                  color: active ? 'var(--gold)' : 'var(--tx2)',
                  boxShadow: active ? '0 0 10px var(--gold-25), var(--elev-1)' : 'none',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                  cursor: 'pointer', opacity: hasData ? 1 : 0.5,
                }}>
                  <span style={{ fontFamily: 'Bebas Neue', fontSize: 22, lineHeight: 1, letterSpacing: 0.5, fontVariantNumeric: 'tabular-nums' }}>{hole}</span>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: hasData ? '#22c55e' : 'var(--bdr2)' }} />
                </button>
              )
            })}
          </div>
        </div>

        {/* Top-right badges: recommended club tile, GPS status, then sim controls */}
        <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
          {aimClub && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
              padding: '8px 12px 7px', borderRadius: 14, minWidth: 66,
              background: 'linear-gradient(180deg, rgba(26,26,32,0.95), rgba(9,9,13,0.95))',
              border: '1px solid rgba(74,222,128,0.38)', boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            }}>
              <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: 1.5, color: 'rgba(255,255,255,0.42)', lineHeight: 1 }}>CLUB</span>
              <span style={{ fontFamily: 'Bebas Neue', fontSize: 32, lineHeight: 0.95, letterSpacing: 0.5, color: '#51e08a' }}>{aimClub.club}</span>
              <ClubIcon club={aimClub.club} size={38} />
              {aimClub.note && <span style={{ fontSize: 8, fontWeight: 700, opacity: 0.6, color: '#fff', marginTop: 1 }}>{aimClub.note}</span>}
              {position && !trackingShot && (
                <button onClick={() => setClubPickerOpen(true)} className="pressable" style={{
                  marginTop: 6, padding: '4px 10px', borderRadius: 8, cursor: 'pointer',
                  border: '1px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.08)',
                  color: '#fff', fontSize: 9.5, fontWeight: 800, letterSpacing: 0.8,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>◉ TRACK SHOT</button>
              )}
            </div>
          )}
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
                <button className="pressable" onClick={() => setHolePickerOpen(true)} style={{
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <div style={{ fontFamily: 'Bebas Neue', fontSize: holeNumSize, letterSpacing: 1, lineHeight: 1, color: '#D4A53A' }}>{selectedHole}</div>
                    <ChevronDown size={isNarrow ? 13 : 17} color="rgba(212,165,58,0.75)" style={{ marginTop: 3 }} />
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Par {parForHole}</div>
                </button>
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
              {/* Camera reset buttons — side by side, spanning the chip width.
                  "Me" frames the player → green; "Hole" frames the whole hole. */}
              {currentHole && (
                <div style={{ display: 'flex', gap: 6 }}>
                  {position && (
                    <button onClick={recenterOnPlayer} style={{
                      flex: 1, minWidth: 0,
                      background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
                      border: '1px solid rgba(255,255,255,0.14)', color: 'white',
                      borderRadius: 12, padding: isNarrow ? '7px 6px' : '10px 8px', fontSize: 12, fontWeight: 600,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer',
                      boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
                    }}>
                      <Navigation size={14} color="#3b82f6" fill="#3b82f6" />
                      Me
                    </button>
                  )}
                  <button onClick={() => flyToHole(currentHole)} style={{
                    flex: 1, minWidth: 0,
                    background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
                    border: '1px solid rgba(255,255,255,0.14)', color: 'white',
                    borderRadius: 12, padding: isNarrow ? '7px 6px' : '10px 8px', fontSize: 12, fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
                  }}>
                    <Camera size={14} color="#D4A53A" />
                    Hole
                  </button>
                </div>
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
              { label: 'Back',              yards: backDist,   color: '#ef4444' },
              { label: pinForHole ? 'Pin' : 'Ctr', yards: centerDist, color: '#D4A53A' },
              { label: 'Frt',              yards: frontDist,  color: '#22c55e' },
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
