import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useYear } from '../context/YearContext'
import { localDb, parseJson } from '../lib/localDb'
import { enqueue } from '../lib/writeQueue'
import type { UpsertLeaheyVotePayload } from '../lib/writeQueue'
import { Skeleton } from '../components/Skeleton'
import { useTour } from '../context/TourContext'
import type { ContestEntry, Player, LeaheyVote } from '../lib/types'
import { displayName } from '../lib/types'
import { Target } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

type ContestType = 'ctp' | 'ld' | 'lahey'

function SkeletonContestRow() {
  return (
    <div className="glass" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <Skeleton width={36} height={36} radius={18} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Skeleton height={14} width="50%" />
        <Skeleton height={11} width="30%" />
      </div>
      <Skeleton width={48} height={20} radius={6} />
    </div>
  )
}

export default function Contests() {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const { effectiveTournamentId, isCurrentYear } = useYear()
  const { active: tourActive, stepAnchor } = useTour()
  const [tab, setTab] = useState<ContestType>('ctp')

  // Drive the contest tab from the tour so its Longest Drive / Jackass steps
  // land on the right sub-page.
  useEffect(() => {
    if (stepAnchor === 'ld-player' || stepAnchor === 'ld-photo') setTab('ld')
    else if (stepAnchor === 'lahey-title' || stepAnchor === 'lahey-vote') setTab('lahey')
  }, [stepAnchor])

  // CTP / LD state
  const [entries,        setEntries]        = useState<(ContestEntry & { player?: Player })[]>([])
  const [loading,        setLoading]        = useState(true)
  const [photoErr,       setPhotoErr]       = useState(false)
  const [lightbox,       setLightbox]       = useState<string | null>(null)

  // Lahey state — separate player list so it's always all active players
  const [laheyPlayers, setLaheyPlayers] = useState<Player[]>([])
  const [votes,        setVotes]        = useState<LeaheyVote[]>([])
  const [myVote,       setMyVote]       = useState<string | null>(null)
  const [selected,     setSelected]     = useState<string | null>(null)
  const [casting,      setCasting]      = useState(false)
  const [votingOpen,   setVotingOpen]   = useState(false)

  useEffect(() => {
    if (tab === 'lahey') {
      fetchLaheyData()
      const sub = supabase.channel('leahey-rt')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'leahey_votes' }, fetchLaheyData)
        .subscribe()
      return () => { supabase.removeChannel(sub) }
    } else {
      fetchContestData()
      const sub = supabase.channel('contests-rt')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'contest_entries' }, fetchContestData)
        .subscribe()
      return () => { supabase.removeChannel(sub) }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, effectiveTournamentId])

  useEffect(() => {
    if (profile && votes.length > 0) {
      const mine = votes.find(v => v.voter_id === profile.id)
      setMyVote(mine?.nominee_id ?? null)
      if (mine) setSelected(mine.nominee_id)
    } else if (profile && votes.length === 0) {
      setMyVote(null)
    }
  }, [votes, profile])

  const fetchContestData = async () => {
    if (!effectiveTournamentId) { setEntries([]); return }

    // Step 1: Show cached entries immediately — fast, works offline
    const localEntries = await localDb.contest_entries
      .where('tournament_id').equals(effectiveTournamentId).toArray()
    if (localEntries.length > 0) {
      setEntries(localEntries.filter(e => e.type === tab)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map(e => ({ ...e, player: parseJson<Player>(e.player_json) } as unknown as ContestEntry & { player?: Player })))
    }
    setLoading(false)

    // Step 2: Refresh from Supabase in background
    try {
      const { data: entriesData } = await supabase
        .from('contest_entries').select('*, player:profiles(*)')
        .eq('type', tab).eq('tournament_id', effectiveTournamentId)
        .order('created_at', { ascending: false })
      if (entriesData !== null) setEntries(entriesData)
    } catch { /* offline — cached entries already shown */ }
  }

  const fetchLaheyData = async () => {
    if (!effectiveTournamentId) { setLaheyPlayers([]); setVotes([]); return }

    const [playersRes, votesRes, settingsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('status', 'active').order('name'),
      supabase.from('leahey_votes').select('*').eq('tournament_id', effectiveTournamentId),
      supabase.from('tournament_settings').select('lahey_voting_open').eq('id', 1).single(),
    ])

    if (playersRes.data !== null) {
      setLaheyPlayers(playersRes.data)
      setVotes(votesRes.data ?? [])
      setVotingOpen(isCurrentYear ? (settingsRes.data?.lahey_voting_open ?? false) : false)
      return
    }

    // Supabase unavailable — fall back to local cache
    const [localProfiles, localVotes] = await Promise.all([
      localDb.profiles.where('status').equals('active').toArray(),
      localDb.leahey_votes.where('tournament_id').equals(effectiveTournamentId).toArray(),
    ])
    setLaheyPlayers(localProfiles as Player[])
    setVotes(localVotes as LeaheyVote[])
    setVotingOpen(false)
  }

  const castVote = async () => {
    if (tourActive) { showToast("Just practice — your vote won't count during the tour 😉"); return }
    if (!selected || !profile || selected === myVote) return
    setCasting(true)
    const isChange = !!myVote

    // Try Supabase first; queue on any network failure
    let voteError
    if (isChange) {
      ;({ error: voteError } = await supabase.from('leahey_votes')
        .update({ nominee_id: selected })
        .eq('voter_id', profile.id)
        .eq('tournament_id', effectiveTournamentId))
    } else {
      ;({ error: voteError } = await supabase.from('leahey_votes')
        .insert({ voter_id: profile.id, nominee_id: selected, ...(effectiveTournamentId && { tournament_id: effectiveTournamentId }) }))
    }

    if (!voteError) {
      navigator.vibrate?.([10, 150, 10])
      showToast(isChange ? 'Vote changed! 🔄 A new jackass rises.' : 'Vote cast! 🤠 Stay out of my way!')
      // Jackass voting is private — no feed event so it never shows to players.
      setCasting(false)
      fetchLaheyData()
      return
    }

    // Supabase unavailable — queue for later sync (vote only, no feed event)
    await enqueue('upsert_leahey_vote', {
      voter_id: profile.id, nominee_id: selected, tournament_id: effectiveTournamentId,
    } satisfies UpsertLeaheyVotePayload, { voter_id: profile.id, tournament_id: effectiveTournamentId })
    const fakeVote: LeaheyVote = { id: `offline-vote-${profile.id}`, voter_id: profile.id, nominee_id: selected, created_at: new Date().toISOString() }
    setVotes(prev => [...prev.filter(v => v.voter_id !== profile.id), fakeVote])
    setMyVote(selected)
    setCasting(false)
    navigator.vibrate?.([10, 150, 10])
    showToast(isChange ? 'Vote queued — will sync when online 🔄' : 'Vote queued — will sync when online 🤠')
  }

  // reset photo error state whenever the leader entry changes
  const leaderId = entries[0]?.id
  useEffect(() => { setPhotoErr(false) }, [leaderId])

  // close lightbox on Escape
  useEffect(() => {
    if (!lightbox) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lightbox])

  // ── Render ───────────────────────────────────────────────────

  // Longest Drive ranks by GPS yardage (one row per player, their best); CTP
  // stays latest-submission (the pin moves daily, so its distance is info only).
  const rankedEntries = (() => {
    if (tab !== 'ld') return entries
    const sorted = [...entries].sort((a, b) => (b.distance_yds ?? -1) - (a.distance_yds ?? -1))
    const seen = new Set<string>()
    const out: (ContestEntry & { player?: Player })[] = []
    for (const e of sorted) { if (!seen.has(e.player_id)) { seen.add(e.player_id); out.push(e) } }
    return out
  })()
  const leader = rankedEntries[0]

  // Distance label: LD in yards, CTP in feet/inches.
  const contestDist = (e: ContestEntry) => {
    if (e.distance_yds == null) return null
    if (e.type === 'ld') return `${Math.round(e.distance_yds)} yds`
    const totalFt = e.distance_yds * 3, ft = Math.floor(totalFt), inch = Math.round((totalFt - ft) * 12)
    return inch >= 12 ? `${ft + 1} ft` : inch > 0 ? `${ft} ft ${inch} in` : `${ft} ft`
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      {/* ── Lightbox ── */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out',
            padding: 16,
          }}
        >
          <img
            src={lightbox}
            alt=""
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '100%', maxHeight: '100%',
              objectFit: 'contain',
              borderRadius: 12,
              boxShadow: '0 8px 60px rgba(0,0,0,0.8)',
            }}
          />
          <button
            onClick={() => setLightbox(null)}
            style={{
              position: 'absolute', top: 16, right: 16,
              width: 36, height: 36, borderRadius: '50%',
              background: 'var(--surf2)', border: '1px solid var(--bdr2)',
              color: 'var(--tx1)', fontSize: 20, lineHeight: 1,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >×</button>
        </div>
      )}
      <header className="animate-fadeUp" style={{ marginBottom: 20 }}>
        <div className="section-label" style={{ marginBottom: 4 }}>Side Action</div>
        <h1 className="gold-text" style={{ fontFamily: 'Bebas Neue', fontSize: 32, letterSpacing: 4, lineHeight: 1 }}>Contest Leaderboards</h1>
        <p style={{ color: 'var(--tx3)', fontSize: 13, marginTop: 4 }}>Closest to Pin, Longest Drive & Jackass of the Day</p>
      </header>

      <div data-tour="contests-tabs" className="pill-tabs animate-fadeUp delay-100" style={{ marginBottom: 20 }}>
        <button onClick={() => { navigator.vibrate?.(8); setTab('ctp') }} className={`pill-tab pressable ${tab === 'ctp' ? 'active' : ''}`}>🎯 Closest to Pin</button>
        <button onClick={() => { navigator.vibrate?.(8); setTab('ld') }}  className={`pill-tab pressable ${tab === 'ld'  ? 'active' : ''}`}>💥 Longest Drive</button>
        <button onClick={() => { navigator.vibrate?.(8); setTab('lahey') }} className={`pill-tab pressable ${tab === 'lahey' ? 'active' : ''}`}>🤠 Jackass of the Day</button>
      </div>

      {/* ── CTP / LD ─────────────────────────────────────────────── */}
      {(tab === 'ctp' || tab === 'ld') && (
        <>

          {isCurrentYear && (
            <div className="glass-flat animate-fadeUp delay-100" style={{ padding: '11px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--tx3)', lineHeight: 1.5 }}>
              <Target size={14} color="#D4A53A" style={{ flexShrink: 0 }} />
              Log {tab === 'ctp' ? 'Closest to Pin' : 'Longest Drive'} from the <strong style={{ color: 'var(--tx2)' }}>GPS screen</strong> when you're out on the hole — it measures with GPS and drops your entry here.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {loading && entries.length === 0 && Array.from({ length: 3 }).map((_, i) => <SkeletonContestRow key={i} />)}
            {!loading && entries.length === 0 && (
              <div className="glass" style={{ padding: 40, textAlign: 'center', color: 'var(--tx4)' }}>
                No entries yet — log one from the GPS screen out on the hole.
              </div>
            )}
            {rankedEntries.map((entry, i) => (
              <div key={entry.id} className="glass animate-fadeUp" style={{
                padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14,
                borderColor: i === 0 ? 'rgba(212,165,58,0.3)' : undefined,
              }}>
                <div style={{ fontSize: 20, width: 28, textAlign: 'center' }}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: 'var(--tx1)', fontSize: 14 }}>{entry.player && displayName(entry.player)}</div>
                  <div style={{ fontSize: 12, color: 'var(--tx2)' }}>
                    {entry.hole ? `Hole ${entry.hole} · ` : ''}{formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                  </div>
                </div>
                {contestDist(entry) && (
                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                    <div style={{ fontFamily: 'Bebas Neue', fontSize: 20, color: '#D4A53A', lineHeight: 1 }}>{contestDist(entry)}</div>
                    {tab === 'ctp' && <div style={{ fontSize: 9, color: 'var(--tx4)' }}>approx</div>}
                  </div>
                )}
                {entry.photo_url && (
                  <div onClick={() => setLightbox(entry.photo_url!)} style={{ flexShrink: 0, cursor: 'zoom-in' }}>
                    <img src={entry.photo_url} alt=""
                      style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, border: `1px solid ${i === 0 ? 'rgba(212,165,58,0.4)' : 'var(--bdr)'}`, display: 'block' }} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Leader photo — shown at bottom */}
          {leader && (
            <div className="glass animate-fadeUp" style={{ marginTop: 16, borderColor: 'rgba(212,165,58,0.4)', background: 'rgba(212,165,58,0.05)', overflow: 'hidden' }}>
              {leader.photo_url && !photoErr ? (
                <div
                  style={{ position: 'relative', height: 460, overflow: 'hidden', cursor: 'zoom-in' }}
                  onClick={() => setLightbox(leader.photo_url!)}
                >
                  <img
                    src={leader.photo_url}
                    alt=""
                    onError={() => setPhotoErr(true)}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.1) 60%, transparent 100%)',
                  }} />
                  <div style={{
                    position: 'absolute', top: 12, left: 14,
                    background: 'rgba(212,165,58,0.18)', backdropFilter: 'blur(6px)',
                    border: '1px solid rgba(212,165,58,0.4)', borderRadius: 999,
                    padding: '4px 12px', fontSize: 11, fontWeight: 700,
                    color: '#D4A53A', letterSpacing: 1, textTransform: 'uppercase',
                  }}>
                    {tab === 'ctp' ? '🎯' : '💥'} Current Leader's Shot
                  </div>
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '16px 18px' }}>
                    <div style={{ fontWeight: 800, color: 'var(--tx1)', fontSize: 20, textShadow: '0 1px 6px rgba(0,0,0,0.8)' }}>
                      {leader.player && displayName(leader.player)}
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(212,165,58,0.8)', marginTop: 2 }}>
                      {formatDistanceToNow(new Date(leader.created_at), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ fontSize: 28 }}>{tab === 'ctp' ? '🎯' : '💥'}</span>
                  <div>
                    <div style={{ fontSize: 11, color: 'rgba(212,165,58,0.7)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Current Leader</div>
                    <div style={{ fontWeight: 700, color: '#D4A53A', fontSize: 16 }}>{leader.player && displayName(leader.player)}</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Jackass of the Day ──────────────────────────────────── */}
      {tab === 'lahey' && (
        <>
          <div className="animate-fadeUp" style={{
            marginBottom: 16, borderRadius: 12, overflow: 'hidden',
            border: '1px solid rgba(212,165,58,0.22)',
            background: 'var(--surf)',
          }}>
            <div data-tour="lahey-title" style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 26, flexShrink: 0 }}>🤠</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: 22, color: '#D4A53A', letterSpacing: 3, lineHeight: 1 }}>
                  Jackass of the Day
                </div>
                <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 3 }}>
                  Vote for who best channels their inner Shooter McGavin. One vote per person.
                </div>
              </div>
            </div>
            <div style={{ borderTop: '1px solid rgba(212,165,58,0.08)', padding: '5px 18px', background: 'rgba(212,165,58,0.05)', fontSize: 11 }}>
              <span style={{ color: 'var(--tx4)', fontStyle: 'italic' }}>💬 "Just stay out of my way... or you'll pay."</span>
              <span style={{ color: 'rgba(212,165,58,0.4)', marginLeft: 6 }}>— Shooter McGavin</span>
            </div>
          </div>

          {!(votingOpen || stepAnchor === 'lahey-vote') ? (
            <div className="glass animate-fadeUp" style={{ padding: '32px', textAlign: 'center', marginBottom: 20, color: 'var(--tx3)' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>🔒</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--tx2)', marginBottom: 6 }}>Voting hasn't started yet</div>
              <div style={{ fontSize: 13, lineHeight: 1.6 }}>The shitwinds aren't blowing quite yet. Check back once the round is underway.</div>
            </div>
          ) : (
            <>
              {myVote && (
                <div style={{ background: 'rgba(212,165,58,0.08)', border: '1px solid rgba(212,165,58,0.25)', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: 'rgba(212,165,58,0.8)' }}>
                  ✅ Your current vote: <strong>{displayName(laheyPlayers.find(p => p.id === myVote)!)}</strong> — select a different player to change it.
                </div>
              )}

              <div data-tour="lahey-vote" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, marginBottom: 20 }}>
                {laheyPlayers.map(player => {
                  const isSelected = selected === player.id
                  const isMyVote   = myVote === player.id
                  return (
                    <button
                      key={player.id}
                      onClick={() => { navigator.vibrate?.(8); setSelected(player.id) }}
                      style={{
                        padding: '12px', borderRadius: 12, border: '1px solid',
                        borderColor: isSelected ? '#D4A53A' : 'var(--bdr)',
                        background: isSelected ? 'rgba(212,165,58,0.15)' : isMyVote ? 'rgba(212,165,58,0.08)' : 'var(--surf)',
                        color: isSelected ? '#D4A53A' : isMyVote ? 'rgba(212,165,58,0.7)' : 'var(--tx1)',
                        cursor: 'pointer',
                        fontWeight: 600, fontSize: 13, transition: 'all 0.2s', textAlign: 'center',
                      }}
                    >
                      {isMyVote && '✅ '}{displayName(player)}
                    </button>
                  )
                })}
              </div>

              <button
                className="btn-gold"
                onClick={castVote}
                disabled={!selected || casting || selected === myVote}
                style={{ width: '100%', justifyContent: 'center', marginBottom: 28, fontSize: 16, padding: '14px' }}
              >
                {casting ? 'Saving…' : myVote ? '🔄 Update My Vote' : '🤠 Cast My Vote'}
              </button>
            </>
          )}

          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--tx4)', textAlign: 'center', fontStyle: 'italic' }}>
            Votes are private — results are revealed by the admins. 🤫
          </div>
        </>
      )}
    </div>
  )
}
