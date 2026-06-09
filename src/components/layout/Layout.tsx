import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import RulesChat from '../RulesChat'
import { UserCircle } from 'lucide-react'
import { useYear } from '../../context/YearContext'

export default function Layout({ children }: { children: ReactNode }) {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const { isCurrentYear, tournaments, viewingTournamentId } = useYear()
  const viewingYear = viewingTournamentId ? tournaments.find(t => t.id === viewingTournamentId)?.year : null

  return (
    <div className="bg-mesh" style={{ minHeight: '100dvh' }}>
      <RulesChat />
      {!isCurrentYear && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 200,
          background: 'rgba(252,181,20,0.12)',
          borderBottom: '1px solid rgba(252,181,20,0.35)',
          backdropFilter: 'blur(12px)',
          padding: '8px 20px',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 14 }}>🔒</span>
          <span style={{ fontFamily: 'Bebas Neue', fontSize: 16, color: '#FCB514', letterSpacing: 2 }}>
            {viewingYear} — Read Only
          </span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', flex: 1 }}>
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
            background: 'rgba(10,7,2,0.97)',
            backdropFilter: 'blur(20px)',
            borderBottom: '1px solid rgba(252,181,20,0.14)',
            padding: '10px 18px',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%',
              border: '2px solid #FCB514',
              boxShadow: '0 0 10px rgba(252,181,20,0.45)',
              overflow: 'hidden', flexShrink: 0,
            }}>
              <img
                src="https://static.wikia.nocookie.net/sandlerverse/images/8/81/Chubbs_Peterson_in_Happy_Gilmore.webp"
                alt="Chubbs"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: 20, color: '#FCB514', letterSpacing: 3, lineHeight: 1 }}>
                The Chubbs Memorial
              </div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', letterSpacing: 2, textTransform: 'uppercase', marginTop: 1 }}>
                Annual Golf Tournament
              </div>
            </div>
            <Link to="/account" style={{ color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center' }}>
              <UserCircle size={22} />
            </Link>
          </header>
          <main style={{ flex: 1, padding: '20px 16px', paddingBottom: 80 }}>
            {children}
          </main>
          <BottomNav />
        </div>
      )}
    </div>
  )
}
