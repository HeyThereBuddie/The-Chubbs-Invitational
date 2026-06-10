import { NavLink, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { CHUBBS_QUOTES, displayName } from '../../lib/types'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, ClipboardList, Trophy, Clock, Users, Users2,
  Target, Shield, LogOut, UserCircle, Star
} from 'lucide-react'

const CHUBBS_IMG = 'https://static.wikia.nocookie.net/sandlerverse/images/8/81/Chubbs_Peterson_in_Happy_Gilmore.webp'

const playerNav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/scores', icon: ClipboardList, label: 'Scores' },
  { to: '/leaderboard', icon: Trophy, label: 'Leaderboard' },
  { to: '/contests', icon: Target, label: 'Contests' },
  { to: '/my-team', icon: Users2, label: 'My Team' },
  { to: '/tee-times', icon: Clock, label: 'Tee Times' },
  { to: '/groups', icon: Users, label: 'Groups' },
  { to: '/hall-of-fame', icon: Star, label: 'Hall of Fame' },
  { to: '/account', icon: UserCircle, label: 'My Account' },
]

const adminNav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/scores', icon: ClipboardList, label: 'Scores' },
  { to: '/leaderboard', icon: Trophy, label: 'Leaderboard' },
  { to: '/contests', icon: Target, label: 'Contests' },
  { to: '/my-team', icon: Users2, label: 'My Team' },
  { to: '/tee-times', icon: Clock, label: 'Tee Times' },
  { to: '/groups', icon: Users, label: 'Groups' },
  { to: '/hall-of-fame', icon: Star, label: 'Hall of Fame' },
  { to: '/account', icon: UserCircle, label: 'My Account' },
  { to: '/admin', icon: Shield, label: 'Admin Panel' },
]

export default function Sidebar() {
  const { isAdmin, profile, signOut } = useAuth()
  const [quote, setQuote] = useState(CHUBBS_QUOTES[0])

  useEffect(() => {
    const i = setInterval(() => {
      setQuote(CHUBBS_QUOTES[Math.floor(Math.random() * CHUBBS_QUOTES.length)])
    }, 8000)
    return () => clearInterval(i)
  }, [])

  const navItems = isAdmin ? adminNav : playerNav

  return (
    <aside style={{
      width: 240,
      minHeight: '100dvh',
      position: 'fixed',
      left: 0, top: 0,
      background: 'rgba(18,14,6,0.95)',
      backdropFilter: 'blur(16px)',
      borderRight: '1px solid rgba(252,181,20,0.12)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 100,
    }}>
      {/* Logo */}
      <div style={{
        padding: '20px',
        borderBottom: '1px solid rgba(252,181,20,0.1)',
        background: 'linear-gradient(180deg, rgba(252,181,20,0.06) 0%, transparent 100%)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="animate-glow-pulse" style={{
            width: 52, height: 52, borderRadius: '50%',
            border: '2px solid #FCB514',
            overflow: 'hidden', flexShrink: 0,
          }}>
            <img src={CHUBBS_IMG} alt="Chubbs" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div>
            <div style={{ fontFamily: 'Bebas Neue', fontSize: 19, color: '#FCB514', letterSpacing: 2, lineHeight: 1 }}>
              The Chubbs
            </div>
            <div style={{ fontFamily: 'Bebas Neue', fontSize: 13, color: 'rgba(252,181,20,0.55)', letterSpacing: 2 }}>
              Memorial
            </div>
          </div>
        </div>
        <div style={{
          marginTop: 12,
          fontSize: 9, color: 'rgba(255,255,255,0.18)', letterSpacing: 3,
          textTransform: 'uppercase', textAlign: 'center',
          paddingTop: 10, borderTop: '1px solid rgba(252,181,20,0.08)',
        }}>
          Annual Golf Tournament
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 12px', overflowY: 'auto' }}>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 12px',
              borderRadius: 10,
              marginBottom: 2,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: 'none',
              transition: 'all 0.2s',
              background: isActive ? 'rgba(252,181,20,0.12)' : 'transparent',
              color: isActive ? '#FCB514' : 'rgba(255,255,255,0.55)',
              borderLeft: isActive ? '2px solid #FCB514' : '2px solid transparent',
            })}
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Quote */}
      <div style={{
        padding: '12px 16px',
        margin: '0 12px 8px',
        background: 'linear-gradient(135deg, rgba(252,181,20,0.05) 0%, rgba(252,181,20,0.02) 100%)',
        borderRadius: 12,
        border: '1px solid rgba(252,181,20,0.12)',
        borderLeft: '3px solid rgba(252,181,20,0.4)',
      }}>
        <div style={{ fontSize: 14, color: 'rgba(252,181,20,0.3)', marginBottom: 4 }}>💬</div>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontStyle: 'italic', lineHeight: 1.5 }}>
          "{quote}"
        </p>
        <p style={{ fontSize: 10, color: 'rgba(252,181,20,0.5)', marginTop: 6, fontWeight: 600 }}>— Chubbs Peterson</p>
      </div>

      {/* User + Sign out */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid rgba(252,181,20,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Link to="/account" style={{ textDecoration: 'none', flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {profile ? displayName(profile) : 'Player'}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(252,181,20,0.6)', textTransform: 'uppercase', letterSpacing: 1 }}>
            {profile?.role ?? 'player'}
          </div>
        </Link>
        <button onClick={signOut} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: 4, flexShrink: 0 }} title="Sign out">
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  )
}
