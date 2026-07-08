import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'

const CHUBBS_IMG = 'https://static.wikia.nocookie.net/sandlerverse/images/8/81/Chubbs_Peterson_in_Happy_Gilmore.webp'
const SEEN_KEY = 'chubbsTourSeen'
const MAX_IMAGES = 8 // per step, probed as /tour/<slug>-1.png … -8.png

interface TourStep {
  slug: string       // images live at /tour/<slug>-1.png, -2.png, …
  title: string
  body: string
  chubbs?: boolean   // show Chubbs on the card (intro/outro)
}

const STEPS: TourStep[] = [
  { slug: 'welcome', chubbs: true, title: "Welcome, big fella",
    body: "I'm Chubbs — your caddie for The Chubbs Memorial. Tap Next and I'll walk you around the app." },
  { slug: 'nav', title: "Getting around",
    body: "Everything lives in the tabs at the bottom — GPS, the leaderboard, contests, your team, photos and your account." },
  { slug: 'gps', title: "GPS: your command centre",
    body: "A live satellite view of every hole with your position, the flag, and all your distances. This is where you'll spend the round." },
  { slug: 'distances', title: "Every distance, adjusted",
    body: "Front / centre / back yardages, plus a “plays like” number that already bakes in the wind and the elevation change." },
  { slug: 'club', title: "Club in your hand",
    body: "The tile up top suggests the right club from YOUR bag for the plays-like distance — and you can track the shot right from it." },
  { slug: 'bag', title: "Set your bag",
    body: "In Account, dial in each club's carry — or just punch in your 7-iron and I'll scale the whole set for you." },
  { slug: 'scope', title: "Scope the green",
    body: "Green-view arcs sweep your carry distances across the fairway so you can see exactly what each club covers." },
  { slug: 'blindshot', title: "Blind shot compass",
    body: "Can't see your target? Set it on the map, lay the phone flat behind the ball, and rotate until the arrow locks — that's your line." },
  { slug: 'pin', title: "Shared pin position",
    body: "First group to the green drops the day's real pin location, and everyone in the tournament sees it live." },
  { slug: 'caddie', title: "Ask Caddie Chubbs",
    body: "Snap a photo of your lie and I'll call the club, ball position, stance and swing — right after I give you grief about your last shot." },
  { slug: 'tracking', title: "Track your shots",
    body: "Log real distances as you play. Your averages, longest pokes and miss tendencies all build up in your profile." },
  { slug: 'scoring', title: "Score the scramble",
    body: "Enter your team's score each hole. The app tracks the two-man scramble, drive minimums and chulligans automatically." },
  { slug: 'finish', chubbs: true, title: "That's the loop, kid",
    body: "Contests, the Jim Lahey vote, and a rules assistant are all a tap away. Keep your head down and follow through — now go play." },
]

interface TourCtx { startTour: () => void }
const Ctx = createContext<TourCtx>({ startTour: () => {} })
export const useTour = () => useContext(Ctx)

export function TourProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false)
  const [index, setIndex] = useState(0)
  const [promptOpen, setPromptOpen] = useState(false)
  const [images, setImages] = useState<string[]>([])
  const [imgIdx, setImgIdx] = useState(0)
  const touchX = useRef<number | null>(null)
  const location = useLocation()
  const { profile } = useAuth()

  const startTour = useCallback(() => {
    try { localStorage.setItem(SEEN_KEY, '1') } catch { /* ignore */ }
    setPromptOpen(false); setIndex(0); setActive(true)
  }, [])
  const close = useCallback(() => setActive(false), [])

  // Offer the tour once to a signed-in user on the dashboard.
  useEffect(() => {
    if (!profile || active) return
    let seen = false
    try { seen = localStorage.getItem(SEEN_KEY) === '1' } catch { /* ignore */ }
    if (!seen && location.pathname === '/') {
      const t = setTimeout(() => setPromptOpen(true), 900)
      return () => clearTimeout(t)
    }
  }, [profile, location.pathname, active])

  // Probe /tour/<slug>-1.png, -2.png … sequentially; stop at the first gap.
  useEffect(() => {
    if (!active) return
    setImages([]); setImgIdx(0)
    const slug = STEPS[index].slug
    let cancelled = false
    const probe = (n: number, acc: string[]) => {
      if (cancelled || n > MAX_IMAGES) return
      const src = `/tour/${slug}-${n}.png`
      const im = new Image()
      im.onload = () => { if (cancelled) return; const next = [...acc, src]; setImages(next); probe(n + 1, next) }
      im.onerror = () => { /* first gap → stop */ }
      im.src = src
    }
    probe(1, [])
    return () => { cancelled = true }
  }, [active, index])

  const step = STEPS[index]
  const last = index === STEPS.length - 1
  const nextImg = () => setImgIdx(i => (i + 1) % images.length)
  const prevImg = () => setImgIdx(i => (i - 1 + images.length) % images.length)

  return (
    <Ctx.Provider value={{ startTour }}>
      {children}

      {/* First-run offer */}
      {promptOpen && !active && (
        <div style={{
          position: 'fixed', left: 16, right: 16, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)', zIndex: 5900,
          background: 'var(--panel)', border: '1px solid rgba(212,165,58,0.4)', borderRadius: 18,
          boxShadow: '0 12px 40px rgba(0,0,0,0.55)', padding: 16, display: 'flex', alignItems: 'center', gap: 12,
          maxWidth: 460, margin: '0 auto',
        }}>
          <img src={CHUBBS_IMG} alt="Chubbs" style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover', border: '2px solid #D4A53A', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--tx1)' }}>New here? Want a quick tour?</div>
            <div style={{ fontSize: 12, color: 'var(--tx3)' }}>I'll show you the ropes in 90 seconds.</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
            <button onClick={startTour} style={{ padding: '8px 14px', borderRadius: 10, border: 'none', background: '#D4A53A', color: '#1a1206', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>Show me</button>
            <button onClick={() => { setPromptOpen(false); try { localStorage.setItem(SEEN_KEY, '1') } catch { /* ignore */ } }}
              style={{ padding: '4px', background: 'none', border: 'none', color: 'var(--tx4)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Not now</button>
          </div>
        </div>
      )}

      {/* Tour overlay */}
      {active && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 6000, background: 'rgba(6,8,7,0.9)' }} />
          <div style={{
            position: 'fixed', left: 16, right: 16, top: '50%', transform: 'translateY(-50%)', zIndex: 6001,
            maxWidth: 480, margin: '0 auto',
            background: 'var(--panel)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 20,
            boxShadow: '0 16px 48px rgba(0,0,0,0.6)', padding: 18, maxHeight: '90vh', overflowY: 'auto',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              {step.chubbs && <img src={CHUBBS_IMG} alt="Chubbs" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '2px solid #D4A53A', flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1, color: '#D4A53A' }}>STEP {index + 1} / {STEPS.length}</div>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: 24, letterSpacing: 0.5, color: 'var(--tx1)', lineHeight: 1.05 }}>{step.title}</div>
              </div>
              <button onClick={close} aria-label="Close tour" style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.06)', color: 'var(--tx1)', cursor: 'pointer', fontSize: 15, flexShrink: 0 }}>✕</button>
            </div>

            {/* Image carousel (whole image shown, swipe/tap between them) */}
            {images.length > 0 && (
              <div
                style={{ position: 'relative', marginBottom: 12, display: 'flex', justifyContent: 'center' }}
                onTouchStart={e => { touchX.current = e.touches[0].clientX }}
                onTouchEnd={e => {
                  if (touchX.current == null || images.length < 2) return
                  const dx = e.changedTouches[0].clientX - touchX.current
                  if (dx < -40) nextImg(); else if (dx > 40) prevImg()
                  touchX.current = null
                }}
              >
                <img src={images[imgIdx]} alt="" style={{
                  display: 'block', maxWidth: '100%', maxHeight: '58vh', borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.1)', objectFit: 'contain',
                }} />
                {images.length > 1 && (
                  <>
                    <button onClick={prevImg} aria-label="Previous" style={arrowStyle('left')}>‹</button>
                    <button onClick={nextImg} aria-label="Next" style={arrowStyle('right')}>›</button>
                    <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0, display: 'flex', gap: 5, justifyContent: 'center' }}>
                      {images.map((_, i) => (
                        <span key={i} style={{ width: i === imgIdx ? 16 : 6, height: 6, borderRadius: 3, background: i === imgIdx ? '#D4A53A' : 'rgba(255,255,255,0.45)', transition: 'width 0.2s' }} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            <div style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--tx2)' }}>{step.body}</div>

            {/* Step progress dots */}
            <div style={{ display: 'flex', gap: 4, justifyContent: 'center', margin: '14px 0', flexWrap: 'wrap' }}>
              {STEPS.map((_, i) => (
                <span key={i} style={{ width: i === index ? 16 : 5, height: 5, borderRadius: 3, background: i === index ? '#D4A53A' : 'rgba(255,255,255,0.2)', transition: 'width 0.2s' }} />
              ))}
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: 10 }}>
              {index > 0 && (
                <button onClick={() => setIndex(i => i - 1)} style={{ padding: '12px 18px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: 'var(--tx1)', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Back</button>
              )}
              <button onClick={() => (last ? close() : setIndex(i => i + 1))} className="pressable" style={{ flex: 1, padding: '12px 18px', borderRadius: 12, border: 'none', background: '#D4A53A', color: '#1a1206', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
                {last ? "Let's play" : 'Next'}
              </button>
            </div>
            {!last && (
              <button onClick={close} style={{ width: '100%', marginTop: 8, background: 'none', border: 'none', color: 'var(--tx4)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Skip tour</button>
            )}
          </div>
        </>
      )}
    </Ctx.Provider>
  )
}

function arrowStyle(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)', [side]: 6,
    width: 34, height: 34, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(10,10,15,0.65)', color: '#fff', fontSize: 20, lineHeight: 1, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
}
