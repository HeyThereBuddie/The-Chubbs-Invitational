import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import {
  LayoutDashboard, Trophy,
  Target, Shield, UserCircle, Images, MapPin, Info, BookOpen
} from 'lucide-react'

// GPS sits in the middle and is emphasised — the on-course home base.
const playerNav = [
  { to: '/', icon: LayoutDashboard, label: 'Home' },
  { to: '/leaderboard', icon: Trophy, label: 'Board' },
  { to: '/contests', icon: Target, label: 'Contests' },
  { to: '/rules', icon: BookOpen, label: 'Rules' },
  { to: '/gps', icon: MapPin, label: 'GPS' },
  { to: '/happys-place', icon: Images, label: 'Photos' },
  { to: '/tourney', icon: Info, label: 'Tourney' },
  { to: '/account', icon: UserCircle, label: 'Account' },
]

const adminNav = [
  { to: '/', icon: LayoutDashboard, label: 'Home' },
  { to: '/leaderboard', icon: Trophy, label: 'Board' },
  { to: '/contests', icon: Target, label: 'Contests' },
  { to: '/rules', icon: BookOpen, label: 'Rules' },
  { to: '/gps', icon: MapPin, label: 'GPS' },
  { to: '/happys-place', icon: Images, label: 'Photos' },
  { to: '/tourney', icon: Info, label: 'Tourney' },
  { to: '/account', icon: UserCircle, label: 'Account' },
  { to: '/admin', icon: Shield, label: 'Admin' },
]

export default function BottomNav() {
  const { isAdmin } = useAuth()
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
        return (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          data-tour={to === '/' ? 'nav-home' : to === '/gps' ? 'nav-gps' : to === '/leaderboard' ? 'nav-board' : undefined}
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
                    marginTop: isNarrow ? -18 : -22, marginBottom: 3,
                    background: 'linear-gradient(160deg, #e8bc55 0%, #c4941f 100%)',
                    border: '3px solid var(--panel)',
                    boxShadow: '0 4px 18px rgba(212,165,58,0.55), 0 2px 8px rgba(0,0,0,0.45)',
                  }}>
                  <Icon size={isNarrow ? 22 : 26} strokeWidth={2.3} color="#1a1206" />
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
