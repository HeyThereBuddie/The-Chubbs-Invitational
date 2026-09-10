import { useTour } from '../context/TourContext'
import { useAuth } from '../context/AuthContext'

const CHUBBS_IMG = 'https://static.wikia.nocookie.net/sandlerverse/images/8/81/Chubbs_Peterson_in_Happy_Gilmore.webp'

// Pre-launch lobby for players. While the tournament is in Preview, non-admins
// can only take the guided tour — the rest of the app unlocks when the admin goes
// live. (The tour itself renders the real pages; this screen shows the rest of the
// time.)
export default function PreviewGate() {
  const { startTour } = useTour()
  const { signOut } = useAuth()

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'radial-gradient(ellipse 85% 55% at 50% -8%, var(--gold-15) 0%, transparent 62%), var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px',
    }}>
      <div className="glass animate-fadeUp" style={{ width: '100%', maxWidth: 440, padding: '36px 26px 30px', textAlign: 'center' }}>
        <div style={{
          width: 92, height: 92, borderRadius: '50%', padding: 3, margin: '0 auto 18px',
          background: 'linear-gradient(160deg, var(--gold-40), var(--gold-08))', boxShadow: 'var(--elev-gold)',
        }}>
          <div className="animate-wiggle" style={{ width: '100%', height: '100%', borderRadius: '50%', border: '2px solid var(--gold)', overflow: 'hidden' }}>
            <img src={CHUBBS_IMG} alt="Chubbs" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        </div>

        <h1 className="gold-text" style={{ fontFamily: 'Bebas Neue', fontSize: 34, letterSpacing: 2.5, lineHeight: 1.05, margin: 0 }}>
          You're all signed up!
        </h1>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--tx2)', margin: '14px 0 6px' }}>
          The tournament hasn't started yet — but you can take the tour and learn the app so you're ready on day one.
        </p>
        <p style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--tx4)', margin: '0 0 24px' }}>
          Everything else unlocks the moment we go live. 🏌️
        </p>

        <button onClick={startTour} className="btn-gold pressable" style={{ width: '100%', justifyContent: 'center', minHeight: 52, fontSize: 16 }}>
          ⛳ Take the tour with Chubbs
        </button>

        <button onClick={signOut} style={{
          marginTop: 16, background: 'none', border: 'none', color: 'var(--tx4)', fontSize: 13, cursor: 'pointer',
        }}>
          Sign out
        </button>
      </div>
    </div>
  )
}
