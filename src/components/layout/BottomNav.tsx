import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTour } from '../../context/TourContext'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import {
  LayoutDashboard, Trophy,
  Target, Shield, UserCircle, Images, MapPin, Info, BookOpen, Sparkles
} from 'lucide-react'

const CHUBBS_IMG = 'https://static.wikia.nocookie.net/sandlerverse/images/8/81/Chubbs_Peterson_in_Happy_Gilmore.webp'

// GPS sits in the middle and is emphasised — the on-course home base.
// '__tour__' is a virtual item that launches the walkthrough instead of routing.
const playerNav = [
  { to: '/account', icon: UserCircle, label: 'Account' },
  { to: '/tourney', icon: Info, label: 'Tourney' },
  { to: '/contests', icon: Target, label: 'Contests' },
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/gps', icon: MapPin, label: 'GPS' },
  { to: '/leaderboard', icon: Trophy, label: 'Board' },
  { to: '/rules', icon: BookOpen, label: 'Rules' },
  { to: '/happys-place', icon: Images, label: 'Photos' },
  { to: '__tour__', icon: Sparkles, label: 'Tour' },
]

const adminNav = [
  { to: '/account', icon: UserCircle, label: 'Account' },
  { to: '/tourney', icon: Info, label: 'Tourney' },
  { to: '/contests', icon: Target, label: 'Contests' },
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/gps', icon: MapPin, label: 'GPS' },
  { to: '/leaderboard', icon: Trophy, label: 'Board' },
  { to: '/rules', icon: BookOpen, label: 'Rules' },
  { to: '/happys-place', icon: Images, label: 'Photos' },
  { to: '__tour__', icon: Sparkles, label: 'Tour' },
  { to: '/admin', icon: Shield, label: 'Admin' },
]

export default function BottomNav() {
  const { isAdmin } = useAuth()
  const { startTour } = useTour()
  const location = useLocation()
  const navItems = isAdmin ? adminNav : playerNav
  const isNarrow = useMediaQuery('(max-width: 430px)')

  return (
    <nav data-tour="nav" style={{
      position: 'fixed',
      bottom: 0, left: 0, right: 0,
      background: 'var(--panel)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderTop: '1px solid rgba(212,165,58,0.14)',
      boxShadow: '0 -8px 32px -8px rgba(0,0,0,0.5)',
      display: 'flex',
      zIndex: 100,
      paddingTop: 4,
      paddingBottom: 'env(safe-area-inset-bottom, 8px)',
    }}>
      {navItems.map(({ to, icon: Icon, label }) => {
        const isGps = to === '/gps'
        const isTour = to === '__tour__'
        if (isTour) {
          return (
            <button
              key="__tour__"
              data-tour="nav-tour"
              onClick={() => { navigator.vibrate?.(8); startTour() }}
              className="pressable"
              style={{
                flex: 1,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
                padding: '6px 2px 6px', minWidth: 0,
                background: 'none', border: 'none', cursor: 'pointer',
              }}
            >
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: isNarrow ? 36 : 42, height: isNarrow ? 24 : 28, borderRadius: 999,
                marginBottom: 2,
              }}>
                <Icon size={isNarrow ? 17 : 20} strokeWidth={1.8} color="var(--tx3)" />
              </div>
              <span style={{ fontSize: isNarrow ? 9 : 10, fontWeight: 500, letterSpacing: 0.3, color: 'var(--tx3)' }}>{label}</span>
            </button>
          )
        }
        return (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          data-tour={to === '/' ? 'nav-home' : to === '/gps' ? 'nav-gps' : to === '/leaderboard' ? 'nav-board' : to === '/rules' ? 'nav-rules' : undefined}
          onClick={() => navigator.vibrate?.(8)}
          className="pressable"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-end',
            padding: '6px 2px 6px',
            textDecoration: 'none',
            minWidth: 0,
          }}
        >
          {({ isActive }) => (
            <>
              {isGps ? (
                <div
                  key={isActive ? location.key : to}
                  className={isActive ? 'nav-icon-pop' : ''}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: isNarrow ? 46 : 54, height: isNarrow ? 46 : 54, borderRadius: '50%',
                    marginTop: isNarrow ? -18 : -22, marginBottom: 3, overflow: 'hidden',
                    background: 'linear-gradient(160deg, #e8bc55 0%, #c4941f 100%)',
                    border: '3px solid var(--panel)',
                    boxShadow: '0 4px 18px rgba(212,165,58,0.55), 0 2px 8px rgba(0,0,0,0.45)',
                  }}>
                  {/* Chubbs — your caddie — is the on-course GPS button */}
                  <img src={CHUBBS_IMG} alt="GPS" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 30%' }} />
                </div>
              ) : (
                <div
                  key={isActive ? location.key : to}
                  className={isActive ? 'nav-icon-pop' : ''}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: isNarrow ? 36 : 42, height: isNarrow ? 24 : 28, borderRadius: 999,
                    background: isActive ? 'rgba(212,165,58,0.18)' : 'transparent',
                    boxShadow: isActive ? '0 0 12px rgba(212,165,58,0.25)' : 'none',
                    transition: 'background 0.25s, box-shadow 0.25s',
                    marginBottom: 2,
                  }}>
                  <Icon size={isNarrow ? 17 : 20} strokeWidth={isActive ? 2.5 : 1.8} color={isActive ? '#D4A53A' : 'var(--tx3)'} />
                </div>
              )}
              <span style={{
                fontSize: isNarrow ? 9 : 10,
                fontWeight: isGps || isActive ? 800 : 500,
                letterSpacing: 0.3,
                color: isGps || isActive ? '#D4A53A' : 'var(--tx3)',
                transition: 'color 0.2s',
              }}>
                {label}
              </span>
            </>
          )}
        </NavLink>
        )
      })}
    </nav>
  )
}
