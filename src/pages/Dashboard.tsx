import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { CHUBBS_QUOTES, COURSE_NAME, TOURNAMENT_DATE, FIRST_TEE_TIME, COURSE_PAR } from '../lib/types'
import type { Team, Score, Player, Update } from '../lib/types'
import { Trophy, Users, Clock, Pin } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

const CHUBBS_IMG = 'https://static.wikia.nocookie.net/sandlerverse/images/8/81/Chubbs_Peterson_in_Happy_Gilmore.webp'

interface LeaderRow {
  team: Team & { player1?: Player; player2?: Player }
  toPar: number
  gross: number
  thru: number
}

export default function Dashboard() {
  const { profile } = useAuth()
  const [leaders, setLeaders] = useState<LeaderRow[]>([])
  const [updates, setUpdates] = useState<Update[]>([])
  const [playerCount, setPlayerCount] = useState(0)
  const [teamCount, setTeamCount] = useState(0)
  const [quote, setQuote] = useState(CHUBBS_QUOTES[0])

  useEffect(() => {
    const i = setInterval(() => {
      setQuote(CHUBBS_QUOTES[Math.floor(Math.random() * CHUBBS_QUOTES.length)])
    }, 7000)
    return () => clearInterval(i)
  }, [])

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    const [teamsRes, scoresRes, playersRes, updatesRes] = await Promise.all([
      supabase.from('teams').select('*, player1:players!teams_p1_id_fkey(*), player2:players!teams_p2_id_fkey(*)'),
      supabase.from('scores').select('*'),
      supabase.from('players').select('id', { count: 'exact' }).eq('rsvp', 'in'),
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

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Hero */}
      <div className="glass animate-fadeUp" style={{
        padding: '32px',
        marginBottom: 24,
        background: 'linear-gradient(135deg, rgba(18,14,6,0.9) 0%, rgba(30,20,0,0.8) 100%)',
        borderColor: 'rgba(252,181,20,0.3)',
        display: 'flex', gap: 24, alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        <div className="animate-wiggle" style={{
          width: 88, height: 88, borderRadius: '50%',
          border: '3px solid #FCB514',
          boxShadow: '0 0 24px rgba(252,181,20,0.6)',
          overflow: 'hidden', flexShrink: 0,
        }}>
          <img src={CHUBBS_IMG} alt="Chubbs" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: 'Bebas Neue', fontSize: 36, color: '#FCB514', letterSpacing: 4, textShadow: '0 0 20px rgba(252,181,20,0.5)', lineHeight: 1 }}>
            The Chubbs Invitational
          </div>
          <div style={{ color: 'rgba(255,255,255,0.6)', marginTop: 8, fontSize: 14, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <span>⛳ {COURSE_NAME}</span>
            <span>📅 {TOURNAMENT_DATE}</span>
            <span>🕗 First tee: {FIRST_TEE_TIME}</span>
          </div>
          <div style={{ marginTop: 10, fontSize: 13, color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>
            "{quote}"
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Welcome back,</div>
          <div style={{ fontWeight: 700, color: '#FCB514', fontSize: 16 }}>{profile?.name ?? 'Player'}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>Best Ball Format</div>
        </div>
      </div>

      {/* Stats row */}
      <div className="animate-fadeUp delay-100" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Confirmed', value: playerCount, icon: <Users size={20} />, sub: 'players' },
          { label: 'Teams', value: teamCount, icon: <Trophy size={20} />, sub: 'competing' },
          { label: 'Course Par', value: COURSE_PAR, icon: <Clock size={20} />, sub: '18 holes' },
          { label: 'Leader', value: leaders[0] ? toPar(Math.round(leaders[0].toPar)) : '—', icon: '🏆', sub: leaders[0]?.team.name ?? 'TBD' },
        ].map(({ label, value, icon, sub }) => (
          <div key={label} className="glass" style={{ padding: '16px 20px', textAlign: 'center' }}>
            <div style={{ color: '#FCB514', marginBottom: 6, fontSize: 18 }}>{icon}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>{value}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{label}</div>
            <div style={{ fontSize: 10, color: 'rgba(252,181,20,0.6)' }}>{sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
        {/* Leaderboard preview */}
        <div className="glass animate-fadeUp delay-200" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(252,181,20,0.1)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Trophy size={16} color="#FCB514" />
            <span style={{ fontWeight: 700, fontSize: 14, color: '#FCB514' }}>Live Leaderboard</span>
            <span className="animate-pulseDot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#FCB514', marginLeft: 'auto' }} />
          </div>
          {leaders.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>
              No scores yet
            </div>
          ) : (
            leaders.map((row, i) => (
              <div key={row.team.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 20px',
                borderBottom: i < leaders.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
              }}>
                <span style={{ fontSize: 18, width: 24 }}>
                  {i === 0 ? '🏆' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {row.team.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                    {[row.team.player1?.name, row.team.player2?.name].filter(Boolean).join(' & ')}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, color: row.toPar <= 0 ? '#FCB514' : 'rgba(255,255,255,0.8)' }}>
                    {toPar(Math.round(row.toPar))}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>thru {row.thru}</div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Updates */}
        <div className="glass animate-fadeUp delay-300" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(252,181,20,0.1)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Pin size={16} color="#FCB514" />
            <span style={{ fontWeight: 700, fontSize: 14, color: '#FCB514' }}>Updates</span>
          </div>
          {updates.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>
              No updates yet
            </div>
          ) : (
            updates.map((u, i) => (
              <div key={u.id} style={{
                padding: '14px 20px',
                borderBottom: i < updates.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                borderLeft: u.pinned ? '3px solid #FCB514' : '3px solid transparent',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  {u.pinned && <span style={{ fontSize: 10, color: '#FCB514', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Pinned</span>}
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginLeft: 'auto' }}>
                    {formatDistanceToNow(new Date(u.created_at), { addSuffix: true })}
                  </span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#fff', marginBottom: 4 }}>{u.title}</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>{u.body}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
