import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useYear } from '../context/YearContext'
import { localDb, parseJson } from '../lib/localDb'
import { enqueue, drainQueue } from '../lib/writeQueue'
import type { LogFeedEventPayload, UpsertLeaheyVotePayload, SubmitContestEntryPayload } from '../lib/writeQueue'
import BottomSheetPicker from '../components/BottomSheetPicker'
import { Skeleton } from '../components/Skeleton'
import { useSyncContext } from '../context/SyncContext'
import { useTour } from '../context/TourContext'
import type { ContestEntry, Player, LeaheyVote } from '../lib/types'
import { displayName } from '../lib/types'
import { Camera, Target, Upload } from 'lucide-react'
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
  const { refreshPendingCount } = useSyncContext()
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
  const [contestPlayers, setContestPlayers] = useState<Player[]>([])
  const [form,           setForm]           = useState({ player_id: '' })
  const [photo,          setPhoto]          = useState<File | null>(null)
  const [myTeamName,     setMyTeamName]     = useState('')
  const [loading,        setLoading]        = useState(true)
  const [submitting,     setSubmitting]     = useState(false)
  const [photoErr,       setPhotoErr]       = useState(false)
  const [lightbox,       setLightbox]       = useState<string | null>(null)
  const fileRef   = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    if (!profile?.team_id) return
    supabase.from('teams').select('name').eq('id', profile.team_id).single()
      .then(({ data }) => { if (data?.name) setMyTeamName(data.name) })
  }, [profile?.team_id])

  const fetchContestData = async () => {
    if (!effectiveTournamentId) { setEntries([]); return }

    // Step 1: Show cached data immediately — fast, works offline
    const localEntries = await localDb.contest_entries
      .where('tournament_id').equals(effectiveTournamentId).toArray()
    if (localEntries.length > 0) {
      setEntries(localEntries.filter(e => e.type === tab)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map(e => ({ ...e, player: parseJson<Player>(e.player_json) } as unknown as ContestEntry & { player?: Player })))
    }
    if (profile?.team_id) {
      const localTeam = await localDb.teams.get(profile.team_id)
      if (localTeam) {
        setMyTeamName(localTeam.name)
        const p1 = parseJson<Player>(localTeam.player1_json)
        const p2 = parseJson<Player>(localTeam.player2_json)
        const players = [p1, p2].filter(Boolean) as Player[]
        if (players.length > 0) setContestPlayers(players)
      }
    } else {
      const localProfiles = await localDb.profiles.where('status').equals('active').toArray()
      if (localProfiles.length > 0) setContestPlayers(localProfiles as Player[])
    }

    setLoading(false)

    // Step 2: Refresh from Supabase in background
    try {
      const { data: entriesData } = await supabase
        .from('contest_entries').select('*, player:profiles(*)')
        .eq('type', tab).eq('tournament_id', effectiveTournamentId)
        .order('created_at', { ascending: false })

      if (entriesData !== null) {
        setEntries(entriesData)
        if (profile?.team_id) {
          const { data: teamData } = await supabase
            .from('teams')
            .select('name, player1:profiles!teams_p1_id_fkey(*), player2:profiles!teams_p2_id_fkey(*)')
            .eq('id', profile.team_id).single()
          const td = teamData as unknown as { name?: string; player1?: Player; player2?: Player }
          setMyTeamName(td?.name ?? '')
          setContestPlayers([td?.player1, td?.player2].filter(Boolean) as Player[])
        } else {
          const { data } = await supabase.from('profiles').select('*').eq('status', 'active').order('name')
          setContestPlayers(data ?? [])
        }
      }
    } catch { /* offline — cached data already shown */ }
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

  const submitContest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.player_id) { showToast('Select a player', 'error'); return }

    setSubmitting(true)
    const player = contestPlayers.find(p => p.id === form.player_id)
    const entryId = crypto.randomUUID()
    const now = new Date().toISOString()

    // Offline path — queue for later sync
    if (!navigator.onLine) {
      if (photo) showToast('Photos can\'t be uploaded offline — entry saved without photo', 'error')

      await localDb.contest_entries
        .where('type').equals(tab)
        .filter(e => e.player_id === form.player_id)
        .delete()
      await localDb.contest_entries.put({
        id: entryId, type: tab, player_id: form.player_id,
        hole: 1, distance: null, photo_url: null,
        created_at: now, tournament_id: effectiveTournamentId ?? '',
        player_json: player ? JSON.stringify(player) : null,
      })
      await enqueue('submit_contest_entry', {
        id: entryId, type: tab as 'ctp' | 'ld', player_id: form.player_id,
        tournament_id: effectiveTournamentId,
      } satisfies SubmitContestEntryPayload, { type: tab, player_id: form.player_id })
      await enqueue('log_feed_event', {
        id: crypto.randomUUID(), event_type: 'contest',
        team_id: null, team_name: myTeamName,
        player_name: player ? displayName(player) : null,
        voter_name: null, hole: 0, score: null,
        label: tab === 'ctp' ? 'CTP Entry' : 'LD Entry',
        emoji: tab === 'ctp' ? '🎯' : '💥',
        tournament_id: effectiveTournamentId ?? null,
      } satisfies LogFeedEventPayload, { type: tab, player_id: form.player_id, ev: 'contest' })

      setEntries(prev => {
        const filtered = prev.filter(e => !(e.type === tab && e.player_id === form.player_id))
        const newEntry = { id: entryId, type: tab, player_id: form.player_id, hole: 1, distance: '', photo_url: null, created_at: now, player } as unknown as ContestEntry & { player?: Player }
        return [newEntry, ...filtered]
      })
      setForm({ player_id: '' })
      setPhoto(null)
      setSubmitting(false)
      await refreshPendingCount()
      navigator.vibrate?.([10, 150, 10])
      showToast(`Entry saved — will sync when online ${tab === 'ctp' ? '🎯' : '💥'}`)
      return
    }

    // Online path
    let photo_url: string | null = null
    if (photo) {
      const ext = photo.name.split('.').pop()
      const path = `${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage.from('contest-photos').upload(path, photo)
      if (uploadErr) { showToast(`Photo upload failed: ${uploadErr.message}`, 'error'); setSubmitting(false); return }
      const { data: urlData } = supabase.storage.from('contest-photos').getPublicUrl(path)
      photo_url = urlData.publicUrl
    }

    await supabase.from('contest_entries').delete().eq('type', tab).eq('player_id', form.player_id)
    const { error } = await supabase.from('contest_entries').insert({
      type: tab, player_id: form.player_id,
      hole: 1, distance: '', photo_url,
      ...(effectiveTournamentId && { tournament_id: effectiveTournamentId }),
    })

    setSubmitting(false)
    if (error) {
      navigator.vibrate?.([20, 100, 20])
      showToast(error.message, 'error')
    } else {
      navigator.vibrate?.([10, 150, 10])
      showToast(`Entry submitted! ${tab === 'ctp' ? '🎯' : '💥'}`)
      const { data: { session } } = await supabase.auth.getSession()
      supabase.functions.invoke('notify-contest', {
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
        body: { player_name: player ? displayName(player) : null, team_name: myTeamName, contest_type: tab },
      }).catch(() => {})
      await supabase.from('feed_events').insert({
        event_type: 'contest', team_name: myTeamName,
        player_name: player ? displayName(player) : null,
        hole: 0, score: null,
        label: tab === 'ctp' ? 'CTP Entry' : 'LD Entry',
        emoji: tab === 'ctp' ? '🎯' : '💥',
        ...(effectiveTournamentId && { tournament_id: effectiveTournamentId }),
      })
      drainQueue().catch(() => {})
      setForm({ player_id: '' })
      setPhoto(null)
      fetchContestData()
    }
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

  const leader = entries[0]

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
        <h1 className="gold-text" style={{ fontFamily: 'Bebas Neue', fontSize: 32, letterSpacing: 4, lineHeight: 1 }}>Contests</h1>
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

          {(isCurrentYear || tourActive) && <div className="glass animate-fadeUp delay-100" style={{ padding: 20, marginBottom: 16 }}>
            <div className="section-label" style={{ color: 'var(--gold)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Target size={12} style={{ flexShrink: 0 }} />
              Submit Entry
            </div>
            <form onSubmit={submitContest}>
              <div data-tour="ld-player" style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, color: 'var(--tx3)', display: 'block', marginBottom: 8 }}>Player *</label>
                <BottomSheetPicker
                  options={contestPlayers.map(p => ({ value: p.id, label: displayName(p) }))}
                  value={form.player_id}
                  onChange={val => setForm(f => ({ ...f, player_id: val }))}
                  placeholder="Select player"
                  searchable={contestPlayers.length > 6}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, color: 'var(--tx3)', display: 'block', marginBottom: 8 }}>
                  Photo (optional){!form.player_id && <span style={{ marginLeft: 6, fontWeight: 400, color: 'var(--tx4)' }}>— select a player first</span>}
                </label>
                {/* File picker — any image from library */}
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => { setPhoto(e.target.files?.[0] ?? null); e.target.value = '' }} />
                {/* Camera — opens rear camera directly on mobile */}
                <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                  onChange={e => { setPhoto(e.target.files?.[0] ?? null); e.target.value = '' }} />
                <div data-tour="ld-photo" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={!form.player_id}
                    onClick={() => cameraRef.current?.click()}
                    style={{ opacity: form.player_id || tourActive ? 1 : 0.35, cursor: form.player_id ? 'pointer' : 'not-allowed', color: 'var(--tx1)', borderColor: 'var(--tx4)' }}
                  >
                    <Camera size={13} /> Take Photo
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={!form.player_id}
                    onClick={() => fileRef.current?.click()}
                    style={{ opacity: form.player_id || tourActive ? 1 : 0.35, cursor: form.player_id ? 'pointer' : 'not-allowed', color: 'var(--tx1)', borderColor: 'var(--tx4)' }}
                  >
                    <Upload size={13} /> Upload Photo
                  </button>
                  {photo && (
                    <span style={{ fontSize: 12, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 4 }}>
                      ✓ {photo.name.length > 24 ? photo.name.slice(0, 24) + '…' : photo.name}
                      <button type="button" onClick={() => setPhoto(null)}
                        style={{ background: 'none', border: 'none', color: 'var(--tx4)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                    </span>
                  )}
                </div>
              </div>
              <button type="submit" className="btn-gold" disabled={submitting}>
                {submitting ? 'Submitting…' : `Submit ${tab === 'ctp' ? 'CTP' : 'LD'} Entry`}
              </button>
            </form>
          </div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {loading && entries.length === 0 && Array.from({ length: 3 }).map((_, i) => <SkeletonContestRow key={i} />)}
            {!loading && entries.length === 0 && (
              <div className="glass" style={{ padding: 40, textAlign: 'center', color: 'var(--tx4)' }}>
                No entries yet — be the first!
              </div>
            )}
            {entries.map((entry, i) => (
              <div key={entry.id} className="glass animate-fadeUp" style={{
                padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14,
                borderColor: i === 0 ? 'rgba(212,165,58,0.3)' : undefined,
              }}>
                <div style={{ fontSize: 20, width: 28, textAlign: 'center' }}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: 'var(--tx1)', fontSize: 14 }}>{entry.player && displayName(entry.player)}</div>
                  <div style={{ fontSize: 12, color: 'var(--tx2)' }}>
                    {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                  </div>
                </div>
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
