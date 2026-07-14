import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useYear } from '../context/YearContext'
import { displayName, type RosterEntry } from '../lib/types'
import { PageMasthead } from '../components/PageMasthead'
import { type ClubDist, resolveBag, scaleBagTo7Iron } from '../lib/clubs'
import { VAPID_PUBLIC_KEY, DEFAULT_NOTIF_PREFS, urlBase64ToUint8Array } from '../lib/push'
import { Bell, ChevronDown, Share } from 'lucide-react'

const CHUBBS_IMG = 'https://static.wikia.nocookie.net/sandlerverse/images/8/81/Chubbs_Peterson_in_Happy_Gilmore.webp'
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true

const card: React.CSSProperties = { background: 'var(--panel)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 18, padding: 18, marginBottom: 16 }
const inputStyle: React.CSSProperties = { padding: '11px 13px', borderRadius: 11, fontSize: 15, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--tx1)', outline: 'none' }
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: 'var(--tx3)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }

export default function WelcomePage() {
  const { user, profile, refreshProfile } = useAuth()
  const { showToast } = useToast()
  const { activeTournamentId } = useYear()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)

  const [bag, setBag] = useState<ClubDist[]>(resolveBag(profile?.club_distances))
  const [sevenIron, setSevenIron] = useState('')
  const [bagOpen, setBagOpen] = useState(false)

  const [pushStatus, setPushStatus] = useState<'unknown' | 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed'>('unknown')
  const [pushLoading, setPushLoading] = useState(false)

  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const [roster, setRoster] = useState<RosterEntry[]>([])
  const [team, setTeam] = useState<{ name: string; partner: string | null } | null>(null)
  const [finishing, setFinishing] = useState(false)

  const myClaim = roster.find(r => r.claimed_by === user?.id) ?? null
  const unclaimed = roster.filter(r => !r.claimed_by)
  const showAddToHome = isIOS() && !isStandalone()

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) { setPushStatus('unsupported'); return }
    if (Notification.permission === 'denied') { setPushStatus('denied'); return }
    navigator.serviceWorker.ready.then(async reg => {
      const sub = await reg.pushManager.getSubscription()
      setPushStatus(sub ? 'subscribed' : 'unsubscribed')
    }).catch(() => setPushStatus('unsupported'))
  }, [])

  useEffect(() => {
    if (!activeTournamentId) { setRoster([]); return }
    supabase.from('roster').select('*').eq('tournament_id', activeTournamentId).order('name')
      .then(({ data }) => setRoster((data ?? []) as RosterEntry[]))
  }, [activeTournamentId, user?.id])

  useEffect(() => {
    if (!profile?.team_id) { setTeam(null); return }
    supabase.from('teams')
      .select('name, p1_id, p1_name, p2_name, player1:profiles!teams_p1_id_fkey(name, nickname), player2:profiles!teams_p2_id_fkey(name, nickname)')
      .eq('id', profile.team_id).single()
      .then(({ data }) => {
        if (!data) { setTeam(null); return }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = data as any
        const meIsP1 = d.p1_id === user?.id
        const partner = meIsP1
          ? (d.player2 ? displayName(d.player2) : d.p2_name)
          : (d.player1 ? displayName(d.player1) : d.p1_name)
        setTeam({ name: d.name, partner: partner ?? null })
      })
  }, [profile?.team_id, user?.id])

  const applySevenIron = () => {
    const v = parseInt(sevenIron, 10)
    if (!v) return
    setBag(scaleBagTo7Iron(v))
    showToast('Bag scaled off your 7-iron 👍')
  }

  const subscribePush = async () => {
    if (!user) return
    setPushLoading(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setPushStatus('denied'); return }
      const reg = await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()
      if (existing) await existing.unsubscribe()
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) })
      await supabase.from('push_subscriptions').upsert(
        { user_id: user.id, subscription: sub.toJSON(), notification_prefs: DEFAULT_NOTIF_PREFS },
        { onConflict: 'user_id' })
      setPushStatus('subscribed')
      showToast('Notifications on! 🔔')
    } catch (e) { showToast((e as Error).message ?? 'Failed to enable notifications', 'error') }
    setPushLoading(false)
  }

  const claim = async (r: RosterEntry) => {
    if (!user) return
    const { error } = await supabase.rpc('claim_roster_entry', { p_roster_id: r.id })
    if (error) { showToast(error.message, 'error'); return }
    await refreshProfile()
    setRoster(prev => prev.map(x => x.id === r.id ? { ...x, claimed_by: user.id } : x))
    showToast(`Linked as ${r.name}!`)
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setPreview(URL.createObjectURL(file))
    setUploading(true)
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${user.id}/avatar.${ext}`
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type })
    if (upErr) { showToast(upErr.message, 'error'); setPreview(null); setUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id)
    await refreshProfile()
    setUploading(false)
    showToast('Looking good! 📸')
  }

  const finish = async () => {
    if (!user) return
    setFinishing(true)
    const { error } = await supabase.from('profiles').update({ club_distances: bag, onboarded: true }).eq('id', user.id)
    if (error) { showToast(error.message, 'error'); setFinishing(false); return }
    await refreshProfile()
    sessionStorage.removeItem('chubbs-new-reg')
    navigate('/')
  }

  const firstName = (profile?.name ?? 'there').split(' ')[0]
  const avatar = preview || profile?.avatar_url

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', padding: '24px 16px calc(40px + env(safe-area-inset-bottom, 0px))', maxWidth: 520, margin: '0 auto' }}>
      {/* Header */}
      <PageMasthead title={`Welcome, ${firstName}!`} subtitle="Let's get you set up"
        icon={<img src={CHUBBS_IMG} alt="Chubbs" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '2px solid #d4a53a', display: 'block' }} />}
        style={{ marginBottom: 16 }} />

      {/* 1 · Push notifications */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Bell size={18} color="#D4A53A" />
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--tx1)' }}>Turn on notifications</div>
          {pushStatus === 'subscribed' && <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#4ade80' }}>✓ On</span>}
        </div>
        <div style={{ fontSize: 13, color: 'var(--tx3)', lineHeight: 1.5, marginBottom: 14 }}>
          Highly recommended — lead changes, eagles, chulligans and all the live drama, straight to your phone.
        </div>
        {showAddToHome && (
          <div style={{ background: 'rgba(212,165,58,0.08)', border: '1px solid rgba(212,165,58,0.25)', borderRadius: 12, padding: '11px 13px', marginBottom: 14, fontSize: 12.5, color: 'var(--tx2)', lineHeight: 1.55 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#D4A53A', marginBottom: 4 }}>
              <Share size={13} /> Add to your Home Screen first
            </div>
            On iPhone, notifications only work once the app is installed: tap the <strong>Share</strong> button, then <strong>“Add to Home Screen,”</strong> and open the app from there.
          </div>
        )}
        {pushStatus === 'subscribed' ? null
          : pushStatus === 'denied' ? (
            <div style={{ fontSize: 12.5, color: '#f87171' }}>Blocked in your settings — enable notifications for this site, then reload.</div>
          ) : pushStatus === 'unsupported' ? (
            <div style={{ fontSize: 12.5, color: 'var(--tx4)' }}>{showAddToHome ? 'Install to the Home Screen above, then this button appears.' : 'Notifications aren’t supported in this browser.'}</div>
          ) : (
            <button onClick={subscribePush} disabled={pushLoading} className="pressable" style={{
              width: '100%', padding: '13px', borderRadius: 12, border: 'none', cursor: 'pointer',
              background: '#D4A53A', color: '#1a1206', fontWeight: 800, fontSize: 15, opacity: pushLoading ? 0.6 : 1,
            }}>{pushLoading ? 'Turning on…' : '🔔 Turn on notifications'}</button>
          )}
      </div>

      {/* 2 · Your bag */}
      <div style={card}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--tx1)', marginBottom: 8 }}>🏌️ Set your bag</div>
        <div style={{ fontSize: 13, color: 'var(--tx3)', lineHeight: 1.5, marginBottom: 14 }}>
          Tell me your <strong>7-iron carry</strong> and I'll scale your whole bag off it — that's what powers the club I recommend on the GPS screen at every distance (adjusted for wind &amp; elevation). Fine-tune any club below.
        </div>
        <label style={labelStyle}>Your 7-iron carry (yards)</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input type="number" inputMode="numeric" placeholder="e.g. 150" value={sevenIron}
            onChange={e => setSevenIron(e.target.value)} min={40} max={230} style={{ ...inputStyle, flex: 1 }} />
          <button onClick={applySevenIron} disabled={!sevenIron} className="pressable" style={{
            padding: '0 18px', borderRadius: 11, border: '1px solid var(--gold)', cursor: sevenIron ? 'pointer' : 'not-allowed',
            background: 'rgba(212,165,58,0.12)', color: '#D4A53A', fontWeight: 800, whiteSpace: 'nowrap', opacity: sevenIron ? 1 : 0.5,
          }}>Scale bag</button>
        </div>

        <button onClick={() => setBagOpen(o => !o)} style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 0', background: 'none', border: 'none', color: 'var(--tx2)', fontWeight: 700, fontSize: 13, cursor: 'pointer',
        }}>
          Customize full bag
          <ChevronDown size={16} style={{ transform: bagOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>
        {bagOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
            {bag.map((c, i) => (
              <div key={c.club} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 2px', opacity: c.enabled ? 1 : 0.4 }}>
                <button onClick={() => setBag(prev => prev.map((p, j) => j === i ? { ...p, enabled: !p.enabled } : p))}
                  aria-label={c.enabled ? 'Disable' : 'Enable'} style={{
                    width: 22, height: 22, borderRadius: 6, flexShrink: 0, cursor: 'pointer',
                    border: `1.5px solid ${c.enabled ? 'var(--gold)' : 'var(--tx4)'}`,
                    background: c.enabled ? 'var(--gold)' : 'transparent', color: '#1a1206', fontWeight: 900, fontSize: 12, lineHeight: 1,
                  }}>{c.enabled ? '✓' : ''}</button>
                <span style={{ width: 40, fontWeight: 800, fontSize: 14 }}>{c.club}</span>
                <input type="number" inputMode="numeric" value={c.carry}
                  onChange={e => setBag(prev => prev.map((p, j) => j === i ? { ...p, carry: parseInt(e.target.value, 10) || 0 } : p))}
                  min={0} max={400} style={{ ...inputStyle, flex: 1, textAlign: 'right', padding: '7px 11px', fontSize: 14 }} />
                <span style={{ width: 16, fontSize: 12, color: 'var(--tx4)' }}>y</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2b · Profile picture (optional) — always available */}
      <div style={card}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--tx1)', marginBottom: 8 }}>
          📸 Profile picture <span style={{ fontWeight: 500, color: 'var(--tx4)', fontSize: 13 }}>· optional</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={() => fileRef.current?.click()} className="pressable" aria-label="Upload profile picture" style={{
            width: 64, height: 64, borderRadius: '50%', flexShrink: 0, border: '2px solid #D4A53A', overflow: 'hidden',
            background: 'rgba(212,165,58,0.12)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {avatar ? <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 24 }}>{uploading ? '…' : '📷'}</span>}
          </button>
          <div style={{ fontSize: 13, color: 'var(--tx3)', lineHeight: 1.5 }}>
            {avatar ? 'Looking good! Tap to change it.' : "Add a photo so your team and the leaderboard know it's you — it shows as your account circle. You can skip and add it later in Account."}
          </div>
        </div>
      </div>

      {/* 3 · You're all set */}
      <div style={card}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--tx1)', marginBottom: 12 }}>You're all set</div>

        {myClaim || team ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <button onClick={() => fileRef.current?.click()} className="pressable" style={{
              width: 56, height: 56, borderRadius: '50%', flexShrink: 0, border: '2px solid #D4A53A', overflow: 'hidden',
              background: 'rgba(212,165,58,0.12)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {avatar ? <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: 20 }}>{uploading ? '…' : '📷'}</span>}
            </button>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--tx1)' }}>
                {profile?.name}{profile?.handicap != null ? <span style={{ fontWeight: 500, color: 'var(--tx3)', fontSize: 13 }}> · HCP {profile.handicap}</span> : null}
              </div>
              <div style={{ fontSize: 13, color: 'var(--tx3)', marginTop: 1 }}>
                {team ? <>Team <strong style={{ color: '#D4A53A' }}>{team.name}</strong>{team.partner ? ` — with ${team.partner}` : ''}</> : 'Tap the photo to add a profile picture'}
              </div>
            </div>
          </div>
        ) : unclaimed.length > 0 ? (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: 'var(--tx2)', marginBottom: 8 }}>👋 Which player are you? Tap your name to link your account and team.</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {unclaimed.map(r => (
                <button key={r.id} onClick={() => claim(r)} className="pressable" style={{
                  padding: '9px 14px', borderRadius: 999, cursor: 'pointer', fontWeight: 700, fontSize: 13,
                  border: '1px solid var(--gold-25)', background: 'rgba(212,165,58,0.08)', color: 'var(--tx1)',
                }}>{r.name}</button>
              ))}
            </div>
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()} className="pressable" style={{
            display: 'flex', alignItems: 'center', gap: 12, width: '100%', marginBottom: 14, padding: 0,
            background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
          }}>
            <span style={{ width: 56, height: 56, borderRadius: '50%', flexShrink: 0, border: '2px solid #D4A53A', overflow: 'hidden', background: 'rgba(212,165,58,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {avatar ? <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 20 }}>{uploading ? '…' : '📷'}</span>}
            </span>
            <span style={{ fontSize: 13, color: 'var(--tx3)' }}>Add a profile picture (optional)</span>
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />

        <div style={{ fontSize: 12, color: 'var(--tx4)', lineHeight: 1.5 }}>
          📍 The GPS caddie needs your location — say “Allow” when it asks on your first hole.
        </div>
      </div>

      <button onClick={finish} disabled={finishing} className="btn-gold pressable" style={{ width: '100%', justifyContent: 'center', fontSize: 16, padding: '15px' }}>
        {finishing ? 'Finishing…' : "Let's play ⛳"}
      </button>
    </div>
  )
}
