import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { type Shot, clubStats, PUTT_TRACKING } from '../lib/shots'
import type { Player } from '../lib/types'

// Augusta scoreboard palette — matches the rest of the Teams screen.
const AUGUSTA = '#0a5c39'
const AUGUSTA_DEEP = '#063a25'
const CREAM = '#efe8d2'
const GOLD_SOFT = '#e7c877'
const MASTHEAD = `linear-gradient(180deg, ${AUGUSTA}, ${AUGUSTA_DEEP})`

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const stddev = (xs: number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map(x => (x - m) ** 2))) }

// All stats here are TEAM stats — every tracked shot from either partner counts.
export function ShotStats({ teamId, players }: { teamId?: string | null; players?: Player[] }) {
  const { profile } = useAuth()
  const [shots, setShots] = useState<Shot[]>([])
  const [putts, setPutts] = useState<(number | null)[]>([])
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

  useEffect(() => {
    if (!teamId) { setPutts([]); return }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase as any).from('scores').select('putts').eq('team_id', teamId)
      .then(({ data }: { data: { putts: number | null }[] | null }) => setPutts((data ?? []).map(r => r.putts)))
  }, [teamId])

  const firstName = (id: string | null) => {
    if (!id) return ''
    const p = players?.find(x => x.id === id)
    return p ? (p.nickname?.trim() || p.name).split(/\s+/)[0] : ''
  }

  const stats = clubStats(shots)
  const history = showAll ? shots : shots.slice(0, 8)

  // ── Team driving ──
  const driveShots = shots.filter(s => s.club === 'Dr' && (s.distance_yds ?? 0) > 0)
  const driveDists = driveShots.map(s => s.distance_yds as number)
  const avgDrive = driveDists.length ? Math.round(mean(driveDists)) : null
  const bigDog = driveShots.reduce<Shot | null>((best, s) => (s.distance_yds! > (best?.distance_yds ?? -1) ? s : best), null)
  const drivesOff = driveShots.filter(s => s.offline_yds != null)
  const fairwayPct = drivesOff.length ? Math.round((drivesOff.filter(s => Math.abs(s.offline_yds!) <= 15).length / drivesOff.length) * 100) : null
  const consistency = driveDists.length >= 2 ? Math.round(stddev(driveDists)) : null
  const bombs = driveDists.filter(d => d >= 250).length

  // ── Team accuracy ──
  const offAll = shots.filter(s => s.club !== 'Putt' && s.offline_yds != null).map(s => s.offline_yds as number)
  const bias = offAll.length ? Math.round(mean(offAll)) : null
  const rankable = stats.filter(s => s.count >= 2)
  const straightest = rankable.length ? rankable.reduce((a, b) => (Math.abs(a.avgOffline) <= Math.abs(b.avgOffline) ? a : b)) : null
  const wildest = rankable.length ? rankable.reduce((a, b) => (Math.abs(a.avgOffline) >= Math.abs(b.avgOffline) ? a : b)) : null

  // ── Team putting (from the scorecard) ──
  const puttVals = putts.filter((p): p is number => p != null)
  const puttsPerHole = puttVals.length ? (puttVals.reduce((a, b) => a + b, 0) / puttVals.length).toFixed(1) : null
  const threePutts = puttVals.filter(p => p >= 3).length
  const puttLenYds = shots.filter(s => s.club === 'Putt' && (s.distance_yds ?? 0) > 0).map(s => s.distance_yds as number)
  const avgPuttFt = puttLenYds.length ? Math.round(mean(puttLenYds) * 3) : null

  const maxBagAvg = Math.max(1, ...stats.map(s => s.avg))

  return (
    <section className="glass animate-fadeUp" style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
      {/* Masthead */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', background: MASTHEAD, borderBottom: '2px solid rgba(240,230,200,0.18)' }}>
        <svg width="30" height="30" viewBox="0 0 100 100" aria-hidden="true" style={{ flexShrink: 0 }}>
          <circle cx="50" cy="50" r="48" fill={AUGUSTA_DEEP} stroke="#d4a53a" strokeWidth="3.5" />
          <path d="M40 74 L40 28 L69 35 L40 42" fill="#e0402f" />
          <rect x="37.5" y="26" width="3" height="48" rx="1.5" fill={CREAM} />
        </svg>
        <div style={{ fontFamily: 'Bebas Neue', fontSize: 22, letterSpacing: 2, color: CREAM, lineHeight: 1 }}>Team Shot Stats</div>
        {shots.length > 0 && <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', color: GOLD_SOFT }}>{shots.length} shots</span>}
      </div>

      <div style={{ padding: 16 }}>
        {loading ? (
          <div style={{ color: 'var(--tx4)', fontSize: 13 }}>Loading…</div>
        ) : shots.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--tx3)', lineHeight: 1.55 }}>
            No shots tracked yet. On the GPS screen, tap <b>◉ Track Shot</b> under the club tile, pick your club, hit, then walk to your ball and tap <b>Mark ball</b>. Every partner's shots feed the same team stats.
          </div>
        ) : (
          <>
            {/* Big Dog — the team's longest drive */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 14, marginBottom: 10,
              background: 'linear-gradient(120deg, rgba(212,165,58,0.14), rgba(212,165,58,0.03) 60%)',
              border: '1px solid var(--gold-25)',
            }}>
              <span style={{ fontSize: 30, flexShrink: 0 }}>💥</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--gold-dim)' }}>Big Dog · Longest Drive</div>
                <div style={{ fontSize: 13, color: 'var(--tx2)', marginTop: 2 }}>
                  {bigDog ? <>{firstName(bigDog.player_id) || 'Someone'}{bigDog.hole ? ` · Hole ${bigDog.hole}` : ''}</> : 'No drives tracked'}
                </div>
              </div>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: 34, color: 'var(--gold)', letterSpacing: 1, lineHeight: 1, flexShrink: 0 }}>
                {bigDog?.distance_yds ?? '—'}<span style={{ fontSize: 16 }}>y</span>
              </div>
            </div>

            {/* Driving row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 8 }}>
              <Tile label="Avg Drive" value={avgDrive != null ? `${avgDrive}y` : '—'} />
              <Tile label="Fairways" value={fairwayPct != null ? `${fairwayPct}%` : '—'} sub="in play" />
              <Tile label="Spread" value={consistency != null ? `±${consistency}y` : '—'} sub="driver" />
            </div>
            {/* Putting row */}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${PUTT_TRACKING ? 4 : 3}, 1fr)`, gap: 8, marginBottom: 18 }}>
              <Tile label="Bombs" value={String(bombs)} sub="250y+" />
              <Tile label="Putts / Hole" value={puttsPerHole ?? '—'} />
              <Tile label="3-Putts" value={String(threePutts)} />
              {PUTT_TRACKING && <Tile label="Avg Putt" value={avgPuttFt != null ? `${avgPuttFt}ft` : '—'} />}
            </div>

            {/* The Bag — club gapping */}
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: 'var(--tx4)', marginBottom: 10 }}>🎒 THE BAG</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 18 }}>
              {stats.map(s => (
                <div key={s.club} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 30, fontFamily: 'Bebas Neue', fontSize: 20, color: GOLD_SOFT, flexShrink: 0 }}>{s.club}</span>
                  <div style={{ flex: 1, height: 22, borderRadius: 7, background: 'var(--surf2)', overflow: 'hidden', position: 'relative' }}>
                    <div style={{ position: 'absolute', inset: 0, width: `${(s.avg / maxBagAvg) * 100}%`, background: `linear-gradient(90deg, ${AUGUSTA}, #0d6a43)`, borderRadius: 7, transition: 'width 0.6s ease' }} />
                    <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 12, fontWeight: 800, color: CREAM, fontVariantNumeric: 'tabular-nums' }}>{s.avg}y</span>
                    <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--tx3)' }}>{s.count} shot{s.count === 1 ? '' : 's'}</span>
                  </div>
                  <span style={{ width: 62, textAlign: 'right', fontSize: 10.5, fontWeight: 700, flexShrink: 0, color: s.tendency === 'straight' ? '#4ade80' : 'var(--gold)' }}>
                    {s.tendency === 'straight' ? '⌂ straight' : `${Math.abs(s.avgOffline)}y ${s.tendency === 'right' ? '▸' : '◂'}`}
                  </span>
                </div>
              ))}
            </div>

            {/* Accuracy */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 130, padding: '11px 14px', borderRadius: 12, background: 'var(--surf)', border: '1px solid var(--bdr)' }}>
                <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--tx4)' }}>Team Miss Bias</div>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: 22, letterSpacing: 0.5, color: bias == null || Math.abs(bias) < 6 ? '#4ade80' : 'var(--gold)', marginTop: 3 }}>
                  {bias == null ? '—' : Math.abs(bias) < 6 ? 'Dead straight' : `${Math.abs(bias)}y ${bias > 0 ? 'right' : 'left'}`}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 130, padding: '11px 14px', borderRadius: 12, background: 'var(--surf)', border: '1px solid var(--bdr)' }}>
                <div style={{ fontSize: 11, color: 'var(--tx3)' }}>🎯 Most reliable <b style={{ color: 'var(--tx1)' }}>{straightest?.club ?? '—'}</b></div>
                <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 5 }}>🌪️ Wildest <b style={{ color: 'var(--tx1)' }}>{wildest?.club ?? '—'}</b>{wildest && wildest.tendency !== 'straight' ? ` (${Math.abs(wildest.avgOffline)}y ${wildest.tendency})` : ''}</div>
              </div>
            </div>

            {/* Recent shots */}
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: 'var(--tx4)', marginBottom: 8 }}>RECENT SHOTS</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {history.map(sh => (
                <div key={sh.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 2px', borderBottom: '1px solid var(--bdr)', fontSize: 13 }}>
                  <span style={{ width: 34, fontWeight: 800, color: GOLD_SOFT }}>{sh.club ?? '—'}</span>
                  <span style={{ width: 50, color: 'var(--tx1)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {sh.club === 'Putt' ? (sh.distance_yds != null ? `${Math.round(sh.distance_yds * 3)}ft` : '—') : `${sh.distance_yds ?? '—'}y`}
                  </span>
                  <span style={{ flex: 1, color: 'var(--tx3)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {firstName(sh.player_id) && <b style={{ color: 'var(--tx2)', fontWeight: 700 }}>{firstName(sh.player_id)}</b>}
                    {sh.club === 'Putt' ? ' putt' : sh.offline_yds != null && Math.abs(sh.offline_yds) >= 3 ? ` · ${Math.abs(sh.offline_yds)}y ${sh.offline_yds > 0 ? 'right' : 'left'}` : ' · on line'}
                  </span>
                  <span style={{ color: 'var(--tx4)', fontSize: 11, flexShrink: 0 }}>{sh.hole ? `H${sh.hole}` : ''}</span>
                </div>
              ))}
            </div>
            {shots.length > 8 && (
              <button onClick={() => setShowAll(v => !v)} style={{ marginTop: 12, background: 'none', border: 'none', color: 'var(--gold)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                {showAll ? 'Show less' : `Show all ${shots.length}`}
              </button>
            )}
          </>
        )}
      </div>
    </section>
  )
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '12px 6px', borderRadius: 14, background: 'var(--surf)', border: '1px solid var(--bdr)' }}>
      <div style={{ fontFamily: 'Bebas Neue', fontSize: 26, lineHeight: 1, color: 'var(--gold)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.6, color: 'var(--tx4)', textTransform: 'uppercase', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 8.5, color: 'var(--tx5)', marginTop: 1 }}>{sub}</div>}
    </div>
  )
}
