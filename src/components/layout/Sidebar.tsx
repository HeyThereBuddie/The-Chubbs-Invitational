import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { CHUBBS_QUOTES } from '../../lib/types'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, ClipboardList, Trophy, Clock, Users,
  Mail, Target, Megaphone, Beer, Shield, LogOut
} from 'lucide-react'

const CHUBBS_IMG = 'https://static.wikia.nocookie.net/sandlerverse/images/8/81/Chubbs_Peterson_in_Happy_Gilmore.webp'

const playerNav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/scores', icon: ClipboardList, label: 'Scores' },
  { to: '/leaderboard', icon: Trophy, label: 'Leaderboard' },
  { to: '/tee-times', icon: Clock, label: 'Tee Times' },
  { to: '/groups', icon: Users, label: 'Groups' },
  { to: '/contests', icon: Target, label: 'Contests' },
  { to: '/updates', icon: Megaphone, label: 'Updates' },
  { to: '/leahey', icon: Beer, label: 'Mr. Leahey' },
]

const adminExtra = [
  { to: '/rsvp', icon: Mail, label: 'RSVP' },
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

  const navItems = isAdmin ? [...playerNav, ...adminExtra] : playerNav

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
      <div style={{ padding: '24px 20px 16px', borderBottom: '1px solid rgba(252,181,20,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            border: '2px solid #FCB514',
            boxShadow: '0 0 12px rgba(252,181,20,0.5)',
            overflow: 'hidden', flexShrink: 0,
          }}>
            <img src={CHUBBS_IMG} alt="Chubbs" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div>
            <div style={{ fontFamily: 'Bebas Neue', fontSize: 18, color: '#FCB514', letterSpacing: 2, lineHeight: 1 }}>
              The Chubbs
            </div>
            <div style={{ fontFamily: 'Bebas Neue', fontSize: 14, color: 'rgba(252,181,20,0.6)', letterSpacing: 2 }}>
              Invitational
            </div>
          </div>
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
        background: 'rgba(252,181,20,0.04)',
        borderRadius: 10,
        borderLeft: '2px solid rgba(252,181,20,0.3)',
      }}>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontStyle: 'italic', lineHeight: 1.4 }}>
          "{quote}"
        </p>
        <p style={{ fontSize: 10, color: 'rgba(252,181,20,0.5)', marginTop: 4 }}>— Chubbs Peterson</p>
      </div>

      {/* User + Sign out */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid rgba(252,181,20,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{profile?.name ?? 'Player'}</div>
          <div style={{ fontSize: 11, color: 'rgba(252,181,20,0.6)', textTransform: 'uppercase', letterSpacing: 1 }}>
            {profile?.role ?? 'player'}
          </div>
        </div>
        <button onClick={signOut} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: 4 }} title="Sign out">
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  )
}
