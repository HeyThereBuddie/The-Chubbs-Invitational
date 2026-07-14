import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'
import { TOURNAMENT_DATE } from '../lib/types'

const CHUBBS_IMG = 'https://static.wikia.nocookie.net/sandlerverse/images/8/81/Chubbs_Peterson_in_Happy_Gilmore.webp'

export default function RSVPLanding() {
  const [params] = useSearchParams()
  const playerId = params.get('player')
  const [player, setPlayer] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [handicap, setHandicap] = useState('')
  const [note, setNote] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [courseName, setCourseName] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('tournaments').select('course').eq('status', 'active').order('year', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setCourseName((data as { course: string | null } | null)?.course ?? null))
  }, [])

  useEffect(() => {
    if (!playerId) { setNotFound(true); setLoading(false); return }
    supabase.from('profiles').select('*').eq('id', playerId).single()
      .then(({ data }) => {
        if (!data) setNotFound(true)
        else {
          setPlayer(data)
          setHandicap(String(data.handicap ?? ''))
          setNote(data.notes ?? '')
        }
        setLoading(false)
      })
  }, [playerId])

  const submit = async () => {
    if (!player) return
    await supabase.from('profiles').update({
      handicap: handicap ? +handicap : null,
      notes: note || null,
    }).eq('id', player.id)
    setSubmitted(true)
  }

  if (loading) return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="animate-spin" style={{ width: 32, height: 32, border: '3px solid rgba(212,165,58,0.2)', borderTopColor: '#D4A53A', borderRadius: '50%' }} />
    </div>
  )

  if (notFound) return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="glass" style={{ maxWidth: 400, padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🤷</div>
        <h2 style={{ fontFamily: 'Bebas Neue', fontSize: 24, color: '#D4A53A', letterSpacing: 3 }}>Player Not Found</h2>
        <p style={{ color: 'var(--tx3)', marginTop: 8 }}>Check your invite link and try again.</p>
      </div>
    </div>
  )

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(212,165,58,0.1) 0%, transparent 70%), #080808',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 16px',
    }}>
      <div className="glass animate-fadeUp" style={{ width: '100%', maxWidth: 480, padding: '40px 36px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            border: '3px solid #D4A53A',
            boxShadow: '0 0 20px rgba(212,165,58,0.5)',
            overflow: 'hidden', margin: '0 auto 16px',
          }}>
            <img src={CHUBBS_IMG} alt="Chubbs" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 28, color: '#D4A53A', letterSpacing: 3, margin: 0 }}>
            The Chubbs Memorial
          </h1>
          <div style={{ color: 'var(--tx2)', fontSize: 13, marginTop: 4 }}>
            {courseName || 'Course TBD'} • {TOURNAMENT_DATE}
          </div>
        </div>

        {submitted ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>⛳</div>
            <h2 style={{ fontFamily: 'Bebas Neue', fontSize: 26, color: '#D4A53A', letterSpacing: 3 }}>
              Profile Updated!
            </h2>
            <p style={{ color: 'var(--tx2)', marginTop: 8, fontSize: 14 }}>
              We've got your details locked in. Get those hips warmed up! 🏌️
            </p>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--tx1)', marginBottom: 6, textAlign: 'center' }}>
              Hey, {player?.name}!
            </div>
            <p style={{ color: 'var(--tx2)', fontSize: 14, textAlign: 'center', marginBottom: 24 }}>
              Confirm your details for the tournament
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--tx2)', display: 'block', marginBottom: 6 }}>Your Handicap</label>
                <input type="number" value={handicap} onChange={e => setHandicap(e.target.value)} placeholder="e.g. 12" />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--tx2)', display: 'block', marginBottom: 6 }}>Note (optional)</label>
                <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Dietary restrictions, cart preference..." />
              </div>
            </div>

            <button className="btn-gold" onClick={submit} style={{ width: '100%', justifyContent: 'center', marginTop: 24 }}>
              ⛳ Save My Details
            </button>
          </>
        )}

        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--tx4)', marginTop: 24 }}>
          "It's all in the hips." — Chubbs Peterson
        </p>
      </div>
    </div>
  )
}
