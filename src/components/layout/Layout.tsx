import type { ReactNode } from 'react'
import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useTheme } from '../../context/ThemeContext'
import { usePullToRefresh } from '../../hooks/usePullToRefresh'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import RulesChat from '../RulesChat'
import OfflineBanner from '../OfflineBanner'
import { Sun, Moon } from 'lucide-react'
import { useYear } from '../../context/YearContext'
import { useAuth } from '../../context/AuthContext'

export default function Layout({ children }: { children: ReactNode }) {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const isNarrow  = useMediaQuery('(max-width: 430px)')
  const { isDark, toggleTheme } = useTheme()
  const { isCurrentYear, tournaments, viewingTournamentId } = useYear()
  const viewingTournament = viewingTournamentId ? tournaments.find(t => t.id === viewingTournamentId) : null
  const viewingYear = viewingTournament?.year ?? null

  const { profile } = useAuth()
  const handleRefresh = useCallback(() => { window.location.reload() }, [])
  const { pullDistance, isRefreshing } = usePullToRefresh(handleRefresh)

  const avatarInitial = (profile?.nickname || profile?.name || '?')[0].toUpperCase()

  return (
    <div className="bg-mesh" style={{ minHeight: '100dvh' }}>
      <RulesChat />
      {!isCurrentYear && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 200,
          background: 'rgba(212,165,58,0.12)',
          borderBottom: '1px solid rgba(212,165,58,0.35)',
          backdropFilter: 'blur(12px)',
          padding: '8px 20px',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 14 }}>🔒</span>
          <span style={{ fontFamily: 'Bebas Neue', fontSize: 16, color: '#D4A53A', letterSpacing: 2 }}>
            {viewingTournament?.name ?? viewingYear} — Read Only
          </span>
          <span style={{ fontSize: 12, color: 'var(--tx3)', flex: 1 }}>
            You're viewing a past tournament. No changes can be made.
          </span>
        </div>
      )}

      {isDesktop ? (
        <div style={{ display: 'flex' }}>
          <Sidebar />
          <main style={{ marginLeft: 240, flex: 1, padding: '32px 40px', minHeight: '100dvh' }}>
            {children}
          </main>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
          {/* Mobile header */}
          <header style={{
            position: 'sticky', top: 0, zIndex: 50,
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
          <main style={{ flex: 1, padding: '20px 16px', paddingBottom: 80 }}>
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
