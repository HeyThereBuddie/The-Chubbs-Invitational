import type { ReactNode } from 'react'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'

export default function Layout({ children }: { children: ReactNode }) {
  const isDesktop = useMediaQuery('(min-width: 768px)')

  return (
    <div className="bg-mesh" style={{ minHeight: '100dvh' }}>
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
            background: 'rgba(12,9,3,0.97)',
            backdropFilter: 'blur(16px)',
            borderBottom: '1px solid rgba(252,181,20,0.12)',
            padding: '10px 20px',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              border: '2px solid #FCB514',
              boxShadow: '0 0 8px rgba(252,181,20,0.4)',
              overflow: 'hidden', flexShrink: 0,
            }}>
              <img
                src="https://static.wikia.nocookie.net/sandlerverse/images/8/81/Chubbs_Peterson_in_Happy_Gilmore.webp"
                alt="Chubbs"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
            <span style={{ fontFamily: 'Bebas Neue', fontSize: 20, color: '#FCB514', letterSpacing: 3 }}>
              The Chubbs Invitational
            </span>
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
