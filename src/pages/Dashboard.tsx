import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useYear } from '../context/YearContext'
import { useTheme } from '../context/ThemeContext'
import { ALL_QUOTES, COURSE_NAME, TOURNAMENT_DATE, FIRST_TEE_TIME, COURSE_PAR, displayName } from '../lib/types'
import type { Team, Score, Player, Update } from '../lib/types'
import { Trophy, Users, Flag, Pin } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

const CHUBBS_IMG = 'https://static.wikia.nocookie.net/sandlerverse/images/8/81/Chubbs_Peterson_in_Happy_Gilmore.webp'

interface FeedEvent {
  id: string
  event_type: 'score' | 'chulligan' | 'putt' | 'contest'
  team_name: string
  voter_name: string | null
  player_name: string | null
  hole: number
  score: number | null
  label: string
  emoji: string
  created_at: string
}

const SCORE_COLORS: Record<string, string> = {
  'Hole in One!': '#3b82f6',
  'Eagle':        '#86efac',
  'Birdie':       '#4ade80',
  'Par':          '#22c55e',
  'Bogey':        '#ef4444',
  'Double':       '#dc2626',
}

function eventColor(ev: FeedEvent) {
  if (ev.event_type === 'contest') return '#FCB514'
  if (ev.event_type === 'chulligan') return '#f59e0b'
  if (ev.event_type === 'putt') {
    if (ev.label === '3-Putt') return '#fb923c'
    if (ev.label === '4-Putt') return '#ea580c'
    return '#c2410c'
  }
  if (ev.label.startsWith('+')) return '#991b1b'
  return SCORE_COLORS[ev.label] ?? '#ef4444'
}

function isHighlight(ev: FeedEvent) {
  return ev.event_type === 'contest' || ev.event_type === 'chulligan' || ev.event_type === 'putt' || ['Hole in One!', 'Eagle', 'Birdie'].includes(ev.label)
}


interface LeaderRow {
  team: Team & { player1?: Player; player2?: Player }
  toPar: number
  gross: number
  thru: number
}

interface DefendingChamp {
  teamName: string
  player1Name: string | null
  player2Name: string | null
  toPar: number | null
  year: number
}

export default function Dashboard() {
  const { profile } = useAuth()
  const { isDark } = useTheme()
  const navigate = useNavigate()
  const { tournaments, viewingTournamentId, effectiveTournamentId, isCurrentYear, setViewingTournamentId, activeTournamentId } = useYear()
  const [leaders, setLeaders] = useState<LeaderRow[]>([])
  const [updates, setUpdates] = useState<Update[]>([])
  const [feed, setFeed] = useState<FeedEvent[]>([])
  const [playerCount, setPlayerCount] = useState(0)
  const [teamCount, setTeamCount] = useState(0)
  const [quoteIdx, setQuoteIdx] = useState(0)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640)
  const [defendingChamp, setDefendingChamp] = useState<DefendingChamp | null>(null)

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => {
    const i = setInterval(() => {
      setQuoteIdx(n => (n + 1) % ALL_QUOTES.length)
    }, 7000)
    return () => clearInterval(i)
  }, [])

  useEffect(() => { fetchData(); fetchDefendingChamp() }, [effectiveTournamentId])
  useEffect(() => {
    fetchFeedRef.current = fetchFeed
  })
  useEffect(() => {
    fetchFeed()

    if (!isCurrentYear) return

    const channel = supabase
      .channel('feed_events_dashboard')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'feed_events' }, payload => {
        setFeed(prev => [payload.new as FeedEvent, ...prev].slice(0, 7))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'feed_events' }, () => {
        fetchFeedRef.current()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCurrentYear, effectiveTournamentId])

  const fetchFeed = async () => {
    if (!effectiveTournamentId) { setFeed([]); return }
    const { data: eventsData } = await supabase
      .from('feed_events').select('*')
      .eq('tournament_id', effectiveTournamentId)
      .order('created_at', { ascending: false }).limit(7)
    const evs = (eventsData ?? []) as FeedEvent[]
    setFeed(evs)
  }

  const fetchFeedRef = useRef(fetchFeed)

  const fetchDefendingChamp = async () => {
    const { data: lastT } = await supabase
      .from('tournaments').select('id, year').eq('status', 'completed')
      .order('year', { ascending: false }).limit(1).single()
    if (!lastT) return
    const { data: result } = await supabase
      .from('tournament_results').select('*')
      .eq('tournament_id', lastT.id).eq('category', 'champion').single()
    if (!result) return
    setDefendingChamp({
      teamName: result.team_name ?? '',
      player1Name: result.player1_name ?? null,
      player2Name: result.player2_name ?? null,
      toPar: result.score_to_par ?? null,
      year: lastT.year,
    })
  }

  const fetchData = async () => {
    if (!effectiveTournamentId) { setLeaders([]); setTeamCount(0); return }
    let teamsQ = supabase.from('teams').select('*, player1:profiles!teams_p1_id_fkey(*), player2:profiles!teams_p2_id_fkey(*)')
    teamsQ = teamsQ.eq('tournament_id', effectiveTournamentId)
    const [teamsRes, scoresRes, playersRes, updatesRes] = await Promise.all([
      teamsQ,
      supabase.from('scores').select('*'),
      supabase.from('profiles').select('id', { count: 'exact' }).eq('status', 'active'),
      supabase.from('updates').select('*').order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(3),
    ])

    const teams: (Team & { player1?: Player; player2?: Player })[] = teamsRes.data ?? []
    const scores: Score[] = scoresRes.data ?? []
    setPlayerCount(playersRes.count ?? 0)
    setTeamCount(teams.length)
    setUpdates(updatesRes.data ?? [])

    const rows: LeaderRow[] = teams.map(team => {
      const teamScores = scores.filter(s => s.team_id === team.id)
      const gross = teamScores.reduce((sum, s) => sum + s.score, 0)
      const thru = teamScores.length
      const toPar = gross - (thru * (COURSE_PAR / 18))
      return { team, gross, thru, toPar }
    })
    rows.sort((a, b) => a.toPar - b.toPar || b.thru - a.thru)
    setLeaders(rows.slice(0, 5))
  }

  const toPar = (n: number) => n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`
  const currentQuote = ALL_QUOTES[quoteIdx]

  const completedTournaments = tournaments.filter(t => t.status === 'completed')
  const viewingTournament = viewingTournamentId ? tournaments.find(t => t.id === viewingTournamentId) : null

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>

      {/* ── Year Selector ─────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18,
        padding: '10px 16px', borderRadius: 12,
        background: 'var(--surf)',
        border: '1px solid var(--bdr)',
      }}>
        <span style={{ fontSize: 12, color: 'var(--tx3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', flexShrink: 0 }}>
          📅 Year
        </span>
        <select
          value={viewingTournamentId ?? ''}
          onChange={e => setViewingTournamentId(e.target.value || null)}
          style={{ flex: 1, maxWidth: 220 }}
        >
          <option value="">Current Tournament ({activeTournamentId ? tournaments.find(t => t.id === activeTournamentId)?.year : '—'})</option>
          {completedTournaments.map(t => (
            <option key={t.id} value={t.id}>{t.name} ({t.year})</option>
          ))}
        </select>
        {completedTournaments.length === 0 && (
          <span style={{ fontSize: 11, color: 'var(--tx5)', fontStyle: 'italic' }}>
            Past years appear here after archiving
          </span>
        )}
        {!isCurrentYear && viewingTournament && (
          <span style={{ fontSize: 11, color: 'rgba(252,181,20,0.6)', fontWeight: 600 }}>
            🔒 {viewingTournament.name} ({viewingTournament.year})
          </span>
        )}
      </div>

      {/* Waitlist banner */}
      {profile?.status === 'waitlist' && isCurrentYear && (
        <div style={{
          background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: 14, padding: '14px 20px', marginBottom: 20,
          display: 'flex', gap: 12, alignItems: 'center',
        }}>
          <span style={{ fontSize: 20 }}>⏳</span>
          <div>
            <div style={{ fontWeight: 700, color: '#f59e0b', fontSize: 14 }}>You're on the Waitlist</div>
            <div style={{ fontSize: 13, color: 'var(--tx3)', marginTop: 2 }}>
              We'll reach out when a spot opens. Hang tight!
            </div>
          </div>
        </div>
      )}

      {/* ── Compact Hero ─────────────────────────────────────── */}
      <div className="animate-fadeUp" style={{
        marginBottom: 14, borderRadius: 12, overflow: 'hidden',
        border: '1px solid rgba(252,181,20,0.22)',
        background: isDark
          ? 'linear-gradient(135deg, #0e0a02 0%, #1a1000 50%, #0e0a02 100%)'
          : 'linear-gradient(135deg, #fffbef 0%, #fff8e1 50%, #fffbef 100%)',
      }}>
        <div style={{ padding: isMobile ? '8px 12px' : '12px 18px', display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12 }}>
          {!isMobile && (
            <div className="animate-glow-pulse" style={{ width: 38, height: 38, borderRadius: '50%', border: '2px solid rgba(252,181,20,0.6)', overflow: 'hidden', flexShrink: 0 }}>
              <img src={CHUBBS_IMG} alt="Chubbs" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="text-shimmer" style={{ fontFamily: 'Bebas Neue', fontSize: isMobile ? 15 : 20, letterSpacing: isMobile ? 2 : 3, lineHeight: 1 }}>
              The Chubbs Memorial
            </div>
            <div style={{ display: 'flex', gap: isMobile ? 6 : 10, flexWrap: 'wrap', fontSize: isMobile ? 10 : 11, color: 'var(--tx3)', marginTop: 3 }}>
              <span>⛳ {COURSE_NAME}</span>
              <span>📅 {TOURNAMENT_DATE}</span>
              {!isMobile && <span>🕗 {FIRST_TEE_TIME}</span>}
            </div>
          </div>

          <div style={{ flexShrink: 0, textAlign: 'right' }}>
            {!isMobile && <div style={{ fontSize: 9, color: 'var(--tx4)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 1 }}>Welcome</div>}
            <div style={{ fontFamily: 'Bebas Neue', fontSize: isMobile ? 15 : 19, color: '#FCB514', letterSpacing: 2, lineHeight: 1 }}>
              {profile ? displayName(profile) : 'Player'}
            </div>
          </div>
        </div>

        {!isMobile && (
          <div style={{ borderTop: '1px solid rgba(252,181,20,0.08)', padding: '5px 18px', background: 'rgba(0,0,0,0.2)', fontSize: 11 }}>
            <span style={{ color: 'var(--tx3)', fontStyle: 'italic' }}>💬 "{currentQuote.quote}"</span>
            <span style={{ color: 'rgba(252,181,20,0.4)', marginLeft: 6 }}>— {currentQuote.by}</span>
          </div>
        )}
      </div>

      {/* ── Defending Champions ──────────────────────────────── */}
      {defendingChamp && (
        <div className="animate-fadeUp" style={{
          marginBottom: 14, borderRadius: 12,
          border: '1px solid rgba(252,181,20,0.2)',
          background: 'linear-gradient(135deg, rgba(252,181,20,0.06) 0%, rgba(12,8,0,0.0) 100%)',
          padding: isMobile ? '10px 14px' : '12px 18px',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 22, flexShrink: 0 }}>🏆</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: 'rgba(252,181,20,0.55)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 2 }}>
              {defendingChamp.year} Defending Champions
            </div>
            <div style={{ fontFamily: 'Bebas Neue', fontSize: isMobile ? 16 : 20, color: '#FCB514', letterSpacing: 2, lineHeight: 1 }}>
              {defendingChamp.teamName}
            </div>
            {(defendingChamp.player1Name || defendingChamp.player2Name) && (
              <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 2 }}>
                {[defendingChamp.player1Name, defendingChamp.player2Name].filter(Boolean).join(' & ')}
              </div>
            )}
          </div>
          {defendingChamp.toPar != null && (
            <div style={{
              fontFamily: 'Bebas Neue', fontSize: 20, letterSpacing: 1, flexShrink: 0,
              color: defendingChamp.toPar < 0 ? '#34d399' : defendingChamp.toPar > 0 ? '#f87171' : '#FCB514',
            }}>
              {defendingChamp.toPar === 0 ? 'E' : defendingChamp.toPar > 0 ? `+${defendingChamp.toPar}` : defendingChamp.toPar}
            </div>
          )}
        </div>
      )}

      {/* ── Live Leaderboard + Live Scoring Feed ─────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 20 }}>

        {/* Live leaderboard */}
        <div className="glass animate-fadeUp delay-100" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{
            padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 8,
            borderBottom: '1px solid rgba(252,181,20,0.1)',
            background: 'rgba(252,181,20,0.04)',
          }}>
            <Trophy size={15} color="#FCB514" />
            <span style={{ fontWeight: 700, fontSize: 14, color: '#FCB514' }}>{isCurrentYear ? 'Live Leaderboard' : 'Final Standings'}</span>
            {isCurrentYear && <span className="animate-pulseDot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#FCB514', marginLeft: 'auto', display: 'inline-block' }} />}
          </div>
          {leaders.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--tx4)', fontSize: 14 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>⛳</div>
              No scores yet — may the best ball win.
            </div>
          ) : (
            leaders.map((row, i) => (
              <div key={row.team.id} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
                borderBottom: i < leaders.length - 1 ? '1px solid var(--bdr)' : 'none',
                background: i === 0 ? 'rgba(252,181,20,0.03)' : 'transparent',
              }}>
                <span style={{ fontSize: 18, width: 26, flexShrink: 0 }}>
                  {i === 0 ? '🏆' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span style={{ fontSize: 13, color: 'var(--tx3)', fontWeight: 700 }}>{i + 1}</span>}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: i === 0 ? '#FCB514' : 'var(--tx1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {row.team.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--tx3)' }}>
                    {[row.team.player1 && displayName(row.team.player1), row.team.player2 && displayName(row.team.player2)].filter(Boolean).join(' & ')}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: row.toPar <= 0 ? '#FCB514' : 'var(--tx2)' }}>
                    {toPar(Math.round(row.toPar))}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--tx3)' }}>thru {row.thru}</div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Live Scoring Feed */}
        <div
          className="glass animate-fadeUp delay-200"
          onClick={() => navigate('/live-feed')}
          style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }}
        >
          <div style={{
            padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 8,
            borderBottom: '1px solid rgba(252,181,20,0.1)',
            background: 'rgba(252,181,20,0.04)',
          }}>
            <span style={{ fontSize: 15 }}>⚡</span>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#FCB514' }}>Live Feed</span>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, color: 'rgba(252,181,20,0.5)' }}>View all →</span>
              <span className="animate-pulseDot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: '#22c55e', letterSpacing: 1.5, textTransform: 'uppercase' }}>Live</span>
            </div>
          </div>
          {feed.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>⛳</div>
              <div style={{ fontSize: 14, color: 'var(--tx3)' }}>Events appear here as scores and chulligans are recorded</div>
            </div>
          ) : (
            feed.map((ev, i) => {
              const color = eventColor(ev)
              const highlight = isHighlight(ev)
              return (
                <div key={ev.id} style={{
                  padding: '11px 20px',
                  borderBottom: i < feed.length - 1 ? '1px solid var(--bdr)' : 'none',
                  background: highlight ? 'rgba(252,181,20,0.02)' : 'transparent',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                      background: highlight ? 'rgba(252,181,20,0.1)' : 'var(--surf)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 18,
                    }}>{ev.emoji}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: 1.2 }}>
                          {ev.label}
                        </span>
                        {ev.event_type === 'contest' && ev.label.includes('Vote') ? (
                          <span style={{ fontSize: 13, color: 'var(--tx2)' }}>
                            <strong style={{ color: 'var(--tx1)', fontWeight: 700 }}>{ev.voter_name}</strong>
                            {' voted '}
                            <strong style={{ color: '#FCB514', fontWeight: 700 }}>{ev.player_name}</strong>
                            {' for jackass'}
                          </span>
                        ) : ev.event_type === 'contest' ? (
                          ev.player_name && (
                            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--tx1)' }}>{ev.player_name}</span>
                          )
                        ) : (
                          <>
                            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--tx1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {ev.team_name || 'Unknown Team'}
                            </span>
                            {ev.player_name && (
                              <span style={{ fontSize: 12, color: 'var(--tx3)' }}>{ev.player_name}</span>
                            )}
                            <span style={{ fontSize: 12, color: 'var(--tx3)', flexShrink: 0 }}>
                              Hole {ev.hole}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {ev.score != null && ev.event_type === 'score' && (
                        <div>
                          <div style={{ fontSize: 9, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: 1 }}>Score</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color, fontFamily: 'Bebas Neue', letterSpacing: 1 }}>
                            {ev.score}
                          </div>
                        </div>
                      )}
                      <div style={{ fontSize: 10, color: 'var(--tx4)' }}>
                        {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ── Stats row ─────────────────────────────────────────── */}
      <div className="animate-fadeUp delay-300" style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        gap: 10, marginBottom: 20,
      }}>
        {[
          { label: 'Players', value: playerCount, icon: <Users size={18} />, sub: 'confirmed' },
          { label: 'Teams',   value: teamCount,   icon: <Trophy size={18} />, sub: 'competing' },
          { label: 'Par',     value: COURSE_PAR,  icon: <Flag size={18} />, sub: '18 holes' },
          {
            label: 'Leader',
            value: leaders[0] ? toPar(Math.round(leaders[0].toPar)) : '—',
            icon: '🏆',
            sub: leaders[0]
              ? `${leaders[0].team.name} · ${[leaders[0].team.player1 && displayName(leaders[0].team.player1), leaders[0].team.player2 && displayName(leaders[0].team.player2)].filter(Boolean).join(' & ')}`
              : 'TBD',
          },
        ].map(({ label, value, icon, sub }) => (
          <div key={label} className="glass" style={{
            padding: '18px 16px', textAlign: 'center',
            borderColor: label === 'Leader' && leaders[0] ? 'rgba(252,181,20,0.3)' : undefined,
          }}>
            <div style={{ color: '#FCB514', marginBottom: 8, display: 'flex', justifyContent: 'center', opacity: 0.85 }}>
              {typeof icon === 'string' ? <span style={{ fontSize: 18 }}>{icon}</span> : icon}
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--tx1)', lineHeight: 1, fontFamily: 'Bebas Neue', letterSpacing: 1 }}>{value}</div>
            <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
            <div style={{ fontSize: 11, color: 'rgba(252,181,20,0.6)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* ── Updates ───────────────────────────────────────────── */}
      <div
        className="glass animate-fadeUp delay-400"
        onClick={() => navigate('/updates')}
        style={{ padding: 0, overflow: 'hidden', marginBottom: 20, cursor: 'pointer' }}
      >
        <div style={{
          padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 8,
          borderBottom: '1px solid rgba(252,181,20,0.1)',
          background: 'rgba(252,181,20,0.04)',
        }}>
          <Pin size={15} color="#FCB514" />
          <span style={{ fontWeight: 700, fontSize: 14, color: '#FCB514' }}>Updates</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(252,181,20,0.5)' }}>View all →</span>
        </div>
        {updates.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--tx4)', fontSize: 14 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
            No updates yet
          </div>
        ) : (
          updates.map((u, i) => (
            <div key={u.id} style={{
              padding: '14px 20px',
              borderBottom: i < updates.length - 1 ? '1px solid var(--bdr)' : 'none',
              borderLeft: u.pinned ? '3px solid #FCB514' : '3px solid transparent',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                {u.pinned && (
                  <span style={{ fontSize: 10, color: '#FCB514', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                    📌 Pinned
                  </span>
                )}
                <span style={{ fontSize: 11, color: 'var(--tx4)', marginLeft: 'auto' }}>
                  {formatDistanceToNow(new Date(u.created_at), { addSuffix: true })}
                </span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--tx1)', marginBottom: 4 }}>{u.title}</div>
              <div style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.55 }}>{u.body}</div>
            </div>
          ))
        )}
      </div>

      {/* ── Chubbs Legacy card ────────────────────────────────── */}
      <div className="glass animate-fadeUp delay-400" style={{
        padding: 0, overflow: 'hidden',
        borderColor: 'rgba(252,181,20,0.2)',
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>

          {/* Portrait panel */}
          <div style={{
            width: 200, flexShrink: 0,
            background: 'linear-gradient(160deg, #130e02 0%, #1e1500 100%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '28px 24px', gap: 12,
            borderRight: '1px solid rgba(252,181,20,0.12)',
          }}>
            <div style={{
              width: 110, height: 110, borderRadius: '50%',
              border: '2px solid rgba(252,181,20,0.5)',
              overflow: 'hidden',
              boxShadow: '0 0 30px rgba(252,181,20,0.15)',
            }}>
              <img
                src={CHUBBS_IMG}
                alt="Chubbs Peterson"
                style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(0.25) contrast(1.05)' }}
              />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: 18, color: '#FCB514', letterSpacing: 2 }}>Chubbs Peterson</div>
              <div style={{ fontSize: 10, color: 'var(--tx3)', letterSpacing: 2, textTransform: 'uppercase', marginTop: 2 }}>Golf Legend</div>
            </div>
          </div>

          {/* Text panel */}
          <div style={{ flex: 1, padding: '28px 28px', minWidth: 220 }}>
            <div style={{ fontSize: 10, letterSpacing: 4, color: 'rgba(252,181,20,0.55)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>
              The Legend
            </div>
            <p style={{ fontSize: 14, color: 'var(--tx2)', lineHeight: 1.75, marginBottom: 16 }}>
              Chubbs Peterson was a PGA-bound prodigy — the most naturally gifted golfer anyone had ever seen. A one-handed grip, a philosophy built entirely around hip rotation, and a belief in every underdog he ever coached. His career was cut short on the 18th hole by an alligator with a personal vendetta. His legacy lives on in every tap-in, every birdie, and every swing that comes from the hips.
            </p>
            <div style={{
              fontSize: 13, color: 'var(--tx3)', fontStyle: 'italic',
              paddingLeft: 14, borderLeft: '2px solid rgba(252,181,20,0.35)', lineHeight: 1.6,
            }}>
              "I would have been a pro if it wasn't for those damn alligators."
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          borderTop: '1px solid rgba(252,181,20,0.08)',
          padding: '12px 24px',
          background: 'rgba(0,0,0,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        }}>
          <hr className="divider-gold" style={{ flex: 1 }} />
          <span style={{ fontSize: 22 }}>🐊</span>
          <hr className="divider-gold" style={{ flex: 1 }} />
        </div>
      </div>

    </div>
  )
}
