import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { displayName } from '../lib/types'
import { type ClubDist, DEFAULT_BAG, resolveBag, scaleBagTo7Iron } from '../lib/clubs'
import { ShotStats } from '../components/ShotStats'

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
  const [tab, setTab] = useState<'profile' | 'bag' | 'career' | 'alerts'>('profile')
  const [bagTab, setBagTab] = useState<'bag' | 'stats'>('bag')
  const [bag, setBag] = useState<ClubDist[]>(DEFAULT_BAG)
  const [sevenIron, setSevenIron] = useState('')
  const [savingBag, setSavingBag] = useState(false)

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
      setBag(resolveBag(profile.club_distances))
    }
  }, [profile])

  const saveBag = async () => {
    if (!profile) return
    setSavingBag(true)
    const { error } = await supabase.from('profiles')
      .update({ club_distances: bag }).eq('id', profile.id)
    setSavingBag(false)
    if (error) { showToast(error.message, 'error'); return }
    await refreshProfile()
    showToast('Bag saved!')
  }

  const applySevenIron = () => {
    const v = parseInt(sevenIron, 10)
    if (!v || v < 40 || v > 260) { showToast('Enter a 7-iron carry between 40 and 260', 'error'); return }
    setBag(prev => scaleBagTo7Iron(v).map(d => ({
      ...d, enabled: prev.find(p => p.club === d.club)?.enabled ?? d.enabled,
    })))
    showToast('Bag scaled to your 7-iron')
  }

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

  if (!profile) return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <div className="skeleton skeleton-title" style={{ width: 160, height: 32, marginBottom: 24 }} />
      <div className="glass" style={{ padding: 20, marginBottom: 28, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div className="skeleton skeleton-circle" style={{ width: 84, height: 84, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton skeleton-title" style={{ width: '60%', marginBottom: 10 }} />
          <div className="skeleton skeleton-line" style={{ width: '80%', marginBottom: 12 }} />
          <div className="skeleton" style={{ width: 120, height: 32, borderRadius: 999 }} />
        </div>
      </div>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ marginBottom: 24 }}>
          <div className="skeleton skeleton-line" style={{ width: 96, marginBottom: 8, marginLeft: 4 }} />
          <div className="skeleton skeleton-card" style={{ height: 152 }} />
        </div>
      ))}
    </div>
  )

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <h1 className="animate-fadeUp" style={{ fontFamily: 'Bebas Neue', fontSize: 32, color: 'var(--gold)', letterSpacing: 4, margin: '0 0 20px' }}>
        My Account
      </h1>

      {/* ── Hero: avatar + identity ── */}
      <section className="glass-strong animate-fadeUp delay-100" style={{ padding: 20, marginBottom: 28, position: 'relative', overflow: 'hidden' }}>
        <div aria-hidden style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 80% 90% at 18% -20%, var(--gold-08) 0%, transparent 65%)',
        }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, position: 'relative' }}>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            style={{ display: 'none' }}
            onChange={handleAvatarChange}
          />
          <button
            className="pressable"
            onClick={() => !uploadingAvatar && fileRef.current?.click()}
            aria-label={profile.avatar_url ? 'Change profile photo' : 'Upload profile photo'}
            style={{
              width: 84, height: 84, borderRadius: '50%', flexShrink: 0,
              padding: 3, border: 'none', cursor: uploadingAvatar ? 'wait' : 'pointer',
              background: 'linear-gradient(150deg, var(--gold) 0%, var(--gold-25) 70%)',
              boxShadow: 'var(--elev-gold)',
            }}
          >
            <span style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '100%', height: '100%', borderRadius: '50%',
              overflow: 'hidden', position: 'relative',
              background: 'var(--surf3)', border: '2px solid var(--bg)',
            }}>
              {(avatarPreview || profile.avatar_url) ? (
                <img
                  src={avatarPreview || profile.avatar_url!}
                  alt="Profile"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={() => setAvatarPreview(null)}
                />
              ) : (
                <span style={{ fontSize: 32, color: 'var(--gold)', fontFamily: 'Bebas Neue', lineHeight: 1 }}>
                  {displayName(profile).charAt(0).toUpperCase()}
                </span>
              )}
              {uploadingAvatar && (
                <span style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.55)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span className="animate-spin" style={{ width: 24, height: 24, border: '2px solid var(--gold-25)', borderTopColor: 'var(--gold)', borderRadius: '50%', display: 'block' }} />
                </span>
              )}
            </span>
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'Bebas Neue', fontSize: 24, letterSpacing: 1.5, color: 'var(--tx1)', lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayName(profile)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profile.email}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
              <button
                className="btn-outline pressable"
                onClick={() => fileRef.current?.click()}
                disabled={uploadingAvatar}
                style={{ fontSize: 12, padding: '6px 16px', minHeight: 32 }}
              >
                {uploadingAvatar ? 'Uploading…' : profile.avatar_url ? 'Change Photo' : 'Upload Photo'}
              </button>
              {(profile.avatar_url || avatarPreview) && !uploadingAvatar && (
                <button
                  className="pressable"
                  onClick={removeAvatar}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx4)', fontSize: 12, padding: '6px 0', textAlign: 'left' }}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Account tabs ── */}
      <div className="pill-tabs animate-fadeUp" style={{ marginBottom: 20 }}>
        <button onClick={() => setTab('profile')} className={`pill-tab pressable ${tab === 'profile' ? 'active' : ''}`}>Profile</button>
        <button onClick={() => setTab('bag')} className={`pill-tab pressable ${tab === 'bag' ? 'active' : ''}`}>Bag &amp; Stats</button>
        <button onClick={() => setTab('career')} className={`pill-tab pressable ${tab === 'career' ? 'active' : ''}`}>Career</button>
        <button onClick={() => setTab('alerts')} className={`pill-tab pressable ${tab === 'alerts' ? 'active' : ''}`}>Alerts</button>
      </div>

      {/* ── Profile info ── */}
      {tab === 'profile' && (
      <section className="animate-fadeUp delay-200" style={{ marginBottom: 24 }}>
        <div className="section-label" style={{ margin: '0 4px 8px' }}>Profile</div>
        <div className="glass" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
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

          <button className="btn-gold pressable" onClick={saveProfile} disabled={savingProfile} style={{ width: '100%', justifyContent: 'center' }}>
            {savingProfile ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      </section>
      )}

      {/* ── Bag & Stats (with Bag / Shot Stats sub-tabs) ── */}
      {tab === 'bag' && (
      <>
      <div className="pill-tabs" style={{ marginBottom: 16 }}>
        <button onClick={() => setBagTab('bag')} className={`pill-tab pressable ${bagTab === 'bag' ? 'active' : ''}`}>My Bag</button>
        <button onClick={() => setBagTab('stats')} className={`pill-tab pressable ${bagTab === 'stats' ? 'active' : ''}`}>Shot Stats</button>
      </div>
      {bagTab === 'bag' && (
      <section data-tour="bag" className="animate-fadeUp delay-200" style={{ marginBottom: 24 }}>
        <div className="section-label" style={{ margin: '0 4px 8px' }}>My Bag</div>
        <div className="glass" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--tx4)', lineHeight: 1.5 }}>
            Your carry distances power the club suggestion on the GPS screen (matched to the
            wind &amp; elevation adjusted “plays like” number). Set them exactly below, or just
            enter your 7-iron to scale the whole bag.
          </div>

          {/* Quick 7-iron scaler */}
          <div>
            <label style={labelStyle}>Scale from 7-iron carry</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="number" inputMode="numeric" placeholder="e.g. 155"
                value={sevenIron} onChange={e => setSevenIron(e.target.value)}
                min={40} max={260} style={{ ...inputStyle, flex: 1 }}
              />
              <button className="pressable" onClick={applySevenIron} style={{
                padding: '0 18px', borderRadius: 12, border: '1px solid var(--gold)',
                background: 'rgba(212,165,58,0.12)', color: 'var(--gold)', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap',
              }}>Scale bag</button>
            </div>
          </div>

          {/* Per-club editor */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {bag.map((c, i) => (
              <div key={c.club} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px',
                opacity: c.enabled ? 1 : 0.4,
              }}>
                <button
                  onClick={() => setBag(prev => prev.map((p, j) => j === i ? { ...p, enabled: !p.enabled } : p))}
                  aria-label={c.enabled ? 'Disable club' : 'Enable club'}
                  style={{
                    width: 24, height: 24, borderRadius: 6, flexShrink: 0, cursor: 'pointer',
                    border: `1.5px solid ${c.enabled ? 'var(--gold)' : 'var(--tx4)'}`,
                    background: c.enabled ? 'var(--gold)' : 'transparent',
                    color: '#1a1206', fontWeight: 900, fontSize: 13, lineHeight: 1,
                  }}
                >{c.enabled ? '✓' : ''}</button>
                <span style={{ width: 44, fontWeight: 800, fontSize: 15 }}>{c.club}</span>
                <input
                  type="number" inputMode="numeric" value={c.carry}
                  onChange={e => setBag(prev => prev.map((p, j) => j === i ? { ...p, carry: parseInt(e.target.value, 10) || 0 } : p))}
                  min={0} max={400}
                  style={{ ...inputStyle, flex: 1, textAlign: 'right', padding: '8px 12px' }}
                />
                <span style={{ width: 20, fontSize: 13, color: 'var(--tx4)' }}>y</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="pressable" onClick={() => setBag(DEFAULT_BAG)} style={{
              padding: '0 16px', height: 44, borderRadius: 12, border: '1px solid var(--line)',
              background: 'transparent', color: 'var(--tx3)', fontWeight: 700, cursor: 'pointer',
            }}>Reset defaults</button>
            <button className="btn-gold pressable" onClick={saveBag} disabled={savingBag} style={{ flex: 1, justifyContent: 'center' }}>
              {savingBag ? 'Saving…' : 'Save Bag'}
            </button>
          </div>
        </div>
      </section>
      )}

      {/* ── Shot Stats & History ── */}
      {bagTab === 'stats' && <div data-tour="shot-stats"><ShotStats /></div>}
      </>
      )}

      {/* ── Career Highlights ── */}
      {tab === 'career' && (careerStats.length > 0 ? (() => {
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
          <section className="animate-fadeUp delay-300" style={{ marginBottom: 24 }}>
            <div className="section-label" style={{ margin: '0 4px 8px' }}>Career Highlights</div>
            <div className="glass" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rows.map(r => (
                <div
                  key={r.key}
                  className="glass-flat list-row"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', minHeight: 48,
                    background: r.key === 'champion' ? 'var(--gold-08)' : undefined,
                    borderColor: r.key === 'champion' ? 'var(--gold-25)' : undefined,
                  }}
                >
                  <span style={{ fontSize: 20, flexShrink: 0, width: 28, textAlign: 'center' }}>{r.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: r.key === 'champion' ? 'var(--gold)' : 'var(--tx1)' }}>
                      {r.label}
                    </span>
                    {r.years.length > 1 && <span style={{ fontSize: 12, color: 'var(--tx3)', marginLeft: 8 }}>×{r.years.length}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--tx3)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {r.years.join(', ')}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )
      })() : (
        <div className="glass" style={{ padding: 28, textAlign: 'center', color: 'var(--tx3)', fontSize: 14 }}>
          No career highlights yet — win a title, a contest, or the Jackass award and it'll show up here.
        </div>
      ))}

      {/* ── Push Notifications ── */}
      {tab === 'alerts' && (
      <section className="animate-fadeUp delay-400" style={{ marginBottom: 24 }}>
        <div className="section-label" style={{ margin: '0 4px 8px' }}>Notifications</div>
        <div className="glass" style={{ padding: '8px 20px' }}>
          <div className="list-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 56, padding: '8px 0', borderBottom: pushStatus === 'subscribed' ? '1px solid var(--bdr)' : 'none' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx1)' }}>Push Alerts</div>
              {pushStatus === 'unsupported' && (
                <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 2 }}>Push notifications aren't supported in this browser.</div>
              )}
              {pushStatus === 'denied' && (
                <div style={{ fontSize: 12, color: '#ef4444', marginTop: 2 }}>Blocked — enable in browser settings, then reload.</div>
              )}
              {pushStatus === 'unsubscribed' && (
                <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 2 }}>Turn on to get alerts during the round.</div>
              )}
              {pushStatus === 'subscribed' && (
                <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 2 }}>Pick which alerts hit your phone.</div>
              )}
            </div>
            {(pushStatus === 'subscribed' || pushStatus === 'unsubscribed') && (
              <div className="pill-tabs" style={{ flexShrink: 0 }}>
                <button
                  className={`pill-tab pressable${pushStatus === 'unsubscribed' ? ' active' : ''}`}
                  onClick={pushStatus === 'subscribed' ? unsubscribePush : subscribePush}
                  disabled={pushLoading}
                  style={{ fontSize: 12, opacity: pushLoading ? 0.6 : 1, cursor: pushLoading ? 'not-allowed' : 'pointer' }}
                >
                  {pushLoading ? '…' : pushStatus === 'subscribed' ? 'Turn Off' : 'Turn On'}
                </button>
              </div>
            )}
          </div>

          {pushStatus === 'subscribed' && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {NOTIF_TYPES.filter(t => !t.adminOnly || isAdmin).map((t, i, arr) => {
                const on = notifPrefs[t.key] !== false
                const saving = prefSaving === t.key
                return (
                  <div
                    key={t.key}
                    className="list-row"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      minHeight: 56, padding: '8px 0',
                      borderBottom: i < arr.length - 1 ? '1px solid var(--bdr)' : 'none',
                    }}
                  >
                    <span style={{ fontSize: 20, flexShrink: 0, width: 28, textAlign: 'center' }}>{t.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx1)' }}>{t.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 2 }}>{t.desc}</div>
                    </div>
                    <button
                      className="pressable"
                      role="switch"
                      aria-checked={on}
                      aria-label={t.label}
                      onClick={() => !saving && togglePref(t.key, !on)}
                      style={{
                        flexShrink: 0, width: 48, height: 28, borderRadius: 999,
                        background: on ? 'linear-gradient(160deg, #e8bc55 0%, #c4941f 100%)' : 'var(--surf2)',
                        border: `1px solid ${on ? 'var(--gold-40)' : 'var(--bdr2)'}`,
                        boxShadow: on ? 'var(--elev-gold)' : 'none',
                        cursor: saving ? 'wait' : 'pointer',
                        position: 'relative', transition: 'background 0.2s, border-color 0.2s, box-shadow 0.2s',
                      }}
                    >
                      <span style={{
                        position: 'absolute', top: 3, left: on ? 23 : 3,
                        width: 20, height: 20, borderRadius: '50%',
                        background: on ? '#fffdf6' : 'var(--tx4)',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
                        transition: 'left 0.2s var(--spring), background 0.2s',
                        display: 'block',
                      }} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>
      )}

      {/* ── Email + RSVP + Password (Profile tab) ── */}
      {tab === 'profile' && (<>
      <section className="animate-fadeUp delay-500" style={{ marginBottom: 24 }}>
        <div className="section-label" style={{ margin: '0 4px 8px' }}>Email Address</div>
        <div className="glass" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
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
            className="btn-gold pressable"
            onClick={saveEmail}
            disabled={savingEmail || emailForm.email === profile.email}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {savingEmail ? 'Sending…' : 'Update Email'}
          </button>
        </div>
      </section>

      {/* ── Tournament RSVP ── */}
      {profile.invite_response && (
        <section className="animate-fadeUp delay-600" style={{ marginBottom: 24 }}>
          <div className="section-label" style={{ margin: '0 4px 8px' }}>Tournament RSVP</div>
          <div className="glass" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div className="glass-flat" style={{ width: 56, height: 56, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0 }}>
                {profile.invite_response === 'yes' ? '⛳' : '😔'}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: 14, fontWeight: 700,
                  color: profile.invite_response === 'yes' ? '#22c55e' : '#ef4444',
                }}>
                  {profile.invite_response === 'yes' ? 'You\'re In — see you on the course!' : 'You declined this year\'s tournament'}
                </div>
                {profile.invite_response_at && (
                  <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 4 }}>
                    Responded {new Date(profile.invite_response_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </div>
                )}
                <div style={{ fontSize: 12, color: 'var(--tx4)', marginTop: 4 }}>
                  To change your response, contact the organizer.
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Password ── */}
      {user?.app_metadata?.provider !== 'google' && (
        <section className="animate-fadeUp delay-700" style={{ marginBottom: 24 }}>
          <div className="section-label" style={{ margin: '0 4px 8px' }}>Change Password</div>
          <div className="glass" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
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
              className="btn-gold pressable"
              onClick={savePassword}
              disabled={savingPassword || !passwordForm.password}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {savingPassword ? 'Saving…' : 'Change Password'}
            </button>
          </div>
        </section>
      )}
      </>)}

      {/* ── Sign Out (destructive zone) ── */}
      <section className="animate-fadeUp delay-800" style={{ marginTop: 32, paddingBottom: 8 }}>
        <hr className="divider-gold" style={{ marginBottom: 24 }} />
        <button
          className="pressable"
          onClick={signOut}
          style={{
            width: '100%', minHeight: 48, padding: '12px 0', borderRadius: 14,
            fontSize: 14, fontWeight: 600, letterSpacing: 0.5,
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
            color: '#f87171', cursor: 'pointer',
          }}
        >
          Sign Out
        </button>
      </section>
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
