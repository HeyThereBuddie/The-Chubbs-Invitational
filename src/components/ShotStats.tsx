import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { type Shot, clubStats } from '../lib/shots'

export function ShotStats({ teamId }: { teamId?: string | null }) {
  const { profile } = useAuth()
  const [shots, setShots] = useState<Shot[]>([])
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    setLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase as any).from('shots').select('*').order('created_at', { ascending: false }).limit(300)
    if (teamId) q = q.eq('team_id', teamId)
    else if (profile?.id) q = q.eq('player_id', profile.id)
    else { setShots([]); setLoading(false); return }
    q.then(({ data }: { data: Shot[] | null }) => { setShots(data ?? []); setLoading(false) })
  }, [teamId, profile?.id])

  const stats = clubStats(shots)
  const history = showAll ? shots : shots.slice(0, 8)

  return (
    <section className="animate-fadeUp delay-200" style={{ marginBottom: 24 }}>
      <div className="section-label" style={{ margin: '0 4px 8px' }}>Shot Stats &amp; History</div>
      <div className="glass" style={{ padding: 20 }}>
        {loading ? (
          <div style={{ color: 'var(--tx4)', fontSize: 13 }}>Loading…</div>
        ) : shots.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--tx3)', lineHeight: 1.5 }}>
            No shots tracked yet. On the GPS screen, tap <b>◉ Track Shot</b> under the club tile, pick your club, hit, then walk to your ball and tap <b>Mark ball</b>.
          </div>
        ) : (
          <>
            {/* Per-club stats */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
              {stats.map(s => (
                <div key={s.club} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', borderRadius: 12,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                }}>
                  <span style={{ width: 42, fontFamily: 'Bebas Neue', fontSize: 22, color: '#e8c766' }}>{s.club}</span>
                  <div style={{ flex: 1, display: 'flex', gap: 16 }}>
                    <Stat label="Avg" value={`${s.avg}y`} />
                    <Stat label="Long" value={`${s.longest}y`} />
                    <Stat label="Shots" value={String(s.count)} />
                    <Stat label="Miss" value={s.tendency === 'straight' ? 'Straight' : `${Math.abs(s.avgOffline)}y ${s.tendency}`} color={s.tendency === 'straight' ? '#4ade80' : '#e8c766'} />
                  </div>
                </div>
              ))}
            </div>

            {/* History */}
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: 'var(--tx4)', marginBottom: 8 }}>RECENT SHOTS</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {history.map(sh => (
                <div key={sh.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 2px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 13 }}>
                  <span style={{ width: 40, fontWeight: 800, color: '#e8c766' }}>{sh.club ?? '—'}</span>
                  <span style={{ width: 52, color: 'var(--tx1)', fontWeight: 700 }}>{sh.distance_yds ?? '—'}y</span>
                  <span style={{ flex: 1, color: 'var(--tx3)' }}>
                    {sh.offline_yds != null && Math.abs(sh.offline_yds) >= 3 ? `${Math.abs(sh.offline_yds)}y ${sh.offline_yds > 0 ? 'right' : 'left'}` : 'on line'}
                  </span>
                  <span style={{ color: 'var(--tx4)', fontSize: 11 }}>{sh.hole ? `H${sh.hole}` : ''}</span>
                </div>
              ))}
            </div>
            {shots.length > 8 && (
              <button onClick={() => setShowAll(v => !v)} style={{
                marginTop: 12, background: 'none', border: 'none', color: 'var(--gold)', fontWeight: 700, fontSize: 13, cursor: 'pointer',
              }}>{showAll ? 'Show less' : `Show all ${shots.length}`}</button>
            )}
          </>
        )}
      </div>
    </section>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
      <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, color: 'var(--tx4)', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: color ?? 'var(--tx1)' }}>{value}</span>
    </div>
  )
}
