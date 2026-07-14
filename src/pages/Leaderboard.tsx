import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Team, Score, Player } from '../lib/types'
import { teamMemberName } from '../lib/types'
import { useYear } from '../context/YearContext'
import { SkeletonLeaderRow } from '../components/Skeleton'
import { useSyncContext } from '../context/SyncContext'
import { localDb, parseJson } from '../lib/localDb'
import { useCourse } from '../context/CourseContext'

// Augusta manual-scoreboard palette (Masters homage), bridged with the app's gold/dark theme.
const AUGUSTA = '#0a5c39'
const AUGUSTA_DEEP = '#063a25'
const CREAM = '#efe8d2'
const GOLD_SOFT = '#e7c877'
const MASTERS_RED = '#e0402f'   // under par turns red — the signature Masters signal

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
  const { parOf, holes: courseHoles } = useCourse()
  const [rows, setRows] = useState<LeaderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [meta, setMeta] = useState<{ course: string | null; year: number | null }>({ course: null, year: null })

  // Masthead: the active tournament's own course + par.
  useEffect(() => {
    if (!effectiveTournamentId || !isOnline) return
    supabase.from('tournaments').select('course, year').eq('id', effectiveTournamentId).single()
      .then(({ data }) => { if (data) setMeta({ course: (data as { course: string | null }).course, year: (data as { year: number | null }).year }) })
  }, [effectiveTournamentId, isOnline])

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
  const coursePar = Array.from({ length: 18 }, (_, i) => parOf(i + 1)).reduce((a, b) => a + b, 0)

  // Masters total: red under par, gold on E, muted over par.
  const MastersTotal = ({ toPar, thru, large }: { toPar: number; thru: number; large?: boolean }) => {
    if (thru === 0) return <span style={{ fontFamily: 'Bebas Neue', fontSize: large ? 26 : 20, color: 'var(--tx4)', letterSpacing: 1 }}>—</span>
    const color = toPar < 0 ? MASTERS_RED : toPar === 0 ? 'var(--gold)' : 'var(--tx2)'
    return <span style={{ fontFamily: 'Bebas Neue', fontSize: large ? 30 : 23, letterSpacing: 1, fontVariantNumeric: 'tabular-nums', color, lineHeight: 1 }}>{toParStr(toPar)}</span>
  }

  const StatCol = ({ value, label }: { value: string | number; label: string }) => (
    <div style={{ textAlign: 'center', minWidth: 44 }}>
      <div style={{ fontFamily: 'Bebas Neue', fontSize: 22, letterSpacing: 0.5, color: 'var(--tx1)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--tx4)', letterSpacing: 1, textTransform: 'uppercase', marginTop: 3 }}>{label}</div>
    </div>
  )

  const GRID = '40px 1fr 46px 62px 16px'

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div className="glass animate-fadeUp" style={{ padding: 0, overflow: 'hidden', borderColor: 'var(--bdr)' }}>

        {/* ── Augusta masthead ───────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: '18px 20px',
          background: `linear-gradient(180deg, ${AUGUSTA}, ${AUGUSTA_DEEP})`,
          borderBottom: '2px solid rgba(240,230,200,0.18)',
        }}>
          <svg width="46" height="46" viewBox="0 0 100 100" aria-hidden="true" style={{ flexShrink: 0 }}>
            <circle cx="50" cy="50" r="48" fill={AUGUSTA_DEEP} stroke="#d4a53a" strokeWidth="3" />
            <path d="M40 74 L40 28 L69 35 L40 42" fill={MASTERS_RED} />
            <rect x="37.5" y="26" width="3" height="48" rx="1.5" fill={CREAM} />
            <circle cx="39" cy="76" r="3.2" fill="#d4a53a" />
          </svg>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'Bebas Neue', fontSize: 27, letterSpacing: 3, color: CREAM, lineHeight: 1 }}>Leaderboard</div>
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: GOLD_SOFT, marginTop: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {meta.course || 'Course TBD'} · Par <span style={{ fontVariantNumeric: 'tabular-nums' }}>{coursePar}</span>
            </div>
          </div>
          <div style={{ marginLeft: 'auto', flexShrink: 0, textAlign: 'right' }}>
            {isCurrentYear ? (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '5px 11px', borderRadius: 999,
                border: '1px solid rgba(240,230,200,0.3)', background: 'rgba(0,0,0,0.18)',
                color: CREAM, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase',
              }}>
                <span className="animate-pulseDot" style={{ width: 6, height: 6, borderRadius: '50%', background: MASTERS_RED, boxShadow: `0 0 8px ${MASTERS_RED}`, display: 'inline-block' }} />
                Live
              </div>
            ) : (
              <div style={{ color: CREAM, lineHeight: 1.15 }}>
                <div style={{ fontSize: 11, letterSpacing: 2, color: GOLD_SOFT, fontVariantNumeric: 'tabular-nums' }}>{meta.year ?? ''}</div>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: 16, letterSpacing: 2 }}>FINAL</div>
              </div>
            )}
          </div>
        </div>

        {/* ── Column rail ────────────────────────────────────── */}
        <div style={{
          display: 'grid', gridTemplateColumns: GRID, gap: 8, alignItems: 'center',
          padding: '9px 18px', borderBottom: '1px solid var(--bdr)',
          fontSize: 10, fontWeight: 800, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--tx4)',
        }}>
          <span>Pos</span><span>Team</span><span style={{ textAlign: 'center' }}>Thru</span><span style={{ textAlign: 'center' }}>Total</span><span />
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ padding: '4px 12px' }}><SkeletonLeaderRow /></div>
            ))}
          </div>
        ) : (() => {
          // Two rows are truly tied only if toPar AND putts are equal
          const areTied = (a: LeaderRow, b: LeaderRow) => {
            if (a.toPar !== b.toPar) return false
            if ((a.thru > 0) !== (b.thru > 0)) return false
            if (a.putts > 0 && b.putts > 0 && a.putts !== b.putts) return false
            return true
          }
          // PGA-style positions: shared place with a T prefix when tied
          const posInfo: Array<{ pos: number; tied: boolean }> = []
          let p = 0
          while (p < rows.length) {
            let j = p
            while (j < rows.length && areTied(rows[p], rows[j])) j++
            const tied = j - p > 1
            for (let k = p; k < j; k++) posInfo.push({ pos: p + 1, tied })
            p = j
          }
          return (
            <div>
              {rows.map((row, i) => {
                const { pos, tied } = posInfo[i]
                const isLeader = pos === 1 && row.thru > 0
                const isOpen = expandedId === row.team.id   // all scorecards collapsed until tapped
                const back = pos > 1 && rows[0].thru > 0 && row.thru > 0 ? row.toPar - rows[0].toPar : null
                return (
                  <div key={row.team.id}>
                    {/* Tap-to-expand row header */}
                    <div
                      className="pressable"
                      onClick={() => setExpandedId(prev => (prev === row.team.id ? null : row.team.id))}
                      style={{
                        display: 'grid', gridTemplateColumns: GRID, gap: 8, alignItems: 'center',
                        padding: isLeader ? '15px 18px' : '12px 18px', cursor: 'pointer',
                        borderBottom: '1px solid var(--bdr)',
                        background: isLeader ? 'linear-gradient(90deg, var(--gold-08), transparent 62%)' : undefined,
                        boxShadow: isLeader ? 'inset 3px 0 0 var(--gold)' : undefined,
                      }}
                    >
                      <span data-tour={i === 0 ? 'lb-position' : undefined} style={{ fontFamily: 'Bebas Neue', fontSize: 20, letterSpacing: 0.5, color: pos === 1 ? 'var(--gold)' : 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>
                        {tied ? 'T' : ''}{pos}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{
                          fontSize: isLeader ? 18 : 15.5, fontWeight: 700,
                          color: isLeader ? 'var(--gold)' : 'var(--tx1)',
                          lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>{row.team.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {[teamMemberName(row.team.player1, row.team.p1_name), teamMemberName(row.team.player2, row.team.p2_name)].filter(Boolean).join(' & ')}
                        </div>
                      </div>
                      <span style={{ textAlign: 'center', fontSize: 13, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>
                        {row.thru === 18 ? 'F' : row.thru || '—'}
                      </span>
                      <span data-tour={i === 0 ? 'lb-stats' : undefined} style={{ textAlign: 'center' }}>
                        <MastersTotal toPar={row.toPar} thru={row.thru} large={isLeader} />
                      </span>
                      <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" style={{ justifySelf: 'center', color: 'var(--tx4)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                        <path d="M6 9 L12 15 L18 9" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>

                    {/* Expanded card: stats + hole-by-hole */}
                    {isOpen && row.thru > 0 && (
                      <div data-tour={i === 0 ? 'lb-scorecard' : undefined} style={{ padding: '14px 18px', borderBottom: '1px solid var(--bdr)', background: 'var(--surf2)' }}>
                        <div style={{ display: 'flex', gap: 18, justifyContent: 'center', marginBottom: 14 }}>
                          <StatCol value={row.gross || '—'} label="Gross" />
                          <StatCol value={row.putts || '—'} label="Putts" />
                          {back !== null && back > 0 && <StatCol value={back} label="Back" />}
                        </div>
                        <div style={{ overflowX: 'auto', overflowY: 'visible' }}>
                          <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, minWidth: 'max-content' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ width: 44, flexShrink: 0, fontSize: 9, fontWeight: 700, color: 'var(--tx4)', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'right' }}>Hole:</div>
                              {row.holeScores.map((_, holeIdx) => (
                                <div key={holeIdx} style={{ width: 28, flexShrink: 0, textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--tx4)', fontVariantNumeric: 'tabular-nums' }}>{holeIdx + 1}</div>
                              ))}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 2px' }}>
                              <div style={{ width: 44, flexShrink: 0, fontSize: 9, fontWeight: 700, color: 'var(--tx4)', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'right' }}>Score:</div>
                              {row.holeScores.map((score, holeIdx) => {
                                const par = parOf(holeIdx + 1)
                                if (score === null) return <div key={holeIdx} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px dashed var(--bdr)', flexShrink: 0 }} />
                                return (
                                  <div key={holeIdx} className={`score-bubble ${scoreBubbleClass(score, par)}`} style={{ width: 28, height: 28, fontSize: 11, flexShrink: 0 }} title={`Hole ${holeIdx + 1}: ${score} (Par ${par})`}>{score}</div>
                                )
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              {rows.length === 0 && (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--tx4)', fontSize: 14 }}>No teams on the board yet.</div>
              )}
            </div>
          )
        })()}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 12, background: AUGUSTA_DEEP, color: 'rgba(240,230,200,0.7)', fontSize: 10.5, letterSpacing: 1.4, textTransform: 'uppercase' }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: MASTERS_RED, boxShadow: `0 0 8px ${MASTERS_RED}` }} /> Red numbers · under par
        </div>
      </div>

      {/* Alligator divider */}
      <div style={{ textAlign: 'center', marginTop: 34, paddingBottom: 24 }}>
        <div className="divider-gold" style={{ marginBottom: 20 }} />
        <div className="animate-float" style={{ fontSize: 30, marginBottom: 8 }}>🐊</div>
        <p style={{ color: 'var(--tx4)', fontSize: 13, fontStyle: 'italic' }}>
          "I would have been a pro if it wasn't for those damn alligators."
        </p>
        <p style={{ color: 'var(--gold-40)', fontSize: 11, marginTop: 4, letterSpacing: 0.5 }}>— Chubbs Peterson</p>
      </div>
    </div>
  )
}
