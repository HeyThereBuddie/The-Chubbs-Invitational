import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  LayoutDashboard, ClipboardList, Trophy, Clock, Users, Users2,
  Target, Shield, UserCircle, Star, Images
} from 'lucide-react'

const playerNav = [
  { to: '/', icon: LayoutDashboard, label: 'Home' },
  { to: '/scores', icon: ClipboardList, label: 'Scores' },
  { to: '/leaderboard', icon: Trophy, label: 'Board' },
  { to: '/contests', icon: Target, label: 'Contests' },
  { to: '/my-team', icon: Users2, label: 'Team' },
  { to: '/tee-times', icon: Clock, label: 'Tees' },
  { to: '/groups', icon: Users, label: 'Groups' },
  { to: '/hall-of-fame', icon: Star, label: 'HOF' },
  { to: '/happys-place', icon: Images, label: 'Photos' },
  { to: '/account', icon: UserCircle, label: 'Account' },
]

const adminNav = [
  { to: '/', icon: LayoutDashboard, label: 'Home' },
  { to: '/scores', icon: ClipboardList, label: 'Scores' },
  { to: '/leaderboard', icon: Trophy, label: 'Board' },
  { to: '/contests', icon: Target, label: 'Contests' },
  { to: '/my-team', icon: Users2, label: 'Team' },
  { to: '/tee-times', icon: Clock, label: 'Tees' },
  { to: '/groups', icon: Users, label: 'Groups' },
  { to: '/hall-of-fame', icon: Star, label: 'HOF' },
  { to: '/happys-place', icon: Images, label: 'Photos' },
  { to: '/account', icon: UserCircle, label: 'Account' },
  { to: '/admin', icon: Shield, label: 'Admin' },
]

export default function BottomNav() {
  const { isAdmin } = useAuth()
  const location = useLocation()
  const navItems = isAdmin ? adminNav : playerNav

  return (
    <nav style={{
      position: 'fixed',
      bottom: 0, left: 0, right: 0,
      background: 'var(--panel)',
      backdropFilter: 'blur(16px)',
      borderTop: '1px solid rgba(212,165,58,0.12)',
      display: 'flex',
      zIndex: 100,
      paddingBottom: 'env(safe-area-inset-bottom, 8px)',
    }}>
      {navItems.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          viewTransition
          onClick={() => navigator.vibrate?.(8)}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '6px 2px 6px',
            textDecoration: 'none',
            minWidth: 0,
          }}
        >
          {({ isActive }) => (
            <>
              <div
                key={isActive ? location.key : to}
                className={isActive ? 'nav-icon-pop' : ''}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 40,
                  height: 26,
                  borderRadius: 999,
                  background: isActive ? 'rgba(212,165,58,0.18)' : 'transparent',
                  transition: 'background 0.2s',
                  marginBottom: 2,
                }}>
                <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} color={isActive ? '#D4A53A' : 'var(--tx3)'} />
              </div>
              <span style={{
                fontSize: 10,
                fontWeight: isActive ? 700 : 500,
                letterSpacing: 0.3,
                color: isActive ? '#D4A53A' : 'var(--tx3)',
                transition: 'color 0.2s',
              }}>
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
