import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'

const CHUBBS_IMG = 'https://static.wikia.nocookie.net/sandlerverse/images/8/81/Chubbs_Peterson_in_Happy_Gilmore.webp'
const SEEN_KEY = 'chubbsTourSeen'
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

type SectionKey = 'dashboard' | 'gps' | 'leaderboard' | 'rules' | 'contests' | 'tourney' | 'photos'

interface TourStep {
  route: string         // path to navigate to before showing this step
  anchor: string        // data-tour value of the element to spotlight
  title: string
  body: string
  section?: SectionKey  // which topic this step belongs to (intro has none)
  interactive?: boolean // let the user tap the element; tour minimizes then resumes
  pokeable?: boolean    // let the user tap the element but keep the card up (no minimize)
}

// The topic menu Chubbs offers after the intro — one entry per app area.
const SECTIONS: { key: SectionKey; emoji: string; label: string; desc: string }[] = [
  { key: 'dashboard',   emoji: '🏠', label: 'Dashboard',     desc: 'Live leaderboard & the action feed' },
  { key: 'gps',         emoji: '⛳', label: 'GPS Caddie',    desc: 'Maps, distances, wind & club calls' },
  { key: 'leaderboard', emoji: '🏆', label: 'Leaderboard',   desc: 'Standings & hole-by-hole scorecards' },
  { key: 'rules',       emoji: '📖', label: 'Rules',         desc: 'Ask me anything about the rulebook' },
  { key: 'contests',    emoji: '🎯', label: 'Contests',      desc: 'Closest to pin, long drive & Lahey' },
  { key: 'tourney',     emoji: 'ℹ️',  label: 'Tourney',       desc: 'Tee times, teams & hall of fame' },
  { key: 'photos',      emoji: '📸', label: "Happy's Place", desc: 'The tournament photo wall' },
]

// The intro is always shown first; every other step is tagged with a section so
// the menu can play just that slice, or all of them for the full tour.
const INTRO: TourStep = { route: '/', anchor: 'nav-tour', title: "Hey, I'm Chubbs",
  body: "I'll be your caddie for this little tour. See this button down here? Tap it any time you want me to walk you through the app again — no need to memorize a thing. Ready?" }

const STEPS: TourStep[] = [
  // ── Dashboard ──
  { section: 'dashboard', route: '/', anchor: 'leaderboard', title: 'Live leaderboard',
    body: "Every team's score to par, live. It updates the instant a score is entered anywhere in the field." },
  { section: 'dashboard', route: '/', anchor: 'feed', title: 'Live feed',
    body: "The day's action as it happens — birdies, eagles, lead changes, chulligans and all the drama." },
  // ── GPS ──
  { section: 'gps', route: '/', anchor: 'nav-gps', title: 'The GPS page',
    body: "This big gold button in the middle is GPS — your on-course caddie, and where you'll spend most of the round. Live satellite maps, distances, wind, club calls, shot tracking and more. Let's walk through it." },
  { section: 'gps', route: '/gps', anchor: 'hole-tile', title: 'Hole, score & position', interactive: true,
    body: "Your current hole and its par, plus your running score and place in the field. Tap the hole number to jump to any hole." },
  { section: 'gps', route: '/gps', anchor: 'camera', title: 'Recenter the camera',
    body: "“Me” frames from where you are to the green. “Hole” zooms out to show the whole hole, tee to green." },
  { section: 'gps', route: '/gps', anchor: 'wind', title: 'Wind',
    body: "Wind speed in mph, the direction it's blowing FROM, and how it hits this shot — ▲ into you / ▼ helping, plus the crosswind component." },
  { section: 'gps', route: '/gps', anchor: 'club', title: 'Recommended club & tracking',
    body: "The club from YOUR bag that matches the plays-like distance. ◉ TRACK lets you log the shot — that's optional and just for your own stats, not required for the tournament." },
  { section: 'gps', route: '/gps', anchor: 'btn-scope', title: 'Scope the green', interactive: true,
    body: "Zooms tight into the green with carry-distance arcs across the fairway. Tap it to try." },
  { section: 'gps', route: '/gps', anchor: 'btn-blindshot', title: 'Blind shot compass', interactive: true,
    body: "Aim at a target you can't see — lay the phone flat and line up the arrow. Tap it to try." },
  { section: 'gps', route: '/gps', anchor: 'btn-pin', title: 'Set the pin', interactive: true,
    body: "Drop the day's real pin position on the green — everyone in the tournament sees it live. Tap it to try." },
  { section: 'gps', route: '/gps', anchor: 'btn-caddie', title: 'Caddie Chubbs', interactive: true,
    body: "Snap a photo of your lie and I'll call the club, stance and swing (after I razz you about your last shot). Tap it to try." },
  { section: 'gps', route: '/gps', anchor: 'yardage', title: 'Yardages to the green',
    body: "Distance to the back, centre and front of the green. When someone sets a pin, the centre number becomes the PIN distance." },
  { section: 'gps', route: '/gps', anchor: 'reticle', title: 'The white sniper',
    body: "Your aim point. Tap anywhere on the map to move it — the pills show the exact yardage to it, adjusted for wind and elevation." },
  { section: 'gps', route: '/gps', anchor: 'chull-drives', title: 'Chulligans & drives',
    body: "Your group's chulligans used and each player's drive count — so you always know where the scramble stands." },
  { section: 'gps', route: '/gps', anchor: 'enter-score', title: 'Enter your score', interactive: true,
    body: "This is where you post the hole — tap it to log your team's score, putts, drives and chulligans. Important: every category has to be completed before the app will let you enter a score on later holes, so finish each hole before moving on." },
  // ── Leaderboard ──
  { section: 'leaderboard', route: '/leaderboard', anchor: 'nav-board', title: 'The Board',
    body: "This tab is the live leaderboard — every team's standing in the tournament, updated the instant scores come in. Let's take a look." },
  { section: 'leaderboard', route: '/leaderboard', anchor: 'lb-position', title: 'Position & strokes back',
    body: "Each team's place in the field. On any team that isn't leading, a red “back” badge shows how many strokes behind the lead they are — so you can read the gap at a glance." },
  { section: 'leaderboard', route: '/leaderboard', anchor: 'lb-stats', title: 'The four numbers',
    body: "For each team: To Par (score against par), Gross (total strokes taken), Thru (holes completed — “F” means finished), and Putts (the first tiebreaker if teams are level)." },
  { section: 'leaderboard', route: '/leaderboard', anchor: 'lb-scorecard', title: 'Hole-by-hole scorecard',
    body: "Below each team is their scorecard — the score on every hole in its own bubble, colour-coded for birdie, par, bogey and worse. Swipe it sideways to see all 18." },
  // ── Rules ──
  { section: 'rules', route: '/rules', anchor: 'nav-rules', title: 'Ask me the rules',
    body: "Stuck on a rule? This tab opens my rules desk — ask me anything about the scramble format, chulligans, contests or penalties and I'll set you straight on the spot." },
  { section: 'rules', route: '/rules', anchor: 'rules-demo', title: 'Watch how it works',
    body: "Say you're not sure what a chulligan is. I'll ask for you and pull up the answer — no typing needed. Give it a read, then hit Next." },
  // ── Contests ──
  { section: 'contests', route: '/contests', anchor: 'contests-tabs', title: 'Side action & contests',
    body: "Closest to Pin, Longest Drive and the Jackass-of-the-Day (Lahey) vote all live here. Flip between them with these tabs. Let me show you a couple." },
  { section: 'contests', route: '/contests', anchor: 'ld-player', title: 'Longest Drive — pick the player',
    body: "Here's Longest Drive. This is where you log the entry — pick the teammate who bombed it, or yourself if you're the one flexing. Whoever you choose gets the entry." },
  { section: 'contests', route: '/contests', anchor: 'ld-photo', title: 'Prove it with a photo',
    body: "Back it up with a picture. “Take Photo” opens your camera for a fresh shot at the ball; “Upload Photo” grabs one from your library instead. The photo rides along with the entry so nobody can argue who's really longest." },
  { section: 'contests', route: '/contests', anchor: 'lahey-title', title: 'Jackass of the Day',
    body: "Now the fun one — the Jackass of the Day, our Lahey Award. It's a running vote for whoever best channels their inner Shooter McGavin out there. One glorious idiot gets crowned each day." },
  { section: 'contests', route: '/contests', anchor: 'lahey-vote', pokeable: true, title: 'Vote for the drunkest',
    body: "Tap whoever earned it — the drunkest, sloppiest, most Happy-Gilmore performance of the day. Go ahead and pick someone now; it's just for show during the tour, so no real vote gets cast. One vote each, and it stays private." },
  // ── Tourney ──
  { section: 'tourney', route: '/tourney', anchor: 'tourney-tabs', title: 'The Tourney tab',
    body: "Everything about the event itself: your tee times, the teams and pairings, and the Hall of Fame of past champions — all tucked behind these three tabs." },
  // ── Photos ──
  { section: 'photos', route: '/happys-place', anchor: 'photos', title: "Happy's Place",
    body: "The photo wall — your best shots and your worst disasters, all in one gallery. Add your own with the button up top." },
]

interface TourCtx { startTour: () => void; active: boolean; gpsDemo: boolean; rulesDemo: boolean; stepAnchor: string | null; stepIndex: number }
const Ctx = createContext<TourCtx>({ startTour: () => {}, active: false, gpsDemo: false, rulesDemo: false, stepAnchor: null, stepIndex: 0 })
export const useTour = () => useContext(Ctx)

export function TourProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false)
  const [index, setIndex] = useState(0)
  // '' before a pick, 'intro' for the welcome step, 'full' for the whole app,
  // or a SectionKey to walk just that topic.
  const [selection, setSelection] = useState<string>('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [rect, setRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [minimized, setMinimized] = useState(false)
  const [promptOpen, setPromptOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { profile } = useAuth()

  // The ordered steps for the current selection.
  const sequence: TourStep[] =
    selection === 'intro' ? [INTRO]
    : selection === 'full' ? STEPS
    : selection ? STEPS.filter(s => s.section === selection)
    : []

  const startTour = useCallback(() => {
    try { localStorage.setItem(SEEN_KEY, '1') } catch { /* ignore */ }
    setPromptOpen(false); setSelection('intro'); setMenuOpen(false); setIndex(0); setRect(null); setMinimized(false); setActive(true)
  }, [])
  const openMenu = useCallback(() => { setMenuOpen(true); setRect(null); setMinimized(false) }, [])
  const pick = useCallback((sel: string) => { setSelection(sel); setIndex(0); setRect(null); setMinimized(false); setMenuOpen(false) }, [])
  const close = useCallback(() => { setActive(false); setMenuOpen(false); setRect(null); setMinimized(false) }, [])

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
    if (!active || menuOpen) return
    const step = sequence[index]
    if (!step) return
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
      // Dashboard sections are tall — pin them to the top so the bottom card never
      // covers them. GPS elements are fixed, so centering is a no-op there.
      node?.scrollIntoView({ block: step.route === '/' ? 'start' : 'center', behavior: 'smooth' })
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
  }, [active, menuOpen, selection, index])

  const step = sequence[index]
  const last = index === sequence.length - 1
  const gpsDemo = active && !menuOpen && step?.route === '/gps'
  // The rules page runs a scripted, hands-off Q&A demo on this one step.
  const rulesDemo = active && !minimized && !menuOpen && step?.anchor === 'rules-demo'
  // Current step's anchor — lets a page react (e.g. switch its own tab) as the tour advances.
  const stepAnchor = active && !menuOpen ? (step?.anchor ?? null) : null
  // Card goes opposite the highlighted element: element in the bottom half → card
  // at top (e.g. a nav-bar tab); element up top → card at the bottom.
  const cardAtTop = rect ? rect.y > window.innerHeight * 0.48 : false
  const pad = 8

  // Lock page scrolling while the tour card is showing (programmatic
  // scrollIntoView still works; opened panels while minimized are unaffected).
  useEffect(() => {
    if (!active || minimized) return
    const onTouchMove = (e: TouchEvent) => {
      const t = e.target as HTMLElement | null
      if (t && t.closest('[data-tour-card]')) return
      e.preventDefault()
    }
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => document.removeEventListener('touchmove', onTouchMove)
  }, [active, minimized])

  // End of a slice: intro & single sections drop back to the menu; the full
  // tour is done, so it closes.
  const advance = () => {
    if (!last) { setIndex(i => i + 1); return }
    if (selection === 'full') close()
    else openMenu()
  }
  const advanceLabel = last
    ? (selection === 'intro' ? 'Show me the menu'
      : selection === 'full' ? "Let's play"
      : 'Back to menu')
    : 'Next'

  return (
    <Ctx.Provider value={{ startTour, active, gpsDemo, rulesDemo, stepAnchor, stepIndex: index }}>
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
      {active && !minimized && !menuOpen && step && (
        <>
          {rect ? (
            <svg width="100%" height="100%" style={{ position: 'fixed', inset: 0, zIndex: 6000, pointerEvents: step.interactive || step.pokeable ? 'none' : 'auto' }}>
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
          <div data-tour-card style={{
            position: 'fixed', left: 16, right: 16, zIndex: 6001, maxWidth: 460, margin: '0 auto',
            ...(rect ? (cardAtTop ? { top: 'calc(env(safe-area-inset-top, 0px) + 16px)' } : { bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }) : { top: '50%', transform: 'translateY(-50%)' }),
            background: 'var(--panel)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 20,
            boxShadow: '0 16px 48px rgba(0,0,0,0.6)', padding: 18,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 11 }}>
              {/* Chubbs, your narrating caddie */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <img src={CHUBBS_IMG} alt="Chubbs" style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover', border: '2px solid #D4A53A', boxShadow: '0 0 0 3px rgba(212,165,58,0.16)' }} />
                {/* speech-bubble tail so it reads like he's talking */}
                <div style={{ position: 'absolute', right: -5, top: '50%', marginTop: -6, width: 0, height: 0, borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderLeft: '7px solid #D4A53A' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1, color: '#D4A53A' }}>{sequence.length > 1 ? `CHUBBS · STEP ${index + 1} / ${sequence.length}` : 'CHUBBS'}</div>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: 24, letterSpacing: 0.5, color: 'var(--tx1)', lineHeight: 1.05 }}>{step.title}</div>
              </div>
              <button onClick={close} aria-label="Close tour" style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.06)', color: 'var(--tx1)', cursor: 'pointer', fontSize: 15, flexShrink: 0 }}>✕</button>
            </div>

            <div style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--tx2)' }}>{step.body}</div>
            {step.interactive && (
              <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: '#e8c766' }}>👆 Tap the highlighted control to try it — then hit “Resume tour”.</div>
            )}

            {sequence.length > 1 && (
              <div style={{ display: 'flex', gap: 4, justifyContent: 'center', margin: '14px 0', flexWrap: 'wrap' }}>
                {sequence.map((_, i) => (
                  <span key={i} style={{ width: i === index ? 16 : 5, height: 5, borderRadius: 3, background: i === index ? '#D4A53A' : 'rgba(255,255,255,0.2)', transition: 'width 0.2s' }} />
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: sequence.length > 1 ? 0 : 14 }}>
              {index > 0 && (
                <button onClick={() => setIndex(i => i - 1)} style={{ padding: '12px 18px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: 'var(--tx1)', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Back</button>
              )}
              <button onClick={advance} className="pressable" style={{ flex: 1, padding: '12px 18px', borderRadius: 12, border: 'none', background: '#D4A53A', color: '#1a1206', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
                {advanceLabel}
              </button>
            </div>
            {selection !== 'intro' && (
              <button onClick={() => openMenu()} style={{ width: '100%', marginTop: 8, background: 'none', border: 'none', color: 'var(--tx4)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>← Pick a different topic</button>
            )}
          </div>
        </>
      )}

      {/* Topic menu — Chubbs asks what you want to learn about */}
      {active && !minimized && menuOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 6000, background: 'rgba(6,8,7,0.86)' }} />
          <div data-tour-card style={{
            position: 'fixed', left: 16, right: 16, top: '50%', transform: 'translateY(-50%)', zIndex: 6001,
            maxWidth: 460, margin: '0 auto', maxHeight: 'calc(100dvh - 48px)', overflowY: 'auto',
            background: 'var(--panel)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 20,
            boxShadow: '0 16px 48px rgba(0,0,0,0.6)', padding: 18,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 12 }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <img src={CHUBBS_IMG} alt="Chubbs" style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover', border: '2px solid #D4A53A', boxShadow: '0 0 0 3px rgba(212,165,58,0.16)' }} />
                <div style={{ position: 'absolute', right: -5, top: '50%', marginTop: -6, width: 0, height: 0, borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderLeft: '7px solid #D4A53A' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1, color: '#D4A53A' }}>CHUBBS</div>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: 24, letterSpacing: 0.5, color: 'var(--tx1)', lineHeight: 1.05 }}>What do you want to learn?</div>
              </div>
              <button onClick={close} aria-label="Close tour" style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.06)', color: 'var(--tx1)', cursor: 'pointer', fontSize: 15, flexShrink: 0 }}>✕</button>
            </div>

            <div style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--tx2)', marginBottom: 14 }}>
              Pick a spot and I'll show you the ropes — or take the whole lap with me.
            </div>

            {/* Full tour */}
            <button onClick={() => pick('full')} className="pressable" style={{
              width: '100%', textAlign: 'left', padding: '13px 15px', borderRadius: 13, marginBottom: 10, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 12,
              background: 'linear-gradient(180deg, rgba(212,165,58,0.22), rgba(212,165,58,0.1))', border: '1px solid rgba(212,165,58,0.5)',
            }}>
              <span style={{ fontSize: 22, flexShrink: 0 }}>✨</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 800, fontSize: 15, color: '#D4A53A' }}>Tour the whole app</span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--tx3)' }}>The full walkthrough, start to finish</span>
              </span>
              <span style={{ color: '#D4A53A', fontSize: 18, flexShrink: 0 }}>›</span>
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 10px' }}>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: 'var(--tx4)' }}>OR PICK A TOPIC</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
            </div>

            {/* Per-section options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {SECTIONS.map(s => (
                <button key={s.key} onClick={() => pick(s.key)} className="pressable" style={{
                  width: '100%', textAlign: 'left', padding: '11px 14px', borderRadius: 12, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{s.emoji}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 800, fontSize: 14, color: 'var(--tx1)' }}>{s.label}</span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--tx3)' }}>{s.desc}</span>
                  </span>
                  <span style={{ color: 'var(--tx4)', fontSize: 18, flexShrink: 0 }}>›</span>
                </button>
              ))}
            </div>

            <button onClick={close} style={{ width: '100%', marginTop: 14, background: 'none', border: 'none', color: 'var(--tx4)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>I'm good, close the tour</button>
          </div>
        </>
      )}
    </Ctx.Provider>
  )
}
