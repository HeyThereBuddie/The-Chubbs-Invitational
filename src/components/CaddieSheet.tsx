import { useRef, useState } from 'react'
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

const SURFACES = ['Fairway', 'Light rough', 'Deep rough', 'Fairway bunker', 'Greenside bunker', 'Hardpan / bare']
const CONDITIONS = ['Flat', 'Uphill', 'Downhill', 'Ball above feet', 'Ball below feet']

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
      const { data, error } = await supabase.functions.invoke('lie-caddie', {
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

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '8px 12px', borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: 'pointer',
    border: `1px solid ${active ? '#D4A53A' : 'rgba(255,255,255,0.16)'}`,
    background: active ? 'rgba(212,165,58,0.18)' : 'rgba(255,255,255,0.05)',
    color: active ? '#e8c766' : 'var(--tx2)', whiteSpace: 'nowrap',
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
        width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto',
        background: 'var(--panel)', borderRadius: '20px 20px 0 0',
        border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 -12px 40px rgba(0,0,0,0.6)',
        padding: '18px 18px calc(env(safe-area-inset-bottom, 0px) + 22px)',
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 16 }}>
              {SURFACES.map(s => <button key={s} onClick={() => setSurface(s)} style={chip(surface === s)}>{s}</button>)}
            </div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: 'var(--tx4)', marginBottom: 7 }}>LIE / STANCE</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 16 }}>
              {CONDITIONS.map(s => <button key={s} onClick={() => setCondition(s)} style={chip(condition === s)}>{s}</button>)}
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
