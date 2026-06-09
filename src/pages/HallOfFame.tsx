import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface ResultEntry {
  id: string
  category: string
  team_name: string | null
  player1_name: string | null
  player2_name: string | null
  player1_id: string | null
  player2_id: string | null
  score_to_par: number | null
  detail: string | null
}

interface TournamentRecord {
  id: string
  year: number
  name: string
  date: string | null
  course: string | null
  results: ResultEntry[]
}

function toPar(n: number | null) {
  if (n == null) return null
  return n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`
}

function playerNames(r: ResultEntry) {
  if (r.player1_name && r.player2_name) return `${r.player1_name} & ${r.player2_name}`
  return r.player1_name ?? r.player2_name ?? r.team_name ?? '—'
}

export default function HallOfFame() {
  const [records, setRecords] = useState<TournamentRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    const { data: tournaments } = await supabase
      .from('tournaments')
      .select('*')
      .eq('status', 'completed')
      .order('year', { ascending: false })

    if (!tournaments?.length) { setLoading(false); return }

    const ids = tournaments.map(t => t.id)
    const { data: results } = await supabase
      .from('tournament_results')
      .select('*')
      .in('tournament_id', ids)
      .order('created_at')

    const resultsByTournament: Record<string, ResultEntry[]> = {}
    for (const r of results ?? []) {
      if (!resultsByTournament[r.tournament_id]) resultsByTournament[r.tournament_id] = []
      resultsByTournament[r.tournament_id].push(r)
    }

    setRecords(tournaments.map(t => ({
      id: t.id,
      year: t.year,
      name: t.name,
      date: t.date,
      course: t.course,
      results: resultsByTournament[t.id] ?? [],
    })))
    setLoading(false)
  }

  const cat = (results: ResultEntry[], category: string) =>
    results.find(r => r.category === category) ?? null

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <span style={{ fontSize: 28 }}>🏆</span>
          <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 36, color: '#FCB514', letterSpacing: 4, margin: 0 }}>
            Hall of Fame
          </h1>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, marginTop: 4 }}>
          The Chubbs Memorial — Tournament Champions
        </p>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', padding: 60, fontSize: 14 }}>
          Loading history…
        </div>
      )}

      {!loading && records.length === 0 && (
        <div className="glass" style={{ padding: '48px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>⛳</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
            No completed tournaments yet
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)', lineHeight: 1.6 }}>
            Tournament results will appear here after an admin ends a tournament and archives the results.
          </div>
        </div>
      )}

      {records.map((record, idx) => {
        const champion = cat(record.results, 'champion')
        const runnerUp = cat(record.results, 'runner_up')
        const third    = cat(record.results, 'third')
        const jackass  = cat(record.results, 'jackass')
        const ctp      = cat(record.results, 'ctp')
        const ld       = cat(record.results, 'ld')

        return (
          <div
            key={record.id}
            className="glass animate-fadeUp"
            style={{
              marginBottom: 20,
              overflow: 'hidden',
              border: idx === 0 ? '1px solid rgba(252,181,20,0.35)' : '1px solid rgba(255,255,255,0.06)',
            }}
          >
            {/* Year banner */}
            <div style={{
              padding: '14px 22px',
              borderBottom: '1px solid rgba(252,181,20,0.1)',
              background: idx === 0
                ? 'linear-gradient(135deg, rgba(252,181,20,0.1) 0%, rgba(252,181,20,0.04) 100%)'
                : 'rgba(255,255,255,0.02)',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: idx === 0 ? 28 : 22, color: idx === 0 ? '#FCB514' : 'rgba(252,181,20,0.6)', letterSpacing: 3 }}>
                {record.year}
              </div>
              {idx === 0 && (
                <div style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: 'rgba(252,181,20,0.15)', color: '#FCB514', letterSpacing: 1, textTransform: 'uppercase' }}>
                  Most Recent
                </div>
              )}
              {record.course && (
                <div style={{ marginLeft: 'auto', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
                  ⛳ {record.course}
                </div>
              )}
              {record.date && !record.course && (
                <div style={{ marginLeft: 'auto', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
                  📅 {new Date(record.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </div>
              )}
            </div>

            <div style={{ padding: '20px 22px' }}>
              {/* Podium */}
              {(champion || runnerUp || third) && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 12 }}>
                    Final Standings
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {champion && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '12px 16px', borderRadius: 12,
                        background: 'rgba(252,181,20,0.08)',
                        border: '1px solid rgba(252,181,20,0.25)',
                      }}>
                        <span style={{ fontSize: 20, flexShrink: 0 }}>🏆</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 15, color: '#FCB514', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {champion.team_name ?? playerNames(champion)}
                          </div>
                          {champion.team_name && (champion.player1_name || champion.player2_name) && (
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 1 }}>
                              {playerNames(champion)}
                            </div>
                          )}
                        </div>
                        {champion.score_to_par != null && (
                          <div style={{
                            fontFamily: 'Bebas Neue', fontSize: 18, letterSpacing: 1,
                            color: champion.score_to_par < 0 ? '#34d399' : champion.score_to_par > 0 ? '#f87171' : '#FCB514',
                          }}>
                            {toPar(champion.score_to_par)}
                          </div>
                        )}
                      </div>
                    )}
                    {runnerUp && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <span style={{ fontSize: 18, flexShrink: 0 }}>🥈</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {runnerUp.team_name ?? playerNames(runnerUp)}
                          </div>
                          {runnerUp.team_name && (runnerUp.player1_name || runnerUp.player2_name) && (
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>{playerNames(runnerUp)}</div>
                          )}
                        </div>
                        {runnerUp.score_to_par != null && (
                          <div style={{ fontFamily: 'Bebas Neue', fontSize: 16, color: 'rgba(255,255,255,0.5)', letterSpacing: 1 }}>{toPar(runnerUp.score_to_par)}</div>
                        )}
                      </div>
                    )}
                    {third && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <span style={{ fontSize: 18, flexShrink: 0 }}>🥉</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, color: 'rgba(255,255,255,0.75)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {third.team_name ?? playerNames(third)}
                          </div>
                          {third.team_name && (third.player1_name || third.player2_name) && (
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>{playerNames(third)}</div>
                          )}
                        </div>
                        {third.score_to_par != null && (
                          <div style={{ fontFamily: 'Bebas Neue', fontSize: 16, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 }}>{toPar(third.score_to_par)}</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Awards row */}
              {(jackass || ctp || ld) && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 10 }}>
                    Awards
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {jackass && (
                      <div style={{ flex: '1 1 180px', padding: '10px 14px', borderRadius: 10, background: 'rgba(252,181,20,0.04)', border: '1px solid rgba(252,181,20,0.15)' }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>🤠 Jackass of the Day</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#FCB514' }}>{jackass.player1_name ?? '—'}</div>
                        {jackass.detail && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{jackass.detail}</div>}
                      </div>
                    )}
                    {ctp && (
                      <div style={{ flex: '1 1 180px', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>🎯 Closest to Pin</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{ctp.player1_name ?? '—'}</div>
                        {ctp.detail && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{ctp.detail}</div>}
                      </div>
                    )}
                    {ld && (
                      <div style={{ flex: '1 1 180px', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>💥 Longest Drive</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{ld.player1_name ?? '—'}</div>
                        {ld.detail && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{ld.detail}</div>}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {record.results.length === 0 && (
                <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 13, padding: '16px 0' }}>
                  No results recorded for this year
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
