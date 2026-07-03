import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Team, Score, Player } from '../lib/types'
import { COURSE_PAR, displayName } from '../lib/types'
import { useYear } from '../context/YearContext'
import { SkeletonLeaderRow } from '../components/Skeleton'
import { useSyncContext } from '../context/SyncContext'
import { localDb, parseJson } from '../lib/localDb'
import { useCourse } from '../context/CourseContext'

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

// Podium metal treatments — 1st gold, 2nd silver, 3rd bronze
const PODIUM: Record<number, { bg: string; color: string; ring: string; glow: string }> = {
  1: {
    bg: 'linear-gradient(160deg, #f2d27a 0%, #D4A53A 52%, #9c7418 100%)',
    color: '#1a1204',
    ring: 'rgba(212,165,58,0.55)',
    glow: '0 2px 14px -2px rgba(212,165,58,0.55)',
  },
  2: {
    bg: 'linear-gradient(160deg, #d8e0ea 0%, #94a3b8 52%, #5d6c80 100%)',
    color: '#101826',
    ring: 'rgba(148,163,184,0.5)',
    glow: '0 2px 12px -2px rgba(148,163,184,0.4)',
  },
  3: {
    bg: 'linear-gradient(160deg, #d9853b 0%, #b45309 52%, #7c3a04 100%)',
    color: '#fff3e4',
    ring: 'rgba(180,83,9,0.55)',
    glow: '0 2px 12px -2px rgba(180,83,9,0.45)',
  },
}

export default function Leaderboard() {
  const { effectiveTournamentId, isCurrentYear } = useYear()
  const { isOnline } = useSyncContext()
  const { parOf, holes: courseHoles } = useCourse()
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
  }, [effectiveTournamentId, isCurrentYear, courseHoles])

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
      const parSoFar = holeScores.reduce((a, s, i) => s !== null ? a + parOf(i + 1) : a, 0)
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

  const toParStr = (n: number) => n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`

  const ScorePill = ({ toPar, thru, large }: { toPar: number; thru: number; large?: boolean }) => {
    if (thru === 0) return <span style={{ fontFamily: 'Bebas Neue', fontSize: large ? 28 : 20, color: 'var(--tx4)', letterSpacing: 1 }}>—</span>
    const text = toParStr(toPar)
    const under = toPar < 0, over = toPar > 0
    return (
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: large ? 52 : 40,
        padding: large ? '6px 14px' : '4px 9px',
        borderRadius: 10,
        background: under ? 'rgba(34,197,94,0.16)' : over ? 'rgba(239,68,68,0.16)' : 'var(--surf2)',
        border: `1px solid ${under ? 'rgba(34,197,94,0.45)' : over ? 'rgba(239,68,68,0.45)' : 'var(--bdr2)'}`,
        boxShadow: under ? '0 2px 12px -4px rgba(34,197,94,0.45)' : over ? '0 2px 12px -4px rgba(239,68,68,0.4)' : 'var(--elev-1)',
        fontFamily: 'Bebas Neue',
        fontSize: large ? 30 : 20,
        letterSpacing: 1,
        fontVariantNumeric: 'tabular-nums',
        color: under ? '#4ade80' : over ? '#f87171' : 'var(--tx2)',
        lineHeight: 1,
      }}>{text}</div>
    )
  }

  const StatCol = ({ value, label }: { value: string | number; label: string }) => (
    <div style={{ textAlign: 'center', minWidth: 30 }}>
      <div style={{ fontFamily: 'Bebas Neue', fontSize: 20, letterSpacing: 0.5, color: 'var(--tx1)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--tx4)', letterSpacing: 1, textTransform: 'uppercase', marginTop: 2 }}>{label}</div>
    </div>
  )

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="animate-fadeUp" style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div className="section-label" style={{ marginBottom: 4 }}>{isCurrentYear ? 'Live standings' : 'Final standings'}</div>
          <h1 className="gold-text" style={{ fontFamily: 'Bebas Neue', fontSize: 36, letterSpacing: 4, lineHeight: 1 }}>Leaderboard</h1>
          <p style={{ color: 'var(--tx3)', fontSize: 12, marginTop: 4 }}>Best Ball Format • Par <span style={{ fontVariantNumeric: 'tabular-nums' }}>{COURSE_PAR}</span></p>
        </div>
        {isCurrentYear && (
          <div className="glass-flat" style={{
            display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0,
            padding: '6px 12px', borderRadius: 999,
            borderColor: 'var(--gold-25)', background: 'var(--gold-08)',
            color: 'var(--gold)', fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase',
          }}>
            <span className="animate-pulseDot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', boxShadow: '0 0 8px var(--gold-40)', display: 'inline-block' }} />
            Live
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-fadeUp" style={{ animationDelay: `${i * 60}ms` }}>
              <SkeletonLeaderRow />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                const metal = PODIUM[pos]
                if (metal) return (
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: metal.bg,
                    border: `1px solid ${metal.ring}`,
                    boxShadow: `${metal.glow}, inset 0 1px 0 rgba(255,255,255,0.35)`,
                  }}>
                    <span style={{
                      fontFamily: 'Bebas Neue', fontSize: tied ? 15 : 18, letterSpacing: 0.5, lineHeight: 1,
                      color: metal.color, fontVariantNumeric: 'tabular-nums',
                      transform: 'translateY(1px)',
                    }}>{tied ? 'T' : ''}{pos}</span>
                  </div>
                )
                return (
                  <span style={{ fontFamily: 'Bebas Neue', fontSize: 24, color: 'var(--tx3)', letterSpacing: 1, fontVariantNumeric: 'tabular-nums' }}>
                    {tied ? 'T' : ''}{pos}
                  </span>
                )
              })()

              return (
              <div key={row.team.id} className={`glass pressable${i < 6 ? ' animate-fadeUp' : ''}`} style={{
                padding: isLeader ? '20px 20px' : '14px 16px',
                borderColor: isLeader ? 'var(--gold-40)' : undefined,
                boxShadow: isLeader ? '0 0 32px rgba(212,165,58,0.16), var(--elev-gold), 0 2px 16px rgba(0,0,0,0.4)' : undefined,
                backgroundImage: isLeader ? 'linear-gradient(135deg, var(--gold-08) 0%, transparent 55%)' : undefined,
                animationDelay: i < 6 ? `${i * 70}ms` : undefined,
              }}>
                {/* Main row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 44, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    {rankIndicator}
                    {back !== null && back > 0 && (
                      <div style={{
                        display: 'flex', alignItems: 'baseline', gap: 3,
                        padding: '2px 6px', borderRadius: 999,
                        background: 'rgba(239,68,68,0.10)',
                        border: '1px solid rgba(239,68,68,0.22)',
                        lineHeight: 1,
                      }}>
                        <span style={{ fontFamily: 'Bebas Neue', fontSize: 13, color: '#f87171', letterSpacing: 0.5, fontVariantNumeric: 'tabular-nums' }}>{back}</span>
                        <span style={{ fontSize: 7, color: 'rgba(248,113,113,0.7)', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>back</span>
                      </div>
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: isLeader ? 'Bebas Neue' : undefined,
                      fontWeight: isLeader ? undefined : 700,
                      fontSize: isLeader ? 22 : 15,
                      letterSpacing: isLeader ? 2 : undefined,
                      color: isLeader ? 'var(--gold)' : 'var(--tx1)',
                      textShadow: isLeader ? '0 0 20px var(--gold-25)' : undefined,
                      lineHeight: 1.2,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {row.team.name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {[row.team.player1 && displayName(row.team.player1), row.team.player2 && displayName(row.team.player2)].filter(Boolean).join(' & ')}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                    <div style={{ textAlign: 'center' }}>
                      <ScorePill toPar={row.toPar} thru={row.thru} large={isLeader} />
                      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--tx4)', marginTop: 3, letterSpacing: 1, textTransform: 'uppercase' }}>To Par</div>
                    </div>
                    <StatCol value={row.gross || '—'} label="Gross" />
                    <StatCol value={row.thru === 18 ? 'F' : row.thru || '—'} label="Thru" />
                    <StatCol value={row.putts || '—'} label="Putts" />
                  </div>
                </div>

                {/* Hole grid: hole numbers on top, score bubbles below */}
                {row.thru > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div className={isLeader ? 'divider-gold' : ''} style={isLeader ? { marginBottom: 8 } : { height: 1, background: 'var(--bdr)', marginBottom: 8 }} />
                    <div style={{ overflowX: 'auto', overflowY: 'visible' }}>
                    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, minWidth: 'max-content' }}>
                      {/* Hole number row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 48, flexShrink: 0, fontSize: 9, fontWeight: 700, color: 'var(--tx4)', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'right' }}>
                          Hole:
                        </div>
                        {row.holeScores.map((_, holeIdx) => (
                          <div key={holeIdx}
                            style={{ width: 28, flexShrink: 0, textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--tx4)', fontVariantNumeric: 'tabular-nums' }}>
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
                          const par = parOf(holeIdx + 1)
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
                  </div>
                )}
              </div>
            )
          })
        })()}
        </div>
      )}

      {/* Alligator divider */}
      <div style={{ textAlign: 'center', marginTop: 40, paddingBottom: 24 }}>
        <div className="divider-gold" style={{ marginBottom: 24 }} />
        <div className="animate-float" style={{ fontSize: 32, marginBottom: 8 }}>🐊</div>
        <p style={{ color: 'var(--tx4)', fontSize: 13, fontStyle: 'italic' }}>
          "I would have been a pro if it wasn't for those damn alligators."
        </p>
        <p style={{ color: 'var(--gold-40)', fontSize: 11, marginTop: 4, letterSpacing: 0.5 }}>— Chubbs Peterson</p>
      </div>
    </div>
  )
}
