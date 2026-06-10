import { useEffect, useState, useRef, memo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useYear } from '../context/YearContext'
import { displayName, HOLE_PARS } from '../lib/types'
import type { Team, Player } from '../lib/types'
import { Pencil, Check, X } from 'lucide-react'

type ScoreRow     = { hole: number; score: number; putts: number | null; drive_used_id: string | null }
type ChulliganRow = { id: string; player_id: string; hole: number }
type TeamFull     = Team & { player1?: Player; player2?: Player }

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

function toParStr(n: number)   { return n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}` }
function toParColor(n: number) { return n < 0 ? '#22c55e' : n > 0 ? '#ef4444' : '#FCB514' }

function scoreColor(score: number, par: number) {
  const d = score - par
  if (d <= -2) return '#FCB514'
  if (d === -1) return '#22c55e'
  if (d === 0)  return 'var(--tx2)'
  if (d === 1)  return '#f59e0b'
  return '#ef4444'
}

// ── Component ─────────────────────────────────────────────
export default function MyTeamPage() {
  const { profile } = useAuth()
  const { effectiveTournamentId, isCurrentYear } = useYear()
  const myTeamId = isCurrentYear ? (profile?.team_id ?? null) : null

  const [allTeams,      setAllTeams]      = useState<TeamFull[]>([])
  const [viewingTeamId, setViewingTeamId] = useState<string | null>(null)
  const [team,          setTeam]          = useState<TeamFull | null>(null)
  const [scores,        setScores]        = useState<ScoreRow[]>([])
  const [chulligans,    setChulligans]    = useState<ChulliganRow[]>([])
  const [loading,       setLoading]       = useState(true)
  const [editingName,   setEditingName]   = useState(false)
  const [nameInput,     setNameInput]     = useState('')
  const [saving,        setSaving]        = useState(false)

  const viewingTeamIdRef = useRef<string | null>(null)
  useEffect(() => { viewingTeamIdRef.current = viewingTeamId }, [viewingTeamId])

  const nameInputRef = useRef<HTMLInputElement>(null)

  // Load all teams for the tab bar
  useEffect(() => {
    if (!effectiveTournamentId) { setAllTeams([]); setLoading(false); return }
    let q = supabase.from('teams').select('*, player1:profiles!teams_p1_id_fkey(id, name, nickname), player2:profiles!teams_p2_id_fkey(id, name, nickname)')
    q = q.eq('tournament_id', effectiveTournamentId)
    q.then(({ data }) => {
        if (data) {
          const teams = data as unknown as TeamFull[]
          setAllTeams(teams)
          // Default: own team first, else first team
          const defaultId = myTeamId ?? (teams[0]?.id ?? null)
          setViewingTeamId(defaultId)
        } else {
          setLoading(false)
        }
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveTournamentId])

  // Load full data whenever selected team changes
  useEffect(() => {
    if (!viewingTeamId) return
    setLoading(true)
    Promise.all([
      supabase
        .from('teams')
        .select(`id, name,
          player1:profiles!teams_p1_id_fkey(id, name, nickname, email, role, status, handicap, joined_at, team_id, notes, phone, avatar_url),
          player2:profiles!teams_p2_id_fkey(id, name, nickname, email, role, status, handicap, joined_at, team_id, notes, phone, avatar_url)`)
        .eq('id', viewingTeamId)
        .single(),
      supabase.from('scores').select('hole, score, putts, drive_used_id').eq('team_id', viewingTeamId),
      supabase.from('chulligans').select('id, player_id, hole').eq('team_id', viewingTeamId),
    ]).then(([{ data: t }, { data: s }, { data: ch }]) => {
      setTeam(t as unknown as TeamFull)
      setScores((s ?? []) as ScoreRow[])
      setChulligans((ch ?? []) as ChulliganRow[])
      setLoading(false)
    })
  }, [viewingTeamId])

  // Real-time: reload current team's data on any change
  useEffect(() => {
    const reload = async () => {
      const tid = viewingTeamIdRef.current
      if (!tid) return
      const [{ data: s }, { data: ch }] = await Promise.all([
        supabase.from('scores').select('hole, score, putts, drive_used_id').eq('team_id', tid),
        supabase.from('chulligans').select('id, player_id, hole').eq('team_id', tid),
      ])
      if (s)  setScores(s as ScoreRow[])
      if (ch) setChulligans(ch as ChulliganRow[])
    }
    const sub = supabase.channel('myteam-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' },     reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chulligans' }, reload)
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [])

  async function saveName() {
    if (!team) return
    const trimmed = nameInput.trim()
    if (!trimmed || trimmed === team.name) { setEditingName(false); return }
    setSaving(true)
    const { error } = await supabase.from('teams').update({ name: trimmed }).eq('id', team.id)
    if (!error) {
      const updated = { ...team, name: trimmed }
      setTeam(updated)
      setAllTeams(prev => prev.map(t => t.id === team.id ? { ...t, name: trimmed } : t))
    }
    setSaving(false)
    setEditingName(false)
  }

  // ── No team, no teams in DB ───────────────────────────────
  if (!loading && allTeams.length === 0) return (
    <div className="glass animate-fadeUp" style={{ padding: '40px', textAlign: 'center', maxWidth: 480, margin: '40px auto' }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>⛳</div>
      <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--tx1)', marginBottom: 8 }}>No teams yet</div>
      <div style={{ color: 'var(--tx3)', fontSize: 14 }}>Teams will appear here once the tournament is set up.</div>
    </div>
  )

  // Tab order: own team first, then alphabetical
  const tabTeams = myTeamId
    ? [...allTeams].sort((a, b) => (a.id === myTeamId ? -1 : b.id === myTeamId ? 1 : 0))
    : allTeams

  const isOwnTeam = viewingTeamId === myTeamId && myTeamId !== null && isCurrentYear

  // ── Stats ─────────────────────────────────────────────────
  const stats      = calcStats(scores)
  const players    = [team?.player1, team?.player2].filter(Boolean) as Player[]
  const frontStats = calcStats(scores.filter(s => s.hole <= 9))
  const backStats  = calcStats(scores.filter(s => s.hole >= 10))

  const driveCount = (pid: string, from = 1, to = 18) =>
    scores.filter(s => s.hole >= from && s.hole <= to && s.drive_used_id === pid).length

  const scoreMap: Record<number, ScoreRow> = {}
  for (const s of scores) scoreMap[s.hole] = s

  const scorecardHalves = [
    { label: 'FRONT', tag: 'OUT', holes: Array.from({ length: 9 }, (_, i) => i + 1) },
    { label: 'BACK',  tag: 'IN',  holes: Array.from({ length: 9 }, (_, i) => i + 10) },
  ]

  const breakdown = [
    { label: '🦅 Eagle',  count: stats.eagles,  color: '#FCB514' },
    { label: '🐦 Birdie', count: stats.birdies,  color: '#22c55e' },
    { label: 'Par',        count: stats.pars,     color: 'var(--tx2)' },
    { label: 'Bogey',      count: stats.bogeys,   color: '#f59e0b' },
    { label: 'Double+',    count: stats.doubles,  color: '#ef4444' },
  ]
  const maxBreakdown = Math.max(...breakdown.map(b => b.count), 1)

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>

      {/* ── Team selector tabs ── */}
      {allTeams.length > 1 && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, marginBottom: 20 }}>
          {tabTeams.map(t => (
            <button
              key={t.id}
              onClick={() => { setViewingTeamId(t.id); setEditingName(false) }}
              className={`pill-tab ${viewingTeamId === t.id ? 'active' : ''}`}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}
            >
              <span>{t.name}{t.id === myTeamId ? ' ⭐' : ''}</span>
              {(t.player1 || t.player2) && (
                <span style={{ fontSize: 9, opacity: 0.55, whiteSpace: 'nowrap' }}>
                  {[t.player1 && displayName(t.player1), t.player2 && displayName(t.player2)].filter(Boolean).join(' & ')}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Loading ── */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
          <div className="animate-spin" style={{ width: 36, height: 36, border: '3px solid rgba(252,181,20,0.2)', borderTopColor: '#FCB514', borderRadius: '50%' }} />
        </div>
      ) : !team ? null : (
        <>
          {/* ── Read-only banner ── */}
          {!isOwnTeam && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '8px 14px', borderRadius: 10, background: 'var(--surf)', border: '1px solid var(--bdr)' }}>
              <span style={{ fontSize: 13 }}>👁</span>
              <span style={{ fontSize: 12, color: 'var(--tx3)' }}>Read-only — you can only edit your own team</span>
            </div>
          )}

          {/* ── Team header ── */}
          <div style={{ marginBottom: 28 }}>
            {isOwnTeam && editingName ? (
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
                <button onClick={() => setEditingName(false)} title="Cancel" style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: 'var(--tx3)', display: 'flex', alignItems: 'center' }}>
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: 'var(--tx4)', textTransform: 'uppercase', marginRight: 4 }}>
                  {isOwnTeam ? 'Your Team' : 'Viewing'}
                </div>
                <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 32, color: '#FCB514', letterSpacing: 4, margin: 0 }}>
                  {team.name}
                </h1>
                {isOwnTeam && (
                  <button
                    onClick={() => { setNameInput(team.name); setEditingName(true) }}
                    title="Rename team"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(252,181,20,0.35)', padding: 4, display: 'flex', alignItems: 'center', flexShrink: 0 }}
                  >
                    <Pencil size={14} />
                  </button>
                )}
              </div>
            )}
            <p style={{ color: 'var(--tx3)', fontSize: 13, margin: 0 }}>
              {players.map(p => displayName(p)).join(' & ')}
            </p>
          </div>

          {/* ── Player cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: players.length > 1 ? '1fr 1fr' : '1fr', gap: 14, marginBottom: 20 }}>
            {players.map(p => (
              <div key={p.id} className="glass animate-fadeUp" style={{ padding: '22px 20px' }}>
                <div style={{ marginBottom: 12 }}>
                  <AvatarCircle player={p} size={80} />
                </div>
                <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--tx1)', marginBottom: p.nickname ? 2 : 6 }}>
                  {displayName(p)}
                </div>
                {p.nickname && (
                  <div style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 6 }}>{p.name}</div>
                )}
                <div style={{
                  fontSize: 12, color: 'var(--tx2)', lineHeight: 1.65,
                  fontStyle: 'italic', marginBottom: 16,
                  padding: '10px 12px', borderRadius: 8,
                  background: 'rgba(252,181,20,0.04)',
                  borderLeft: '2px solid rgba(252,181,20,0.2)',
                }}>
                  {getBio(p.id, displayName(p))}
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <StatChip label="All Drives" value={driveCount(p.id)} />
                  {p.handicap != null && <StatChip label="HCP" value={p.handicap} />}
                </div>
              </div>
            ))}
          </div>

          {/* ── Content: round has started ── */}
          {stats.played > 0 ? (
            <>
              {/* Round Summary */}
              <div className="glass animate-fadeUp" style={{ padding: '22px 26px', marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: 'var(--tx3)', textTransform: 'uppercase', marginBottom: 18 }}>
                  Round Summary
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 12, marginBottom: 20 }}>
                  <BigStat label="Score"    value={`${stats.gross}`}            sub={`${toParStr(stats.toPar)} to par`} color={toParColor(stats.toPar)} />
                  <BigStat label="Thru"     value={`${stats.played}`}           sub="of 18 holes" />
                  <BigStat label="Putts"    value={`${stats.putts}`}            sub="total" />
                  {stats.birdies + stats.eagles > 0 && (
                    <BigStat label="Under Par" value={`${stats.birdies + stats.eagles}`} sub="holes" color="#22c55e" />
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, borderTop: '1px solid var(--bdr)', paddingTop: 16 }}>
                  {[
                    { label: 'Front 9', st: frontStats },
                    { label: 'Back 9',  st: backStats  },
                  ].map(({ label, st }) => (
                    <div key={label} style={{ textAlign: 'center', padding: '10px 8px', borderRadius: 10, background: 'var(--surf)' }}>
                      <div style={{ fontSize: 10, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{label}</div>
                      {st.played > 0 ? (
                        <>
                          <div style={{ fontSize: 22, fontWeight: 900, color: toParColor(st.toPar), fontFamily: 'Bebas Neue', letterSpacing: 2, lineHeight: 1 }}>
                            {st.gross}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 3 }}>
                            {toParStr(st.toPar)} · {st.played} holes
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: 14, color: 'var(--tx4)', marginTop: 4 }}>—</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Scorecard */}
              <div className="glass animate-fadeUp" style={{ padding: '20px 22px', marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: 'var(--tx3)', textTransform: 'uppercase', marginBottom: 14 }}>
                  Scorecard
                </div>
                {scorecardHalves.map(({ label, tag, holes }) => {
                  const holePars  = holes.map(h => HOLE_PARS[h - 1])
                  const totalPar  = holePars.reduce((a, p) => a + p, 0)
                  const played    = holes.filter(h => scoreMap[h])
                  const subtotal  = played.reduce((a, h) => a + scoreMap[h].score, 0)
                  const playedPar = played.reduce((a, h) => a + HOLE_PARS[h - 1], 0)
                  const toPar     = subtotal - playedPar
                  return (
                    <div key={label} style={{ marginBottom: 16 }}>
                      <div style={{ overflowX: 'auto' }}>
                        <div style={{ minWidth: 340 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: `60px repeat(9, 1fr) 52px`, gap: 2, marginBottom: 3 }}>
                            <div style={{ fontSize: 9, color: 'var(--tx3)', fontWeight: 700, padding: '2px 4px', letterSpacing: 1 }}>{label}</div>
                            {holes.map(h => (
                              <div key={h} style={{ fontSize: 10, color: 'var(--tx3)', textAlign: 'center', padding: '2px 0' }}>{h}</div>
                            ))}
                            <div style={{ fontSize: 9, color: 'var(--tx4)', textAlign: 'center', fontWeight: 700, padding: '2px 0' }}>{tag}</div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: `60px repeat(9, 1fr) 52px`, gap: 2, marginBottom: 3 }}>
                            <div style={{ fontSize: 9, color: 'var(--tx4)', padding: '2px 4px' }}>PAR</div>
                            {holePars.map((par, i) => (
                              <div key={i} style={{ fontSize: 10, color: 'var(--tx4)', textAlign: 'center', padding: '2px 0' }}>{par}</div>
                            ))}
                            <div style={{ fontSize: 10, color: 'var(--tx4)', textAlign: 'center', fontWeight: 700, padding: '2px 0' }}>{totalPar}</div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: `60px repeat(9, 1fr) 52px`, gap: 2, marginBottom: 3 }}>
                            <div style={{ fontSize: 9, color: 'var(--tx4)', padding: '2px 4px' }}>SCORE</div>
                            {holes.map((h, i) => {
                              const s = scoreMap[h]?.score ?? null
                              if (s === null) return (
                                <div key={h} style={{ fontSize: 10, color: 'var(--tx5)', textAlign: 'center', padding: '3px 0' }}>—</div>
                              )
                              return (
                                <div key={h} style={{ fontSize: 11, fontWeight: 700, color: scoreColor(s, holePars[i]), textAlign: 'center', padding: '3px 0' }}>{s}</div>
                              )
                            })}
                            <div style={{ fontSize: 11, fontWeight: 700, textAlign: 'center', padding: '3px 0', color: played.length > 0 ? toParColor(toPar) : 'var(--tx4)' }}>
                              {played.length > 0 ? `${subtotal}` : '—'}
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: `60px repeat(9, 1fr) 52px`, gap: 2, marginBottom: 3 }}>
                            <div style={{ fontSize: 9, color: 'var(--tx4)', padding: '2px 4px' }}>PUTTS</div>
                            {holes.map(h => {
                              const p = scoreMap[h]?.putts ?? null
                              return (
                                <div key={h} style={{ fontSize: 10, color: 'var(--tx4)', textAlign: 'center', padding: '3px 0' }}>
                                  {p !== null ? p : <span style={{ color: 'var(--tx5)' }}>—</span>}
                                </div>
                              )
                            })}
                            <div style={{ fontSize: 10, color: 'var(--tx4)', textAlign: 'center', padding: '3px 0', fontWeight: 700 }}>
                              {played.length > 0 ? played.reduce((a, h) => a + (scoreMap[h]?.putts ?? 0), 0) : '—'}
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: `60px repeat(9, 1fr) 52px`, gap: 2 }}>
                            <div style={{ fontSize: 9, color: 'var(--tx4)', padding: '2px 4px' }}>🍺</div>
                            {holes.map(h => {
                              const hit = chulligans.find(c => c.hole === h)
                              return (
                                <div key={h} style={{ textAlign: 'center', padding: '2px 0', fontSize: 11 }}>
                                  {hit ? '🍺' : <span style={{ color: 'var(--tx5)', fontSize: 9 }}>·</span>}
                                </div>
                              )
                            })}
                            <div />
                          </div>
                        </div>
                      </div>
                      {played.length > 0 && (
                        <div style={{ marginTop: 6, fontSize: 11, color: toParColor(toPar), textAlign: 'right', fontWeight: 600 }}>
                          {toParStr(toPar)} ({played.length} holes)
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Drive Usage */}
              {players.length === 2 && (
                <div className="glass animate-fadeUp" style={{ padding: '20px 26px', marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: 'var(--tx3)', textTransform: 'uppercase', marginBottom: 14 }}>
                    Drive Usage — min 4 per player per nine
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {[{ label: 'Front 9', from: 1, to: 9 }, { label: 'Back 9', from: 10, to: 18 }].map(({ label, from, to }) => (
                      <div key={label}>
                        <div style={{ fontSize: 10, color: 'var(--tx4)', marginBottom: 8, fontWeight: 600 }}>{label}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                          {players.map(p => {
                            const c  = driveCount(p.id, from, to)
                            const ok = c >= 4
                            return (
                              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <AvatarCircle player={p} size={22} />
                                <div style={{ flex: 1, fontSize: 12, color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {displayName(p)}
                                </div>
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                  <div style={{ fontSize: 16, fontWeight: 700, color: ok ? '#22c55e' : c > 0 ? '#FCB514' : 'var(--tx4)', minWidth: 20, textAlign: 'right' }}>{c}</div>
                                  {ok && <span style={{ fontSize: 10, color: '#22c55e' }}>✓</span>}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Chulligans */}
              {players.length === 2 && (
                <div className="glass animate-fadeUp" style={{ padding: '20px 26px', marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: 'var(--tx3)', textTransform: 'uppercase', marginBottom: 14 }}>
                    🍺 Chulligans — 1 per player per round (must chug)
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {players.map(p => {
                      const c = chulligans.find(ch => ch.player_id === p.id)
                      return (
                        <div key={p.id} style={{
                          flex: 1, textAlign: 'center', padding: '12px 10px', borderRadius: 12,
                          background: c ? 'rgba(252,181,20,0.1)' : 'var(--surf2)',
                          border: `1px solid ${c ? 'rgba(252,181,20,0.35)' : 'var(--bdr)'}`,
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                            <AvatarCircle player={p} size={36} />
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx2)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {displayName(p)}
                          </div>
                          <div style={{ fontSize: 22, marginBottom: 4 }}>{c ? '✅' : '🍺'}</div>
                          <div style={{ fontSize: 11, color: c ? '#FCB514' : 'var(--tx4)', fontWeight: 600 }}>
                            {c ? `Used H${c.hole}` : 'Available'}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Scoring Breakdown */}
              <div className="glass animate-fadeUp" style={{ padding: '22px 26px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: 'var(--tx3)', textTransform: 'uppercase', marginBottom: 18 }}>
                  Scoring Breakdown
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {breakdown.map(({ label, count, color }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 70, fontSize: 12, color: 'var(--tx2)', textAlign: 'right', flexShrink: 0 }}>{label}</div>
                      <div style={{ flex: 1, height: 8, borderRadius: 999, background: 'var(--surf2)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 999, width: `${(count / maxBreakdown) * 100}%`, background: color, transition: 'width 0.6s ease' }} />
                      </div>
                      <div style={{ width: 20, fontSize: 13, fontWeight: 700, color, textAlign: 'right', flexShrink: 0 }}>{count}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="glass animate-fadeUp" style={{ padding: '32px', textAlign: 'center', color: 'var(--tx3)' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>🏌️</div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Round hasn't started yet</div>
              <div style={{ fontSize: 13, marginTop: 6 }}>Stats will appear once scores are entered.</div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const AvatarCircle = memo(function AvatarCircle({ player, size }: { player: Player; size: number }) {
  const [err, setErr] = useState(false)
  const hasPhoto = !!player.avatar_url && !err
  const initial  = displayName(player).charAt(0).toUpperCase()
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      border: '2px solid rgba(252,181,20,0.4)',
      overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: hasPhoto ? '#111' : 'linear-gradient(135deg, rgba(252,181,20,0.3), rgba(252,181,20,0.1))',
      fontSize: size * 0.4, fontWeight: 800, color: '#FCB514',
      fontFamily: 'Bebas Neue', letterSpacing: 1,
    }}>
      {hasPhoto ? (
        <img
          src={player.avatar_url!}
          alt={displayName(player)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setErr(true)}
        />
      ) : initial}
    </div>
  )
})

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#FCB514', fontFamily: 'Bebas Neue', letterSpacing: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
    </div>
  )
}

function BigStat({ label, value, sub, color = '#fff' }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '12px 8px', borderRadius: 12, background: 'var(--surf)' }}>
      <div style={{ fontSize: 11, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color, fontFamily: 'Bebas Neue', letterSpacing: 2, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4 }}>{sub}</div>
    </div>
  )
}
