import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useYear } from '../context/YearContext'

interface FinalStanding {
  teamName: string
  p1Name: string | null
  p2Name: string | null
  toPar: number
  thru: number
  gross: number
  place?: number          // explicit finishing place (e.g. tiebreak-resolved); else derived from toPar
  noScore?: boolean        // team never posted a score — always sits last
}

interface ResultEntry {
  id: string
  category: string
  team_name: string | null
  player1_name: string | null
  player2_name: string | null
  score_to_par: number | null
  detail: string | null
}

interface TournamentRecord {
  id: string
  year: number
  name: string
  date: string | null
  course: string | null
  notes: string | null
  final_standings: FinalStanding[] | null
  results: ResultEntry[]
}

// Augusta scoreboard palette — matches the live Leaderboard's Masters styling.
const AUGUSTA = '#0a5c39'
const AUGUSTA_DEEP = '#063a25'
const CREAM = '#efe8d2'
const GOLD_SOFT = '#e7c877'
const MASTERS_RED = '#e0402f'

function fmtToPar(n: number | null) {
  if (n == null) return null
  return n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`
}

function awardPlayers(r: ResultEntry) {
  if (r.player1_name && r.player2_name) return `${r.player1_name} & ${r.player2_name}`
  return r.player1_name ?? r.player2_name ?? r.team_name ?? '—'
}

export default function HallOfFame() {
  const navigate = useNavigate()
  const { setViewingTournamentId } = useYear()
  const [records, setRecords] = useState<TournamentRecord[]>([])
  const [loading, setLoading] = useState(true)

  // Open a full read-only snapshot of a past tournament's app.
  const openSnapshot = (id: string) => {
    setViewingTournamentId(id)
    navigate('/')
    window.scrollTo({ top: 0 })
  }

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const { data: tournaments } = await supabase
      .from('tournaments')
      .select('*')
      .eq('status', 'completed')
      .is('deleted_at', null)
      .order('year', { ascending: false })

    if (!tournaments?.length) { setLoading(false); return }

    const ids = tournaments.map(t => t.id)
    const { data: results } = await supabase
      .from('tournament_results')
      .select('*')
      .in('tournament_id', ids)

    const byT: Record<string, ResultEntry[]> = {}
    for (const r of results ?? []) {
      if (!byT[r.tournament_id]) byT[r.tournament_id] = []
      byT[r.tournament_id].push(r)
    }

    const recs: TournamentRecord[] = tournaments.map(t => ({
      id: t.id, year: t.year, name: t.name, date: t.date,
      course: t.course, notes: t.notes,
      final_standings: t.final_standings ?? null,
      results: byT[t.id] ?? [],
    }))

    setRecords(recs)
    setLoading(false)
  }

  const cat = (results: ResultEntry[], category: string) =>
    results.find(r => r.category === category) ?? null

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>

      {/* Header */}
      <div className="animate-fadeUp" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <span className="animate-float" style={{ fontSize: 28 }}>🏆</span>
          <h1 className="gold-text" style={{ fontFamily: 'Bebas Neue', fontSize: 36, letterSpacing: 4, margin: 0 }}>
            Hall of Fame
          </h1>
        </div>
        <p className="section-label" style={{ marginTop: 4 }}>
          The Chubbs Memorial — Tournament History
        </p>
      </div>

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="skeleton" style={{ width: 76, height: 36, borderRadius: 999 }} />
            <div className="skeleton" style={{ width: 76, height: 36, borderRadius: 999 }} />
          </div>
          <div className="skeleton skeleton-card" style={{ height: 120 }} />
          <div className="skeleton skeleton-card" style={{ height: 220 }} />
        </div>
      )}

      {!loading && records.length === 0 && (
        <div className="glass" style={{ padding: '48px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>⛳</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--tx2)', marginBottom: 8 }}>
            No completed tournaments yet
          </div>
          <div style={{ fontSize: 13, color: 'var(--tx4)', lineHeight: 1.6 }}>
            Tournament results appear here after an admin archives a completed year.
          </div>
        </div>
      )}

      {records.length > 0 && (
        <>
          {/* ── Tournament tiles — one per completed year ─────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {records.map(selected => {
            const champion = cat(selected.results, 'champion')
            const runnerUp = cat(selected.results, 'runner_up')
            const third    = cat(selected.results, 'third')
            const jackass  = cat(selected.results, 'jackass')
            const ctp      = cat(selected.results, 'ctp')
            const ld       = cat(selected.results, 'ld')
            // Derive par from any scored row (gross = par + toPar), for the masthead.
            const scoredForPar = (selected.final_standings ?? []).filter(s => !s.noScore)
            const parNum = scoredForPar.length ? scoredForPar[0].gross - scoredForPar[0].toPar : null

            return (
              <div key={selected.id} className="glass animate-fadeUp" style={{ overflow: 'hidden', border: '1px solid var(--bdr)' }}>
                {/* Augusta masthead */}
                <div style={{
                  padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                  background: `linear-gradient(180deg, ${AUGUSTA}, ${AUGUSTA_DEEP})`,
                  borderBottom: '2px solid rgba(240,230,200,0.18)',
                }}>
                  <svg width="42" height="42" viewBox="0 0 100 100" aria-hidden="true" style={{ flexShrink: 0 }}>
                    <circle cx="50" cy="50" r="48" fill={AUGUSTA_DEEP} stroke="#d4a53a" strokeWidth="3" />
                    <path d="M40 74 L40 28 L69 35 L40 42" fill={MASTERS_RED} />
                    <rect x="37.5" y="26" width="3" height="48" rx="1.5" fill={CREAM} />
                    <circle cx="39" cy="76" r="3.2" fill="#d4a53a" />
                  </svg>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontFamily: 'Bebas Neue', fontSize: 32, color: CREAM, letterSpacing: 3, lineHeight: 1 }}>
                      {selected.year}
                    </div>
                    <div style={{ fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: GOLD_SOFT, marginTop: 5 }}>
                      {selected.course || 'The Chubbs Memorial'}{parNum ? <> · Par <span style={{ fontVariantNumeric: 'tabular-nums' }}>{parNum}</span></> : null}
                      {selected.date && <> · {new Date(selected.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>}
                    </div>
                    {selected.notes && <div style={{ fontSize: 11.5, color: 'rgba(240,230,200,0.62)', marginTop: 3, fontStyle: 'italic' }}>{selected.notes}</div>}
                  </div>
                  <div style={{ marginLeft: 'auto', flexShrink: 0, textAlign: 'right', color: CREAM }}>
                    <div style={{ fontSize: 10, letterSpacing: 2, color: GOLD_SOFT }}>🔒</div>
                    <div style={{ fontFamily: 'Bebas Neue', fontSize: 16, letterSpacing: 2 }}>FINAL</div>
                  </div>
                </div>

                <div style={{ padding: '22px 22px' }}>

                  {/* Full standings (from final_standings snapshot) — PGA-style: tied teams share a place (T3, T3…) */}
                  {selected.final_standings && selected.final_standings.length > 0 && (() => {
                    const standings = selected.final_standings!
                    const scored = standings.filter(s => !s.noScore)
                    const placeOf = (s: FinalStanding) => s.place ?? (1 + scored.filter(x => x.toPar < s.toPar).length)
                    const counts: Record<number, number> = {}
                    scored.forEach(s => { const p = placeOf(s); counts[p] = (counts[p] ?? 0) + 1 })
                    return (
                    <div style={{ marginBottom: 24, border: '1px solid var(--bdr)', borderRadius: 12, overflow: 'hidden' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '38px 1fr 62px', gap: 8, padding: '8px 14px', borderBottom: '1px solid var(--bdr)', fontSize: 9.5, fontWeight: 800, letterSpacing: 1.3, textTransform: 'uppercase', color: 'var(--tx4)' }}>
                        <span>Pos</span><span>Team</span><span style={{ textAlign: 'center' }}>Total</span>
                      </div>
                      {standings.map((s, i) => {
                        const place = s.noScore ? null : placeOf(s)
                        const shared = place != null && counts[place] > 1
                        const top = place != null && place <= 3
                        const badge = s.noScore ? 'NS'
                          : (!shared && place === 1) ? '🏆'
                          : (!shared && place === 2) ? '🥈'
                          : (!shared && place === 3) ? '🥉'
                          : `${shared ? 'T' : ''}${place}`
                        const totalColor = s.toPar < 0 ? MASTERS_RED : s.toPar === 0 ? 'var(--gold)' : 'var(--tx2)'
                        return (
                        <div key={i} style={{
                          display: 'grid', gridTemplateColumns: '38px 1fr 62px', gap: 8, alignItems: 'center',
                          padding: '11px 14px',
                          borderBottom: i < standings.length - 1 ? '1px solid var(--bdr)' : 'none',
                          background: place === 1 ? 'linear-gradient(90deg, var(--gold-08), transparent 62%)' : undefined,
                          boxShadow: place === 1 ? 'inset 3px 0 0 var(--gold)' : undefined,
                          opacity: s.noScore ? 0.6 : 1,
                        }}>
                          <span style={{ textAlign: 'center', fontSize: top ? 16 : 14, color: place === 1 ? 'var(--gold)' : 'var(--tx4)', fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontFamily: top && !shared ? undefined : 'Bebas Neue' }}>
                            {badge}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div className={place === 1 ? 'text-shimmer' : undefined} style={{ fontWeight: 700, fontSize: 14.5, color: place === 1 ? 'var(--gold)' : 'var(--tx1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {s.teamName}
                            </div>
                            {(s.p1Name || s.p2Name) && (
                              <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {[s.p1Name, s.p2Name].filter(Boolean).join(' & ')}
                              </div>
                            )}
                          </div>
                          <span style={{ textAlign: 'center' }}>
                            {s.noScore ? (
                              <span style={{ fontSize: 11, color: 'var(--tx4)', fontStyle: 'italic' }}>NS</span>
                            ) : (
                              <span style={{ fontFamily: 'Bebas Neue', fontSize: 19, color: totalColor, fontVariantNumeric: 'tabular-nums' }}>{fmtToPar(s.toPar)}</span>
                            )}
                          </span>
                        </div>
                        )
                      })}
                    </div>
                    )
                  })()}

                  {/* Top 3 from tournament_results (fallback if no final_standings) */}
                  {!selected.final_standings && (champion || runnerUp || third) && (
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: 'var(--tx4)', textTransform: 'uppercase', marginBottom: 12 }}>Final Standings</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {([['🏆', champion], ['🥈', runnerUp], ['🥉', third]] as [string, ResultEntry | null][]).filter(([, r]) => r).map(([icon, r]) => (
                          <div key={(r as ResultEntry).id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: icon === '🏆' ? 'rgba(212,165,58,0.07)' : 'var(--surf2)', border: icon === '🏆' ? '1px solid rgba(212,165,58,0.2)' : '1px solid var(--bdr)' }}>
                            <span style={{ fontSize: 18 }}>{icon}</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: 14, color: icon === '🏆' ? '#D4A53A' : 'var(--tx1)' }}>{(r as ResultEntry).team_name ?? awardPlayers(r as ResultEntry)}</div>
                              {(r as ResultEntry).team_name && ((r as ResultEntry).player1_name || (r as ResultEntry).player2_name) && <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 1 }}>{awardPlayers(r as ResultEntry)}</div>}
                            </div>
                            {(r as ResultEntry).score_to_par != null && <div style={{ fontFamily: 'Bebas Neue', fontSize: 17, color: (r as ResultEntry).score_to_par! < 0 ? '#34d399' : (r as ResultEntry).score_to_par! > 0 ? '#f87171' : '#D4A53A' }}>{fmtToPar((r as ResultEntry).score_to_par)}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Awards */}
                  {(jackass || ctp || ld) && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: 'var(--tx4)', textTransform: 'uppercase', marginBottom: 10 }}>Awards</div>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {jackass && (
                          <div style={{ flex: '1 1 180px', padding: '12px 16px', borderRadius: 12, background: 'var(--gold-08)', border: '1px solid rgba(212,165,58,0.18)', boxShadow: 'var(--elev-1)' }}>
                            <div className="section-label" style={{ fontSize: 10, marginBottom: 4 }}>🤠 Jackass of the Day</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gold)' }}>{jackass.player1_name ?? '—'}</div>
                            {jackass.detail && <div style={{ fontSize: 11, color: 'var(--tx4)', marginTop: 2 }}>{jackass.detail}</div>}
                          </div>
                        )}
                        {ctp && (
                          <div className="glass-flat" style={{ flex: '1 1 180px', padding: '12px 16px' }}>
                            <div className="section-label" style={{ fontSize: 10, marginBottom: 4 }}>🎯 Closest to Pin</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx1)' }}>{ctp.player1_name ?? '—'}</div>
                            {ctp.detail && <div style={{ fontSize: 11, color: 'var(--tx4)', marginTop: 2 }}>{ctp.detail}</div>}
                          </div>
                        )}
                        {ld && (
                          <div className="glass-flat" style={{ flex: '1 1 180px', padding: '12px 16px' }}>
                            <div className="section-label" style={{ fontSize: 10, marginBottom: 4 }}>💥 Longest Drive</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx1)' }}>{ld.player1_name ?? '—'}</div>
                            {ld.detail && <div style={{ fontSize: 11, color: 'var(--tx4)', marginTop: 2 }}>{ld.detail}</div>}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {selected.results.length === 0 && !selected.final_standings && (
                    <div style={{ textAlign: 'center', color: 'var(--tx4)', fontSize: 13, padding: '16px 0' }}>
                      No results recorded for this year
                    </div>
                  )}
                </div>

                {/* Open the archived app for this tournament */}
                <button
                  onClick={() => openSnapshot(selected.id)}
                  className="pressable"
                  style={{
                    width: '100%', border: 'none', cursor: 'pointer',
                    borderTop: '1px solid rgba(212,165,58,0.18)',
                    padding: '14px 16px',
                    background: 'linear-gradient(180deg, rgba(212,165,58,0.14), rgba(212,165,58,0.06))',
                    color: '#D4A53A', fontWeight: 800, fontSize: 14,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  ⛳ Open the {selected.year} tournament →
                </button>
              </div>
            )
          })}
          </div>
        </>
      )}
    </div>
  )
}
