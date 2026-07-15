import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

const CHUBBS_IMG = 'https://static.wikia.nocookie.net/sandlerverse/images/8/81/Chubbs_Peterson_in_Happy_Gilmore.webp'

// Landing page for the password-reset email link. Supabase parses the token from
// the URL and opens a temporary recovery session (see AuthContext), which lets the
// user set a new password via updateUser — no old password required.
export default function ResetPasswordPage() {
  const { session, clearRecovery } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  // Give the client a moment to parse the token from the URL before deciding the
  // link is bad — detectSessionInUrl resolves asynchronously on load.
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (session) { setChecking(false); return }
    const t = setTimeout(() => setChecking(false), 2500)
    return () => clearTimeout(t)
  }, [session])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 6) { showToast('Password must be at least 6 characters', 'error'); return }
    if (password !== confirm) { showToast('Passwords do not match', 'error'); return }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) { showToast(error.message, 'error'); return }

    clearRecovery()
    showToast('Password updated — you\'re all set', 'success')
    navigate('/', { replace: true })
  }

  const linkExpired = !checking && !session

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'radial-gradient(ellipse 85% 55% at 50% -8%, var(--gold-15) 0%, transparent 62%), var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 16px',
    }}>
      <div className="glass animate-fadeUp" style={{ width: '100%', maxWidth: 420, padding: '36px 24px 32px' }}>
        {/* Header */}
        <div className="animate-fadeUp delay-100" style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 88, height: 88, borderRadius: '50%', padding: 3, margin: '0 auto 16px',
            background: 'linear-gradient(160deg, var(--gold-40), var(--gold-08))',
            boxShadow: 'var(--elev-gold)',
          }}>
            <div style={{ width: '100%', height: '100%', borderRadius: '50%', border: '2px solid var(--gold)', overflow: 'hidden' }}>
              <img src={CHUBBS_IMG} alt="Chubbs" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          </div>
          <h1 className="gold-text" style={{ fontFamily: 'Bebas Neue', fontSize: 34, letterSpacing: 3, lineHeight: 1.1, margin: 0 }}>
            Reset Password
          </h1>
          <p className="section-label" style={{ marginTop: 8 }}>
            {linkExpired ? 'Link trouble' : 'Choose a new one'}
          </p>
        </div>

        {checking ? (
          <div style={{ textAlign: 'center', padding: '12px 0 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <span className="animate-spin" style={{ width: 26, height: 26, border: '3px solid rgba(212,165,58,0.2)', borderTopColor: '#D4A53A', borderRadius: '50%' }} />
            <span style={{ fontSize: 13, color: 'var(--tx3)' }}>Verifying your reset link…</span>
          </div>
        ) : linkExpired ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--tx2)', marginBottom: 20 }}>
              This reset link is invalid or has expired. Reset links are single-use and time out after a while — request a fresh one to try again.
            </p>
            <button onClick={() => navigate('/auth', { replace: true })} className="btn-gold pressable"
              style={{ width: '100%', justifyContent: 'center', minHeight: 48 }}>
              Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="animate-fadeUp delay-200">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input
                type="password" placeholder="New password" autoComplete="new-password"
                value={password} onChange={e => setPassword(e.target.value)} required
              />
              <input
                type="password" placeholder="Confirm new password" autoComplete="new-password"
                value={confirm} onChange={e => setConfirm(e.target.value)} required
              />
              <button type="submit" className="btn-gold pressable" disabled={loading}
                style={{ width: '100%', justifyContent: 'center', minHeight: 48, marginTop: 8 }}>
                {loading ? (
                  <span className="animate-spin" style={{ width: 16, height: 16, border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#000', borderRadius: '50%', display: 'inline-block' }} />
                ) : '⛳ Update password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
