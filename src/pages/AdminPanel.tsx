import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'
import type { Profile, Team, Highlight, HighlightType } from '../lib/types'
import { displayName, HL_TYPES } from '../lib/types'
import { formatDistanceToNow } from 'date-fns'
import { Copy, Shield, ShieldOff, Trash2, Check, Plus, Users, RotateCcw, Beer, PlayCircle, Shuffle } from 'lucide-react'

type TeamWithPlayers = Team & { player1?: Profile; player2?: Profile }

export default function AdminPanel() {
  const { showToast } = useToast()
  const [tab, setTab] = useState<'teams' | 'users' | 'codes' | 'reset' | 'brevo' | 'highlights'>('teams')
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [teams, setTeams] = useState<TeamWithPlayers[]>([])
  const [newTeamName, setNewTeamName] = useState('')
  const [creating, setCreating] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [adminBlurred, setAdminBlurred] = useState(true)

  useEffect(() => { fetchProfiles(); fetchTeams(); fetchHighlights() }, [])

  const fetchProfiles = async () => {
    const { data } = await supabase.from('profiles').select('*').order('name')
    setProfiles(data ?? [])
  }

  const fetchTeams = async () => {
    const { data } = await supabase
      .from('teams')
      .select('*, player1:profiles!teams_p1_id_fkey(*), player2:profiles!teams_p2_id_fkey(*)')
      .order('created_at')
    setTeams(data ?? [])
  }

  // ── Team management ──────────────────────────────────────────

  const createTeam = async () => {
    if (!newTeamName.trim()) return
    setCreating(true)
    const { error } = await supabase.from('teams').insert({ name: newTeamName.trim() })
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

  useEffect(() => {
    supabase.from('tournament_settings').select('lahey_voting_open').eq('id', 1).single()
      .then(({ data }) => { if (data) setLaheyVotingOpen(data.lahey_voting_open) })
  }, [])

  const resetTournament = async () => {
    setResetting(true)
    const [scoresRes, teamsRes] = await Promise.all([
      supabase.from('scores').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      supabase.from('teams').update({ name: '' }).neq('id', '00000000-0000-0000-0000-000000000000'),
    ])
    setResetting(false)
    setResetConfirm(false)
    const error = scoresRes.error ?? teamsRes.error
    if (error) showToast(error.message, 'error')
    else { showToast('All scores cleared and team names reset!'); fetchTeams() }
  }

  const toggleLaheyVoting = async () => {
    setLaheyTogglingOpen(true)
    const next = !laheyVotingOpen
    const { error } = await supabase.from('tournament_settings').update({ lahey_voting_open: next }).eq('id', 1)
    setLaheyTogglingOpen(false)
    if (error) showToast(error.message, 'error')
    else {
      setLaheyVotingOpen(next)
      showToast(next ? '🍺 Lahey voting is now open!' : 'Lahey voting closed.')
    }
  }

  const resetLaheyVotes = async () => {
    if (!confirm('Clear all Lahey votes? This cannot be undone.')) return
    setLaheyResetting(true)
    const { error } = await supabase.from('leahey_votes').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    setLaheyResetting(false)
    if (error) showToast(error.message, 'error')
    else showToast('All Lahey votes cleared.')
  }

  const activePlayers = profiles.filter(p => p.status === 'active')

  // ── Highlights ───────────────────────────────────────────
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [hlType, setHlType] = useState<HighlightType>('moment')
  const [hlPlayer, setHlPlayer] = useState('')
  const [hlHole, setHlHole] = useState('')
  const [hlDesc, setHlDesc] = useState('')
  const [hlSaving, setHlSaving] = useState(false)

  const fetchHighlights = async () => {
    const { data } = await supabase.from('highlights').select('*').order('created_at', { ascending: false })
    setHighlights(data ?? [])
  }

  const addHighlight = async () => {
    if (!hlPlayer.trim()) return
    setHlSaving(true)
    const { error } = await supabase.from('highlights').insert({
      type: hlType,
      player_name: hlPlayer.trim(),
      hole: hlHole ? parseInt(hlHole) : null,
      description: hlDesc.trim() || null,
    })
    setHlSaving(false)
    if (error) showToast(error.message, 'error')
    else { showToast('Highlight pinned!'); setHlPlayer(''); setHlHole(''); setHlDesc(''); fetchHighlights() }
  }

  const deleteHighlight = async (id: string) => {
    await supabase.from('highlights').delete().eq('id', id)
    setHighlights(h => h.filter(x => x.id !== id))
  }

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
        <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 32, color: '#FCB514', letterSpacing: 4 }}>Admin Panel</h1>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Manage teams, users, and access codes</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {([
          { id: 'teams',  label: '⛳ Teams' },
          { id: 'users',  label: '👥 Users' },
          { id: 'codes',  label: '🔑 Codes' },
          { id: 'reset',  label: '⚠️ Reset' },
          { id: 'brevo',       label: '📣 Brevo' },
          { id: 'highlights',  label: '🎬 Highlights' },
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
                    background: teamsReset ? 'rgba(255,255,255,0.03)' : 'rgba(239,68,68,0.1)',
                    border: `1px solid ${teamsReset ? 'rgba(255,255,255,0.08)' : 'rgba(239,68,68,0.3)'}`,
                    color: teamsReset ? 'rgba(255,255,255,0.25)' : '#ef4444',
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
                    background: teamsReset ? 'rgba(252,181,20,0.12)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${teamsReset ? 'rgba(252,181,20,0.35)' : 'rgba(255,255,255,0.08)'}`,
                    color: teamsReset ? '#FCB514' : 'rgba(255,255,255,0.2)',
                    cursor: regenerating || !teamsReset ? 'not-allowed' : 'pointer',
                    opacity: regenerating ? 0.6 : 1,
                  }}
                >
                  <Shuffle size={13} />
                  {regenerating ? 'Assigning…' : 'Regenerate Teams'}
                </button>

                {!teamsReset && (
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>
                    Reset teams first to enable regeneration
                  </span>
                )}
              </div>
            )
          })()}

          {teams.length === 0 && (
            <div className="glass" style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>
              <Users size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.2 }} />
              No teams yet. Create one above.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {teams.map(team => (
              <div key={team.id} className="glass" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, color: '#FCB514', fontSize: 15, flex: 1 }}>{team.name}</div>
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
                        <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 4 }}>
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
                  <span style={{ fontWeight: 700, color: '#fff', fontSize: 14 }}>{p.name}</span>
                  {p.nickname && (
                    <span style={{ fontSize: 12, color: '#FCB514', background: 'rgba(252,181,20,0.1)', padding: '1px 8px', borderRadius: 999 }}>
                      "{p.nickname}"
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{p.email}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
                  background: p.role === 'admin' ? 'rgba(252,181,20,0.15)' : 'rgba(255,255,255,0.06)',
                  color: p.role === 'admin' ? '#FCB514' : 'rgba(255,255,255,0.5)',
                  textTransform: 'uppercase', letterSpacing: 1,
                }}>
                  {p.role}
                </div>
                <div style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
                  background: p.status === 'active' ? 'rgba(34,197,94,0.12)' : p.status === 'waitlist' ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.1)',
                  color: p.status === 'active' ? '#22c55e' : p.status === 'waitlist' ? '#f59e0b' : '#ef4444',
                  textTransform: 'uppercase', letterSpacing: 1,
                }}>
                  {p.status ?? 'active'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {p.role === 'player' ? (
                  <button onClick={() => promoteUser(p.id)} className="btn-ghost" title="Promote to admin" style={{ padding: '6px 10px' }}>
                    <Shield size={13} color="#FCB514" />
                  </button>
                ) : (
                  <button onClick={() => demoteUser(p.id)} className="btn-ghost" title="Demote to player" style={{ padding: '6px 10px' }}>
                    <ShieldOff size={13} color="rgba(255,255,255,0.4)" />
                  </button>
                )}
                {p.nickname && (
                  <button
                    onClick={() => supabase.from('profiles').update({ nickname: null }).eq('id', p.id).then(() => fetchProfiles())}
                    className="btn-ghost" title="Clear nickname" style={{ padding: '6px 10px', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}
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
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Player Invite Code</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontFamily: 'monospace', fontSize: 24, fontWeight: 700, color: '#FCB514', letterSpacing: 3 }}>{PLAYER_CODE}</div>
              <button onClick={() => copy(PLAYER_CODE, 'player')} className="btn-ghost" style={{ padding: '6px 12px', display: 'flex', gap: 4, alignItems: 'center' }}>
                {copiedKey === 'player' ? <Check size={13} /> : <Copy size={13} />} Copy
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 8 }}>Share this code freely with all players</div>
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

      {/* ── Reset tab ───────────────────────────────────────────── */}
      {tab === 'reset' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Lahey voting controls */}
          <div style={{ padding: '20px 22px', borderRadius: 14, border: '1px solid rgba(252,181,20,0.25)', background: 'rgba(252,181,20,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <Beer size={20} color="#FCB514" />
              <div style={{ fontSize: 18, fontWeight: 700, color: '#FCB514' }}>Mr. Jim Lahey Award</div>
              <div style={{
                marginLeft: 'auto', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
                background: laheyVotingOpen ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)',
                color: laheyVotingOpen ? '#22c55e' : 'rgba(255,255,255,0.4)',
                textTransform: 'uppercase', letterSpacing: 1,
              }}>
                {laheyVotingOpen ? '● Open' : '● Closed'}
              </div>
            </div>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 18, lineHeight: 1.6 }}>
              Control when players can vote. Reset clears all votes so you can start fresh.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={toggleLaheyVoting}
                disabled={laheyTogglingOpen}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '11px 24px', borderRadius: 999, fontSize: 14, fontWeight: 700,
                  background: laheyVotingOpen ? 'rgba(255,255,255,0.06)' : 'rgba(34,197,94,0.15)',
                  border: `1px solid ${laheyVotingOpen ? 'rgba(255,255,255,0.12)' : 'rgba(34,197,94,0.4)'}`,
                  color: laheyVotingOpen ? 'rgba(255,255,255,0.6)' : '#22c55e',
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

          {/* Score reset */}
          <div style={{ padding: '20px 22px', borderRadius: 14, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <RotateCcw size={20} color="#ef4444" />
              <div style={{ fontSize: 18, fontWeight: 700, color: '#ef4444' }}>Reset Tournament</div>
            </div>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 6, lineHeight: 1.6 }}>
              This will permanently delete <strong style={{ color: '#fff' }}>all scores and drive selections</strong> for every team.
            </p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 20, lineHeight: 1.6 }}>
              Teams, player assignments, tee times, and all other data will remain untouched. Only the scorecard is cleared.
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
                <div style={{ fontWeight: 700, color: '#ef4444', fontSize: 15, marginBottom: 6 }}>
                  Are you absolutely sure?
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>
                  Every score will be deleted and all team names cleared. This cannot be undone.
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={resetTournament}
                    disabled={resetting}
                    style={{
                      padding: '10px 24px', borderRadius: 999, fontSize: 14, fontWeight: 700,
                      background: '#ef4444', border: 'none', color: '#fff',
                      cursor: resetting ? 'not-allowed' : 'pointer', opacity: resetting ? 0.6 : 1,
                    }}
                  >
                    {resetting ? 'Resetting…' : 'Yes, delete all scores'}
                  </button>
                  <button
                    onClick={() => setResetConfirm(false)}
                    style={{
                      padding: '10px 24px', borderRadius: 999, fontSize: 14,
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                      color: 'rgba(255,255,255,0.6)', cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Highlights tab ──────────────────────────────────────── */}
      {tab === 'highlights' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Add form */}
          <div className="glass" style={{ padding: '20px 22px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 16 }}>
              Pin a Moment
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              {HL_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setHlType(t.value)}
                  style={{
                    padding: '8px 14px', borderRadius: 999, fontSize: 13, fontWeight: 700,
                    background: hlType === t.value ? 'rgba(252,181,20,0.18)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${hlType === t.value ? 'rgba(252,181,20,0.5)' : 'rgba(255,255,255,0.1)'}`,
                    color: hlType === t.value ? '#FCB514' : 'rgba(255,255,255,0.4)',
                    cursor: 'pointer',
                  }}
                >
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 10, marginBottom: 10 }}>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Player or team name…"
                  value={hlPlayer}
                  onChange={e => setHlPlayer(e.target.value)}
                  list="hl-players"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
                <datalist id="hl-players">
                  {activePlayers.map(p => <option key={p.id} value={displayName(p)} />)}
                </datalist>
              </div>
              <input
                type="number"
                placeholder="Hole #"
                value={hlHole}
                onChange={e => setHlHole(e.target.value)}
                min={1} max={18}
              />
            </div>

            <textarea
              placeholder="What happened? (optional)"
              value={hlDesc}
              onChange={e => setHlDesc(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', minHeight: 68, resize: 'vertical', marginBottom: 12 }}
            />

            <button
              className="btn-gold"
              onClick={addHighlight}
              disabled={hlSaving || !hlPlayer.trim()}
            >
              {hlSaving ? 'Saving…' : '📌 Pin to Reel'}
            </button>
          </div>

          {/* List */}
          {highlights.length === 0 ? (
            <div className="glass" style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🎬</div>
              No highlights yet — pin the first moment above.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {highlights.map(h => {
                const t = HL_TYPES.find(x => x.value === h.type) ?? HL_TYPES[4]
                return (
                  <div key={h.id} className="glass" style={{ padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    <div style={{ fontSize: 24, flexShrink: 0, lineHeight: 1, marginTop: 2 }}>{t.emoji}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#FCB514', textTransform: 'uppercase', letterSpacing: 1.5 }}>{t.label}</span>
                        <span style={{ fontWeight: 700, color: '#fff', fontSize: 14 }}>{h.player_name}</span>
                        {h.hole && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>· Hole {h.hole}</span>}
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginLeft: 'auto' }}>
                          {formatDistanceToNow(new Date(h.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      {h.description && (
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 4, lineHeight: 1.55 }}>{h.description}</div>
                      )}
                    </div>
                    <button
                      onClick={() => deleteHighlight(h.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(239,68,68,0.5)', padding: '2px 4px', flexShrink: 0 }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Brevo tab ───────────────────────────────────────────── */}
      {tab === 'brevo' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Status card */}
          <div className="glass" style={{ padding: '22px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 28 }}>📣</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#FCB514' }}>Brevo Contact Sync</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
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
                <div key={label} style={{ padding: '10px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#FCB514', fontFamily: 'Bebas Neue', letterSpacing: 1 }}>{value}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 18, lineHeight: 1.7 }}>
              Syncs <strong style={{ color: 'rgba(255,255,255,0.6)' }}>name</strong>, <strong style={{ color: 'rgba(255,255,255,0.6)' }}>email</strong>, and <strong style={{ color: 'rgba(255,255,255,0.6)' }}>phone</strong> (if set) for every active player.
              Existing contacts are updated. Safe to run multiple times.
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <button
                onClick={syncToBrevo}
                disabled={brevoSyncing}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '11px 24px', borderRadius: 999, fontSize: 14, fontWeight: 700,
                  background: 'rgba(252,181,20,0.15)', border: '1px solid rgba(252,181,20,0.4)',
                  color: '#FCB514', cursor: brevoSyncing ? 'not-allowed' : 'pointer',
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
          <div style={{ padding: '18px 20px', borderRadius: 12, background: 'rgba(252,181,20,0.04)', border: '1px solid rgba(252,181,20,0.15)', fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.8 }}>
            <div style={{ fontWeight: 700, color: '#FCB514', marginBottom: 10 }}>One-time setup</div>
            <ol style={{ paddingLeft: 18, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li>
                In Brevo: <strong style={{ color: 'rgba(255,255,255,0.7)' }}>Settings → API Keys</strong> → create a key with Contacts permission.
              </li>
              <li>
                In Supabase Dashboard: <strong style={{ color: 'rgba(255,255,255,0.7)' }}>Edge Functions → brevo-sync → Secrets</strong>, add <code style={{ color: '#FCB514', fontSize: 12 }}>BREVO_API_KEY</code>.
              </li>
              <li>
                Deploy the function: <code style={{ color: '#FCB514', fontSize: 12 }}>supabase functions deploy brevo-sync</code>
              </li>
            </ol>
          </div>
        </div>
      )}
    </div>
  )
}

