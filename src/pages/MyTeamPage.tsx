import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { displayName, HOLE_PARS } from '../lib/types'
import type { Team, Player } from '../lib/types'
import { Pencil, Check, X } from 'lucide-react'

type ScoreRow = { hole: number; score: number; putts: number | null; drive_used_id: string | null }

// ── Bio generator ─────────────────────────────────────────
const BIO_TEMPLATES = [
  "{n} once called 911 because his Roomba was acting suspicious. The operator stayed on the line out of genuine concern, not for {n}, but for the Roomba.",
  "{n} has been feuding with his neighbor since 2017 over a wind chime that plays three notes. He has filed four complaints, two police reports, and one noise ordinance petition with the city council.",
  "In 2019, {n} was briefly banned from a Sbarro in Phoenix, Arizona for reasons that have never been fully explained. He refers to the incident only as 'the calzone situation.'",
  "{n} lost his car in a Costco parking lot for four hours and emerged having purchased a kayak, a 48-pack of sparkling water, and a rotisserie chicken he ate in the car on the way home.",
  "{n} owns seventeen USB cables and cannot locate a single one. He has purchased new ones six times this year and considers this a systemic failure of the universe.",
  "There is a Wikipedia page about a minor geographical feature in rural Manitoba that {n} has edited 34 times, all of them disputed. He considers this his legacy.",
  "{n} has watched the same three episodes of The Deadliest Catch more times than he can count and considers himself knowledgeable about crab fishing. He is not.",
  "{n} once drove forty minutes to a restaurant that was closed, drove home, and then drove back because he left his sunglasses in the parking lot. He did not find the sunglasses.",
  "Authorities have never been able to confirm exactly how {n} got a golf cart stuck on top of a concrete barrier at a Home Depot in 2021. {n} has confirmed only that it 'made sense at the time.'",
  "{n} subscribed to a meal kit service in 2020, cooked two meals, and has been ignoring the weekly charges ever since. He has received 214 boxes. He does not know where the boxes go.",
  "The GrubHub algorithm has flagged {n}'s account three times for ordering behavior described in internal documents as 'statistically improbable.' He once ordered soup at 3:47 AM during a Tuesday.",
  "{n} has a strong opinion about the correct way to load a dishwasher that he will share unprompted. He is statistically wrong about 60% of it and will not be told this.",
  "In 2018, {n} became briefly famous in a regional Facebook group for a photograph of a cloud he described as 'shaped exactly like a Dodge Durango.' It was not.",
  "{n} once mispronounced 'quinoa' at a restaurant and then doubled down so confidently that the server left the table without correcting him. Three tables overheard.",
  "{n} has a collection of hotel key cards from places he has stayed that he keeps 'for some reason' in a drawer. There are 41 of them. He has been to 11 hotels.",
  "There is a review on Yelp from {n} for a gas station in Flagstaff that has been upvoted 847 times. It is four paragraphs long and concerns exclusively the squeegee situation.",
  "{n} returned a throw pillow to a TJ Maxx three weeks after purchase and was told he could not do that, at which point he produced a handwritten argument. He got the refund.",
  "{n} once found a phone number written in his own handwriting on a receipt from 2016 and has been trying to figure out whose it was ever since. He calls the number annually.",
  "The last time {n} assembled IKEA furniture, he finished with nine extra screws, a mystery panel, and a bookcase that holds things but only if you don't touch it.",
  "{n} has been 'about to switch banks' for eleven years. He does not know what is stopping him. Neither does his bank, which has sent him six retention offers he did not read.",
  "In 2022, {n} got into a comment section argument with a stranger about the correct name for the plastic tip on a shoelace and maintained his position for nine hours. The stranger was right.",
  "{n} has attempted to cancel a gym membership four times and has been a member since 2015. He went twice. Both times he just sat in the parking lot and then drove home.",
  "{n} once convinced himself he had a gas leak for an entire evening before discovering it was a candle. He had called a plumber, his landlord, and one ex-girlfriend during that time.",
  "The Home Depot staff in {n}'s zip code know him by name despite the fact that he has never successfully completed a home improvement project. They describe him as 'optimistic.'",
  "{n} has a draft text to his landlord that he has been editing since March. It is 340 words long. He has not sent it. He adds to it every few weeks and then closes the app.",
  "In 2020, {n} spent six weeks building a backyard deck that was immediately cited by his HOA for being 4 inches too wide. He has been in a cold war with the HOA since that afternoon.",
  "{n} once challenged a parking ticket in court, won, and then got a new parking ticket in the courthouse parking lot while he was inside winning. He has told this story 200 times.",
  "{n} has been carrying a reusable grocery bag in his car since 2019 and has used it twice. Both times he forgot he had it and bought a new one at checkout. He now has four bags in the car.",
  "{n} once ordered something from Amazon, forgot about it, ordered it again, forgot again, and received three of the same humidifier over the course of a single month. He kept all of them.",
  "The neighborhood watch email thread that {n} started in 2021 about a suspicious van has 94 replies, two counter-threads, and one resignation from the block captain. The van belonged to a plumber.",
  "{n} confidently told a group of people at a party that bats are blind. When corrected, he said 'that's what they want you to think' and changed the subject. He has not revisited this.",
  "{n} has an ongoing fantasy football team he has not logged into since Week 4. His team is somehow in third place. He takes partial credit for this.",
  "In 2023, {n} attempted to haggle at a Best Buy and was told they do not negotiate prices. He asked to speak to someone who did. He was escorted to the same employee. He bought the TV.",
  "{n} refers to the area behind his couch as 'the void' and has accepted that whatever falls back there is gone forever. Estimated contents include: three remotes, a passport, and $47 in change.",
  "{n} received a certified letter from the county in 2019, did not open it, moved twice, and still has it. He describes it as 'probably nothing.' He will not open it.",
  "According to people who have driven with {n}, he narrates other drivers' behavior in real time with the calm authority of a nature documentary. He has been doing this for 12 years.",
  "{n} has a notes app entry from 2021 that says only 'look into this' with no further context. He has looked at it 30 times and has not investigated anything.",
  "{n} once spent $340 on an ergonomic office chair, assembled it incorrectly, and has been sitting wrong on it for two years. His back is worse now than before the chair.",
  "The most terrifying 45 minutes of anyone's life is being in a Costco with {n} when he 'just needs two things.' He will emerge with a dolly, a regret, and a 9-pound bag of shredded cheese.",
  "{n} once confidently told everyone at a dinner that a movie came out in 1994 and it came out in 2001. He did not back down. He went home and googled it and has not brought it up since.",
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
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [saving, setSaving] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  async function saveName() {
    if (!team) return
    const trimmed = nameInput.trim()
    if (!trimmed || trimmed === team.name) { setEditingName(false); return }
    setSaving(true)
    const { error } = await supabase.from('teams').update({ name: trimmed }).eq('id', team.id)
    if (!error) setTeam({ ...team, name: trimmed })
    setSaving(false)
    setEditingName(false)
  }

  useEffect(() => {
    if (!profile?.team_id) { setLoading(false); return }
    Promise.all([
      supabase.from('teams').select(`
        id, name,
        player1:profiles!teams_p1_id_fkey(id, name, nickname, email, role, status, handicap, joined_at, team_id, notes, phone),
        player2:profiles!teams_p2_id_fkey(id, name, nickname, email, role, status, handicap, joined_at, team_id, notes, phone)
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
        {editingName ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <input
              ref={nameInputRef}
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false) }}
              maxLength={50}
              autoFocus
              style={{
                fontFamily: 'Bebas Neue', fontSize: 28, letterSpacing: 3, color: '#FCB514',
                background: 'rgba(252,181,20,0.07)', border: '1px solid rgba(252,181,20,0.4)',
                borderRadius: 8, padding: '4px 12px', outline: 'none', minWidth: 0, flex: 1,
              }}
            />
            <button onClick={saveName} disabled={saving} title="Save" style={{ background: 'rgba(252,181,20,0.15)', border: '1px solid rgba(252,181,20,0.3)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: '#FCB514', display: 'flex', alignItems: 'center' }}>
              <Check size={16} />
            </button>
            <button onClick={() => setEditingName(false)} title="Cancel" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center' }}>
              <X size={16} />
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 32, color: '#FCB514', letterSpacing: 4, margin: 0 }}>
              {team.name}
            </h1>
            <button
              onClick={() => { setNameInput(team.name); setEditingName(true) }}
              title="Rename team"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(252,181,20,0.35)', padding: 4, display: 'flex', alignItems: 'center', flexShrink: 0 }}
            >
              <Pencil size={14} />
            </button>
          </div>
        )}
        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, margin: 0 }}>
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
