import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface FinalStanding {
  teamName: string
  p1Name: string | null
  p2Name: string | null
  toPar: number
  thru: number
  gross: number
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

function fmtToPar(n: number | null) {
  if (n == null) return null
  return n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`
}

function awardPlayers(r: ResultEntry) {
  if (r.player1_name && r.player2_name) return `${r.player1_name} & ${r.player2_name}`
  return r.player1_name ?? r.player2_name ?? r.team_name ?? '—'
}

export default function HallOfFame() {
  const [records, setRecords] = useState<TournamentRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

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
    setSelectedId(recs[0]?.id ?? null)
    setLoading(false)
  }

  const selected = records.find(r => r.id === selectedId) ?? null

  const cat = (results: ResultEntry[], category: string) =>
    results.find(r => r.category === category) ?? null

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <span style={{ fontSize: 28 }}>🏆</span>
          <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 36, color: '#FCB514', letterSpacing: 4, margin: 0 }}>
            Hall of Fame
          </h1>
        </div>
        <p style={{ color: 'var(--tx3)', fontSize: 13, marginTop: 4 }}>
          The Chubbs Memorial — Tournament History
        </p>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', color: 'var(--tx4)', padding: 60, fontSize: 14 }}>
          Loading history…
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
          {/* ── Year Toggle ───────────────────────────────────────── */}
          <div style={{
            display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 22,
            padding: '12px 16px', borderRadius: 12,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid var(--bdr)',
          }}>
            {records.map(r => (
              <button
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                style={{
                  fontFamily: 'Bebas Neue', fontSize: 18, letterSpacing: 2,
                  padding: '6px 18px', borderRadius: 999, border: 'none', cursor: 'pointer',
                  transition: 'all 0.15s',
                  background: selectedId === r.id ? '#FCB514' : 'rgba(255,255,255,0.05)',
                  color: selectedId === r.id ? '#0a0800' : 'var(--tx2)',
                  boxShadow: selectedId === r.id ? '0 0 12px rgba(252,181,20,0.35)' : 'none',
                }}
              >
                {r.year}
              </button>
            ))}
          </div>

          {/* ── Selected Year Detail ──────────────────────────────── */}
          {selected && (() => {
            const champion = cat(selected.results, 'champion')
            const runnerUp = cat(selected.results, 'runner_up')
            const third    = cat(selected.results, 'third')
            const jackass  = cat(selected.results, 'jackass')
            const ctp      = cat(selected.results, 'ctp')
            const ld       = cat(selected.results, 'ld')

            return (
              <div className="glass animate-fadeUp" style={{ overflow: 'hidden', border: '1px solid rgba(252,181,20,0.3)' }}>
                {/* Year banner */}
                <div style={{
                  padding: '16px 22px',
                  background: 'linear-gradient(135deg, rgba(252,181,20,0.1) 0%, rgba(252,181,20,0.03) 100%)',
                  borderBottom: '1px solid rgba(252,181,20,0.12)',
                  display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                }}>
                  <div style={{ fontFamily: 'Bebas Neue', fontSize: 36, color: '#FCB514', letterSpacing: 4, lineHeight: 1 }}>
                    {selected.year}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 999, background: 'var(--surf2)', color: 'var(--tx3)', letterSpacing: 1, textTransform: 'uppercase' }}>
                        🔒 Locked
                      </div>
                      {selected.course && <div style={{ fontSize: 12, color: 'var(--tx3)' }}>⛳ {selected.course}</div>}
                      {selected.date && <div style={{ fontSize: 12, color: 'var(--tx3)' }}>📅 {new Date(selected.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>}
                    </div>
                    {selected.notes && <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 4, fontStyle: 'italic' }}>{selected.notes}</div>}
                  </div>
                </div>

                <div style={{ padding: '22px 22px' }}>

                  {/* Full standings (from final_standings snapshot) */}
                  {selected.final_standings && selected.final_standings.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: 'var(--tx4)', textTransform: 'uppercase', marginBottom: 12 }}>
                        Final Standings
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {selected.final_standings.map((s, i) => (
                          <div key={i} style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '9px 14px', borderRadius: 10,
                            background: i === 0 ? 'rgba(252,181,20,0.07)' : i < 3 ? 'rgba(255,255,255,0.03)' : 'transparent',
                            border: i === 0 ? '1px solid rgba(252,181,20,0.2)' : i < 3 ? '1px solid rgba(255,255,255,0.05)' : '1px solid transparent',
                          }}>
                            <span style={{ width: 26, textAlign: 'center', flexShrink: 0, fontSize: i < 3 ? 16 : 13, color: i === 0 ? '#FCB514' : 'var(--tx4)', fontWeight: 700 }}>
                              {i === 0 ? '🏆' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ fontWeight: 700, fontSize: 14, color: i === 0 ? '#FCB514' : 'var(--tx2)' }}>
                                {s.teamName}
                              </span>
                              {(s.p1Name || s.p2Name) && (
                                <span style={{ fontSize: 12, color: 'var(--tx3)', marginLeft: 8 }}>
                                  {[s.p1Name, s.p2Name].filter(Boolean).join(' & ')}
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                              <span style={{ fontFamily: 'Bebas Neue', fontSize: 16, color: s.toPar < 0 ? '#34d399' : s.toPar > 0 ? '#f87171' : '#FCB514' }}>
                                {fmtToPar(s.toPar)}
                              </span>
                              <span style={{ fontSize: 11, color: 'var(--tx4)' }}>/ {s.thru}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Top 3 from tournament_results (fallback if no final_standings) */}
                  {!selected.final_standings && (champion || runnerUp || third) && (
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: 'var(--tx4)', textTransform: 'uppercase', marginBottom: 12 }}>Final Standings</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {([['🏆', champion], ['🥈', runnerUp], ['🥉', third]] as [string, ResultEntry | null][]).filter(([, r]) => r).map(([icon, r]) => (
                          <div key={(r as ResultEntry).id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: icon === '🏆' ? 'rgba(252,181,20,0.07)' : 'rgba(255,255,255,0.03)', border: icon === '🏆' ? '1px solid rgba(252,181,20,0.2)' : '1px solid rgba(255,255,255,0.05)' }}>
                            <span style={{ fontSize: 18 }}>{icon}</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: 14, color: icon === '🏆' ? '#FCB514' : 'var(--tx1)' }}>{(r as ResultEntry).team_name ?? awardPlayers(r as ResultEntry)}</div>
                              {(r as ResultEntry).team_name && ((r as ResultEntry).player1_name || (r as ResultEntry).player2_name) && <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 1 }}>{awardPlayers(r as ResultEntry)}</div>}
                            </div>
                            {(r as ResultEntry).score_to_par != null && <div style={{ fontFamily: 'Bebas Neue', fontSize: 17, color: (r as ResultEntry).score_to_par! < 0 ? '#34d399' : (r as ResultEntry).score_to_par! > 0 ? '#f87171' : '#FCB514' }}>{fmtToPar((r as ResultEntry).score_to_par)}</div>}
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
                          <div style={{ flex: '1 1 180px', padding: '12px 16px', borderRadius: 10, background: 'rgba(252,181,20,0.04)', border: '1px solid rgba(252,181,20,0.18)' }}>
                            <div style={{ fontSize: 10, color: 'var(--tx4)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>🤠 Jackass of the Day</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#FCB514' }}>{jackass.player1_name ?? '—'}</div>
                            {jackass.detail && <div style={{ fontSize: 11, color: 'var(--tx4)', marginTop: 2 }}>{jackass.detail}</div>}
                          </div>
                        )}
                        {ctp && (
                          <div style={{ flex: '1 1 180px', padding: '12px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--bdr)' }}>
                            <div style={{ fontSize: 10, color: 'var(--tx4)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>🎯 Closest to Pin</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx1)' }}>{ctp.player1_name ?? '—'}</div>
                            {ctp.detail && <div style={{ fontSize: 11, color: 'var(--tx4)', marginTop: 2 }}>{ctp.detail}</div>}
                          </div>
                        )}
                        {ld && (
                          <div style={{ flex: '1 1 180px', padding: '12px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--bdr)' }}>
                            <div style={{ fontSize: 10, color: 'var(--tx4)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>💥 Longest Drive</div>
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
              </div>
            )
          })()}
        </>
      )}
    </div>
  )
}
