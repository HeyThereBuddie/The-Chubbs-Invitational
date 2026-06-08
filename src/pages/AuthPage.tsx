import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'

const CHUBBS_IMG = 'https://static.wikia.nocookie.net/sandlerverse/images/8/81/Chubbs_Peterson_in_Happy_Gilmore.webp'

export default function AuthPage() {
  const { showToast } = useToast()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name: '', nickname: '', email: '', password: '', code: '', handicap: '' })

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    })
    setLoading(false)
    if (error) showToast(error.message, 'error')
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    const playerCode   = import.meta.env.VITE_PLAYER_CODE
    const adminCode    = import.meta.env.VITE_ADMIN_CODE
    const waitlistCode = import.meta.env.VITE_WAITLIST_CODE
    const code = form.code.trim().toUpperCase()

    let role   = ''
    let status = 'active'
    if      (code === adminCode)    { role = 'admin';  status = 'active' }
    else if (code === playerCode)   { role = 'player'; status = 'active' }
    else if (code === waitlistCode) { role = 'player'; status = 'waitlist' }
    else { showToast('Invalid invite code', 'error'); return }

    setLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: { name: form.name.trim(), role, status },
      },
    })

    // Update optional fields on the profile right after creation
    if (!error && data.user && (form.handicap || form.nickname.trim())) {
      await supabase.from('profiles')
        .update({
          ...(form.handicap ? { handicap: +form.handicap } : {}),
          ...(form.nickname.trim() ? { nickname: form.nickname.trim() } : {}),
        })
        .eq('id', data.user.id)
    }

    setLoading(false)
    if (error) showToast(error.message, 'error')
    else if (status === 'waitlist') showToast("You're on the waitlist! We'll reach out when a spot opens.")
    else showToast('Account created! Welcome to The Chubbs Invitational 🏌️')
  }

  const handleGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(252,181,20,0.1) 0%, transparent 70%), #080808',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 16px',
    }}>
      <div className="glass animate-fadeUp" style={{ width: '100%', maxWidth: 420, padding: '40px 36px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div className="animate-wiggle" style={{
            width: 80, height: 80, borderRadius: '50%',
            border: '3px solid #FCB514',
            boxShadow: '0 0 20px rgba(252,181,20,0.5)',
            overflow: 'hidden', margin: '0 auto 16px',
          }}>
            <img src={CHUBBS_IMG} alt="Chubbs" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 32, letterSpacing: 4, color: '#FCB514', textShadow: '0 0 20px rgba(252,181,20,0.5)', margin: 0 }}>
            The Chubbs Invitational
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 4 }}>
            It's all in the hips
          </p>
        </div>

        {/* Tab toggle */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: 999, padding: 3, marginBottom: 24 }}>
          {(['login', 'register'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                flex: 1, padding: '8px', borderRadius: 999, border: 'none',
                background: mode === m ? 'rgba(252,181,20,0.15)' : 'transparent',
                color: mode === m ? '#FCB514' : 'rgba(255,255,255,0.5)',
                fontWeight: 600, fontSize: 13, cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {m === 'login' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        <form onSubmit={mode === 'login' ? handleLogin : handleRegister}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {mode === 'register' && (
              <input
                type="text" placeholder="Your Name"
                value={form.name} onChange={e => set('name', e.target.value)}
                required
              />
            )}
            {mode === 'register' && (
              <input
                type="text" placeholder='Nickname (optional, e.g. "Big Easy")'
                value={form.nickname} onChange={e => set('nickname', e.target.value)}
                maxLength={30}
              />
            )}
            <input
              type="email" placeholder="Email"
              value={form.email} onChange={e => set('email', e.target.value)}
              required
            />
            <input
              type="password" placeholder="Password"
              value={form.password} onChange={e => set('password', e.target.value)}
              required
            />
            {mode === 'register' && (
              <input
                type="text" placeholder="Invite Code"
                value={form.code} onChange={e => set('code', e.target.value)}
                required
              />
            )}
            {mode === 'register' && (
              <input
                type="number" placeholder="Handicap (optional)"
                value={form.handicap} onChange={e => set('handicap', e.target.value)}
                min={0} max={54} step={0.1}
              />
            )}
            <button type="submit" className="btn-gold" disabled={loading} style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
              {loading ? (
                <span className="animate-spin" style={{ width: 16, height: 16, border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#000', borderRadius: '50%', display: 'inline-block' }} />
              ) : mode === 'login' ? '⛳ Sign In' : '🏌️ Join the Tournament'}
            </button>
          </div>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(252,181,20,0.1)' }} />
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>or</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(252,181,20,0.1)' }} />
        </div>

        <button onClick={handleGoogle} className="btn-outline" style={{ width: '100%', justifyContent: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Continue with Google
        </button>

        <p style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 24 }}>
          "You're gonna be a golf legend, Happy." — Chubbs Peterson
        </p>
      </div>
    </div>
  )
}
