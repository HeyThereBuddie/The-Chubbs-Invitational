import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const CHUBBS_IMG = 'https://static.wikia.nocookie.net/sandlerverse/images/8/81/Chubbs_Peterson_in_Happy_Gilmore.webp'

type State = 'loading' | 'yes' | 'no' | 'already' | 'error'

export default function InviteResponsePage() {
  const [params] = useSearchParams()
  const token    = params.get('t')
  const response = params.get('r')

  const [state,    setState]    = useState<State>('loading')
  const [name,     setName]     = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!token || !response) { setState('error'); setErrorMsg('Missing invite link parameters.'); return }
    if (response !== 'yes' && response !== 'no') { setState('error'); setErrorMsg('Invalid response value.'); return }

    const run = async () => {
      const { data, error } = await supabase.rpc('submit_invite_response', {
        p_token:    token,
        p_response: response,
      })
      if (error) { setState('error'); setErrorMsg(error.message); return }
      if (!data.success) { setState('error'); setErrorMsg(data.error ?? 'Something went wrong.'); return }
      setName(data.name ?? '')
      setState(response as 'yes' | 'no')
    }
    run()
  }, [token, response])

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(252,181,20,0.12) 0%, transparent 70%), #080808',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 16px', fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{
        width: '100%', maxWidth: 460, textAlign: 'center',
        background: 'rgba(18,14,6,0.88)',
        border: '1px solid rgba(252,181,20,0.18)',
        borderRadius: 22, padding: '44px 36px',
        boxShadow: '0 0 60px rgba(252,181,20,0.08)',
      }}>
        {/* Chubbs circle */}
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          border: '3px solid #FCB514',
          boxShadow: '0 0 24px rgba(252,181,20,0.4)',
          overflow: 'hidden', margin: '0 auto 24px',
        }}>
          <img src={CHUBBS_IMG} alt="Chubbs" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>

        {state === 'loading' && (
          <>
            <div style={{ fontFamily: 'Bebas Neue, system-ui', fontSize: 28, letterSpacing: 4, color: '#FCB514', marginBottom: 12 }}>
              One moment…
            </div>
            <div style={{ margin: '0 auto', width: 36, height: 36, border: '3px solid rgba(252,181,20,0.2)', borderTopColor: '#FCB514', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </>
        )}

        {state === 'yes' && (
          <>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⛳</div>
            <div style={{ fontFamily: 'Bebas Neue, system-ui', fontSize: 32, letterSpacing: 4, color: '#FCB514', marginBottom: 12 }}>
              You're In{name ? `, ${name.split(' ')[0]}` : ''}!
            </div>
            <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 15, lineHeight: 1.6, margin: '0 0 24px' }}>
              Your spot is confirmed. Get your hips loose and your swing ready —
              The Chubbs Invitational is coming in mid-to-late August 2025.
            </p>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, fontStyle: 'italic' }}>
              "You're gonna be a golf legend." — Chubbs Peterson
            </p>
          </>
        )}

        {state === 'no' && (
          <>
            <div style={{ fontSize: 44, marginBottom: 12 }}>😔</div>
            <div style={{ fontFamily: 'Bebas Neue, system-ui', fontSize: 32, letterSpacing: 4, color: '#FCB514', marginBottom: 12 }}>
              We'll Miss You{name ? `, ${name.split(' ')[0]}` : ''}
            </div>
            <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 15, lineHeight: 1.6, margin: '0 0 24px' }}>
              Totally understood. Your response has been recorded and
              you've been moved to the dropped list. If things change, reach
              out to the organizer to get back in.
            </p>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, fontStyle: 'italic' }}>
              "I would have been a pro if it wasn't for those damn alligators." — Chubbs Peterson
            </p>
          </>
        )}

        {state === 'error' && (
          <>
            <div style={{ fontSize: 44, marginBottom: 12 }}>🐊</div>
            <div style={{ fontFamily: 'Bebas Neue, system-ui', fontSize: 28, letterSpacing: 3, color: '#ef4444', marginBottom: 12 }}>
              Uh Oh
            </div>
            <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, lineHeight: 1.6, margin: '0 0 12px' }}>
              Something went wrong with your invite link.
            </p>
            {errorMsg && (
              <p style={{ color: 'rgba(239,68,68,0.7)', fontSize: 12, fontFamily: 'monospace' }}>{errorMsg}</p>
            )}
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 16 }}>
              Contact the organizer to get a fresh invite link.
            </p>
          </>
        )}

        <div style={{ marginTop: 32, paddingTop: 20, borderTop: '1px solid rgba(252,181,20,0.1)' }}>
          <div style={{ fontFamily: 'Bebas Neue, system-ui', fontSize: 14, letterSpacing: 3, color: 'rgba(252,181,20,0.4)' }}>
            THE CHUBBS INVITATIONAL
          </div>
        </div>
      </div>
    </div>
  )
}
