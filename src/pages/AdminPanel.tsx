import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'
import { useYear } from '../context/YearContext'
import type { Profile, Team } from '../lib/types'
import { displayName, HOLE_PARS } from '../lib/types'
import { Copy, Shield, ShieldOff, Trash2, Check, Plus, Users, RotateCcw, PlayCircle, Shuffle, Archive } from 'lucide-react'
import RSVPPanel from './RSVP'

type TeamWithPlayers = Team & { player1?: Profile; player2?: Profile }

interface StandingEntry {
  teamName: string; p1Name: string | null; p2Name: string | null
  p1Id: string | null; p2Id: string | null; toPar: number; thru: number; gross: number
}

interface EndTournamentPreview {
  standings: StandingEntry[]
  jackassName: string | null; jackassId: string | null; jackassVotes: number
  ctpWinner: string; ldWinner: string
}

interface EditCategory {
  id: string | null
  team_name: string; player1_name: string; player2_name: string; score_to_par: string; detail: string
}

interface EditingTournament {
  id: string; year: number; name: string; course: string; date: string; notes: string
  champion: EditCategory; runner_up: EditCategory; third: EditCategory
  jackass: EditCategory; ctp: EditCategory; ld: EditCategory
}

interface THistoryEntry {
  id: string; year: number; name: string; date: string | null; course: string | null
  status: string; notes: string | null; deleted_at: string | null
  final_standings: StandingEntry[] | null
  results: Array<{ id: string; category: string; team_name: string | null; player1_name: string | null; player2_name: string | null; score_to_par: number | null; detail: string | null }>
}

export default function AdminPanel() {
  const { showToast } = useToast()
  const { refreshTournaments } = useYear()
  const [tab, setTab] = useState<'teams' | 'users' | 'codes' | 'tournament' | 'brevo' | 'rsvp'>('teams')
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [teams, setTeams] = useState<TeamWithPlayers[]>([])
  const [newTeamName, setNewTeamName] = useState('')
  const [creating, setCreating] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [adminBlurred, setAdminBlurred] = useState(true)

  useEffect(() => {
    fetchProfiles()
    fetchActiveTournament().then(id => fetchTeams(id))
  }, [])

  const fetchProfiles = async () => {
    const { data } = await supabase.from('profiles').select('*').order('name')
    setProfiles(data ?? [])
  }

  const fetchActiveTournament = async (): Promise<string | null> => {
    const { data } = await supabase.from('tournaments').select('id').eq('status', 'active').limit(1).single()
    const id = data?.id ?? null
    setActiveTournamentId(id)
    return id
  }

  const fetchTeams = async (tournamentId?: string | null) => {
    const tid = tournamentId !== undefined ? tournamentId : activeTournamentId
    let q = supabase.from('teams')
      .select('*, player1:profiles!teams_p1_id_fkey(*), player2:profiles!teams_p2_id_fkey(*)')
      .order('created_at')
    if (tid) q = q.eq('tournament_id', tid)
    const { data } = await q
    setTeams(data ?? [])
  }

  // ── Team management ──────────────────────────────────────────

  const createTeam = async () => {
    if (!newTeamName.trim()) return
    setCreating(true)
    const payload: Record<string, unknown> = { name: newTeamName.trim() }
    if (activeTournamentId) payload.tournament_id = activeTournamentId
    const { error } = await supabase.from('teams').insert(payload)
    setCreating(false)
    if (error) showToast(error.message, 'error')
    else { showToast('Team created!'); setNewTeamName(''); fetchTeams() }
  }

  const assignPlayer = async (
    team: TeamWithPlayers,
    slot: 'p1_id' | 'p2_id',
    profileId: string
  ) => {
    const oldId = slot === 'p1_id' ? team.p1_id : team.p2_id
    const otherId = slot === 'p1_id' ? team.p2_id : team.p1_id
    const newId = profileId || null

    // Update team slot
    await supabase.from('teams').update({ [slot]: newId }).eq('id', team.id)

    // Clear old player's team_id if they're no longer in either slot
    if (oldId && oldId !== otherId) {
      await supabase.from('profiles').update({ team_id: null }).eq('id', oldId)
    }

    // Set new player's team_id
    if (newId) {
      await supabase.from('profiles').update({ team_id: team.id }).eq('id', newId)
    }

    fetchTeams()
    fetchProfiles()
  }

  const deleteTeam = async (team: TeamWithPlayers) => {
    if (!confirm(`Delete "${team.name}"? This removes all their scores.`)) return
    // Clear team_id for assigned players
    if (team.p1_id) await supabase.from('profiles').update({ team_id: null }).eq('id', team.p1_id)
    if (team.p2_id && team.p2_id !== team.p1_id) await supabase.from('profiles').update({ team_id: null }).eq('id', team.p2_id)
    await supabase.from('teams').delete().eq('id', team.id)
    showToast('Team deleted')
    fetchTeams()
    fetchProfiles()
  }

  const resetTeamAssignments = async () => {
    if (!confirm('Remove all player assignments from every team? Player accounts are kept — only the roster slots are cleared.')) return
    setResettingTeams(true)
    await Promise.all([
      supabase.from('teams').update({ p1_id: null, p2_id: null }).neq('id', '00000000-0000-0000-0000-000000000000'),
      supabase.from('profiles').update({ team_id: null }).neq('id', '00000000-0000-0000-0000-000000000000'),
    ])
    showToast('All team assignments cleared')
    setResettingTeams(false)
    fetchTeams()
    fetchProfiles()
  }

  const regenerateTeams = async () => {
    if (!confirm('Randomly assign all active players to teams?')) return
    setRegenerating(true)
    const shuffled = [...activePlayers].sort(() => Math.random() - 0.5)
    const updates: PromiseLike<unknown>[] = []
    teams.forEach(team => {
      const p1 = shuffled.shift() ?? null
      const p2 = shuffled.shift() ?? null
      updates.push(supabase.from('teams').update({ p1_id: p1?.id ?? null, p2_id: p2?.id ?? null }).eq('id', team.id))
      if (p1) updates.push(supabase.from('profiles').update({ team_id: team.id }).eq('id', p1.id))
      if (p2) updates.push(supabase.from('profiles').update({ team_id: team.id }).eq('id', p2.id))
    })
    await Promise.all(updates)
    showToast('Teams regenerated!')
    setRegenerating(false)
    fetchTeams()
    fetchProfiles()
  }

  // ── User management ──────────────────────────────────────────

  const promoteUser = async (id: string) => {
    await supabase.from('profiles').update({ role: 'admin' }).eq('id', id)
    showToast('Promoted to admin!')
    fetchProfiles()
  }

  const demoteUser = async (id: string) => {
    await supabase.from('profiles').update({ role: 'player' }).eq('id', id)
    showToast('Demoted to player')
    fetchProfiles()
  }

  const removeUser = async (id: string) => {
    if (!confirm('Remove this account? This cannot be undone.')) return
    await supabase.from('profiles').delete().eq('id', id)
    fetchProfiles()
  }

  const copy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedKey(key)
    showToast('Copied to clipboard!')
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const PLAYER_CODE   = import.meta.env.VITE_PLAYER_CODE   ?? 'CHUBS2025'
  const ADMIN_CODE    = import.meta.env.VITE_ADMIN_CODE    ?? 'CHUBS_ADMIN'
  const WAITLIST_CODE = import.meta.env.VITE_WAITLIST_CODE ?? 'CHUBS_WAITLIST'

  const [resettingTeams, setResettingTeams] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetConfirm, setResetConfirm] = useState(false)
  const [laheyVotingOpen, setLaheyVotingOpen] = useState(false)
  const [laheyResetting, setLaheyResetting] = useState(false)
  const [laheyTogglingOpen, setLaheyTogglingOpen] = useState(false)
  const [endTournamentOpen, setEndTournamentOpen] = useState(false)
  const [endTournamentPreview, setEndTournamentPreview] = useState<EndTournamentPreview | null>(null)
  const [endingTournament, setEndingTournament] = useState(false)
  const [tournamentHistory, setTournamentHistory] = useState<THistoryEntry[]>([])
  const [editingT, setEditingT] = useState<EditingTournament | null>(null)
  const [deleteModal, setDeleteModal] = useState<{ id: string; year: number; name: string; isActive: boolean; step: 1 | 2 } | null>(null)
  const [deleteInput, setDeleteInput] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingYear, setDeletingYear] = useState(false)
  const [restoringYear, setRestoringYear] = useState<string | null>(null)
  const [permDeleteModal, setPermDeleteModal] = useState<{ id: string; name: string } | null>(null)
  const [permDeleteInput, setPermDeleteInput] = useState('')
  const [permDeleting, setPermDeleting] = useState(false)
  const [activeTournamentId, setActiveTournamentId] = useState<string | null>(null)
  const [testTournamentOpen, setTestTournamentOpen] = useState(false)
  const [testTournamentName, setTestTournamentName] = useState('')
  const [testTournamentYear, setTestTournamentYear] = useState(String(new Date().getFullYear()))
  const [creatingTestTournament, setCreatingTestTournament] = useState(false)
  const [createTournamentOpen, setCreateTournamentOpen] = useState(false)
  const [createTournamentName, setCreateTournamentName] = useState('')
  const [creatingTournament, setCreatingTournament] = useState(false)

  useEffect(() => {
    supabase.from('tournament_settings').select('lahey_voting_open').eq('id', 1).single()
      .then(({ data }) => { if (data) setLaheyVotingOpen(data.lahey_voting_open) })
  }, [])

  useEffect(() => { if (tab === 'tournament') fetchTournamentHistory() }, [tab])

  const resetTournament = async () => {
    if (!activeTournamentId) return
    setResetting(true)
    // Only delete current year data
    const { data: curTeams } = await supabase.from('teams').select('id').eq('tournament_id', activeTournamentId)
    const teamIds = (curTeams ?? []).map(t => t.id)
    await Promise.all([
      teamIds.length > 0
        ? supabase.from('scores').delete().in('team_id', teamIds)
        : Promise.resolve({ error: null }),
      teamIds.length > 0
        ? supabase.from('chulligans').delete().in('team_id', teamIds)
        : Promise.resolve({ error: null }),
      supabase.from('feed_events').delete().eq('tournament_id', activeTournamentId),
      supabase.from('contest_entries').delete().eq('tournament_id', activeTournamentId),
    ])
    setResetting(false)
    setResetConfirm(false)
    showToast('All scores, chulligans, contests, and live feed cleared!')
    fetchTeams()
  }

  const toggleLaheyVoting = async () => {
    setLaheyTogglingOpen(true)
    const next = !laheyVotingOpen
    const { error } = await supabase.from('tournament_settings').update({ lahey_voting_open: next }).eq('id', 1)
    setLaheyTogglingOpen(false)
    if (error) showToast(error.message, 'error')
    else {
      setLaheyVotingOpen(next)
      showToast(next ? '🤠 Jackass of the Day voting is now open!' : 'Jackass of the Day voting closed.')
    }
  }

  const resetLaheyVotes = async () => {
    if (!confirm('Clear all Jackass of the Day votes? This cannot be undone.')) return
    setLaheyResetting(true)
    let q = supabase.from('leahey_votes').delete()
    if (activeTournamentId) q = q.eq('tournament_id', activeTournamentId)
    else q = q.neq('id', '00000000-0000-0000-0000-000000000000')
    const { error } = await q
    setLaheyResetting(false)
    if (error) showToast(error.message, 'error')
    else showToast('All Jackass of the Day votes cleared.')
  }

  const prepareEndTournament = async () => {
    let teamsQ = supabase.from('teams').select('id, name, p1_id, p2_id, player1:profiles!teams_p1_id_fkey(id, name, nickname), player2:profiles!teams_p2_id_fkey(id, name, nickname)')
    if (activeTournamentId) teamsQ = teamsQ.eq('tournament_id', activeTournamentId)
    let votesQ = supabase.from('leahey_votes').select('nominee_id')
    if (activeTournamentId) votesQ = votesQ.eq('tournament_id', activeTournamentId)
    let contestQ = supabase.from('contest_entries').select('type, player:profiles(name, nickname)').in('type', ['ctp', 'ld']).order('created_at', { ascending: false })
    if (activeTournamentId) contestQ = contestQ.eq('tournament_id', activeTournamentId)
    const [teamsRes, scoresRes, votesRes, contestRes] = await Promise.all([
      teamsQ,
      supabase.from('scores').select('team_id, hole, score'),
      votesQ,
      contestQ,
    ])

    const teams = (teamsRes.data ?? []) as unknown as (Team & { player1?: Profile; player2?: Profile })[]
    const allScores = scoresRes.data ?? []

    const standings: StandingEntry[] = teams.map(team => {
      const teamScores = allScores.filter(s => s.team_id === team.id)
      const scoreMap: Record<number, number> = {}
      for (const s of teamScores) scoreMap[s.hole] = s.score
      const played = Array.from({ length: 18 }, (_, i) => scoreMap[i + 1] ?? null).filter(Boolean) as number[]
      const thru = played.length
      const gross = played.reduce((a, b) => a + b, 0)
      const parSoFar = HOLE_PARS.slice(0, thru).reduce((a, b) => a + b, 0)
      return {
        teamName: team.name || '(unnamed)',
        p1Name: team.player1 ? displayName(team.player1) : null,
        p2Name: team.player2 ? displayName(team.player2) : null,
        p1Id: team.p1_id ?? null,
        p2Id: team.p2_id ?? null,
        toPar: gross - parSoFar,
        thru,
        gross,
      }
    }).sort((a, b) => {
      if (a.thru === 0 && b.thru > 0) return 1
      if (b.thru === 0 && a.thru > 0) return -1
      return a.toPar - b.toPar || b.thru - a.thru
    }).filter(t => t.thru > 0)

    const votes = votesRes.data ?? []
    const voteCounts: Record<string, number> = {}
    for (const v of votes) voteCounts[v.nominee_id] = (voteCounts[v.nominee_id] ?? 0) + 1
    const jackassId = Object.entries(voteCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    let jackassName: string | null = null
    let jackassVotes = 0
    if (jackassId) {
      const { data: jp } = await supabase.from('profiles').select('name, nickname').eq('id', jackassId).single()
      if (jp) jackassName = displayName(jp as Profile)
      jackassVotes = voteCounts[jackassId]
    }

    // Latest submission per type is the winner (last person to move the stick)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entries = (contestRes.data ?? []) as any[]
    const ctpEntry = entries.find(e => e.type === 'ctp')
    const ldEntry  = entries.find(e => e.type === 'ld')
    const ctpWinner = ctpEntry?.player ? displayName(ctpEntry.player as Profile) : ''
    const ldWinner  = ldEntry?.player  ? displayName(ldEntry.player  as Profile) : ''

    setEndTournamentPreview({ standings, jackassName, jackassId, jackassVotes, ctpWinner, ldWinner })
    setEndTournamentOpen(true)
  }

  const doEndTournament = async () => {
    if (!endTournamentPreview) return
    setEndingTournament(true)
    try {
      const { standings, jackassName, jackassId, jackassVotes, ctpWinner, ldWinner } = endTournamentPreview

      // Get or create active tournament
      let { data: activeTournament } = await supabase
        .from('tournaments').select('id, year, name').eq('status', 'active').order('year', { ascending: false }).limit(1).single()

      if (!activeTournament) {
        const { data: newT } = await supabase
          .from('tournaments').insert({ year: new Date().getFullYear(), status: 'active' }).select().single()
        activeTournament = newT
      }
      if (!activeTournament) throw new Error('Could not find or create tournament')

      // Build results rows
      const rows: Record<string, unknown>[] = []
      const cats: [string, StandingEntry | undefined][] = [
        ['champion', standings[0]],
        ['runner_up', standings[1]],
        ['third', standings[2]],
      ]
      for (const [cat, s] of cats) {
        if (!s) continue
        rows.push({
          tournament_id: activeTournament.id, category: cat,
          team_name: s.teamName, player1_name: s.p1Name, player2_name: s.p2Name,
          player1_id: s.p1Id, player2_id: s.p2Id, score_to_par: s.toPar,
        })
      }
      if (jackassName) {
        rows.push({
          tournament_id: activeTournament.id, category: 'jackass',
          player1_name: jackassName, player1_id: jackassId,
          detail: jackassVotes > 0 ? `${jackassVotes} vote${jackassVotes !== 1 ? 's' : ''}` : null,
        })
      }
      if (ctpWinner.trim()) {
        rows.push({ tournament_id: activeTournament.id, category: 'ctp', player1_name: ctpWinner.trim() })
      }
      if (ldWinner.trim()) {
        rows.push({ tournament_id: activeTournament.id, category: 'ld', player1_name: ldWinner.trim() })
      }

      if (rows.length > 0) await supabase.from('tournament_results').insert(rows)

      // Mark completed + save full standings (critical — must succeed)
      await supabase.from('tournaments').update({
        status: 'completed',
        final_standings: standings,
      }).eq('id', activeTournament.id)

      // Snapshot active players (best-effort — requires migration 031 to be applied)
      try {
        const { data: activePlayers } = await supabase
          .from('profiles')
          .select('id, name, nickname, role')
          .eq('status', 'active')
          .neq('role', 'admin')
        await supabase.from('tournaments').update({
          participants_json: activePlayers ?? [],
        }).eq('id', activeTournament.id)
      } catch { /* migration not yet applied — skip participants snapshot */ }

      // Clear player team assignments
      await supabase.from('profiles').update({ team_id: null }).neq('id', '00000000-0000-0000-0000-000000000000')

      setEndTournamentOpen(false)
      setEndTournamentPreview(null)
      setActiveTournamentId(null)
      showToast(`${activeTournament.name || activeTournament.year} archived! Create a new tournament when you're ready. 🏆`)
      fetchTeams(null)
      refreshTournaments()
    } catch (e) {
      showToast((e as Error).message ?? 'Archive failed', 'error')
    }
    setEndingTournament(false)
  }

  const fetchTournamentHistory = async () => {
    const { data: ts } = await supabase.from('tournaments').select('*').order('year', { ascending: false })
    if (!ts?.length) { setTournamentHistory([]); return }
    const ids = ts.map(t => t.id)
    const { data: results } = await supabase.from('tournament_results').select('*').in('tournament_id', ids)
    const byT: Record<string, THistoryEntry['results']> = {}
    for (const r of results ?? []) {
      if (!byT[r.tournament_id]) byT[r.tournament_id] = []
      byT[r.tournament_id].push(r)
    }
    setTournamentHistory(ts.map(t => ({ ...t, results: byT[t.id] ?? [] })))
  }

  const blankCat = (): EditCategory => ({ id: null, team_name: '', player1_name: '', player2_name: '', score_to_par: '', detail: '' })

  const openEditT = (t: THistoryEntry) => {
    const findCat = (cat: string): EditCategory => {
      const r = t.results.find(r => r.category === cat)
      if (!r) return blankCat()
      return { id: r.id, team_name: r.team_name ?? '', player1_name: r.player1_name ?? '', player2_name: r.player2_name ?? '', score_to_par: r.score_to_par != null ? String(r.score_to_par) : '', detail: r.detail ?? '' }
    }
    setEditingT({ id: t.id, year: t.year, name: t.name ?? '', course: t.course ?? '', date: t.date ?? '', notes: t.notes ?? '', champion: findCat('champion'), runner_up: findCat('runner_up'), third: findCat('third'), jackass: findCat('jackass'), ctp: findCat('ctp'), ld: findCat('ld') })
  }

  const saveEditT = async () => {
    if (!editingT) return
    setSavingEdit(true)
    await supabase.from('tournaments').update({ name: editingT.name.trim() || 'The Chubbs Memorial', course: editingT.course.trim() || null, date: editingT.date || null, notes: editingT.notes.trim() || null }).eq('id', editingT.id)
    const catMap: Record<string, EditCategory> = { champion: editingT.champion, runner_up: editingT.runner_up, third: editingT.third, jackass: editingT.jackass, ctp: editingT.ctp, ld: editingT.ld }
    for (const [cat, ec] of Object.entries(catMap)) {
      const isEmpty = !ec.player1_name.trim() && !ec.team_name.trim()
      const payload = { team_name: ec.team_name.trim() || null, player1_name: ec.player1_name.trim() || null, player2_name: ec.player2_name.trim() || null, score_to_par: ec.score_to_par !== '' ? parseInt(ec.score_to_par) : null, detail: ec.detail.trim() || null }
      if (ec.id) {
        if (isEmpty) await supabase.from('tournament_results').delete().eq('id', ec.id)
        else await supabase.from('tournament_results').update(payload).eq('id', ec.id)
      } else if (!isEmpty) {
        await supabase.from('tournament_results').insert({ ...payload, tournament_id: editingT.id, category: cat })
      }
    }
    setSavingEdit(false)
    setEditingT(null)
    fetchTournamentHistory()
    showToast(`${editingT.name || editingT.year} updated!`)
  }

  const softDeleteT = async () => {
    if (!deleteModal || deleteInput !== String(deleteModal.year)) return
    setDeletingYear(true)
    await supabase.from('tournaments').update({ deleted_at: new Date().toISOString() }).eq('id', deleteModal.id)
    setDeletingYear(false)
    const { name, isActive } = deleteModal
    if (isActive) { setActiveTournamentId(null); fetchTeams(null) }
    setDeleteModal(null)
    setDeleteInput('')
    fetchTournamentHistory()
    refreshTournaments()
    showToast(`"${name}" removed. Restore it from Deleted Years anytime.`)
  }

  const activateT = async (id: string, year: number) => {
    // Demote any currently active tournament to completed first
    if (activeTournamentId) {
      await supabase.from('tournaments').update({ status: 'completed' }).eq('id', activeTournamentId)
    }
    await supabase.from('tournaments').update({ status: 'active' }).eq('id', id)
    setActiveTournamentId(id)
    fetchTournamentHistory()
    refreshTournaments()
    showToast(`${year} is now the active tournament!`)
  }

  const restoreT = async (id: string, year: number) => {
    setRestoringYear(id)
    await supabase.from('tournaments').update({ deleted_at: null }).eq('id', id)
    setRestoringYear(null)
    fetchTournamentHistory()
    showToast(`${year} restored to Hall of Fame!`)
  }

  const permanentDeleteT = async () => {
    if (!permDeleteModal || permDeleteInput !== permDeleteModal.name) return
    setPermDeleting(true)
    await supabase.from('tournaments').delete().eq('id', permDeleteModal.id)
    setPermDeleting(false)
    setPermDeleteModal(null)
    setPermDeleteInput('')
    fetchTournamentHistory()
    showToast(`"${permDeleteModal.name}" permanently deleted.`)
  }

  const createTestTournament = async () => {
    const name = testTournamentName.trim()
    const year = parseInt(testTournamentYear)
    if (!name || isNaN(year)) return
    setCreatingTestTournament(true)
    const { error } = await supabase.from('tournaments').insert({ name, year, status: 'completed' })
    setCreatingTestTournament(false)
    if (error) { showToast(error.message, 'error'); return }
    setTestTournamentOpen(false)
    setTestTournamentName('')
    setTestTournamentYear(String(new Date().getFullYear()))
    fetchTournamentHistory()
    showToast(`"${name}" created! It will appear in the year selector.`)
  }

  const createNewTournament = async () => {
    const name = createTournamentName.trim()
    if (!name) return
    setCreatingTournament(true)

    // Demote any existing active tournament before creating the new one
    await supabase.from('tournaments').update({ status: 'completed' }).eq('status', 'active')

    const { data, error } = await supabase
      .from('tournaments')
      .insert({ name, year: new Date().getFullYear(), status: 'active' })
      .select().single()
    setCreatingTournament(false)
    if (error) { showToast(error.message, 'error'); return }
    setActiveTournamentId(data.id)
    setCreateTournamentOpen(false)
    setCreateTournamentName('')

    // Deactivate all active non-admin players — roster starts fresh each year
    const { data: movedPlayers } = await supabase
      .from('profiles')
      .update({ status: 'dropped' })
      .eq('status', 'active')
      .neq('role', 'admin')
      .select('id')
    const movedCount = movedPlayers?.length ?? 0

    fetchTeams(data.id)
    fetchTournamentHistory()
    refreshTournaments()
    showToast(`"${name}" is live! ${movedCount > 0 ? `${movedCount} player${movedCount !== 1 ? 's' : ''} deactivated.` : ''} 🏆`)
  }

  const activePlayers = profiles.filter(p => p.status === 'active')

  // ── Brevo sync ────────────────────────────────────────────
  const [brevoSyncing, setBrevoSyncing] = useState(false)
  const [brevoLastSync, setBrevoLastSync] = useState<{ count: number; at: string } | null>(null)

  const syncToBrevo = async () => {
    setBrevoSyncing(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { data, error } = await supabase.functions.invoke('brevo-sync', {
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
      })
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error)
      const count = (data as { synced: number }).synced
      setBrevoLastSync({ count, at: new Date().toLocaleTimeString() })
      showToast(`${count} contacts synced to Brevo ✓`)
    } catch (e) {
      showToast((e as Error).message ?? 'Sync failed', 'error')
    }
    setBrevoSyncing(false)
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 32, color: '#D4A53A', letterSpacing: 4 }}>Admin Panel</h1>
        <p style={{ color: 'var(--tx3)', fontSize: 13 }}>Manage teams, users, and access codes</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {([
          { id: 'teams',      label: '⛳ Teams' },
          { id: 'users',      label: '👥 Users' },
          { id: 'codes',      label: '🔑 Codes' },
          { id: 'tournament', label: '🏆 Tournament' },
          { id: 'brevo',      label: '📣 Brevo' },
          { id: 'rsvp',       label: '📋 Player Management' },
        ] as const).map(({ id, label }) => (
          <button key={id} onClick={() => setTab(id)} className={`pill-tab ${tab === id ? 'active' : ''}`}>{label}</button>
        ))}
      </div>

      {/* ── Teams tab ───────────────────────────────────────────── */}
      {tab === 'teams' && (
        <div>
          {/* Create team */}
          <div className="glass" style={{ padding: '18px 20px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              type="text"
              placeholder="New team name..."
              value={newTeamName}
              onChange={e => setNewTeamName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createTeam()}
              style={{ flex: 1 }}
            />
            <button className="btn-gold" onClick={createTeam} disabled={creating || !newTeamName.trim()}>
              <Plus size={14} /> Create Team
            </button>
          </div>

          {/* Team bulk actions */}
          {teams.length > 0 && (() => {
            const teamsReset = teams.every(t => !t.p1_id && !t.p2_id)
            return (
              <div className="glass" style={{ padding: '14px 18px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={resetTeamAssignments}
                  disabled={resettingTeams || teamsReset}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '9px 18px', borderRadius: 999, fontSize: 13, fontWeight: 700,
                    background: teamsReset ? 'var(--surf2)' : 'rgba(239,68,68,0.1)',
                    border: `1px solid ${teamsReset ? 'var(--bdr)' : 'rgba(239,68,68,0.3)'}`,
                    color: teamsReset ? 'var(--tx4)' : '#ef4444',
                    cursor: resettingTeams || teamsReset ? 'not-allowed' : 'pointer',
                    opacity: resettingTeams ? 0.6 : 1,
                  }}
                >
                  <RotateCcw size={13} />
                  {resettingTeams ? 'Clearing…' : teamsReset ? 'Teams Already Reset' : 'Reset Teams'}
                </button>

                <button
                  onClick={regenerateTeams}
                  disabled={regenerating || !teamsReset}
                  title={!teamsReset ? 'Reset team assignments first before regenerating' : undefined}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '9px 18px', borderRadius: 999, fontSize: 13, fontWeight: 700,
                    background: teamsReset ? 'rgba(212,165,58,0.12)' : 'var(--surf2)',
                    border: `1px solid ${teamsReset ? 'rgba(212,165,58,0.35)' : 'var(--bdr)'}`,
                    color: teamsReset ? '#D4A53A' : 'var(--tx4)',
                    cursor: regenerating || !teamsReset ? 'not-allowed' : 'pointer',
                    opacity: regenerating ? 0.6 : 1,
                  }}
                >
                  <Shuffle size={13} />
                  {regenerating ? 'Assigning…' : 'Regenerate Teams'}
                </button>

                {!teamsReset && (
                  <span style={{ fontSize: 11, color: 'var(--tx4)', fontStyle: 'italic' }}>
                    Reset teams first to enable regeneration
                  </span>
                )}
              </div>
            )
          })()}

          {teams.length === 0 && (
            <div className="glass" style={{ padding: 40, textAlign: 'center', color: 'var(--tx4)' }}>
              <Users size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.2 }} />
              No teams yet. Create one above.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {teams.map(team => (
              <div key={team.id} className="glass" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, color: '#D4A53A', fontSize: 15, flex: 1 }}>{team.name}</div>
                  <button
                    onClick={() => deleteTeam(team)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(239,68,68,0.5)', padding: '4px' }}>
                    <Trash2 size={14} />
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {(['p1_id', 'p2_id'] as const).map((slot, i) => {
                    const current = slot === 'p1_id' ? team.p1_id : team.p2_id
                    const otherSlot = slot === 'p1_id' ? team.p2_id : team.p1_id
                    return (
                      <div key={slot}>
                        <label style={{ fontSize: 11, color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>
                          Player {i + 1}
                        </label>
                        <select
                          value={current ?? ''}
                          onChange={e => assignPlayer(team, slot, e.target.value)}
                        >
                          <option value="">— Unassigned —</option>
                          {activePlayers.map(p => (
                            <option
                              key={p.id}
                              value={p.id}
                              disabled={p.id === otherSlot}
                            >
                              {displayName(p)}{p.handicap != null ? ` (HCP ${p.handicap})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Users tab ───────────────────────────────────────────── */}
      {tab === 'users' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {profiles.map(p => (
            <div key={p.id} className="glass" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 700, color: 'var(--tx1)', fontSize: 14 }}>{p.name}</span>
                  {p.nickname && (
                    <span style={{ fontSize: 12, color: '#D4A53A', background: 'rgba(212,165,58,0.1)', padding: '1px 8px', borderRadius: 999 }}>
                      "{p.nickname}"
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--tx3)' }}>{p.email}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
                  background: p.role === 'admin' ? 'rgba(212,165,58,0.15)' : 'var(--surf2)',
                  color: p.role === 'admin' ? '#D4A53A' : 'var(--tx2)',
                  textTransform: 'uppercase', letterSpacing: 1,
                }}>
                  {p.role}
                </div>
                <div style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
                  background: p.status === 'active' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.1)',
                  color: p.status === 'active' ? '#22c55e' : '#ef4444',
                  textTransform: 'uppercase', letterSpacing: 1,
                }}>
                  {p.status === 'active' ? 'Active' : 'Deactivated'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {p.role === 'player' ? (
                  <button onClick={() => promoteUser(p.id)} className="btn-ghost" title="Promote to admin" style={{ padding: '6px 10px' }}>
                    <Shield size={13} color="#D4A53A" />
                  </button>
                ) : (
                  <button onClick={() => demoteUser(p.id)} className="btn-ghost" title="Demote to player" style={{ padding: '6px 10px' }}>
                    <ShieldOff size={13} color="var(--tx3)" />
                  </button>
                )}
                {p.nickname && (
                  <button
                    onClick={() => supabase.from('profiles').update({ nickname: null }).eq('id', p.id).then(() => fetchProfiles())}
                    className="btn-ghost" title="Clear nickname" style={{ padding: '6px 10px', fontSize: 11, color: 'var(--tx3)' }}
                  >
                    ✕ nick
                  </button>
                )}
                <button onClick={() => removeUser(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px 10px', color: 'rgba(239,68,68,0.6)' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Codes tab ───────────────────────────────────────────── */}
      {tab === 'codes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="glass" style={{ padding: '20px 22px' }}>
            <div style={{ fontSize: 11, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Player Invite Code</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontFamily: 'monospace', fontSize: 24, fontWeight: 700, color: '#D4A53A', letterSpacing: 3 }}>{PLAYER_CODE}</div>
              <button onClick={() => copy(PLAYER_CODE, 'player')} className="btn-ghost" style={{ padding: '6px 12px', display: 'flex', gap: 4, alignItems: 'center' }}>
                {copiedKey === 'player' ? <Check size={13} /> : <Copy size={13} />} Copy
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 8 }}>Share this code freely with all players</div>
          </div>

          <div className="glass" style={{ padding: '20px 22px', borderColor: 'rgba(245,158,11,0.2)' }}>
            <div style={{ fontSize: 11, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>⏳ Waitlist Code</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontFamily: 'monospace', fontSize: 24, fontWeight: 700, color: '#f59e0b', letterSpacing: 3 }}>{WAITLIST_CODE}</div>
              <button onClick={() => copy(WAITLIST_CODE, 'waitlist')} className="btn-ghost" style={{ padding: '6px 12px', display: 'flex', gap: 4, alignItems: 'center' }}>
                {copiedKey === 'waitlist' ? <Check size={13} /> : <Copy size={13} />} Copy
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'rgba(245,158,11,0.6)', marginTop: 8 }}>Share with players on standby — promote them to active when a spot opens</div>
          </div>

          <div className="glass" style={{ padding: '20px 22px', borderColor: 'rgba(239,68,68,0.2)' }}>
            <div style={{ fontSize: 11, color: '#ef4444', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>⚠️ Admin Code — Keep Private</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{ fontFamily: 'monospace', fontSize: 24, fontWeight: 700, color: '#ef4444', letterSpacing: 3, filter: adminBlurred ? 'blur(6px)' : 'none', transition: 'filter 0.2s', cursor: 'pointer' }}
                onClick={() => setAdminBlurred(false)}>
                {ADMIN_CODE}
              </div>
              <button onClick={() => copy(ADMIN_CODE, 'admin')} className="btn-ghost" style={{ padding: '6px 12px', display: 'flex', gap: 4, alignItems: 'center' }}>
                {copiedKey === 'admin' ? <Check size={13} /> : <Copy size={13} />} Copy
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'rgba(239,68,68,0.6)', marginTop: 8 }}>
              {adminBlurred ? 'Click code to reveal. ' : ''}Only share with trusted admins — grants full app access.
            </div>
          </div>
        </div>
      )}

      {/* ── Tournament tab ──────────────────────────────────────── */}
      {tab === 'tournament' && (() => {
        const active = tournamentHistory.filter(t => !t.deleted_at)
        const deleted = tournamentHistory.filter(t => t.deleted_at)

        const catLabel: Record<string, string> = { champion: '🏆 Champion', runner_up: '🥈 Runner-Up', third: '🥉 Third Place', jackass: '🤠 Jackass of the Day', ctp: '🎯 Closest to Pin', ld: '💥 Longest Drive' }

        const EditRow = ({ label, ec, update }: { label: string; ec: EditCategory; update: (p: Partial<EditCategory>) => void }) => (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: 'var(--tx3)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {['jackass', 'ctp', 'ld'].some(k => label.toLowerCase().includes(k.slice(0,3))) ? (
                <>
                  <input placeholder="Name…" value={ec.player1_name} onChange={e => update({ player1_name: e.target.value })} style={{ flex: '2 1 160px' }} />
                  <input placeholder="Detail (votes / distance)…" value={ec.detail} onChange={e => update({ detail: e.target.value })} style={{ flex: '2 1 160px' }} />
                </>
              ) : (
                <>
                  <input placeholder="Team name…" value={ec.team_name} onChange={e => update({ team_name: e.target.value })} style={{ flex: '2 1 140px' }} />
                  <input placeholder="Player 1…" value={ec.player1_name} onChange={e => update({ player1_name: e.target.value })} style={{ flex: '2 1 120px' }} />
                  <input placeholder="Player 2…" value={ec.player2_name} onChange={e => update({ player2_name: e.target.value })} style={{ flex: '2 1 120px' }} />
                  <input placeholder="Score (E=0, -4=-4)…" type="number" value={ec.score_to_par} onChange={e => update({ score_to_par: e.target.value })} style={{ flex: '1 1 80px' }} />
                </>
              )}
            </div>
          </div>
        )

        const editKey = (cat: keyof EditingTournament) => (p: Partial<EditCategory>) =>
          setEditingT(prev => prev ? { ...prev, [cat]: { ...(prev[cat] as EditCategory), ...p } } : prev)

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setTestTournamentOpen(true)}
                style={{ padding: '8px 16px', borderRadius: 999, fontSize: 13, fontWeight: 600, background: 'var(--surf2)', border: '1px solid var(--bdr2)', color: 'var(--tx2)', cursor: 'pointer' }}
              >
                + Create Test Tournament
              </button>
            </div>

            {active.length === 0 && (
              <div className="glass" style={{ padding: '32px', textAlign: 'center', color: 'var(--tx4)', fontSize: 14 }}>
                No tournaments archived yet. Use "End Tournament &amp; Archive" below to save your first entry.
              </div>
            )}

            {active.map(t => {
              const champ = t.results.find(r => r.category === 'champion')
              return (
                <div key={t.id} className="glass" style={{ padding: '18px 22px', border: t.status === 'active' ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(212,165,58,0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{ fontFamily: 'Bebas Neue', fontSize: 28, letterSpacing: 3, color: t.status === 'active' ? '#22c55e' : '#D4A53A', lineHeight: 1 }}>{t.year}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx1)', marginBottom: 4 }}>{t.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: 1, background: t.status === 'active' ? 'rgba(34,197,94,0.12)' : 'var(--surf2)', color: t.status === 'active' ? '#22c55e' : 'var(--tx2)' }}>
                          {t.status === 'active' ? '● Active' : '🔒 Locked'}
                        </div>
                        {t.course && <div style={{ fontSize: 12, color: 'var(--tx3)' }}>⛳ {t.course}</div>}
                      </div>
                      {champ && (
                        <div style={{ fontSize: 13, color: 'var(--tx2)', marginTop: 4 }}>
                          🏆 {champ.team_name ?? champ.player1_name ?? '—'}
                          {champ.score_to_par != null && <span style={{ color: champ.score_to_par < 0 ? '#34d399' : '#f87171', marginLeft: 6 }}>{champ.score_to_par === 0 ? 'E' : champ.score_to_par > 0 ? `+${champ.score_to_par}` : champ.score_to_par}</span>}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button onClick={() => openEditT(t)} style={{ padding: '7px 16px', borderRadius: 999, fontSize: 13, fontWeight: 600, background: 'rgba(212,165,58,0.1)', border: '1px solid rgba(212,165,58,0.3)', color: '#D4A53A', cursor: 'pointer' }}>Edit</button>
                      {t.status !== 'active' && (
                        <button onClick={() => activateT(t.id, t.year)} style={{ padding: '7px 16px', borderRadius: 999, fontSize: 13, fontWeight: 600, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e', cursor: 'pointer' }}>Set Active</button>
                      )}
                      {t.status !== 'active' && (
                        <button onClick={() => setDeleteModal({ id: t.id, year: t.year, name: t.name, isActive: false, step: 1 })} style={{ padding: '7px 16px', borderRadius: 999, fontSize: 13, fontWeight: 600, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444', cursor: 'pointer' }}>Remove</button>
                      )}
                    </div>
                  </div>
                  {t.final_standings && t.final_standings.length > 0 && (
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--bdr)' }}>
                      <div style={{ fontSize: 10, letterSpacing: 2, color: 'var(--tx4)', textTransform: 'uppercase', marginBottom: 8 }}>Full Final Standings</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {(t.final_standings).map((s, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                            <span style={{ width: 20, textAlign: 'center', flexShrink: 0, color: 'var(--tx4)', fontFamily: 'Bebas Neue' }}>{i + 1}</span>
                            <span style={{ flex: 1, color: i === 0 ? '#D4A53A' : 'var(--tx2)' }}>{s.teamName} {(s.p1Name || s.p2Name) && <span style={{ color: 'var(--tx3)', fontSize: 11 }}>— {[s.p1Name, s.p2Name].filter(Boolean).join(' & ')}</span>}</span>
                            <span style={{ fontFamily: 'Bebas Neue', fontSize: 14, color: s.toPar < 0 ? '#34d399' : s.toPar > 0 ? '#f87171' : '#D4A53A' }}>{s.toPar === 0 ? 'E' : s.toPar > 0 ? `+${s.toPar}` : s.toPar}</span>
                            <span style={{ fontSize: 11, color: 'var(--tx4)', minWidth: 30, textAlign: 'right' }}>/{s.thru}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {/* Deleted years */}
            {deleted.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: 'var(--tx4)', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                  🗑️ Deleted Years <span style={{ background: 'var(--surf2)', borderRadius: 999, padding: '1px 8px', fontSize: 10 }}>{deleted.length}</span>
                </div>
                {deleted.map(t => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px', borderRadius: 12, background: 'var(--surf2)', border: '1px solid var(--bdr)', marginBottom: 8, opacity: 0.7 }}>
                    <div style={{ fontFamily: 'Bebas Neue', fontSize: 22, color: 'var(--tx4)', letterSpacing: 2 }}>{t.year}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: 'var(--tx2)', fontWeight: 600 }}>{t.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--tx4)', marginTop: 2 }}>
                        Removed {t.deleted_at ? new Date(t.deleted_at).toLocaleDateString() : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => restoreT(t.id, t.year)}
                        disabled={restoringYear === t.id}
                        style={{ padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e', cursor: 'pointer', opacity: restoringYear === t.id ? 0.6 : 1 }}
                      >
                        {restoringYear === t.id ? 'Restoring…' : 'Restore'}
                      </button>
                      <button
                        onClick={() => { setPermDeleteModal({ id: t.id, name: t.name }); setPermDeleteInput('') }}
                        style={{ padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', cursor: 'pointer' }}
                      >
                        Delete Forever
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Edit modal */}
            {editingT && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                <div style={{ background: 'var(--panel)', border: '1px solid rgba(212,165,58,0.3)', borderRadius: 18, padding: 28, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
                  <div style={{ fontFamily: 'Bebas Neue', fontSize: 24, color: '#D4A53A', letterSpacing: 3, marginBottom: 20 }}>Edit {editingT.year}</div>

                  {/* Metadata */}
                  <div style={{ marginBottom: 22 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: 'var(--tx4)', textTransform: 'uppercase', marginBottom: 10 }}>Tournament Info</div>
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ fontSize: 11, color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Tournament Name</label>
                      <input placeholder="e.g. The Chubbs Memorial" value={editingT.name} onChange={e => setEditingT(p => p ? { ...p, name: e.target.value } : p)} style={{ width: '100%', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      <div style={{ flex: '2 1 200px' }}>
                        <label style={{ fontSize: 11, color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Course</label>
                        <input placeholder="Course name…" value={editingT.course} onChange={e => setEditingT(p => p ? { ...p, course: e.target.value } : p)} style={{ width: '100%', boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ flex: '1 1 140px' }}>
                        <label style={{ fontSize: 11, color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Date</label>
                        <input type="date" value={editingT.date} onChange={e => setEditingT(p => p ? { ...p, date: e.target.value } : p)} style={{ width: '100%', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <label style={{ fontSize: 11, color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Notes</label>
                      <input placeholder="Any notes about this year…" value={editingT.notes} onChange={e => setEditingT(p => p ? { ...p, notes: e.target.value } : p)} style={{ width: '100%', boxSizing: 'border-box' }} />
                    </div>
                  </div>

                  {/* Results */}
                  <div style={{ marginBottom: 22 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: 'var(--tx4)', textTransform: 'uppercase', marginBottom: 12 }}>Results <span style={{ fontWeight: 400, color: 'var(--tx4)' }}>(clear all fields to remove a category)</span></div>
                    {([['champion', '🏆 Champion'], ['runner_up', '🥈 Runner-Up'], ['third', '🥉 Third Place'], ['jackass', '🤠 Jackass of the Day'], ['ctp', '🎯 Closest to Pin'], ['ld', '💥 Longest Drive']] as [keyof EditingTournament, string][]).map(([cat, label]) => (
                      <EditRow key={cat} label={label} ec={editingT[cat] as EditCategory} update={editKey(cat)} />
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={saveEditT} disabled={savingEdit} style={{ flex: 1, padding: '12px 20px', borderRadius: 999, fontSize: 14, fontWeight: 700, background: '#D4A53A', border: 'none', color: '#0a0800', cursor: savingEdit ? 'not-allowed' : 'pointer', opacity: savingEdit ? 0.6 : 1 }}>
                      {savingEdit ? 'Saving…' : 'Save Changes'}
                    </button>
                    <button onClick={() => setEditingT(null)} disabled={savingEdit} style={{ padding: '12px 20px', borderRadius: 999, fontSize: 14, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--tx2)', cursor: 'pointer' }}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {/* Delete modal — step 1 */}
            {deleteModal?.step === 1 && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                <div style={{ background: 'var(--panel)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 18, padding: 28, width: '100%', maxWidth: 440 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#ef4444', marginBottom: 12 }}>Remove "{deleteModal.name}"?</div>
                  {deleteModal.isActive && (
                    <p style={{ fontSize: 13, color: '#f59e0b', marginBottom: 10, lineHeight: 1.6, padding: '8px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
                      ⚠️ This is the active tournament. Removing it will put the app into off-season mode until you create a new one.
                    </p>
                  )}
                  <p style={{ fontSize: 14, color: 'var(--tx2)', marginBottom: 8, lineHeight: 1.6 }}>This will hide <strong style={{ color: 'var(--tx1)' }}>{deleteModal.name}</strong> from the Hall of Fame.</p>
                  <p style={{ fontSize: 13, color: 'var(--tx3)', marginBottom: 24, lineHeight: 1.6 }}>Not permanent — restore it from Deleted Years at any time.</p>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => setDeleteModal(d => d ? { ...d, step: 2 } : d)} style={{ flex: 1, padding: '12px 20px', borderRadius: 999, fontSize: 14, fontWeight: 700, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444', cursor: 'pointer' }}>Yes, remove it</button>
                    <button onClick={() => setDeleteModal(null)} style={{ padding: '12px 20px', borderRadius: 999, fontSize: 14, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--tx2)', cursor: 'pointer' }}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {/* Delete modal — step 2 */}
            {deleteModal?.step === 2 && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                <div style={{ background: 'var(--panel)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 18, padding: 28, width: '100%', maxWidth: 440 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#ef4444', marginBottom: 12 }}>Final Confirmation</div>
                  <p style={{ fontSize: 14, color: 'var(--tx2)', marginBottom: 20, lineHeight: 1.6 }}>
                    Type <strong style={{ color: 'var(--tx1)' }}>{deleteModal.year}</strong> to confirm removal from the Hall of Fame.
                  </p>
                  <input
                    autoFocus
                    type="text"
                    placeholder={`Type ${deleteModal.year} here…`}
                    value={deleteInput}
                    onChange={e => setDeleteInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && deleteInput === String(deleteModal.year) && softDeleteT()}
                    style={{ width: '100%', boxSizing: 'border-box', marginBottom: 20, textAlign: 'center', fontSize: 18, letterSpacing: 4 }}
                  />
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={softDeleteT}
                      disabled={deletingYear || deleteInput !== String(deleteModal.year)}
                      style={{ flex: 1, padding: '12px 20px', borderRadius: 999, fontSize: 14, fontWeight: 700, background: deleteInput === String(deleteModal.year) ? '#ef4444' : 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: deleteInput === String(deleteModal.year) ? '#fff' : 'rgba(239,68,68,0.4)', cursor: deletingYear || deleteInput !== String(deleteModal.year) ? 'not-allowed' : 'pointer', opacity: deletingYear ? 0.6 : 1 }}
                    >
                      {deletingYear ? 'Removing…' : 'Confirm Remove'}
                    </button>
                    <button onClick={() => { setDeleteModal(null); setDeleteInput('') }} style={{ padding: '12px 20px', borderRadius: 999, fontSize: 14, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--tx2)', cursor: 'pointer' }}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {/* Permanent delete modal */}
            {permDeleteModal && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                <div style={{ background: 'var(--panel)', border: '1px solid rgba(239,68,68,0.5)', borderRadius: 18, padding: 28, width: '100%', maxWidth: 440 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#ef4444', marginBottom: 12 }}>Delete Forever?</div>
                  <p style={{ fontSize: 14, color: 'var(--tx2)', marginBottom: 8, lineHeight: 1.6 }}>
                    This will <strong style={{ color: 'var(--tx1)' }}>permanently delete</strong> all data for this tournament — standings, results, scores, and feed events. <strong style={{ color: '#ef4444' }}>This cannot be undone.</strong>
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--tx3)', marginBottom: 20, lineHeight: 1.6 }}>
                    Type <strong style={{ color: 'var(--tx1)' }}>{permDeleteModal.name}</strong> to confirm.
                  </p>
                  <input
                    autoFocus
                    type="text"
                    placeholder={`Type "${permDeleteModal.name}" here…`}
                    value={permDeleteInput}
                    onChange={e => setPermDeleteInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && permDeleteInput === permDeleteModal.name && permanentDeleteT()}
                    style={{ width: '100%', boxSizing: 'border-box', marginBottom: 20 }}
                  />
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={permanentDeleteT}
                      disabled={permDeleting || permDeleteInput !== permDeleteModal.name}
                      style={{ flex: 1, padding: '12px 20px', borderRadius: 999, fontSize: 14, fontWeight: 700, background: permDeleteInput === permDeleteModal.name ? '#ef4444' : 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: permDeleteInput === permDeleteModal.name ? '#fff' : 'rgba(239,68,68,0.4)', cursor: permDeleting || permDeleteInput !== permDeleteModal.name ? 'not-allowed' : 'pointer', opacity: permDeleting ? 0.6 : 1 }}
                    >
                      {permDeleting ? 'Deleting…' : 'Delete Forever'}
                    </button>
                    <button onClick={() => { setPermDeleteModal(null); setPermDeleteInput('') }} style={{ padding: '12px 20px', borderRadius: 999, fontSize: 14, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--tx2)', cursor: 'pointer' }}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {Object.keys(catLabel).length > 0 && null /* suppress unused var */}

            {/* ── Current Tournament Actions ───────────────────── */}
            <div style={{ marginTop: 8, paddingTop: 24, borderTop: '1px solid var(--bdr)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: 'var(--tx4)', textTransform: 'uppercase', marginBottom: 16 }}>
                Current Tournament Actions
              </div>
              {!activeTournamentId && (
                <div style={{ padding: '28px 24px', borderRadius: 14, border: '1px dashed rgba(212,165,58,0.3)', background: 'rgba(212,165,58,0.03)', textAlign: 'center', marginBottom: 16 }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>⛳</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--tx2)', marginBottom: 6 }}>No active tournament</div>
                  <p style={{ fontSize: 13, color: 'var(--tx3)', marginBottom: 18, lineHeight: 1.5 }}>
                    Create a new tournament to start tracking scores, teams, and events.
                  </p>
                  <button
                    onClick={() => setCreateTournamentOpen(true)}
                    style={{ padding: '12px 28px', borderRadius: 999, fontSize: 14, fontWeight: 700, background: '#D4A53A', border: 'none', color: '#0a0800', cursor: 'pointer' }}
                  >
                    + Create Tournament
                  </button>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {activeTournamentId && (<>

                {/* Jackass voting */}
                <div style={{ padding: '20px 22px', borderRadius: 14, border: '1px solid rgba(212,165,58,0.25)', background: 'rgba(212,165,58,0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span style={{ fontSize: 20 }}>🤠</span>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#D4A53A' }}>Jackass of the Day</div>
                    <div style={{
                      marginLeft: 'auto', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
                      background: laheyVotingOpen ? 'rgba(34,197,94,0.15)' : 'var(--surf2)',
                      color: laheyVotingOpen ? '#22c55e' : 'var(--tx3)',
                      textTransform: 'uppercase', letterSpacing: 1,
                    }}>
                      {laheyVotingOpen ? '● Open' : '● Closed'}
                    </div>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--tx3)', marginBottom: 18, lineHeight: 1.6 }}>
                    Control when players can vote. Reset clears all votes so you can start fresh.
                  </p>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      onClick={toggleLaheyVoting}
                      disabled={laheyTogglingOpen}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '11px 24px', borderRadius: 999, fontSize: 14, fontWeight: 700,
                        background: laheyVotingOpen ? 'var(--surf2)' : 'rgba(34,197,94,0.15)',
                        border: `1px solid ${laheyVotingOpen ? 'var(--bdr)' : 'rgba(34,197,94,0.4)'}`,
                        color: laheyVotingOpen ? 'var(--tx2)' : '#22c55e',
                        cursor: laheyTogglingOpen ? 'not-allowed' : 'pointer',
                        opacity: laheyTogglingOpen ? 0.6 : 1,
                      }}
                    >
                      <PlayCircle size={15} />
                      {laheyTogglingOpen ? 'Updating…' : laheyVotingOpen ? 'Close Voting' : 'Open Voting'}
                    </button>
                    <button
                      onClick={resetLaheyVotes}
                      disabled={laheyResetting}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '11px 24px', borderRadius: 999, fontSize: 14, fontWeight: 700,
                        background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                        color: '#ef4444', cursor: laheyResetting ? 'not-allowed' : 'pointer',
                        opacity: laheyResetting ? 0.6 : 1,
                      }}
                    >
                      <RotateCcw size={15} />
                      {laheyResetting ? 'Clearing…' : 'Reset All Votes'}
                    </button>
                  </div>
                </div>

                {/* End Tournament & Archive */}
                <div style={{ padding: '20px 22px', borderRadius: 14, border: '1px solid rgba(212,165,58,0.3)', background: 'rgba(212,165,58,0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <Archive size={20} color="#D4A53A" />
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#D4A53A' }}>End Tournament & Archive</div>
                  </div>
                  <p style={{ fontSize: 14, color: 'var(--tx2)', marginBottom: 6, lineHeight: 1.6 }}>
                    Saves the final standings, Jackass winner, and contest winners to the <strong style={{ color: '#D4A53A' }}>Hall of Fame</strong>, then clears all scores for the next tournament.
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--tx3)', marginBottom: 18, lineHeight: 1.6 }}>
                    Teams and player accounts are preserved.
                  </p>
                  <button
                    onClick={prepareEndTournament}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '12px 28px', borderRadius: 999, fontSize: 15, fontWeight: 700,
                      background: 'rgba(212,165,58,0.15)', border: '1px solid rgba(212,165,58,0.5)',
                      color: '#D4A53A', cursor: 'pointer',
                    }}
                  >
                    <Archive size={15} /> Archive Results & Reset
                  </button>
                </div>

                {/* Score reset */}
                <div style={{ padding: '20px 22px', borderRadius: 14, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <RotateCcw size={20} color="#ef4444" />
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#ef4444' }}>Reset Tournament</div>
                  </div>
                  <p style={{ fontSize: 14, color: 'var(--tx2)', marginBottom: 6, lineHeight: 1.6 }}>
                    Permanently deletes <strong style={{ color: 'var(--tx1)' }}>all scores and drive selections</strong> for every team.
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--tx3)', marginBottom: 20, lineHeight: 1.6 }}>
                    Teams, player assignments, tee times, and all other data remain untouched.
                  </p>
                  {!resetConfirm ? (
                    <button
                      onClick={() => setResetConfirm(true)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '12px 28px', borderRadius: 999, fontSize: 15, fontWeight: 700,
                        background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
                        color: '#ef4444', cursor: 'pointer',
                      }}
                    >
                      <RotateCcw size={15} /> Reset All Scores
                    </button>
                  ) : (
                    <div style={{ padding: '16px 20px', borderRadius: 12, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)' }}>
                      <div style={{ fontWeight: 700, color: '#ef4444', fontSize: 15, marginBottom: 6 }}>Are you absolutely sure?</div>
                      <div style={{ fontSize: 13, color: 'var(--tx2)', marginBottom: 16 }}>
                        Every score will be deleted. This cannot be undone.
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button
                          onClick={resetTournament}
                          disabled={resetting}
                          style={{
                            padding: '10px 24px', borderRadius: 999, fontSize: 14, fontWeight: 700,
                            background: '#ef4444', border: 'none', color: 'var(--tx1)',
                            cursor: resetting ? 'not-allowed' : 'pointer', opacity: resetting ? 0.6 : 1,
                          }}
                        >
                          {resetting ? 'Resetting…' : 'Yes, delete all scores'}
                        </button>
                        <button
                          onClick={() => setResetConfirm(false)}
                          style={{
                            padding: '10px 24px', borderRadius: 999, fontSize: 14,
                            background: 'var(--surf2)', border: '1px solid var(--bdr)',
                            color: 'var(--tx2)', cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>

              </>)}
              </div>
            </div>

            {/* Create Tournament modal */}
            {createTournamentOpen && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                <div style={{ background: 'var(--panel)', border: '1px solid rgba(212,165,58,0.35)', borderRadius: 18, padding: 28, width: '100%', maxWidth: 420 }}>
                  <div style={{ fontFamily: 'Bebas Neue', fontSize: 24, color: '#D4A53A', letterSpacing: 3, marginBottom: 6 }}>New Tournament</div>
                  <p style={{ fontSize: 13, color: 'var(--tx3)', marginBottom: 20, lineHeight: 1.5 }}>
                    Give this tournament a name. It will be set to {new Date().getFullYear()} and go live immediately.
                  </p>
                  <div style={{ marginBottom: 24 }}>
                    <label style={{ fontSize: 11, color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Tournament Name</label>
                    <input
                      autoFocus
                      placeholder="e.g. The Chubbs Memorial"
                      value={createTournamentName}
                      onChange={e => setCreateTournamentName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && createNewTournament()}
                      style={{ width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={createNewTournament}
                      disabled={creatingTournament || !createTournamentName.trim()}
                      style={{ flex: 1, padding: '12px 20px', borderRadius: 999, fontSize: 14, fontWeight: 700, background: '#D4A53A', border: 'none', color: '#0a0800', cursor: creatingTournament ? 'not-allowed' : 'pointer', opacity: creatingTournament ? 0.6 : 1 }}
                    >
                      {creatingTournament ? 'Creating…' : 'Create & Go Live'}
                    </button>
                    <button onClick={() => { setCreateTournamentOpen(false); setCreateTournamentName('') }} style={{ padding: '12px 20px', borderRadius: 999, fontSize: 14, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--tx2)', cursor: 'pointer' }}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {/* End Tournament Modal */}
            {endTournamentOpen && endTournamentPreview && (
              <div style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
                zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
              }}>
                <div style={{ background: 'var(--panel)', border: '1px solid rgba(212,165,58,0.3)', borderRadius: 18, padding: 28, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
                  <div style={{ fontFamily: 'Bebas Neue', fontSize: 24, color: '#D4A53A', letterSpacing: 3, marginBottom: 6 }}>End of Year Summary</div>
                  <p style={{ fontSize: 13, color: 'var(--tx3)', marginBottom: 22, lineHeight: 1.5 }}>
                    Review the results that will be saved to the Hall of Fame, then confirm to archive and reset.
                  </p>
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: 'var(--tx4)', textTransform: 'uppercase', marginBottom: 10 }}>Final Standings</div>
                    {endTournamentPreview.standings.length === 0 ? (
                      <div style={{ fontSize: 13, color: 'var(--tx4)', padding: '10px 0' }}>No scores recorded</div>
                    ) : (
                      endTournamentPreview.standings.slice(0, 3).map((s, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', marginBottom: 6, borderRadius: 10, background: 'var(--surf)', border: '1px solid var(--bdr)' }}>
                          <span style={{ fontSize: 16, width: 24, textAlign: 'center' }}>{i === 0 ? '🏆' : i === 1 ? '🥈' : '🥉'}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: i === 0 ? '#D4A53A' : 'var(--tx1)' }}>{s.teamName}</div>
                            {(s.p1Name || s.p2Name) && <div style={{ fontSize: 11, color: 'var(--tx3)' }}>{[s.p1Name, s.p2Name].filter(Boolean).join(' & ')}</div>}
                          </div>
                          <div style={{ fontFamily: 'Bebas Neue', fontSize: 17, color: s.toPar < 0 ? '#34d399' : s.toPar > 0 ? '#f87171' : '#D4A53A' }}>
                            {s.toPar === 0 ? 'E' : s.toPar > 0 ? `+${s.toPar}` : s.toPar}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div style={{ marginBottom: 20, padding: '12px 16px', borderRadius: 10, background: 'rgba(212,165,58,0.04)', border: '1px solid rgba(212,165,58,0.15)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: 'var(--tx4)', textTransform: 'uppercase', marginBottom: 6 }}>🤠 Jackass of the Day</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#D4A53A' }}>
                      {endTournamentPreview.jackassName ?? 'No votes recorded'}
                      {endTournamentPreview.jackassVotes > 0 && <span style={{ fontSize: 12, color: 'var(--tx3)', fontWeight: 400, marginLeft: 8 }}>({endTournamentPreview.jackassVotes} votes)</span>}
                    </div>
                  </div>
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: 'var(--tx4)', textTransform: 'uppercase', marginBottom: 10 }}>Contest Winners (optional)</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 12, color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>🎯 Closest to Pin winner</label>
                        <input type="text" placeholder="Player name..." value={endTournamentPreview.ctpWinner} onChange={e => setEndTournamentPreview(p => p ? { ...p, ctpWinner: e.target.value } : p)} style={{ width: '100%', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>💥 Longest Drive winner</label>
                        <input type="text" placeholder="Player name..." value={endTournamentPreview.ldWinner} onChange={e => setEndTournamentPreview(p => p ? { ...p, ldWinner: e.target.value } : p)} style={{ width: '100%', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(239,68,68,0.7)', marginBottom: 16, lineHeight: 1.6, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    ⚠️ After archiving, all scores, chulligans, contest entries, votes, and feed events will be permanently cleared.
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={doEndTournament} disabled={endingTournament} style={{ flex: 1, padding: '12px 20px', borderRadius: 999, fontSize: 14, fontWeight: 700, background: '#D4A53A', border: 'none', color: '#0a0800', cursor: endingTournament ? 'not-allowed' : 'pointer', opacity: endingTournament ? 0.6 : 1 }}>
                      {endingTournament ? 'Archiving…' : '🏆 Archive & Reset for Next Year'}
                    </button>
                    <button onClick={() => { setEndTournamentOpen(false); setEndTournamentPreview(null) }} disabled={endingTournament} style={{ padding: '12px 20px', borderRadius: 999, fontSize: 14, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--tx2)', cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Create Test Tournament modal */}
            {testTournamentOpen && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                <div style={{ background: 'var(--panel)', border: '1px solid var(--bdr2)', borderRadius: 18, padding: 28, width: '100%', maxWidth: 420 }}>
                  <div style={{ fontFamily: 'Bebas Neue', fontSize: 22, color: '#D4A53A', letterSpacing: 3, marginBottom: 6 }}>Create Test Tournament</div>
                  <p style={{ fontSize: 13, color: 'var(--tx3)', marginBottom: 20, lineHeight: 1.5 }}>
                    Creates a completed tournament that appears in the year dropdown. Useful for testing the archive viewer.
                  </p>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 11, color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Tournament Name</label>
                    <input
                      autoFocus
                      placeholder="e.g. Test 2023"
                      value={testTournamentName}
                      onChange={e => setTestTournamentName(e.target.value)}
                      style={{ width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ marginBottom: 24 }}>
                    <label style={{ fontSize: 11, color: 'var(--tx3)', display: 'block', marginBottom: 4 }}>Year</label>
                    <input
                      type="number"
                      placeholder="e.g. 2023"
                      value={testTournamentYear}
                      onChange={e => setTestTournamentYear(e.target.value)}
                      style={{ width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={createTestTournament}
                      disabled={creatingTestTournament || !testTournamentName.trim() || !testTournamentYear}
                      style={{ flex: 1, padding: '12px 20px', borderRadius: 999, fontSize: 14, fontWeight: 700, background: '#D4A53A', border: 'none', color: '#0a0800', cursor: creatingTestTournament ? 'not-allowed' : 'pointer', opacity: creatingTestTournament ? 0.6 : 1 }}
                    >
                      {creatingTestTournament ? 'Creating…' : 'Create'}
                    </button>
                    <button onClick={() => { setTestTournamentOpen(false); setTestTournamentName(''); setTestTournamentYear(String(new Date().getFullYear())) }} style={{ padding: '12px 20px', borderRadius: 999, fontSize: 14, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--tx2)', cursor: 'pointer' }}>Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Brevo tab ───────────────────────────────────────────── */}
      {tab === 'brevo' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Status card */}
          <div className="glass" style={{ padding: '22px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 28 }}>📣</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#D4A53A' }}>Brevo Contact Sync</div>
                <div style={{ fontSize: 13, color: 'var(--tx3)', marginTop: 2 }}>
                  Push all active players to your Brevo audience for email campaigns
                </div>
              </div>
              {brevoLastSync && (
                <div style={{
                  marginLeft: 'auto', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
                  background: 'rgba(34,197,94,0.12)', color: '#22c55e',
                  textTransform: 'uppercase', letterSpacing: 1, flexShrink: 0,
                }}>
                  ● Synced
                </div>
              )}
            </div>

            {/* What gets synced */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
              {[
                { label: 'Active players', value: activePlayers.length },
                { label: 'With email', value: activePlayers.filter(p => p.email).length },
                { label: 'With phone', value: activePlayers.filter(p => p.phone).length },
              ].map(({ label, value }) => (
                <div key={label} style={{ padding: '10px 16px', borderRadius: 10, background: 'var(--surf)', border: '1px solid var(--bdr)', textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#D4A53A', fontFamily: 'Bebas Neue', letterSpacing: 1 }}>{value}</div>
                  <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 18, lineHeight: 1.7 }}>
              Syncs <strong style={{ color: 'var(--tx2)' }}>name</strong>, <strong style={{ color: 'var(--tx2)' }}>email</strong>, and <strong style={{ color: 'var(--tx2)' }}>phone</strong> (if set) for every active player.
              Existing contacts are updated. Safe to run multiple times.
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <button
                onClick={syncToBrevo}
                disabled={brevoSyncing}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '11px 24px', borderRadius: 999, fontSize: 14, fontWeight: 700,
                  background: 'rgba(212,165,58,0.15)', border: '1px solid rgba(212,165,58,0.4)',
                  color: '#D4A53A', cursor: brevoSyncing ? 'not-allowed' : 'pointer',
                  opacity: brevoSyncing ? 0.6 : 1,
                }}
              >
                <span style={{ fontSize: 16 }}>🔄</span>
                {brevoSyncing ? 'Syncing…' : `Sync ${activePlayers.length} active players to Brevo`}
              </button>
              {brevoLastSync && (
                <span style={{ fontSize: 12, color: '#22c55e' }}>
                  ✓ Last sync: {brevoLastSync.count} contacts at {brevoLastSync.at}
                </span>
              )}
            </div>
          </div>

          {/* Setup instructions */}
          <div style={{ padding: '18px 20px', borderRadius: 12, background: 'rgba(212,165,58,0.04)', border: '1px solid rgba(212,165,58,0.15)', fontSize: 13, color: 'var(--tx2)', lineHeight: 1.8 }}>
            <div style={{ fontWeight: 700, color: '#D4A53A', marginBottom: 10 }}>One-time setup</div>
            <ol style={{ paddingLeft: 18, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li>
                In Brevo: <strong style={{ color: 'var(--tx2)' }}>Settings → API Keys</strong> → create a key with Contacts permission.
              </li>
              <li>
                In Supabase Dashboard: <strong style={{ color: 'var(--tx2)' }}>Edge Functions → brevo-sync → Secrets</strong>, add <code style={{ color: '#D4A53A', fontSize: 12 }}>BREVO_API_KEY</code>.
              </li>
              <li>
                Deploy the function: <code style={{ color: '#D4A53A', fontSize: 12 }}>supabase functions deploy brevo-sync</code>
              </li>
            </ol>
          </div>
        </div>
      )}

      {/* ── RSVP tab ────────────────────────────────────────────── */}
      {tab === 'rsvp' && <RSVPPanel />}
    </div>
  )
}

