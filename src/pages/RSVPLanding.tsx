import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Player } from '../lib/types'
import { COURSE_NAME, TOURNAMENT_DATE } from '../lib/types'

const CHUBBS_IMG = 'https://static.wikia.nocookie.net/sandlerverse/images/8/81/Chubbs_Peterson_in_Happy_Gilmore.webp'

export default function RSVPLanding() {
  const [params] = useSearchParams()
  const playerId = params.get('player')
  const [player, setPlayer] = useState<Player | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [handicap, setHandicap] = useState('')
  const [note, setNote] = useState('')
  const [likeMen, setLikeMen] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [choice, setChoice] = useState<'in' | 'out' | null>(null)

  useEffect(() => {
    if (!playerId) { setNotFound(true); setLoading(false); return }
    supabase.from('players').select('*').eq('id', playerId).single()
      .then(({ data }) => {
        if (!data) setNotFound(true)
        else { setPlayer(data); setHandicap(String(data.handicap ?? '')) }
        setLoading(false)
      })
  }, [playerId])

  const handleLikeMen = (val: string) => {
    if (val === 'No') {
      setTimeout(() => setLikeMen('Yes'), 200)
    } else {
      setLikeMen(val)
    }
  }

  const submit = async (rsvp: 'in' | 'out') => {
    if (!player) return
    setChoice(rsvp)
    await supabase.from('players').update({
      rsvp,
      handicap: handicap ? +handicap : null,
      notes: note || null,
    }).eq('id', player.id)
    setSubmitted(true)
  }

  if (loading) return (
    <div style={{ minHeight: '100dvh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="animate-spin" style={{ width: 32, height: 32, border: '3px solid rgba(252,181,20,0.2)', borderTopColor: '#FCB514', borderRadius: '50%' }} />
    </div>
  )

  if (notFound) return (
    <div style={{ minHeight: '100dvh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="glass" style={{ maxWidth: 400, padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🤷</div>
        <h2 style={{ fontFamily: 'Bebas Neue', fontSize: 24, color: '#FCB514', letterSpacing: 3 }}>Player Not Found</h2>
        <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: 8 }}>Check your invite link and try again.</p>
      </div>
    </div>
  )

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(252,181,20,0.1) 0%, transparent 70%), #080808',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 16px',
    }}>
      <div className="glass animate-fadeUp" style={{ width: '100%', maxWidth: 480, padding: '40px 36px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            border: '3px solid #FCB514',
            boxShadow: '0 0 20px rgba(252,181,20,0.5)',
            overflow: 'hidden', margin: '0 auto 16px',
          }}>
            <img src={CHUBBS_IMG} alt="Chubbs" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 28, color: '#FCB514', letterSpacing: 3, margin: 0 }}>
            The Chubbs Invitational
          </h1>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 4 }}>
            {COURSE_NAME} • {TOURNAMENT_DATE}
          </div>
        </div>

        {submitted ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>{choice === 'in' ? '⛳' : '😔'}</div>
            <h2 style={{ fontFamily: 'Bebas Neue', fontSize: 26, color: '#FCB514', letterSpacing: 3 }}>
              {choice === 'in' ? "You're In!" : "See You Next Time"}
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginTop: 8, fontSize: 14 }}>
              {choice === 'in'
                ? "We've got you on the list. Get those hips warmed up, Shooter! 🏌️"
                : "Sorry to miss you. The alligators will be disappointed."}
            </p>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 6, textAlign: 'center' }}>
              Hey, {player?.name}!
            </div>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, textAlign: 'center', marginBottom: 24 }}>
              Can you make it to this year's tournament?
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }}>Your Handicap</label>
                <input type="number" value={handicap} onChange={e => setHandicap(e.target.value)} placeholder="e.g. 12" />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }}>Note (optional)</label>
                <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Dietary restrictions, cart preference..." />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }}>Do You Like Men?</label>
                <select value={likeMen} onChange={e => handleLikeMen(e.target.value)}
                  style={{ appearance: 'none', WebkitAppearance: 'none' }}>
                  <option value="">Select an answer...</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
                {likeMen === 'Yes' && (
                  <p style={{ fontSize: 12, color: '#FCB514', marginTop: 6 }}>
                    Buddy, we both know the answer is yes. Updated for you. 😂
                  </p>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button className="btn-gold" onClick={() => submit('in')} style={{ flex: 1, justifyContent: 'center' }}>
                ⛳ Count Me In!
              </button>
              <button className="btn-ghost" onClick={() => submit('out')} style={{ flex: 1, justifyContent: 'center' }}>
                😔 Can't Make It
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
