import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { displayName, HOLE_PARS } from '../lib/types'
import type { Team, Player } from '../lib/types'

type ScoreRow = { hole: number; score: number; putts: number | null; drive_used_id: string | null }

// ── Bio generator ─────────────────────────────────────────
const BIO_TEMPLATES = [
  "{n} has a 36 handicap but insists he plays to a 14. His most impressive shot of any round is opening a beer with his teeth.",
  "{n} treats every mulligan like a divine right and every fairway like a suggestion. He once lost a ball in a water hazard that was clearly marked with a sign.",
  "The only thing longer than {n}'s backswing is his excuse list. He showed up to the last round still drunk from the night before and somehow shot his best round.",
  "{n} brings a flask to every round and calls it a performance enhancer. His handicap has gone up four strokes since joining this tournament, which somehow tracks.",
  "According to {n}, every bad shot is the club's fault, the course's fault, or the sun's fault — never his. He once spent 15 minutes looking for a ball that was in his pocket.",
  "{n} smokes half a pack before the turn and claims it steadies his nerves. His idea of a warm-up is finishing someone else's breakfast.",
  "{n} has the reading speed of a toddler and applies the same skill to golf greens. He's 2-for-47 on sand saves, which he calls statistically impressive.",
  "Medical professionals would describe {n}'s golf swing as a controlled fall. He averages four lost balls per nine holes and counts it as cardio.",
  "{n} shows up to every round with a full set of expensive clubs he has no idea how to use. His drives are less 'controlled draw' and more 'everyone run.'",
  "The last time {n} hit a fairway, flip phones were still a thing. He compensates by being absolutely insufferable about golf strategy he read on Reddit.",
  "{n} is the kind of guy who takes a 10 and writes down a 7 on the scorecard. He's also the guy who asks for a foot wedge in front of everyone and acts like it's normal.",
  "Sources close to {n} confirm he once four-putted from inside two feet and immediately blamed the green keeper. He considers drinking a social skill and a sport.",
  "{n}'s approach to golf is the same as his approach to life — swing hard and hope for the best. He's been 'about to quit smoking' for six years.",
  "Nobody in the group has taken more penalty strokes than {n}, which he refers to as aggressive course management. He drives the same way — fast, reckless, and somehow always blaming someone else.",
  "{n} insists he was hitting it great on the range and then proceeds to open with a triple bogey. He's also the guy who takes the longest to putt and still three-putts.",
  "The rules of golf were clearly written before {n} existed, and he exploits every loophole accordingly. He once declared a ball unplayable because a butterfly landed near it.",
  "{n} thinks divot repair means walking over it. He's been told his tempo is 'aggressive' by four separate golf pros, all of whom said it was unsalvageable.",
  "At some point {n} decided that crying about his score is a legitimate strategy and has been executing it flawlessly. His handicap is higher than his IQ score, but only barely.",
  "{n} is what happens when someone watches too many golf YouTube videos and practices none of it. He's been playing for 10 years and is somehow getting worse.",
  "Legend has it {n} once birdied a hole, but nobody witnessed it and the scorecard doesn't show it. He treats the honor system in golf the same way he treats speed limits.",
  "{n} takes three practice swings and then completely ignores whatever he just practiced. He's the kind of guy who shushes people during his backswing but talks through everyone else's.",
  "When {n} is in the rough, the rough is in trouble — because he's about to take half of it with him. He's had more lost balls than friends who still play with him voluntarily.",
  "The thing about {n} is that he truly believes he's better than he is. They did not have {n} in mind when they invented the word 'confidence.'",
  "{n} has the short game of a Golden Retriever and the course management of someone who just discovered golf yesterday. His post-round analysis is always someone else's fault.",
  "{n} drinks two beers on the front nine and calls it taking the edge off. By the back nine, the edge is fully off and so is his ability to hold a club.",
  "Rumor has it {n} once parred three holes in a row and immediately called it divine intervention. He's since been unable to replicate it, which everyone around him finds hilarious.",
  "{n} gives golf advice like he knows what he's talking about, which is medically concerning given how he actually plays. He's the loudest member of the group and the worst golfer.",
  "{n} once dropped a ball from shoulder height on a slope and called it relief. He lost a club in a pond in 2019 and has been rebuilding his life ever since.",
  "{n} claims he was distracted by a bird, a cloud, a passing car, wind, and general cosmic forces on every single bad shot. He is statistically speaking the worst driver in the group both on and off the course.",
  "The only consistency in {n}'s game is his ability to lose a ball every single round. He approaches the 19th hole with the same enthusiasm he should have brought to the first.",
  "{n} considers reading the green to mean walking around it for four minutes before three-putting anyway. He also considers himself a serious golfer, which everyone respects by saying nothing.",
  "Golf instructors have a file on {n} that they use as a cautionary tale. He's the guy who blames bad karma for a shank, right before doing it again.",
  "{n} treats every par like an eagle and every bogey like it was the course's fault. He's also somehow on his third set of irons in two years, which should tell you everything.",
  "When {n} says he's playing well today, prepare for carnage. He defines playing well as only losing four balls before the turn.",
  "{n} has a pre-shot routine that takes 45 seconds and produces the same result as no routine at all. He calls himself a feel player, which is a compliment he does not deserve.",
  "{n} once asked what OB stood for mid-round and then proceeded to hit it there twice. He describes every round as 'building momentum' on the drive home.",
  "{n} has never met a gimmie he wouldn't accept from 8 feet out. He also has never met a round he wouldn't embellish by at least four strokes at the bar afterwards.",
  "{n} is the reason the cart path exists — not for convenience, but for everyone else's safety. His playing partners wear helmets emotionally if not physically.",
  "The best part of playing with {n} is that you always feel better about your own game. The worst part is everything else about playing with {n}.",
  "{n} approaches every par-3 like it personally wronged him and every par-5 like it owes him money. Neither hole feels the same way about {n}.",
]

function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function getBio(playerId: string, name: string): string {
  const template = BIO_TEMPLATES[hashCode(playerId) % BIO_TEMPLATES.length]
  return template.replace(/\{n\}/g, name)
}

// ── Stats helpers ─────────────────────────────────────────
function calcStats(scores: ScoreRow[]) {
  const played = scores.filter(s => s.score > 0)
  const gross = played.reduce((a, s) => a + s.score, 0)
  const parSoFar = played.reduce((a, s) => a + HOLE_PARS[s.hole - 1], 0)
  const toPar = gross - parSoFar
  const putts = played.reduce((a, s) => a + (s.putts ?? 0), 0)

  let eagles = 0, birdies = 0, pars = 0, bogeys = 0, doubles = 0
  for (const s of played) {
    const diff = s.score - HOLE_PARS[s.hole - 1]
    if (diff <= -2) eagles++
    else if (diff === -1) birdies++
    else if (diff === 0) pars++
    else if (diff === 1) bogeys++
    else doubles++
  }

  return { gross, toPar, putts, played: played.length, eagles, birdies, pars, bogeys, doubles }
}

function toParStr(n: number) { return n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}` }
function toParColor(n: number) { return n < 0 ? '#22c55e' : n > 0 ? '#ef4444' : '#FCB514' }

// ── Component ─────────────────────────────────────────────
export default function MyTeamPage() {
  const { profile } = useAuth()
  const [team, setTeam] = useState<Team | null>(null)
  const [scores, setScores] = useState<ScoreRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.team_id) { setLoading(false); return }
    Promise.all([
      supabase.from('teams').select(`
        id, name,
        player1:profiles!teams_p1_id_fkey(id, name, nickname, email, role, status, handicap, joined_at, team_id, shirt_size, notes, phone),
        player2:profiles!teams_p2_id_fkey(id, name, nickname, email, role, status, handicap, joined_at, team_id, shirt_size, notes, phone)
      `).eq('id', profile.team_id).single(),
      supabase.from('scores').select('hole, score, putts, drive_used_id').eq('team_id', profile.team_id),
    ]).then(([{ data: t }, { data: s }]) => {
      setTeam(t as unknown as Team)
      setScores((s ?? []) as ScoreRow[])
      setLoading(false)
    })
  }, [profile?.team_id])

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
      <div className="animate-spin" style={{ width: 36, height: 36, border: '3px solid rgba(252,181,20,0.2)', borderTopColor: '#FCB514', borderRadius: '50%' }} />
    </div>
  )

  if (!profile?.team_id || !team) return (
    <div className="glass animate-fadeUp" style={{ padding: '40px', textAlign: 'center', maxWidth: 480, margin: '40px auto' }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>⛳</div>
      <div style={{ fontWeight: 700, fontSize: 18, color: '#fff', marginBottom: 8 }}>You're not on a team yet</div>
      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>An admin will assign you to a team before the round.</div>
    </div>
  )

  const stats = calcStats(scores)
  const players = [team.player1, team.player2].filter(Boolean) as Player[]

  const driveCount = (playerId: string) => scores.filter(s => s.drive_used_id === playerId).length

  const breakdown = [
    { label: '🦅 Eagle', count: stats.eagles, color: '#FCB514' },
    { label: '🐦 Birdie', count: stats.birdies, color: '#22c55e' },
    { label: 'Par', count: stats.pars, color: 'rgba(255,255,255,0.6)' },
    { label: 'Bogey', count: stats.bogeys, color: '#f59e0b' },
    { label: 'Double+', count: stats.doubles, color: '#ef4444' },
  ]
  const maxBreakdown = Math.max(...breakdown.map(b => b.count), 1)

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 32, color: '#FCB514', letterSpacing: 4, margin: 0 }}>
          {team.name}
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, marginTop: 4 }}>
          {players.map(p => displayName(p)).join(' & ')}
        </p>
      </div>

      {/* Player cards */}
      <div style={{ display: 'grid', gridTemplateColumns: players.length > 1 ? '1fr 1fr' : '1fr', gap: 14, marginBottom: 20 }}>
        {players.map(p => (
          <div key={p.id} className="glass animate-fadeUp" style={{ padding: '22px 20px' }}>
            {/* Avatar */}
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(252,181,20,0.3), rgba(252,181,20,0.1))',
              border: '2px solid rgba(252,181,20,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, fontWeight: 800, color: '#FCB514',
              fontFamily: 'Bebas Neue', letterSpacing: 1,
              marginBottom: 12,
            }}>
              {displayName(p).charAt(0).toUpperCase()}
            </div>

            <div style={{ fontWeight: 800, fontSize: 17, color: '#fff', marginBottom: p.nickname ? 2 : 6 }}>
              {displayName(p)}
            </div>
            {p.nickname && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>{p.name}</div>
            )}

            {/* Bio */}
            <div style={{
              fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.65,
              fontStyle: 'italic', marginBottom: 16,
              padding: '10px 12px', borderRadius: 8,
              background: 'rgba(252,181,20,0.04)',
              borderLeft: '2px solid rgba(252,181,20,0.2)',
            }}>
              {getBio(p.id, displayName(p))}
            </div>

            {/* Player stats */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <StatChip label="Drives" value={driveCount(p.id)} />
              {p.handicap != null && <StatChip label="HCP" value={p.handicap} />}
            </div>
          </div>
        ))}
      </div>

      {/* Round summary */}
      {stats.played > 0 ? (
        <>
          <div className="glass animate-fadeUp" style={{ padding: '22px 26px', marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 18 }}>
              Round Summary
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 12 }}>
              <BigStat label="Score" value={`${stats.gross}`} sub={`${toParStr(stats.toPar)} to par`} color={toParColor(stats.toPar)} />
              <BigStat label="Thru" value={`${stats.played}`} sub="of 18 holes" />
              <BigStat label="Putts" value={`${stats.putts}`} sub="total" />
              {stats.birdies + stats.eagles > 0 && (
                <BigStat label="Under Par" value={`${stats.birdies + stats.eagles}`} sub="holes" color="#22c55e" />
              )}
            </div>
          </div>

          {/* Scoring breakdown */}
          <div className="glass animate-fadeUp" style={{ padding: '22px 26px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 18 }}>
              Scoring Breakdown
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {breakdown.map(({ label, count, color }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 70, fontSize: 12, color: 'rgba(255,255,255,0.55)', textAlign: 'right', flexShrink: 0 }}>{label}</div>
                  <div style={{ flex: 1, height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 999,
                      width: `${(count / maxBreakdown) * 100}%`,
                      background: color,
                      transition: 'width 0.6s ease',
                    }} />
                  </div>
                  <div style={{ width: 20, fontSize: 13, fontWeight: 700, color, textAlign: 'right', flexShrink: 0 }}>{count}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="glass animate-fadeUp" style={{ padding: '32px', textAlign: 'center', color: 'rgba(255,255,255,0.35)' }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🏌️</div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Round hasn't started yet</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Stats will appear once scores are entered.</div>
        </div>
      )}
    </div>
  )
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#FCB514', fontFamily: 'Bebas Neue', letterSpacing: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
    </div>
  )
}

function BigStat({ label, value, sub, color = '#fff' }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '12px 8px', borderRadius: 12, background: 'rgba(255,255,255,0.03)' }}>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color, fontFamily: 'Bebas Neue', letterSpacing: 2, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>{sub}</div>
    </div>
  )
}
