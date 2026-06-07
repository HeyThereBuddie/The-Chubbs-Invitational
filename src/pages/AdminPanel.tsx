import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'
import type { Profile, Team } from '../lib/types'
import { Copy, Shield, ShieldOff, Trash2, Check, Plus, Users, RotateCcw } from 'lucide-react'

type TeamWithPlayers = Team & { player1?: Profile; player2?: Profile }

export default function AdminPanel() {
  const { showToast } = useToast()
  const [tab, setTab] = useState<'teams' | 'users' | 'codes' | 'invite'>('teams')
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [teams, setTeams] = useState<TeamWithPlayers[]>([])
  const [newTeamName, setNewTeamName] = useState('')
  const [creating, setCreating] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [adminBlurred, setAdminBlurred] = useState(true)

  useEffect(() => { fetchProfiles(); fetchTeams() }, [])

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

  const playerInvite = `Hey! You're invited to The Chubbs Invitational golf tournament. Sign up at ${window.location.origin} using invite code: ${PLAYER_CODE}

Format: Best Ball
Dress code: Business casual on the course
Questions? Reply to this message.

"It's all in the hips." — Chubbs Peterson`

  const adminInvite = `Hey! You've been given admin access to The Chubbs Invitational app. Sign up at ${window.location.origin} using the admin invite code (ask me separately for security).

You'll have full control over RSVP, tee times, pairings, and announcements.`

  const [resetting, setResetting] = useState(false)
  const [resetConfirm, setResetConfirm] = useState(false)

  const resetTournament = async () => {
    setResetting(true)
    const { error } = await supabase.from('scores').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    setResetting(false)
    setResetConfirm(false)
    if (error) showToast(error.message, 'error')
    else showToast('All scores cleared — tournament reset!')
  }

  const activePlayers = profiles.filter(p => p.status === 'active')

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 32, color: '#FCB514', letterSpacing: 4 }}>Admin Panel</h1>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Manage teams, users, access codes, and invites</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {([
          { id: 'teams',  label: '⛳ Teams' },
          { id: 'users',  label: '👥 Users' },
          { id: 'codes',  label: '🔑 Codes' },
          { id: 'invite', label: '✉️ Invite' },
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

          {teams.length === 0 && (
            <div className="glass" style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>
              <Users size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.2 }} />
              No teams yet. Create one above.
            </div>
          )}

          {/* Danger zone */}
          <div style={{ marginBottom: 20, padding: '16px 20px', borderRadius: 14, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.04)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              ⚠️ Danger Zone
            </div>
            {!resetConfirm ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 600, color: 'rgba(255,255,255,0.8)', fontSize: 14 }}>Reset Tournament</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>Deletes all scores and drive selections. Teams and players are kept.</div>
                </div>
                <button
                  onClick={() => setResetConfirm(true)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 18px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                    background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                    color: '#ef4444', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  <RotateCcw size={13} /> Reset Scores
                </button>
              </div>
            ) : (
              <div>
                <div style={{ fontWeight: 600, color: '#ef4444', marginBottom: 8 }}>
                  Are you sure? This will permanently delete every score.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={resetTournament}
                    disabled={resetting}
                    style={{
                      padding: '8px 20px', borderRadius: 999, fontSize: 13, fontWeight: 700,
                      background: '#ef4444', border: 'none', color: '#fff',
                      cursor: resetting ? 'not-allowed' : 'pointer', opacity: resetting ? 0.7 : 1,
                    }}
                  >
                    {resetting ? 'Resetting…' : 'Yes, delete all scores'}
                  </button>
                  <button
                    onClick={() => setResetConfirm(false)}
                    style={{
                      padding: '8px 20px', borderRadius: 999, fontSize: 13,
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
                              {p.name}{p.handicap != null ? ` (HCP ${p.handicap})` : ''}
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
                <div style={{ fontWeight: 700, color: '#fff', fontSize: 14 }}>{p.name}</div>
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

      {/* ── Invite tab ──────────────────────────────────────────── */}
      {tab === 'invite' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            { label: 'Player Invite Message', text: playerInvite, key: 'playerMsg' },
            { label: 'Admin Invite Message', text: adminInvite, key: 'adminMsg' },
          ].map(({ label, text, key }) => (
            <div key={key} className="glass" style={{ padding: '20px 22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#FCB514' }}>{label}</div>
                <button onClick={() => copy(text, key)} className="btn-gold" style={{ padding: '7px 16px', fontSize: 12 }}>
                  {copiedKey === key ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy</>}
                </button>
              </div>
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 10, padding: '14px 16px',
                fontSize: 13, color: 'rgba(255,255,255,0.6)',
                lineHeight: 1.7, whiteSpace: 'pre-wrap',
              }}>
                {text}
              </div>
            </div>
          ))}
          <div className="glass" style={{ padding: '14px 18px', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
            💡 <strong style={{ color: 'rgba(255,255,255,0.6)' }}>Tip:</strong> Paste the player invite message in a group text, iMessage, or email.
          </div>
        </div>
      )}
    </div>
  )
}
