import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'
import type { Profile } from '../lib/types'
import { Copy, Shield, ShieldOff, Trash2, Check } from 'lucide-react'

export default function AdminPanel() {
  const { showToast } = useToast()
  const [tab, setTab] = useState<'users' | 'codes' | 'invite'>('users')
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [adminBlurred, setAdminBlurred] = useState(true)

  useEffect(() => { fetchProfiles() }, [])

  const fetchProfiles = async () => {
    const { data } = await supabase.from('profiles').select('*').order('joined_at')
    setProfiles(data ?? [])
  }

  const promoteUser = async (id: string) => {
    await supabase.from('profiles').update({ role: 'admin' }).eq('id', id)
    showToast('Promoted to admin!')
    fetchProfiles()
  }

  const demoteUser = async (id: string) => {
    await supabase.from('profiles').update({ role: 'player' }).eq('id', id)
    showToast('Demoted to player')
    fetchProfiles()
  }

  const removeUser = async (id: string) => {
    if (!confirm('Remove this account? This cannot be undone.')) return
    await supabase.from('profiles').delete().eq('id', id)
    fetchProfiles()
  }

  const copy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedKey(key)
    showToast('Copied to clipboard!')
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const PLAYER_CODE = import.meta.env.VITE_PLAYER_CODE ?? 'CHUBS2025'
  const ADMIN_CODE = import.meta.env.VITE_ADMIN_CODE ?? 'CHUBS_ADMIN'

  const playerInvite = `Hey! You're invited to The Chubbs Invitational golf tournament. Sign up at ${window.location.origin} using invite code: ${PLAYER_CODE}

Format: Best Ball
Dress code: Business casual on the course
Questions? Reply to this message.

"It's all in the hips." — Chubbs Peterson`

  const adminInvite = `Hey! You've been given admin access to The Chubbs Invitational app. Sign up at ${window.location.origin} using the admin invite code (ask me separately for security).

You'll have full control over RSVP, tee times, pairings, and announcements.`

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 32, color: '#FCB514', letterSpacing: 4 }}>Admin Panel</h1>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Manage users, access codes, and invites</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {([
          { id: 'users', label: '👥 Users' },
          { id: 'codes', label: '🔑 Codes' },
          { id: 'invite', label: '✉️ Invite' },
        ] as const).map(({ id, label }) => (
          <button key={id} onClick={() => setTab(id)} className={`pill-tab ${tab === id ? 'active' : ''}`}>{label}</button>
        ))}
      </div>

      {/* Users tab */}
      {tab === 'users' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {profiles.map(p => (
            <div key={p.id} className="glass" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 700, color: '#fff', fontSize: 14 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{p.email}</div>
              </div>
              <div style={{
                fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
                background: p.role === 'admin' ? 'rgba(252,181,20,0.15)' : 'rgba(255,255,255,0.06)',
                color: p.role === 'admin' ? '#FCB514' : 'rgba(255,255,255,0.5)',
                textTransform: 'uppercase', letterSpacing: 1,
              }}>
                {p.role}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {p.role === 'player' ? (
                  <button onClick={() => promoteUser(p.id)} className="btn-ghost" title="Promote to admin" style={{ padding: '6px 10px' }}>
                    <Shield size={13} color="#FCB514" />
                  </button>
                ) : (
                  <button onClick={() => demoteUser(p.id)} className="btn-ghost" title="Demote to player" style={{ padding: '6px 10px' }}>
                    <ShieldOff size={13} color="rgba(255,255,255,0.4)" />
                  </button>
                )}
                <button onClick={() => removeUser(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px 10px', color: 'rgba(239,68,68,0.6)' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Codes tab */}
      {tab === 'codes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="glass" style={{ padding: '20px 22px' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Player Invite Code</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontFamily: 'monospace', fontSize: 24, fontWeight: 700, color: '#FCB514', letterSpacing: 3 }}>{PLAYER_CODE}</div>
              <button onClick={() => copy(PLAYER_CODE, 'player')} className="btn-ghost" style={{ padding: '6px 12px', display: 'flex', gap: 4, alignItems: 'center' }}>
                {copiedKey === 'player' ? <Check size={13} /> : <Copy size={13} />} Copy
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 8 }}>Share this code freely with all players</div>
          </div>

          <div className="glass" style={{ padding: '20px 22px', borderColor: 'rgba(239,68,68,0.2)' }}>
            <div style={{ fontSize: 11, color: '#ef4444', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>⚠️ Admin Code — Keep Private</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontFamily: 'monospace', fontSize: 24, fontWeight: 700, color: '#ef4444', letterSpacing: 3, filter: adminBlurred ? 'blur(6px)' : 'none', transition: 'filter 0.2s', cursor: 'pointer' }}
                onClick={() => setAdminBlurred(false)}>
                {ADMIN_CODE}
              </div>
              <button onClick={() => copy(ADMIN_CODE, 'admin')} className="btn-ghost" style={{ padding: '6px 12px', display: 'flex', gap: 4, alignItems: 'center' }}>
                {copiedKey === 'admin' ? <Check size={13} /> : <Copy size={13} />} Copy
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'rgba(239,68,68,0.6)', marginTop: 8 }}>
              {adminBlurred ? 'Click code to reveal. ' : ''}Only share with trusted admins — grants full app access.
            </div>
          </div>
        </div>
      )}

      {/* Invite tab */}
      {tab === 'invite' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            { label: 'Player Invite Message', text: playerInvite, key: 'playerMsg' },
            { label: 'Admin Invite Message', text: adminInvite, key: 'adminMsg' },
          ].map(({ label, text, key }) => (
            <div key={key} className="glass" style={{ padding: '20px 22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#FCB514' }}>{label}</div>
                <button onClick={() => copy(text, key)} className="btn-gold" style={{ padding: '7px 16px', fontSize: 12 }}>
                  {copiedKey === key ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy</>}
                </button>
              </div>
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 10, padding: '14px 16px',
                fontSize: 13, color: 'rgba(255,255,255,0.6)',
                lineHeight: 1.7, whiteSpace: 'pre-wrap',
              }}>
                {text}
              </div>
            </div>
          ))}
          <div className="glass" style={{ padding: '14px 18px', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
            💡 <strong style={{ color: 'rgba(255,255,255,0.6)' }}>Tip:</strong> Paste the player invite message in a group text, iMessage, or email. You can also use Gmail's "Schedule Send" to send RSVP reminders.
          </div>
        </div>
      )}
    </div>
  )
}
