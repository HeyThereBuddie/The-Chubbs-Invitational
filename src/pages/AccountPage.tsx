import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { displayName } from '../lib/types'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY
  || 'BFw6RXT78FLUWtAKcd7hdVWNghyABhbeAMu-IoA0Hh6PtS8bfgkvA-ugJL7DaASOHk586kEZjK-5rfjzi6JPP6U'

const DEFAULT_NOTIF_PREFS: Record<string, boolean> = {
  lead_change: true, top3_shift: true, hot_streak: true, eagle: true,
  round_complete: true, team_scores: true, contest_winner: true,
  alligator: true, choking: true, score_disputed: false,
}

const NOTIF_TYPES: { key: string; icon: string; label: string; desc: string; adminOnly?: boolean }[] = [
  { key: 'lead_change',    icon: '🏆', label: 'Lead Change',    desc: 'A team takes the lead' },
  { key: 'top3_shift',     icon: '📊', label: 'Top 3 Shift',    desc: 'Any position change in the top 3' },
  { key: 'hot_streak',     icon: '🔥', label: 'Hot Streak',     desc: 'A team birdies 2 holes in a row' },
  { key: 'eagle',          icon: '🦅', label: 'Eagle or Better', desc: 'Any team scores eagle or albatross' },
  { key: 'round_complete', icon: '🏁', label: 'Round Complete', desc: 'All teams finish 18 holes' },
  { key: 'team_scores',    icon: '⛳', label: 'My Team Scores', desc: 'Your team posts a score' },
  { key: 'contest_winner', icon: '🎯', label: 'Contest Entry',  desc: 'CTP or longest drive entry claimed' },
  { key: 'alligator',      icon: '🐊', label: 'Alligator Alert', desc: 'A team makes double bogey or worse' },
  { key: 'choking',        icon: '💀', label: 'Choking Alert',  desc: 'The leader gives up 2+ strokes on a hole' },
  { key: 'score_disputed', icon: '📋', label: 'Score Edited',   desc: 'An admin edits a posted score', adminOnly: true },
]

function urlBase64ToUint8Array(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}


export default function AccountPage() {
  const { profile, user, refreshProfile, signOut, isAdmin } = useAuth()
  const { showToast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const [profileForm, setProfileForm] = useState({
    nickname: '',
    phone: '',
    handicap: '',
  })
  const [emailForm, setEmailForm] = useState({ email: '' })
  const [passwordForm, setPasswordForm] = useState({ password: '', confirm: '' })
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingEmail, setSavingEmail] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [pushStatus, setPushStatus] = useState<'unsupported' | 'denied' | 'subscribed' | 'unsubscribed'>('unsubscribed')
  const [pushLoading, setPushLoading] = useState(false)
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>(DEFAULT_NOTIF_PREFS)
  const [prefSaving, setPrefSaving] = useState<string | null>(null)
  const [careerStats, setCareerStats] = useState<{ category: string; year: number }[]>([])

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushStatus('unsupported'); return
    }
    if (Notification.permission === 'denied') { setPushStatus('denied'); return }
    navigator.serviceWorker.ready.then(async reg => {
      const sub = await reg.pushManager.getSubscription()
      if (sub && user) {
        setPushStatus('subscribed')
        const { data } = await supabase.from('push_subscriptions')
          .select('notification_prefs').eq('user_id', user.id).single()
        if (data?.notification_prefs) setNotifPrefs(data.notification_prefs as Record<string, boolean>)
      } else {
        setPushStatus('unsubscribed')
      }
    })
  }, [user])

  const subscribePush = async () => {
    setPushLoading(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setPushStatus('denied'); return }
      // Use .ready to ensure the SW is fully active before subscribing
      const reg = await navigator.serviceWorker.ready
      // Clear any stale subscription (different key causes the P-256 error)
      const existing = await reg.pushManager.getSubscription()
      if (existing) await existing.unsubscribe()
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
      await supabase.from('push_subscriptions').upsert(
        { user_id: user!.id, subscription: sub.toJSON(), notification_prefs: DEFAULT_NOTIF_PREFS },
        { onConflict: 'user_id' }
      )
      setNotifPrefs(DEFAULT_NOTIF_PREFS)
      setPushStatus('subscribed')
      showToast('Notifications enabled!')
    } catch (e) {
      showToast((e as Error).message ?? 'Failed to enable notifications', 'error')
    }
    setPushLoading(false)
  }

  const togglePref = async (key: string, value: boolean) => {
    const updated = { ...notifPrefs, [key]: value }
    setNotifPrefs(updated)
    setPrefSaving(key)
    await supabase.from('push_subscriptions')
      .update({ notification_prefs: updated })
      .eq('user_id', user!.id)
    setPrefSaving(null)
  }

  const unsubscribePush = async () => {
    setPushLoading(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js')
      const sub = await reg?.pushManager.getSubscription()
      await sub?.unsubscribe()
      await supabase.from('push_subscriptions').delete().eq('user_id', user!.id)
      setPushStatus('unsubscribed')
      showToast('Notifications disabled')
    } catch (e) {
      showToast((e as Error).message ?? 'Failed to disable', 'error')
    }
    setPushLoading(false)
  }

  useEffect(() => {
    if (profile) fetchCareerStats(profile.id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  const fetchCareerStats = async (profileId: string) => {
    const { data: results } = await supabase
      .from('tournament_results')
      .select('category, tournament_id, tournaments!inner(year)')
      .or(`player1_id.eq.${profileId},player2_id.eq.${profileId}`)
    const flat = (results ?? []).map((r: { category: string; tournaments: { year: number } | { year: number }[] | null }) => ({
      category: r.category,
      year: Array.isArray(r.tournaments) ? r.tournaments[0]?.year : (r.tournaments as { year: number } | null)?.year ?? 0,
    }))
    setCareerStats(flat)
  }

  useEffect(() => {
    if (profile) {
      setProfileForm({
        nickname: profile.nickname ?? '',
        phone: profile.phone ?? '',
        handicap: profile.handicap != null ? String(profile.handicap) : '',
      })
      setEmailForm({ email: profile.email ?? '' })
    }
  }, [profile])

  const saveProfile = async () => {
    if (!profile) return
    setSavingProfile(true)
    const { error } = await supabase.from('profiles').update({
      nickname: profileForm.nickname.trim() || null,
      phone: profileForm.phone.trim() || null,
      handicap: profileForm.handicap !== '' ? parseFloat(profileForm.handicap) : null,
    }).eq('id', profile.id)
    setSavingProfile(false)
    if (error) showToast(error.message, 'error')
    else showToast('Profile saved!')
  }

  const saveEmail = async () => {
    const newEmail = emailForm.email.trim()
    if (!newEmail || newEmail === profile?.email) return
    setSavingEmail(true)
    const { error } = await supabase.auth.updateUser({ email: newEmail })
    setSavingEmail(false)
    if (error) showToast(error.message, 'error')
    else showToast('Check your new email for a confirmation link.')
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !profile) return

    const objectUrl = URL.createObjectURL(file)
    setAvatarPreview(objectUrl)
    setUploadingAvatar(true)

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${profile.id}/avatar.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type })

    if (uploadErr) {
      showToast(uploadErr.message, 'error')
      setAvatarPreview(null)
      setUploadingAvatar(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', profile.id)

    setUploadingAvatar(false)
    if (updateErr) {
      showToast(updateErr.message, 'error')
    } else {
      await refreshProfile()
      showToast('Profile photo updated!')
    }
  }

  const removeAvatar = async () => {
    if (!profile?.avatar_url) return
    setUploadingAvatar(true)
    await supabase.from('profiles').update({ avatar_url: null }).eq('id', profile.id)
    setAvatarPreview(null)
    await refreshProfile()
    setUploadingAvatar(false)
    showToast('Photo removed.')
  }

  const savePassword = async () => {
    if (passwordForm.password.length < 6) {
      showToast('Password must be at least 6 characters', 'error'); return
    }
    if (passwordForm.password !== passwordForm.confirm) {
      showToast('Passwords do not match', 'error'); return
    }
    setSavingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: passwordForm.password })
    setSavingPassword(false)
    if (error) showToast(error.message, 'error')
    else {
      showToast('Password updated!')
      setPasswordForm({ password: '', confirm: '' })
    }
  }

  if (!profile) return null

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 32, color: '#D4A53A', letterSpacing: 4, margin: 0 }}>
          My Account
        </h1>
        <p style={{ color: 'var(--tx3)', fontSize: 13, marginTop: 4 }}>
          {displayName(profile)} · {profile.email}
        </p>
      </div>

      {/* ── Profile Photo ── */}
      <div className="glass" style={{ padding: '24px 26px', marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: 'var(--tx3)', textTransform: 'uppercase', marginBottom: 18 }}>
          Profile Photo
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            border: '2px solid rgba(212,165,58,0.35)',
            overflow: 'hidden', flexShrink: 0,
            background: 'var(--surf)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative',
          }}>
            {(avatarPreview || profile.avatar_url) ? (
              <img
                src={avatarPreview || profile.avatar_url!}
                alt="Profile"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={() => setAvatarPreview(null)}
              />
            ) : (
              <span style={{ fontSize: 30, color: 'var(--tx4)', fontFamily: 'Bebas Neue' }}>
                {displayName(profile).charAt(0).toUpperCase()}
              </span>
            )}
            {uploadingAvatar && (
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                background: 'rgba(0,0,0,0.55)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div className="animate-spin" style={{ width: 24, height: 24, border: '2px solid rgba(212,165,58,0.3)', borderTopColor: '#D4A53A', borderRadius: '50%' }} />
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              style={{ display: 'none' }}
              onChange={handleAvatarChange}
            />
            <button
              className="btn-gold"
              onClick={() => fileRef.current?.click()}
              disabled={uploadingAvatar}
              style={{ fontSize: 13 }}
            >
              {uploadingAvatar ? 'Uploading…' : profile.avatar_url ? 'Change Photo' : 'Upload Photo'}
            </button>
            {(profile.avatar_url || avatarPreview) && !uploadingAvatar && (
              <button
                onClick={removeAvatar}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx4)', fontSize: 12, padding: 0, textAlign: 'left' }}
              >
                Remove photo
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Profile info ── */}
      <div className="glass" style={{ padding: '24px 26px', marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: 'var(--tx3)', textTransform: 'uppercase', marginBottom: 18 }}>
          Profile
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Full Name</label>
            <input value={profile.name} disabled style={{ ...inputStyle, opacity: 0.4, cursor: 'not-allowed' }} />
            <div style={{ fontSize: 11, color: 'var(--tx4)', marginTop: 4 }}>Contact an admin to change your name.</div>
          </div>

          <div>
            <label style={labelStyle}>Nickname <span style={{ color: 'var(--tx4)', fontWeight: 400 }}>(optional)</span></label>
            <input
              type="text"
              placeholder='e.g. "Big Easy", "The Shark"'
              value={profileForm.nickname}
              onChange={e => setProfileForm(f => ({ ...f, nickname: e.target.value }))}
              maxLength={30}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Phone</label>
            <input
              type="tel"
              placeholder="e.g. 555-867-5309"
              value={profileForm.phone}
              onChange={e => setProfileForm(f => ({ ...f, phone: e.target.value }))}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Handicap</label>
            <input
              type="number"
              placeholder="e.g. 14"
              value={profileForm.handicap}
              onChange={e => setProfileForm(f => ({ ...f, handicap: e.target.value }))}
              min={0} max={54} step={0.1}
              style={inputStyle}
            />
          </div>

          <button className="btn-gold" onClick={saveProfile} disabled={savingProfile} style={{ alignSelf: 'flex-start', minWidth: 120 }}>
            {savingProfile ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      </div>

      {/* ── Career Highlights ── */}
      {careerStats.length > 0 && (() => {
        const cats = [
          { key: 'champion', emoji: '🏆', label: 'Championship' },
          { key: 'runner_up', emoji: '🥈', label: 'Runner-Up' },
          { key: 'third', emoji: '🥉', label: 'Third Place' },
          { key: 'jackass', emoji: '🤠', label: 'Jackass Award' },
          { key: 'ctp', emoji: '🎯', label: 'Closest to Pin' },
          { key: 'ld', emoji: '💥', label: 'Longest Drive' },
        ]
        const rows = cats.map(c => ({ ...c, years: careerStats.filter(s => s.category === c.key).map(s => s.year).sort() })).filter(r => r.years.length > 0)
        if (!rows.length) return null
        return (
          <div className="glass" style={{ padding: '24px 26px', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: 'var(--tx3)', textTransform: 'uppercase', marginBottom: 16 }}>
              Career Highlights
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rows.map(r => (
                <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: r.key === 'champion' ? 'rgba(212,165,58,0.06)' : 'var(--surf2)', border: r.key === 'champion' ? '1px solid rgba(212,165,58,0.2)' : '1px solid var(--bdr)' }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{r.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: r.key === 'champion' ? '#D4A53A' : 'var(--tx1)' }}>
                      {r.label}
                    </span>
                    {r.years.length > 1 && <span style={{ fontSize: 12, color: 'var(--tx3)', marginLeft: 8 }}>×{r.years.length}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--tx3)', textAlign: 'right' }}>
                    {r.years.join(', ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* ── Email ── */}
      <div className="glass" style={{ padding: '24px 26px', marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: 'var(--tx3)', textTransform: 'uppercase', marginBottom: 18 }}>
          Email Address
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>New Email</label>
            <input
              type="email"
              value={emailForm.email}
              onChange={e => setEmailForm({ email: e.target.value })}
              style={inputStyle}
            />
            <div style={{ fontSize: 11, color: 'var(--tx4)', marginTop: 4 }}>
              A confirmation link will be sent to the new address.
            </div>
          </div>
          <button
            className="btn-gold"
            onClick={saveEmail}
            disabled={savingEmail || emailForm.email === profile.email}
            style={{ alignSelf: 'flex-start', minWidth: 140 }}
          >
            {savingEmail ? 'Sending…' : 'Update Email'}
          </button>
        </div>
      </div>

      {/* ── Tournament RSVP ── */}
      {profile.invite_response && (
        <div className="glass" style={{ padding: '24px 26px', marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: 'var(--tx3)', textTransform: 'uppercase', marginBottom: 14 }}>
            Tournament RSVP
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontSize: 36 }}>{profile.invite_response === 'yes' ? '⛳' : '😔'}</div>
            <div>
              <div style={{
                fontSize: 15, fontWeight: 700,
                color: profile.invite_response === 'yes' ? '#22c55e' : '#ef4444',
              }}>
                {profile.invite_response === 'yes' ? 'You\'re In — see you on the course!' : 'You declined this year\'s tournament'}
              </div>
              {profile.invite_response_at && (
                <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 3 }}>
                  Responded {new Date(profile.invite_response_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </div>
              )}
              <div style={{ fontSize: 12, color: 'var(--tx4)', marginTop: 6 }}>
                To change your response, contact the organizer.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Password ── */}
      {user?.app_metadata?.provider !== 'google' && (
        <div className="glass" style={{ padding: '24px 26px', marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: 'var(--tx3)', textTransform: 'uppercase', marginBottom: 18 }}>
            Change Password
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>New Password</label>
              <input
                type="password"
                placeholder="Min. 6 characters"
                value={passwordForm.password}
                onChange={e => setPasswordForm(f => ({ ...f, password: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Confirm Password</label>
              <input
                type="password"
                placeholder="Repeat new password"
                value={passwordForm.confirm}
                onChange={e => setPasswordForm(f => ({ ...f, confirm: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <button
              className="btn-gold"
              onClick={savePassword}
              disabled={savingPassword || !passwordForm.password}
              style={{ alignSelf: 'flex-start', minWidth: 160 }}
            >
              {savingPassword ? 'Saving…' : 'Change Password'}
            </button>
          </div>
        </div>
      )}

      {/* ── Sign Out ── */}
      <div style={{ marginTop: 24, paddingBottom: 8 }}>
        <button
          onClick={signOut}
          style={{
            width: '100%', padding: '13px 0', borderRadius: 12, fontSize: 14, fontWeight: 600,
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
            color: 'rgba(239,68,68,0.75)', cursor: 'pointer', letterSpacing: 0.5,
          }}
        >
          Sign Out
        </button>
      </div>

      {/* ── Push Notifications ── */}
      <div className="glass" style={{ padding: '24px 26px', marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: 'var(--tx3)', textTransform: 'uppercase' }}>
            Notifications
          </div>
          {(pushStatus === 'subscribed' || pushStatus === 'unsubscribed') && (
            <button
              onClick={pushStatus === 'subscribed' ? unsubscribePush : subscribePush}
              disabled={pushLoading}
              style={{
                padding: '5px 16px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                background: pushStatus === 'subscribed' ? 'var(--surf2)' : 'rgba(212,165,58,0.15)',
                border: `1px solid ${pushStatus === 'subscribed' ? 'var(--bdr)' : 'rgba(212,165,58,0.4)'}`,
                color: pushStatus === 'subscribed' ? 'var(--tx2)' : '#D4A53A',
                cursor: pushLoading ? 'not-allowed' : 'pointer', opacity: pushLoading ? 0.6 : 1,
              }}
            >
              {pushLoading ? '…' : pushStatus === 'subscribed' ? 'Turn Off' : 'Turn On'}
            </button>
          )}
        </div>

        {pushStatus === 'unsupported' && (
          <p style={{ fontSize: 13, color: 'var(--tx3)' }}>Push notifications aren't supported in this browser.</p>
        )}
        {pushStatus === 'denied' && (
          <p style={{ fontSize: 13, color: '#ef4444' }}>Notifications are blocked. Enable them in your browser settings, then reload.</p>
        )}
        {pushStatus === 'unsubscribed' && (
          <p style={{ fontSize: 13, color: 'var(--tx3)' }}>Turn on notifications to get alerts during the round.</p>
        )}

        {pushStatus === 'subscribed' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {NOTIF_TYPES.filter(t => !t.adminOnly || isAdmin).map((t, i, arr) => {
              const on = notifPrefs[t.key] !== false
              const saving = prefSaving === t.key
              return (
                <div
                  key={t.key}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 0',
                    borderBottom: i < arr.length - 1 ? '1px solid var(--bdr)' : 'none',
                  }}
                >
                  <span style={{ fontSize: 20, flexShrink: 0, width: 28, textAlign: 'center' }}>{t.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx1)' }}>{t.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 1 }}>{t.desc}</div>
                  </div>
                  <button
                    onClick={() => !saving && togglePref(t.key, !on)}
                    style={{
                      flexShrink: 0, width: 44, height: 26, borderRadius: 999,
                      background: on ? 'rgba(212,165,58,0.2)' : 'var(--surf2)',
                      border: `1.5px solid ${on ? 'rgba(212,165,58,0.5)' : 'var(--bdr)'}`,
                      cursor: saving ? 'wait' : 'pointer',
                      position: 'relative', transition: 'background 0.2s, border-color 0.2s',
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: 3, left: on ? 20 : 3,
                      width: 18, height: 18, borderRadius: '50%',
                      background: on ? '#D4A53A' : 'var(--tx4)',
                      transition: 'left 0.2s, background 0.2s',
                      display: 'block',
                    }} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--tx3)',
  textTransform: 'uppercase',
  letterSpacing: 1,
  marginBottom: 6,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
}
