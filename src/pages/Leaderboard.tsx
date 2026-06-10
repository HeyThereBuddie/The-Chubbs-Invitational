import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Team, Score, Player } from '../lib/types'
import { COURSE_PAR, displayName } from '../lib/types'
import { useYear } from '../context/YearContext'
import { useSyncContext } from '../context/SyncContext'
import { localDb, parseJson } from '../lib/localDb'

const HOLE_PARS = [5,4,5,3,4,4,3,4,4, 4,4,4,3,5,4,3,5,4]

function scoreBubbleClass(score: number, par: number): string {
  const diff = score - par
  if (diff <= -2) return 'score-eagle'
  if (diff === -1) return 'score-birdie'
  if (diff === 0) return 'score-par'
  if (diff === 1) return 'score-bogey'
  return 'score-double'
}

interface LeaderRow {
  team: Team & { player1?: Player; player2?: Player }
  toPar: number
  gross: number
  thru: number
  putts: number
  holeScores: (number | null)[]
}

export default function Leaderboard() {
  const { effectiveTournamentId, isCurrentYear } = useYear()
  const { isOnline } = useSyncContext()
  const [rows, setRows] = useState<LeaderRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()

    if (!isCurrentYear) return

    const sub = supabase.channel('leaderboard-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, fetchData)
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveTournamentId, isCurrentYear])

  const fetchData = async () => {
    if (!effectiveTournamentId) { setRows([]); setLoading(false); return }

    let teams: (Team & { player1?: Player; player2?: Player })[]
    let allScores: Score[]

    if (!isOnline) {
      const localTeams = await localDb.teams.where('tournament_id').equals(effectiveTournamentId).toArray()
      const localScores = await localDb.scores.toArray()
      teams = localTeams.map(t => ({
        id: t.id, name: t.name, tournament_id: t.tournament_id,
        p1_id: t.p1_id, p2_id: t.p2_id,
        player1: parseJson<Player>(t.player1_json),
        player2: parseJson<Player>(t.player2_json),
      } as unknown as Team & { player1?: Player; player2?: Player }))
      allScores = localScores as Score[]
    } else {
      let teamsQ = supabase.from('teams').select('*, player1:profiles!teams_p1_id_fkey(*), player2:profiles!teams_p2_id_fkey(*)')
      teamsQ = teamsQ.eq('tournament_id', effectiveTournamentId)
      const [teamsRes, scoresRes] = await Promise.all([
        teamsQ,
        supabase.from('scores').select('*'),
      ])
      teams = teamsRes.data ?? []
      allScores = scoresRes.data ?? []
    }

    const leaderRows: LeaderRow[] = teams.map(team => {
      const teamScores = allScores.filter(s => s.team_id === team.id)
      const scoreMap: Record<number, number> = {}
      for (const s of teamScores) scoreMap[s.hole] = s.score

      const puttsMap: Record<number, number> = {}
      for (const s of teamScores) if (s.putts != null) puttsMap[s.hole] = s.putts

      const holeScores = Array.from({ length: 18 }, (_, i) => scoreMap[i + 1] ?? null)
      const played = holeScores.filter(s => s !== null) as number[]
      const gross = played.reduce((a, b) => a + b, 0)
      const thru = played.length
      const parSoFar = HOLE_PARS.slice(0, thru).reduce((a, b) => a + b, 0)
      const toPar = gross - parSoFar
      const putts = Object.values(puttsMap).reduce((a, b) => a + b, 0)

      return { team, toPar, gross, thru, putts, holeScores }
    })

    leaderRows.sort((a, b) => {
      if (b.thru !== a.thru && a.thru === 0) return 1
      if (b.thru !== a.thru && b.thru === 0) return -1
      // Putts tiebreaker: only applies when both teams have putts recorded
      const puttsBreaker = (a.putts > 0 && b.putts > 0) ? a.putts - b.putts : 0
      return a.toPar - b.toPar || b.thru - a.thru || puttsBreaker
    })

    setRows(leaderRows)
    setLoading(false)
  }

  const toPar = (n: number) => n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 32, color: '#FCB514', letterSpacing: 4 }}>Leaderboard</h1>
          <p style={{ color: 'var(--tx3)', fontSize: 13 }}>{isCurrentYear ? 'Live standings' : 'Final standings'} • Best Ball Format • Par {COURSE_PAR}</p>
        </div>
        {isCurrentYear && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--tx3)', fontSize: 12 }}>
            <span className="animate-pulseDot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#FCB514', display: 'inline-block' }} />
            Live
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div className="animate-spin" style={{ width: 32, height: 32, border: '3px solid rgba(252,181,20,0.2)', borderTopColor: '#FCB514', borderRadius: '50%' }} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(() => {
            // Two rows are truly tied only if toPar AND putts are equal
            // (putts only act as tiebreaker when both teams have putts recorded)
            const areTied = (a: LeaderRow, b: LeaderRow) => {
              if (a.toPar !== b.toPar) return false
              if ((a.thru > 0) !== (b.thru > 0)) return false
              if (a.putts > 0 && b.putts > 0 && a.putts !== b.putts) return false
              return true
            }

            // Compute PGA-style positions: skip numbers for each group, T prefix when truly tied
            const posInfo: Array<{ pos: number; tied: boolean }> = []
            let i = 0
            while (i < rows.length) {
              let j = i
              while (j < rows.length && areTied(rows[i], rows[j])) j++
              const count = j - i
              const tied = count > 1
              for (let k = 0; k < count; k++) posInfo.push({ pos: i + 1, tied })
              i = j
            }
            return rows.map((row, i) => {
              const { pos, tied } = posInfo[i]
              const isLeader = pos === 1 && row.thru > 0
              const back = pos > 1 && rows[0].thru > 0 && row.thru > 0 ? row.toPar - rows[0].toPar : null

              const rankIndicator = (() => {
                const emoji = pos === 1 ? '🏆' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : null
                if (emoji) return (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <span style={{ fontSize: tied ? 26 : 34, lineHeight: 1 }}>{emoji}</span>
                    {tied && (
                      <span style={{
                        fontFamily: 'Bebas Neue', fontSize: 18, letterSpacing: 1, lineHeight: 1,
                        color: pos === 1 ? '#FCB514' : 'var(--tx3)',
                        width: 42, textAlign: 'center', display: 'block',
                      }}>T{pos}</span>
                    )}
                  </div>
                )
                return (
                  <span style={{ fontFamily: 'Bebas Neue', fontSize: 28, color: 'var(--tx2)', letterSpacing: 1 }}>
                    {tied ? 'T' : ''}{pos}
                  </span>
                )
              })()

              return (
              <div key={row.team.id} className="glass animate-fadeUp" style={{
                padding: '16px 20px',
                borderColor: isLeader ? 'rgba(252,181,20,0.4)' : undefined,
                boxShadow: isLeader ? '0 0 20px rgba(252,181,20,0.1)' : undefined,
              }} >
                {/* Main row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 42, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    {rankIndicator}
                    {back !== null && back > 0 && (
                      <span style={{ fontSize: 10, color: 'var(--tx3)', whiteSpace: 'nowrap', lineHeight: 1, fontWeight: 600 }}>
                        {back} back
                      </span>
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: isLeader ? '#FCB514' : 'var(--tx1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {row.team.name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 1 }}>
                      {[row.team.player1 && displayName(row.team.player1), row.team.player2 && displayName(row.team.player2)].filter(Boolean).join(' & ')}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 16, textAlign: 'right', flexShrink: 0 }}>
                    <div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: row.toPar <= 0 ? '#FCB514' : 'var(--tx1)' }}>
                        {row.thru > 0 ? toPar(row.toPar) : '—'}
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--tx4)' }}>TO PAR</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--tx1)' }}>{row.gross || '—'}</div>
                      <div style={{ fontSize: 9, color: 'var(--tx4)' }}>GROSS</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--tx1)' }}>{row.thru}</div>
                      <div style={{ fontSize: 9, color: 'var(--tx4)' }}>THRU</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--tx1)' }}>{row.putts || '—'}</div>
                      <div style={{ fontSize: 9, color: 'var(--tx4)' }}>PUTTS</div>
                    </div>
                  </div>
                </div>

                {/* Hole grid: hole numbers on top, score bubbles below */}
                {row.thru > 0 && (
                  <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--bdr)', overflowX: 'auto', overflowY: 'visible' }}>
                    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, minWidth: 'max-content' }}>
                      {/* Hole number row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 48, flexShrink: 0, fontSize: 9, fontWeight: 700, color: 'var(--tx4)', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'right' }}>
                          Hole:
                        </div>
                        {row.holeScores.map((_, holeIdx) => (
                          <div key={holeIdx}
                            style={{ width: 28, flexShrink: 0, textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'var(--tx3)' }}>
                            {holeIdx + 1}
                          </div>
                        ))}
                      </div>
                      {/* Score bubble row — padding lets outlines (outline-offset: 3px) render without clipping */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 2px' }}>
                        <div style={{ width: 44, flexShrink: 0, fontSize: 9, fontWeight: 700, color: 'var(--tx4)', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'right' }}>
                          Score:
                        </div>
                        {row.holeScores.map((score, holeIdx) => {
                          const par = HOLE_PARS[holeIdx]
                          if (score === null) {
                            return (
                              <div key={holeIdx}
                                style={{ width: 28, height: 28, borderRadius: '50%', border: '1px dashed var(--bdr)', flexShrink: 0 }} />
                            )
                          }
                          return (
                            <div key={holeIdx}
                              className={`score-bubble ${scoreBubbleClass(score, par)}`}
                              style={{ width: 28, height: 28, fontSize: 11, flexShrink: 0 }}
                              title={`Hole ${holeIdx + 1}: ${score} (Par ${par})`}
                            >
                              {score}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        })()}
        </div>
      )}

      {/* Alligator divider */}
      <div style={{ textAlign: 'center', marginTop: 40, padding: '24px', borderTop: '1px solid rgba(252,181,20,0.1)' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🐊</div>
        <p style={{ color: 'var(--tx4)', fontSize: 13, fontStyle: 'italic' }}>
          "I would have been a pro if it wasn't for those damn alligators."
        </p>
        <p style={{ color: 'rgba(252,181,20,0.4)', fontSize: 11, marginTop: 4 }}>— Chubbs Peterson</p>
      </div>
    </div>
  )
}
