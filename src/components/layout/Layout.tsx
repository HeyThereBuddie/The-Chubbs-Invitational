import type { ReactNode } from 'react'
import { useCallback, useRef, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useTheme } from '../../context/ThemeContext'
import { usePullToRefresh } from '../../hooks/usePullToRefresh'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import OfflineBanner from '../OfflineBanner'
import { Sun, Moon, X } from 'lucide-react'
import { useYear } from '../../context/YearContext'
import { useAuth } from '../../context/AuthContext'

export default function Layout({ children }: { children: ReactNode }) {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const isNarrow  = useMediaQuery('(max-width: 430px)')
  const { isDark, toggleTheme } = useTheme()
  const { isCurrentYear, tournaments, viewingTournamentId, setViewingTournamentId } = useYear()
  const viewingTournament = viewingTournamentId ? tournaments.find(t => t.id === viewingTournamentId) : null
  const viewingYear = viewingTournament?.year ?? null

  const { profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Leave a past-tournament snapshot: back to the current tournament + Hall of Fame.
  const exitSnapshot = () => {
    setViewingTournamentId(null)
    navigate('/hall-of-fame')
  }
  const handleRefresh = useCallback(() => { window.location.reload() }, [])
  const scrollRef = useRef<HTMLElement>(null)
  const { pullDistance, isRefreshing } = usePullToRefresh(handleRefresh, location.pathname !== '/gps', scrollRef)
  // The document no longer scrolls (only <main> does), so reset it to the top on
  // each route change — otherwise a new page inherits the previous page's scroll.
  useEffect(() => { scrollRef.current?.scrollTo(0, 0) }, [location.pathname])

  const avatarInitial = (profile?.nickname || profile?.name || '?')[0].toUpperCase()

  const snapshotBanner = !isCurrentYear ? (
    <div style={{
      zIndex: 200, flexShrink: 0,
      background: 'rgba(212,165,58,0.12)',
      borderBottom: '1px solid rgba(212,165,58,0.35)',
      backdropFilter: 'blur(12px)',
      padding: '8px 12px 8px 20px',
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <span style={{ fontSize: 14 }}>🔒</span>
      <span style={{ fontFamily: 'Bebas Neue', fontSize: 16, color: '#D4A53A', letterSpacing: 2, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {viewingTournament?.name ?? viewingYear} — Snapshot
      </span>
      <button
        onClick={exitSnapshot}
        aria-label="Exit snapshot"
        className="pressable"
        style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
          padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
          background: '#D4A53A', color: '#1a1206', border: 'none', fontWeight: 800, fontSize: 12,
        }}
      >
        <X size={14} strokeWidth={2.6} /> Exit
      </button>
    </div>
  ) : null

  return (
    <div className="bg-mesh" style={{ minHeight: '100dvh' }}>
      {isDesktop ? (
        <>
          {snapshotBanner}
          <div style={{ display: 'flex' }}>
            <Sidebar />
            <main style={{ marginLeft: 240, flex: 1, padding: '32px 40px', minHeight: '100dvh' }}>
              {children}
            </main>
          </div>
        </>
      ) : (
        // Fixed-height shell: the document itself never scrolls, so the browser's
        // collapsing toolbar can't drag the fixed nav up and down — only <main> scrolls.
        <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden' }}>
          {snapshotBanner}
          {/* Mobile header — hidden on the full-screen GPS page */}
          {location.pathname !== '/gps' && (
          <header style={{
            flexShrink: 0, zIndex: 50,
            background: 'var(--panel)',
            backdropFilter: 'blur(20px)',
            borderBottom: '1px solid rgba(212,165,58,0.14)',
            padding: isNarrow ? '8px 14px' : '10px 18px',
            display: 'flex', alignItems: 'center', gap: isNarrow ? 8 : 12,
          }}>
            <div style={{
              width: isNarrow ? 28 : 34, height: isNarrow ? 28 : 34, borderRadius: '50%',
              border: '2px solid #D4A53A',
              boxShadow: '0 0 10px rgba(212,165,58,0.45)',
              overflow: 'hidden', flexShrink: 0,
            }}>
              <img
                src="https://static.wikia.nocookie.net/sandlerverse/images/8/81/Chubbs_Peterson_in_Happy_Gilmore.webp"
                alt="Chubbs"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: isNarrow ? 17 : 20, color: '#D4A53A', letterSpacing: 3, lineHeight: 1 }}>
                The Chubbs Memorial
              </div>
              <div style={{ fontSize: 9, color: 'var(--tx5)', letterSpacing: 2, textTransform: 'uppercase', marginTop: 1 }}>
                Annual Golf Tournament
              </div>
            </div>
            <button
              onClick={toggleTheme}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx3)', padding: 4, display: 'flex', alignItems: 'center' }}
            >
              {isDark ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <Link to="/account" style={{ display: 'flex', alignItems: 'center' }}>
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt="account"
                  style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', border: '1.5px solid rgba(212,165,58,0.4)' }}
                />
              ) : (
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'rgba(212,165,58,0.15)',
                  border: '1.5px solid rgba(212,165,58,0.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, color: '#D4A53A',
                }}>
                  {avatarInitial}
                </div>
              )}
            </Link>
          </header>
          )}
          <main ref={scrollRef} style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '20px 16px', paddingBottom: 80 }}>
            {/* Pull-to-refresh indicator */}
            <div style={{
              display: 'flex', justifyContent: 'center', alignItems: 'center',
              overflow: 'hidden',
              height: isRefreshing ? 40 : Math.min(pullDistance * 0.5, 40),
              transition: isRefreshing ? 'none' : 'height 0.15s ease',
              marginTop: -8, marginBottom: 4,
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                border: '2.5px solid rgba(212,165,58,0.25)',
                borderTopColor: '#D4A53A',
                opacity: isRefreshing ? 1 : Math.min(pullDistance / 72, 1),
                animation: isRefreshing ? 'spinAnim 0.7s linear infinite' : 'none',
                transform: isRefreshing ? 'none' : `rotate(${(pullDistance / 72) * 240}deg)`,
                transition: isRefreshing ? 'none' : 'opacity 0.1s',
              }} />
            </div>
            {children}
          </main>
          <BottomNav />
        </div>
      )}
      <OfflineBanner />
    </div>
  )
}
