import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  LayoutDashboard, ClipboardList, Trophy, Clock, Users, Users2,
  Mail, Target, Megaphone, Shield, Map
} from 'lucide-react'

const playerNav = [
  { to: '/', icon: LayoutDashboard, label: 'Home' },
  { to: '/my-team', icon: Users2, label: 'My Team' },
  { to: '/course', icon: Map, label: 'Course' },
  { to: '/scores', icon: ClipboardList, label: 'Scores' },
  { to: '/leaderboard', icon: Trophy, label: 'Board' },
  { to: '/tee-times', icon: Clock, label: 'Tees' },
  { to: '/groups', icon: Users, label: 'Groups' },
  { to: '/contests', icon: Target, label: 'Contest' },
  { to: '/updates', icon: Megaphone, label: 'Updates' },
]

const adminExtra = [
  { to: '/rsvp', icon: Mail, label: 'RSVP' },
  { to: '/admin', icon: Shield, label: 'Admin' },
]

export default function BottomNav() {
  const { isAdmin } = useAuth()
  const navItems = isAdmin ? [...playerNav, ...adminExtra] : playerNav

  return (
    <nav style={{
      position: 'fixed',
      bottom: 0, left: 0, right: 0,
      background: 'rgba(12,9,3,0.97)',
      backdropFilter: 'blur(16px)',
      borderTop: '1px solid rgba(252,181,20,0.12)',
      display: 'flex',
      zIndex: 100,
      paddingBottom: 'env(safe-area-inset-bottom, 8px)',
    }}>
      {navItems.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          style={({ isActive }) => ({
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px 2px 6px',
            textDecoration: 'none',
            color: isActive ? '#FCB514' : 'rgba(255,255,255,0.4)',
            transition: 'color 0.2s',
            minWidth: 0,
          })}
        >
          {({ isActive }) => (
            <>
              <Icon size={20} strokeWidth={isActive ? 2.5 : 1.5} />
              <span style={{ fontSize: 10, marginTop: 3, fontWeight: isActive ? 700 : 400, letterSpacing: 0.3 }}>
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
