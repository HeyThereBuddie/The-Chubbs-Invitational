import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface CaddieContext {
  hole: number
  par: number | null
  targetDistanceYds: number | null
  playsLikeYds: number | null
  windText: string | null
  elevationText: string | null
  baselineClub: string | null
  bag: { club: string; carry: number }[]
  surfaceHint: string | null
}

interface Rec {
  club: string
  clubChange: 'up' | 'down' | 'same'
  ballPosition: string
  stance: string
  swingType: string
  aim: string
  flight?: string
  rationale: string
  confidence: 'low' | 'medium' | 'high'
}

const SURFACES: { label: string; kind: string }[] = [
  { label: 'Fairway', kind: 'fairway' }, { label: 'Light rough', kind: 'light' }, { label: 'Deep rough', kind: 'deep' },
  { label: 'Fairway bunker', kind: 'fbunker' }, { label: 'Greenside bunker', kind: 'gbunker' }, { label: 'Hardpan / bare', kind: 'hardpan' },
]
const CONDITIONS: { label: string; kind: string }[] = [
  { label: 'Flat', kind: 'flat' }, { label: 'Uphill', kind: 'uphill' }, { label: 'Downhill', kind: 'downhill' },
  { label: 'Ball above feet', kind: 'above' }, { label: 'Ball below feet', kind: 'below' },
]

const ball = (cx: number, cy: number) => <circle cx={cx} cy={cy} r={4.6} fill="#f4f4f4" stroke="rgba(0,0,0,0.25)" strokeWidth={0.6} />

// Little illustration of each lie / stance.
function LieIcon({ kind, size = 50 }: { kind: string; size?: number }) {
  const G = '#4f9d4f', GD = '#3c7a3c', SAND = '#e2c483', DIRT = '#a9793f'
  let body: React.ReactNode = null
  switch (kind) {
    case 'fairway': body = (<>
      <rect x={3} y={27} width={42} height={11} rx={3} fill={G} />
      <g stroke={GD} strokeWidth={1.2} strokeLinecap="round"><line x1={9} y1={27} x2={9} y2={24} /><line x1={16} y1={27} x2={16} y2={24.5} /><line x1={33} y1={27} x2={33} y2={24} /><line x1={40} y1={27} x2={40} y2={24.5} /></g>
      {ball(24, 23)}</>); break
    case 'light': body = (<>
      <rect x={3} y={27} width={42} height={11} rx={3} fill={G} />
      <g stroke={GD} strokeWidth={1.4} strokeLinecap="round"><line x1={14} y1={28} x2={13} y2={21} /><line x1={18} y1={28} x2={18.6} y2={20} /><line x1={30} y1={28} x2={29} y2={21} /><line x1={34} y1={28} x2={35} y2={20.5} /></g>
      {ball(24, 25)}</>); break
    case 'deep': body = (<>
      <rect x={3} y={28} width={42} height={10} rx={3} fill={GD} />
      {ball(24, 28)}
      <g stroke="#2f6b2f" strokeWidth={1.8} strokeLinecap="round"><line x1={12} y1={30} x2={10} y2={18} /><line x1={17} y1={30} x2={18} y2={17} /><line x1={22} y1={31} x2={21} y2={19} /><line x1={27} y1={31} x2={28} y2={18} /><line x1={32} y1={30} x2={31} y2={17} /><line x1={37} y1={30} x2={39} y2={19} /></g></>); break
    case 'fbunker': body = (<><path d="M3 32 Q3 25 14 25 Q24 23 34 25 Q45 25 45 32 L45 38 L3 38 Z" fill={SAND} />{ball(24, 23)}</>); break
    case 'gbunker': body = (<>
      <path d="M20 30 Q30 22 46 24 L46 38 L20 38 Z" fill={G} />
      <path d="M2 33 Q2 27 12 27 Q20 26 26 29 L26 38 L2 38 Z" fill={SAND} />
      <line x1={38} y1={10} x2={38} y2={26} stroke="#fff" strokeWidth={1.3} /><polygon points="38,10 46,13 38,16" fill="#d64545" />
      {ball(14, 25)}</>); break
    case 'hardpan': body = (<>
      <rect x={3} y={27} width={42} height={11} rx={3} fill={DIRT} />
      <g stroke="#7c5322" strokeWidth={1} strokeLinecap="round" fill="none"><path d="M10 33 l4 2 l-2 2" /><path d="M32 32 l3 3" /><line x1={20} y1={35} x2={26} y2={34} /></g>
      {ball(24, 23)}</>); break
    case 'flat': body = (<><rect x={3} y={28} width={42} height={5} rx={2.5} fill={G} />{ball(24, 24)}</>); break
    case 'uphill': body = (<><path d="M3 38 L45 16 L45 38 Z" fill={G} />{ball(30, 22)}</>); break
    case 'downhill': body = (<><path d="M3 16 L45 38 L3 38 Z" fill={G} />{ball(18, 22)}</>); break
    case 'above': body = (<><path d="M3 38 L45 20 L45 38 Z" fill={G} />{ball(36, 24)}<g fill="#cbd0d6"><ellipse cx={14} cy={33} rx={4.5} ry={2.2} /><ellipse cx={20} cy={34.5} rx={4.5} ry={2.2} /></g></>); break
    case 'below': body = (<><path d="M3 20 L45 38 L3 38 Z" fill={G} />{ball(12, 24)}<g fill="#cbd0d6"><ellipse cx={32} cy={33} rx={4.5} ry={2.2} /><ellipse cx={38} cy={34.5} rx={4.5} ry={2.2} /></g></>); break
  }
  return <svg width={size} height={Math.round(size * 40 / 48)} viewBox="0 0 48 40" style={{ pointerEvents: 'none' }}>{body}</svg>
}

// Downscale a captured photo so the upload stays small/fast (plenty for a lie).
function fileToScaledBase64(file: File, maxPx = 1024, quality = 0.8): Promise<{ data: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('no canvas')); return }
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      const dataUrl = canvas.toDataURL('image/jpeg', quality)
      resolve({ data: dataUrl.split(',')[1], mediaType: 'image/jpeg' })
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')) }
    img.src = url
  })
}

export function CaddieSheet({ context, onClose }: { context: CaddieContext; onClose: () => void }) {
  const [surface, setSurface] = useState<string>(context.surfaceHint ?? 'Fairway')
  const [condition, setCondition] = useState<string>('Flat')
  const [photo, setPhoto] = useState<{ data: string; mediaType: string; preview: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [rec, setRec] = useState<Rec | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Hide the global rules-assistant FAB while this sheet is open.
  useEffect(() => {
    document.body.classList.add('caddie-open')
    return () => document.body.classList.remove('caddie-open')
  }, [])

  const pickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const scaled = await fileToScaledBase64(file)
      setPhoto({ ...scaled, preview: `data:${scaled.mediaType};base64,${scaled.data}` })
    } catch { setError('Could not read that photo.') }
  }

  const analyze = async () => {
    setLoading(true); setError(null); setRec(null)
    try {
      const { data, error } = await supabase.functions.invoke('rapid-function', {
        body: {
          context: { ...context, lieSurface: surface, lieCondition: condition },
          imageBase64: photo?.data ?? null,
          imageMediaType: photo?.mediaType ?? null,
        },
      })
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error)
      if (!data?.rec) throw new Error('No recommendation returned.')
      setRec(data.rec as Rec)
    } catch (e) {
      setError((e as Error).message || 'Caddie is unavailable right now.')
    }
    setLoading(false)
  }

  const tile = (active: boolean): React.CSSProperties => ({
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 4px 7px',
    borderRadius: 12, cursor: 'pointer',
    border: `1.5px solid ${active ? '#D4A53A' : 'rgba(255,255,255,0.12)'}`,
    background: active ? 'rgba(212,165,58,0.16)' : 'rgba(255,255,255,0.04)',
    color: active ? '#e8c766' : 'var(--tx2)',
  })

  const changeBadge = rec ? (rec.clubChange === 'up' ? { t: '▲ CLUB UP', c: '#4ade80' }
    : rec.clubChange === 'down' ? { t: '▼ CLUB DOWN', c: '#ff6b6b' }
    : { t: '= SAME CLUB', c: 'rgba(255,255,255,0.6)' }) : null

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(4,6,5,0.6)',
      backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 520, maxHeight: '86vh', overflowY: 'auto',
        marginBottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px)', // clear the bottom nav
        background: 'var(--panel)', borderRadius: '20px 20px 0 0',
        border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 -12px 40px rgba(0,0,0,0.6)',
        padding: '18px 18px 22px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontFamily: 'Bebas Neue', fontSize: 26, letterSpacing: 1, color: '#D4A53A' }}>⛳ AI CADDIE</span>
          <button onClick={onClose} style={{
            width: 34, height: 34, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(255,255,255,0.06)', color: 'var(--tx1)', cursor: 'pointer', fontSize: 16,
          }}>✕</button>
        </div>

        {/* Shot summary */}
        <div style={{ fontSize: 12.5, color: 'var(--tx3)', lineHeight: 1.5, marginBottom: 16 }}>
          {context.playsLikeYds != null && <>Plays like <b style={{ color: 'var(--tx1)' }}>{context.playsLikeYds}y</b>{context.baselineClub && <> · baseline <b style={{ color: 'var(--tx1)' }}>{context.baselineClub}</b></>}<br /></>}
          {context.windText && <>{context.windText}<br /></>}
          {context.elevationText}
        </div>

        {!rec && (
          <>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: 'var(--tx4)', marginBottom: 7 }}>SURFACE</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
              {SURFACES.map(s => (
                <button key={s.label} onClick={() => setSurface(s.label)} style={tile(surface === s.label)}>
                  <LieIcon kind={s.kind} />
                  <span style={{ fontSize: 11, fontWeight: 700, textAlign: 'center', lineHeight: 1.15 }}>{s.label}</span>
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: 'var(--tx4)', marginBottom: 7 }}>LIE / STANCE</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
              {CONDITIONS.map(s => (
                <button key={s.label} onClick={() => setCondition(s.label)} style={tile(condition === s.label)}>
                  <LieIcon kind={s.kind} />
                  <span style={{ fontSize: 11, fontWeight: 700, textAlign: 'center', lineHeight: 1.15 }}>{s.label}</span>
                </button>
              ))}
            </div>

            {/* Photo */}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={pickPhoto} style={{ display: 'none' }} />
            <button onClick={() => fileRef.current?.click()} className="pressable" style={{
              width: '100%', padding: 12, borderRadius: 12, marginBottom: 16, cursor: 'pointer',
              border: '1px dashed rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.04)',
              color: 'var(--tx2)', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              {photo ? '📸 Photo added — tap to retake' : '📷 Add a photo of your lie (more accurate)'}
            </button>
            {photo && <img src={photo.preview} alt="lie" style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 12, marginBottom: 16 }} />}

            <button onClick={analyze} disabled={loading} className="pressable" style={{
              width: '100%', padding: 15, borderRadius: 14, border: 'none', cursor: loading ? 'default' : 'pointer',
              background: '#D4A53A', color: '#1a1206', fontWeight: 800, fontSize: 16, opacity: loading ? 0.6 : 1,
            }}>{loading ? 'Reading your lie…' : 'Get caddie advice'}</button>
            {error && <div style={{ marginTop: 12, color: '#ff6b6b', fontSize: 13, textAlign: 'center' }}>{error}</div>}
          </>
        )}

        {rec && changeBadge && (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 16, marginBottom: 12,
              background: 'linear-gradient(180deg, rgba(212,165,58,0.16), rgba(212,165,58,0.06))', border: '1px solid rgba(212,165,58,0.35)',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: changeBadge.c }}>{changeBadge.t}</div>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: 40, lineHeight: 1, color: '#fff' }}>{rec.club}</div>
              </div>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--tx4)', textAlign: 'right' }}>
                Confidence<br /><span style={{ color: rec.confidence === 'high' ? '#4ade80' : rec.confidence === 'low' ? '#ff6b6b' : '#e8c766', fontSize: 13 }}>{rec.confidence}</span>
              </div>
            </div>

            {[
              { k: 'Ball position', v: rec.ballPosition },
              { k: 'Stance / setup', v: rec.stance },
              { k: 'Swing', v: rec.swingType },
              { k: 'Aim', v: rec.aim },
              ...(rec.flight ? [{ k: 'Expected flight', v: rec.flight }] : []),
            ].map(row => (
              <div key={row.k} style={{ display: 'flex', gap: 10, padding: '9px 2px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <span style={{ width: 110, flexShrink: 0, fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--tx4)', paddingTop: 2 }}>{row.k}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx1)', lineHeight: 1.4 }}>{row.v}</span>
              </div>
            ))}

            <div style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.55, margin: '14px 0 4px', fontStyle: 'italic' }}>“{rec.rationale}”</div>

            <button onClick={() => setRec(null)} className="pressable" style={{
              width: '100%', marginTop: 14, padding: 13, borderRadius: 12, cursor: 'pointer',
              border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.06)', color: 'var(--tx1)', fontWeight: 700, fontSize: 15,
            }}>Analyze again</button>
          </>
        )}
      </div>
    </div>
  )
}
