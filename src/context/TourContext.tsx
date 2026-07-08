import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'

const CHUBBS_IMG = 'https://static.wikia.nocookie.net/sandlerverse/images/8/81/Chubbs_Peterson_in_Happy_Gilmore.webp'
const SEEN_KEY = 'chubbsTourSeen'
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

interface TourStep {
  route: '/' | '/gps'
  anchor: string        // data-tour value of the element to spotlight
  title: string
  body: string
  interactive?: boolean // let the user tap the element; tour minimizes then resumes
}

const STEPS: TourStep[] = [
  // ── Dashboard ──
  { route: '/', anchor: 'tour-launch', title: 'Your tour button',
    body: "This is your tour button — tap it anytime to run this whole walkthrough again. No pressure to remember everything." },
  { route: '/', anchor: 'leaderboard', title: 'Live leaderboard',
    body: "Every team's score to par, live. It updates the instant a score is entered anywhere in the field." },
  { route: '/', anchor: 'feed', title: 'Live feed',
    body: "The day's action as it happens — birdies, eagles, lead changes, chulligans and all the drama." },
  // ── GPS ──
  { route: '/gps', anchor: 'hole-tile', title: 'Hole, score & position', interactive: true,
    body: "Your current hole and its par, plus your running score and place in the field. Tap the hole number to jump to any hole." },
  { route: '/gps', anchor: 'camera', title: 'Recenter the camera',
    body: "“Me” frames from where you are to the green. “Hole” zooms out to show the whole hole, tee to green." },
  { route: '/gps', anchor: 'wind', title: 'Wind',
    body: "Wind speed in mph, the direction it's blowing FROM, and how it hits this shot — ▲ into you / ▼ helping, plus the crosswind component." },
  { route: '/gps', anchor: 'club', title: 'Recommended club & tracking',
    body: "The club from YOUR bag that matches the plays-like distance. ◉ TRACK lets you log the shot — that's optional and just for your own stats, not required for the tournament." },
  { route: '/gps', anchor: 'btn-scope', title: 'Scope the green', interactive: true,
    body: "Zooms tight into the green with carry-distance arcs across the fairway. Tap it to try." },
  { route: '/gps', anchor: 'btn-blindshot', title: 'Blind shot compass', interactive: true,
    body: "Aim at a target you can't see — lay the phone flat and line up the arrow. Tap it to try." },
  { route: '/gps', anchor: 'btn-pin', title: 'Set the pin', interactive: true,
    body: "Drop the day's real pin position on the green — everyone in the tournament sees it live. Tap it to try." },
  { route: '/gps', anchor: 'btn-caddie', title: 'Caddie Chubbs', interactive: true,
    body: "Snap a photo of your lie and I'll call the club, stance and swing (after I razz you about your last shot). Tap it to try." },
  { route: '/gps', anchor: 'yardage', title: 'Yardages to the green',
    body: "Distance to the back, centre and front of the green. When someone sets a pin, the centre number becomes the PIN distance." },
  { route: '/gps', anchor: 'reticle', title: 'The white sniper',
    body: "Your aim point. Tap anywhere on the map to move it — the pills show the exact yardage to it, adjusted for wind and elevation." },
  { route: '/gps', anchor: 'chull-drives', title: 'Chulligans & drives',
    body: "Your group's chulligans used and each player's drive count — so you always know where the scramble stands." },
]

interface TourCtx { startTour: () => void; active: boolean; gpsDemo: boolean; stepIndex: number }
const Ctx = createContext<TourCtx>({ startTour: () => {}, active: false, gpsDemo: false, stepIndex: 0 })
export const useTour = () => useContext(Ctx)

export function TourProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false)
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [minimized, setMinimized] = useState(false)
  const [promptOpen, setPromptOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { profile } = useAuth()

  const startTour = useCallback(() => {
    try { localStorage.setItem(SEEN_KEY, '1') } catch { /* ignore */ }
    setPromptOpen(false); setIndex(0); setRect(null); setMinimized(false); setActive(true)
  }, [])
  const close = useCallback(() => { setActive(false); setRect(null); setMinimized(false) }, [])

  // Offer once to a signed-in user on the dashboard.
  useEffect(() => {
    if (!profile || active) return
    let seen = false
    try { seen = localStorage.getItem(SEEN_KEY) === '1' } catch { /* ignore */ }
    if (!seen && location.pathname === '/') {
      const t = setTimeout(() => setPromptOpen(true), 900)
      return () => clearTimeout(t)
    }
  }, [profile, location.pathname, active])

  // Navigate → find → scroll → measure the anchor element for the current step.
  useEffect(() => {
    if (!active) return
    const step = STEPS[index]
    setRect(null); setMinimized(false)
    let cancelled = false
    let el: HTMLElement | null = null
    const onClick = () => setMinimized(true)
    const measure = () => {
      if (cancelled) return
      const node = document.querySelector(`[data-tour="${step.anchor}"]`) as HTMLElement | null
      if (!node) return
      el = node
      const r = node.getBoundingClientRect()
      if (r.width && r.height) setRect({ x: r.left, y: r.top, width: r.width, height: r.height })
    }
    const run = async () => {
      const needNav = location.pathname !== step.route
      if (needNav) navigate(step.route)
      await sleep(needNav ? (step.route === '/gps' ? 850 : 400) : 150)
      if (cancelled) return
      const node = document.querySelector(`[data-tour="${step.anchor}"]`) as HTMLElement | null
      node?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      if (!cancelled && step.interactive && node) { el = node; node.addEventListener('click', onClick, { once: true }) }
      // Re-measure repeatedly for ~2.5s: map markers (the reticle) keep moving as
      // the map frames the hole, so a single measurement lands in the wrong spot.
      for (let i = 0; i < 12 && !cancelled; i++) { measure(); await sleep(220) }
    }
    run()
    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    return () => { cancelled = true; window.removeEventListener('resize', onResize); if (el) el.removeEventListener('click', onClick) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, index])

  const step = STEPS[index]
  const last = index === STEPS.length - 1
  const gpsDemo = active && step.route === '/gps'
  const cardAtTop = rect ? rect.y > window.innerHeight * 0.48 : false
  const pad = 8

  const advance = () => (last ? close() : setIndex(i => i + 1))

  return (
    <Ctx.Provider value={{ startTour, active, gpsDemo, stepIndex: index }}>
      {children}

      {/* First-run offer */}
      {promptOpen && !active && (
        <div style={{
          position: 'fixed', left: 16, right: 16, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)', zIndex: 5900,
          background: 'var(--panel)', border: '1px solid rgba(212,165,58,0.4)', borderRadius: 18,
          boxShadow: '0 12px 40px rgba(0,0,0,0.55)', padding: 16, display: 'flex', alignItems: 'center', gap: 12, maxWidth: 460, margin: '0 auto',
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

      {/* Minimized: just a Resume pill while the user pokes at the opened control */}
      {active && minimized && (
        <button onClick={() => { setMinimized(false); advance() }} style={{
          position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 90px)', zIndex: 6100,
          padding: '12px 22px', borderRadius: 999, border: 'none', background: '#D4A53A', color: '#1a1206', fontWeight: 800, fontSize: 15,
          boxShadow: '0 8px 28px rgba(0,0,0,0.5)', cursor: 'pointer',
        }}>Resume tour ▸</button>
      )}

      {/* Live spotlight */}
      {active && !minimized && (
        <>
          {rect ? (
            <svg width="100%" height="100%" style={{ position: 'fixed', inset: 0, zIndex: 6000, pointerEvents: step.interactive ? 'none' : 'auto' }}>
              <defs>
                <mask id="tour-hole">
                  <rect x="0" y="0" width="100%" height="100%" fill="white" />
                  <rect x={rect.x - pad} y={rect.y - pad} width={rect.width + pad * 2} height={rect.height + pad * 2} rx={14} fill="black" />
                </mask>
              </defs>
              <rect x="0" y="0" width="100%" height="100%" fill="rgba(6,8,7,0.8)" mask="url(#tour-hole)" />
              <rect x={rect.x - pad} y={rect.y - pad} width={rect.width + pad * 2} height={rect.height + pad * 2} rx={14} fill="none" stroke="#D4A53A" strokeWidth={2.5} />
            </svg>
          ) : (
            <div style={{ position: 'fixed', inset: 0, zIndex: 6000, background: 'rgba(6,8,7,0.86)' }} />
          )}

          {/* Card */}
          <div style={{
            position: 'fixed', left: 16, right: 16, zIndex: 6001, maxWidth: 460, margin: '0 auto',
            ...(rect ? (cardAtTop ? { top: 'calc(env(safe-area-inset-top, 0px) + 16px)' } : { bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }) : { top: '50%', transform: 'translateY(-50%)' }),
            background: 'var(--panel)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 20,
            boxShadow: '0 16px 48px rgba(0,0,0,0.6)', padding: 18,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1, color: '#D4A53A' }}>STEP {index + 1} / {STEPS.length}</div>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: 24, letterSpacing: 0.5, color: 'var(--tx1)', lineHeight: 1.05 }}>{step.title}</div>
              </div>
              <button onClick={close} aria-label="Close tour" style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.06)', color: 'var(--tx1)', cursor: 'pointer', fontSize: 15, flexShrink: 0 }}>✕</button>
            </div>

            <div style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--tx2)' }}>{step.body}</div>
            {step.interactive && (
              <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: '#e8c766' }}>👆 Tap the highlighted control to try it — then hit “Resume tour”.</div>
            )}

            <div style={{ display: 'flex', gap: 4, justifyContent: 'center', margin: '14px 0', flexWrap: 'wrap' }}>
              {STEPS.map((_, i) => (
                <span key={i} style={{ width: i === index ? 16 : 5, height: 5, borderRadius: 3, background: i === index ? '#D4A53A' : 'rgba(255,255,255,0.2)', transition: 'width 0.2s' }} />
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              {index > 0 && (
                <button onClick={() => setIndex(i => i - 1)} style={{ padding: '12px 18px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: 'var(--tx1)', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Back</button>
              )}
              <button onClick={advance} className="pressable" style={{ flex: 1, padding: '12px 18px', borderRadius: 12, border: 'none', background: '#D4A53A', color: '#1a1206', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
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
