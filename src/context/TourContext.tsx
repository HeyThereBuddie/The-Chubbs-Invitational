import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'

const CHUBBS_IMG = 'https://static.wikia.nocookie.net/sandlerverse/images/8/81/Chubbs_Peterson_in_Happy_Gilmore.webp'
const SEEN_KEY = 'chubbsTourSeen'

interface TourStep {
  title: string
  body: string
  route?: string      // navigate here before showing (for live-anchored steps)
  anchor?: string      // data-tour value of a live element to spotlight
  image?: string       // screenshot to show instead of spotlighting a live element
  chubbs?: boolean     // show Chubbs on the card (intro/outro)
}

const STEPS: TourStep[] = [
  { title: "Welcome, big fella", chubbs: true,
    body: "I'm Chubbs — let me walk you through your caddie for The Chubbs Memorial. Tap Next and I'll show you around." },
  { title: "Getting around", route: '/', anchor: 'nav',
    body: "Everything lives in these tabs — GPS, the leaderboard, contests, your team, photos and your account." },
  { title: "GPS: your command centre", image: '/tour/gps.png',
    body: "A live satellite view of every hole with your position, the flag, and all your distances. This is where you'll spend the round." },
  { title: "Every distance, adjusted", image: '/tour/gps-club.png',
    body: "Front / centre / back yardages, plus a “plays like” number that already bakes in the wind and the elevation change." },
  { title: "Club in your hand", image: '/tour/gps-club.png',
    body: "The tile up top suggests the right club from YOUR bag for the plays-like distance — and you can track the shot right from it." },
  { title: "Set your bag", route: '/account', anchor: 'bag',
    body: "Dial in each club's carry here — or just punch in your 7-iron and I'll scale the whole set for you." },
  { title: "Scope the green", image: '/tour/scope.png',
    body: "Green-view arcs sweep your carry distances across the fairway so you can see exactly what each club covers." },
  { title: "Blind shot compass",
    body: "Can't see your target? Set it on the map, lay the phone flat behind the ball, and rotate until the arrow locks — that's your line." },
  { title: "Shared pin position",
    body: "First group to the green drops the day's real pin location, and everyone in the tournament sees it live." },
  { title: "Ask Caddie Chubbs", image: '/tour/caddie.png',
    body: "Snap a photo of your lie and I'll call the club, ball position, stance and swing — right after I give you a hard time about your last shot." },
  { title: "Track your shots", route: '/account', anchor: 'shot-stats',
    body: "Log real distances as you play. Your averages, longest pokes and miss tendencies all build up right here in your profile." },
  { title: "Score the scramble",
    body: "Enter your team's score each hole. The app tracks the two-man scramble, drive minimums and chulligans automatically." },
  { title: "That's the loop, kid", chubbs: true,
    body: "Contests, the Jim Lahey vote, and a rules assistant are all a tap away. Keep your head down and follow through — now go play." },
]

interface TourCtx { startTour: () => void }
const Ctx = createContext<TourCtx>({ startTour: () => {} })
export const useTour = () => useContext(Ctx)

export function TourProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false)
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [promptOpen, setPromptOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { profile } = useAuth()

  const startTour = useCallback(() => {
    try { localStorage.setItem(SEEN_KEY, '1') } catch { /* ignore */ }
    setPromptOpen(false); setIndex(0); setRect(null); setActive(true)
  }, [])
  const close = useCallback(() => { setActive(false); setRect(null) }, [])

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

  // Position the spotlight for anchored steps (navigate, scroll, measure).
  useEffect(() => {
    if (!active) return
    const step = STEPS[index]
    setRect(null)
    if (!step.anchor) return
    let cancelled = false
    const run = async () => {
      const needNav = step.route && location.pathname !== step.route
      if (needNav) navigate(step.route!)
      await new Promise(r => setTimeout(r, needNav ? 450 : 120))
      if (cancelled) return
      const el = document.querySelector(`[data-tour="${step.anchor}"]`) as HTMLElement | null
      if (!el) return
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      await new Promise(r => setTimeout(r, 380))
      if (cancelled) return
      const r = el.getBoundingClientRect()
      setRect({ x: r.left, y: r.top, width: r.width, height: r.height })
    }
    run()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, index])

  const step = STEPS[index]
  const last = index === STEPS.length - 1
  const pad = 8
  // Card goes opposite the highlighted element so it never covers it.
  const cardAtTop = rect ? rect.y > window.innerHeight * 0.5 : false

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

      {/* The tour overlay */}
      {active && (
        <>
          {/* Scrim + spotlight */}
          {rect ? (
            <svg width="100%" height="100%" style={{ position: 'fixed', inset: 0, zIndex: 6000, pointerEvents: 'auto' }}>
              <defs>
                <mask id="tour-hole">
                  <rect x="0" y="0" width="100%" height="100%" fill="white" />
                  <rect x={rect.x - pad} y={rect.y - pad} width={rect.width + pad * 2} height={rect.height + pad * 2} rx={14} fill="black" />
                </mask>
              </defs>
              <rect x="0" y="0" width="100%" height="100%" fill="rgba(6,8,7,0.82)" mask="url(#tour-hole)" />
              <rect x={rect.x - pad} y={rect.y - pad} width={rect.width + pad * 2} height={rect.height + pad * 2} rx={14} fill="none" stroke="#D4A53A" strokeWidth={2.5} />
            </svg>
          ) : (
            <div style={{ position: 'fixed', inset: 0, zIndex: 6000, background: 'rgba(6,8,7,0.88)' }} />
          )}

          {/* Card */}
          <div style={{
            position: 'fixed', left: 16, right: 16, zIndex: 6001, maxWidth: 460, margin: '0 auto',
            ...(rect
              ? (cardAtTop ? { top: 'calc(env(safe-area-inset-top, 0px) + 16px)' } : { bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' })
              : { top: '50%', transform: 'translateY(-50%)' }),
            background: 'var(--panel)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 20,
            boxShadow: '0 16px 48px rgba(0,0,0,0.6)', padding: 18, maxHeight: '84vh', overflowY: 'auto',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              {step.chubbs && <img src={CHUBBS_IMG} alt="Chubbs" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '2px solid #D4A53A', flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1, color: '#D4A53A' }}>STEP {index + 1} / {STEPS.length}</div>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: 24, letterSpacing: 0.5, color: 'var(--tx1)', lineHeight: 1.05 }}>{step.title}</div>
              </div>
              <button onClick={close} aria-label="Close tour" style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.06)', color: 'var(--tx1)', cursor: 'pointer', fontSize: 15, flexShrink: 0 }}>✕</button>
            </div>

            {step.image && (
              <img src={step.image} alt="" style={{ width: '100%', borderRadius: 12, marginBottom: 12, border: '1px solid rgba(255,255,255,0.1)', maxHeight: '42vh', objectFit: 'cover', objectPosition: 'top' }} />
            )}

            <div style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--tx2)' }}>{step.body}</div>

            {/* Progress dots */}
            <div style={{ display: 'flex', gap: 5, justifyContent: 'center', margin: '14px 0' }}>
              {STEPS.map((_, i) => (
                <span key={i} style={{ width: i === index ? 18 : 6, height: 6, borderRadius: 3, background: i === index ? '#D4A53A' : 'rgba(255,255,255,0.2)', transition: 'width 0.2s' }} />
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
