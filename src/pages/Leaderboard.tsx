import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Team, Score, Player } from '../lib/types'
import { COURSE_PAR } from '../lib/types'

const HOLE_PARS = [4,4,3,5,4,3,4,5,4, 4,3,5,4,4,3,5,4,4]

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
  holeScores: (number | null)[]
}

export default function Leaderboard() {
  const [rows, setRows] = useState<LeaderRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()

    const sub = supabase.channel('leaderboard-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, fetchData)
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  }, [])

  const fetchData = async () => {
    const [teamsRes, scoresRes] = await Promise.all([
      supabase.from('teams').select('*, player1:profiles!teams_p1_id_fkey(*), player2:profiles!teams_p2_id_fkey(*)'),
      supabase.from('scores').select('*'),
    ])

    const teams: (Team & { player1?: Player; player2?: Player })[] = teamsRes.data ?? []
    const allScores: Score[] = scoresRes.data ?? []

    const leaderRows: LeaderRow[] = teams.map(team => {
      const teamScores = allScores.filter(s => s.team_id === team.id)
      const scoreMap: Record<number, number> = {}
      for (const s of teamScores) scoreMap[s.hole] = s.score

      const holeScores = Array.from({ length: 18 }, (_, i) => scoreMap[i + 1] ?? null)
      const played = holeScores.filter(s => s !== null) as number[]
      const gross = played.reduce((a, b) => a + b, 0)
      const thru = played.length
      const parSoFar = HOLE_PARS.slice(0, thru).reduce((a, b) => a + b, 0)
      const toPar = gross - parSoFar

      return { team, toPar, gross, thru, holeScores }
    })

    leaderRows.sort((a, b) => {
      if (b.thru !== a.thru && a.thru === 0) return 1
      if (b.thru !== a.thru && b.thru === 0) return -1
      return a.toPar - b.toPar || b.thru - a.thru
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
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Live standings • Best Ball Format • Par {COURSE_PAR}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
          <span className="animate-pulseDot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#FCB514', display: 'inline-block' }} />
          Live
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div className="animate-spin" style={{ width: 32, height: 32, border: '3px solid rgba(252,181,20,0.2)', borderTopColor: '#FCB514', borderRadius: '50%' }} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((row, i) => {
            const isLeader = i === 0 && row.thru > 0
            const gap = i > 0 && rows[0].thru > 0 ? row.toPar - rows[0].toPar : null

            return (
              <div key={row.team.id} className="glass animate-fadeUp" style={{
                padding: '16px 20px',
                borderColor: isLeader ? 'rgba(252,181,20,0.4)' : undefined,
                boxShadow: isLeader ? '0 0 20px rgba(252,181,20,0.1)' : undefined,
              }} >
                {/* Main row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 22, width: 32, flexShrink: 0 }}>
                    {i === 0 ? '🏆' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>{i + 1}</span>}
                  </span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: isLeader ? '#FCB514' : '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {row.team.name}
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 1 }}>
                      {[row.team.player1?.name, row.team.player2?.name].filter(Boolean).join(' & ')}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 20, textAlign: 'right', flexShrink: 0 }}>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: row.toPar <= 0 ? '#FCB514' : 'rgba(255,255,255,0.9)' }}>
                        {row.thru > 0 ? toPar(row.toPar) : '—'}
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>TO PAR</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>{row.gross || '—'}</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>GROSS</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>{row.thru}</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>THRU</div>
                    </div>
                  </div>
                </div>

                {/* Gap from leader */}
                {gap !== null && gap > 0 && row.thru > 0 && (
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4, marginLeft: 44 }}>
                    {gap} back
                  </div>
                )}

                {/* Hole dots */}
                {row.thru > 0 && (
                  <div style={{ display: 'flex', gap: 4, overflowX: 'auto', marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    {row.holeScores.map((score, holeIdx) => {
                      const par = HOLE_PARS[holeIdx]
                      if (score === null) {
                        return (
                          <div key={holeIdx} title={`Hole ${holeIdx + 1}`} style={{ width: 22, height: 22, borderRadius: '50%', border: '1px dashed rgba(255,255,255,0.08)', flexShrink: 0 }} />
                        )
                      }
                      return (
                        <div key={holeIdx} className={`score-bubble ${scoreBubbleClass(score, par)}`}
                          style={{ width: 22, height: 22, fontSize: 10, flexShrink: 0 }}
                          title={`Hole ${holeIdx + 1}: ${score} (Par ${par})`}
                        >
                          {score}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Alligator divider */}
      <div style={{ textAlign: 'center', marginTop: 40, padding: '24px', borderTop: '1px solid rgba(252,181,20,0.1)' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🐊</div>
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, fontStyle: 'italic' }}>
          "I would have been a pro if it wasn't for those damn alligators."
        </p>
        <p style={{ color: 'rgba(252,181,20,0.4)', fontSize: 11, marginTop: 4 }}>— Chubbs Peterson</p>
      </div>
    </div>
  )
}
