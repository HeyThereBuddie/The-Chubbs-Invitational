import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useYear } from '../context/YearContext'
import type { Player, Team, RosterEntry } from '../lib/types'
import { displayName, teamMemberName } from '../lib/types'
import { Trash2, Plus, UserPlus, Wand2, ArrowLeftRight } from 'lucide-react'

type TeamRow = Team & { player1?: Player; player2?: Player }

const firstToken = (name: string) => name.trim().split(/\s+/).slice(-1)[0] || name.trim()

export default function Groups() {
  const { isAdmin } = useAuth()
  const { showToast } = useToast()
  const { activeTournamentId, isCurrentYear } = useYear()

  const [roster, setRoster] = useState<RosterEntry[]>([])
  const [profiles, setProfiles] = useState<Player[]>([])
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [tab, setTab] = useState<'draw' | 'roster'>('draw')
  const [pasteText, setPasteText] = useState('')
  const [importing, setImporting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])   // roster ids picked for the next team
  const [search, setSearch] = useState('')
  const [swapTarget, setSwapTarget] = useState<{ teamId: string; slot: 1 | 2; currentName: string | null } | null>(null)

  useEffect(() => { fetchData() }, [activeTournamentId])

  const fetchData = async () => {
    if (!activeTournamentId) { setRoster([]); setTeams([]); return }
    const [rosterRes, profilesRes, teamsRes] = await Promise.all([
      supabase.from('roster').select('*').eq('tournament_id', activeTournamentId).order('name'),
      supabase.from('profiles').select('*').eq('status', 'active').order('name'),
      supabase.from('teams').select('*, player1:profiles!teams_p1_id_fkey(*), player2:profiles!teams_p2_id_fkey(*)').eq('tournament_id', activeTournamentId).order('created_at'),
    ])
    setRoster((rosterRes.data ?? []) as RosterEntry[])
    setProfiles((profilesRes.data ?? []) as Player[])
    setTeams((teamsRes.data ?? []) as TeamRow[])
  }

  // ── Roster import (paste "Name, Email, Handicap" — email & handicap optional,
  // detected by shape so column order doesn't matter) ───────────────────────
  const importRoster = async () => {
    if (!activeTournamentId) { showToast('Create/select an active tournament first', 'error'); return }
    const rows = pasteText.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
      const parts = line.split(',').map(s => s.trim()).filter(Boolean)
      const name = parts.shift() ?? ''
      let email: string | null = null
      let handicap: number | null = null
      for (const p of parts) {
        if (p.includes('@')) email = p
        else if (/^\d+$/.test(p)) handicap = parseInt(p, 10)
      }
      return { name, email, handicap }
    }).filter(r => r.name)
    if (!rows.length) { showToast('Nothing to import', 'error'); return }
    const existing = new Set(roster.map(r => r.name.toLowerCase()))
    const fresh = rows.filter(r => !existing.has(r.name.toLowerCase()))
    if (!fresh.length) { showToast('Those names are already on the roster'); return }
    setImporting(true)
    const { error } = await supabase.from('roster').insert(fresh.map(r => ({ ...r, tournament_id: activeTournamentId })))
    setImporting(false)
    if (error) { showToast(error.message, 'error'); return }
    setPasteText('')
    showToast(`Added ${fresh.length} to the roster`)
    fetchData()
  }

  // Link roster entries to accounts by email first, then name (case-insensitive).
  const autoMatch = async () => {
    const byEmail = new Map(profiles.filter(p => p.email).map(p => [p.email!.trim().toLowerCase(), p.id]))
    const byName = new Map(profiles.map(p => [p.name.trim().toLowerCase(), p.id]))
    const updates = roster.filter(r => !r.claimed_by).map(r => {
      const pid = (r.email && byEmail.get(r.email.trim().toLowerCase())) || byName.get(r.name.trim().toLowerCase())
      return { r, pid }
    }).filter((x): x is { r: RosterEntry; pid: string } => !!x.pid)
    if (!updates.length) { showToast('No new email or name matches found'); return }
    await Promise.all(updates.map(async ({ r, pid }) => {
      await supabase.from('roster').update({ claimed_by: pid }).eq('id', r.id)
      // Roster is the source of truth — push canonical name + handicap to the account.
      await supabase.from('profiles').update({ name: r.name, ...(r.handicap != null ? { handicap: r.handicap } : {}) }).eq('id', pid)
      const t = teams.find(t => t.p1_roster_id === r.id || t.p2_roster_id === r.id)
      if (!t) return
      const slot = t.p1_roster_id === r.id ? 'p1_id' : 'p2_id'
      await supabase.from('teams').update({ [slot]: pid }).eq('id', t.id)
      await supabase.from('profiles').update({ team_id: t.id }).eq('id', pid)
    }))
    showToast(`Matched ${updates.length} player${updates.length === 1 ? '' : 's'} to accounts`)
    fetchData()
  }

  const removeRosterEntry = async (id: string) => {
    await supabase.from('roster').delete().eq('id', id)
    setSelected(s => s.filter(x => x !== id))
    fetchData()
  }

  // Add / edit a roster entry's email (filled in as they're collected).
  const updateRosterEmail = async (id: string, email: string) => {
    const v = email.trim() || null
    await supabase.from('roster').update({ email: v }).eq('id', id)
    setRoster(prev => prev.map(r => r.id === id ? { ...r, email: v } : r))
  }

  // ── Live pair builder ─────────────────────────────────────────────────────
  const assignedRosterIds = new Set(teams.flatMap(t => [t.p1_roster_id, t.p2_roster_id].filter(Boolean) as string[]))
  const pool = roster.filter(r => !assignedRosterIds.has(r.id))
  const poolFiltered = pool.filter(r => r.name.toLowerCase().includes(search.toLowerCase()))

  const toggleSelect = (id: string) => {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : s.length >= 2 ? [s[1], id] : [...s, id])
  }

  const createTeam = async () => {
    if (selected.length !== 2 || !activeTournamentId) return
    const a = roster.find(r => r.id === selected[0])!
    const b = roster.find(r => r.id === selected[1])!
    const name = `${firstToken(a.name)} & ${firstToken(b.name)}`
    const { data: team, error } = await supabase.from('teams').insert({
      name, tournament_id: activeTournamentId,
      p1_name: a.name, p2_name: b.name,
      p1_roster_id: a.id, p2_roster_id: b.id,
      p1_id: a.claimed_by, p2_id: b.claimed_by,
    }).select('id, p1_id, p2_id').single()
    if (error) { showToast(error.message, 'error'); return }
    const ids = [team.p1_id, team.p2_id].filter(Boolean) as string[]
    if (ids.length) await supabase.from('profiles').update({ team_id: team.id }).in('id', ids)
    setSelected([])
    showToast(`Team created: ${name}`)
    fetchData()
  }

  const renameTeam = async (team: TeamRow) => {
    const name = window.prompt('Team name', team.name)?.trim()
    if (!name || name === team.name) return
    await supabase.from('teams').update({ name }).eq('id', team.id)
    fetchData()
  }

  const removeTeam = async (team: TeamRow) => {
    const ids = [team.p1_id, team.p2_id].filter(Boolean) as string[]
    if (ids.length) await supabase.from('profiles').update({ team_id: null }).in('id', ids)
    await supabase.from('teams').delete().eq('id', team.id)
    fetchData()
  }

  // Swap one player on a team for an unpaired roster entry (late substitution).
  const swapMember = async (teamId: string, slot: 1 | 2, newRosterId: string) => {
    const team = teams.find(t => t.id === teamId)
    const newR = roster.find(r => r.id === newRosterId)
    if (!team || !newR) return
    const oldPid = slot === 1 ? team.p1_id : team.p2_id
    const patch = slot === 1
      ? { p1_roster_id: newR.id, p1_name: newR.name, p1_id: newR.claimed_by }
      : { p2_roster_id: newR.id, p2_name: newR.name, p2_id: newR.claimed_by }
    await supabase.from('teams').update(patch).eq('id', teamId)
    if (oldPid && oldPid !== newR.claimed_by) await supabase.from('profiles').update({ team_id: null }).eq('id', oldPid)
    if (newR.claimed_by) await supabase.from('profiles').update({ team_id: teamId }).eq('id', newR.claimed_by)
    setSwapTarget(null)
    showToast(`Swapped in ${newR.name}`)
    fetchData()
  }

  const claimedCount = roster.filter(r => r.claimed_by).length

  if (!isAdmin) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <div className="glass" style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--tx3)' }}>
          Team pairings are entered by the organizers from the live draw. Check the Teams tab to see yours.
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div className="animate-fadeUp" style={{ marginBottom: 16 }}>
        <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: 'var(--gold)', letterSpacing: 4, lineHeight: 1.1, margin: 0 }}>
          Team Draw
        </h1>
        <p style={{ color: 'var(--tx3)', fontSize: 13, marginTop: 4 }}>
          {roster.length} on roster · {claimedCount} signed up · {teams.length} teams built
        </p>
      </div>

      <div className="pill-tabs animate-fadeUp delay-100" style={{ marginBottom: 20 }}>
        <button onClick={() => setTab('draw')} className={`pill-tab pressable ${tab === 'draw' ? 'active' : ''}`}>🎲 Build Teams</button>
        <button onClick={() => setTab('roster')} className={`pill-tab pressable ${tab === 'roster' ? 'active' : ''}`}>📋 Roster</button>
      </div>

      {!isCurrentYear && (
        <div className="glass" style={{ padding: 16, textAlign: 'center', color: 'var(--tx3)', fontSize: 13 }}>
          You're viewing a past tournament — switch to the current one to edit teams.
        </div>
      )}

      {/* ── Build Teams ── */}
      {tab === 'draw' && isCurrentYear && (
        <>
          {/* Selection tray */}
          <div className="glass animate-fadeUp" style={{ padding: 14, marginBottom: 16, border: '1px solid var(--gold-25)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: 'var(--gold-dim)', textTransform: 'uppercase', marginBottom: 8 }}>Next team</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {[0, 1].map(i => {
                const r = selected[i] ? roster.find(x => x.id === selected[i]) : null
                return (
                  <div key={i} style={{
                    flex: 1, minWidth: 0, padding: '11px 12px', borderRadius: 10, textAlign: 'center',
                    border: `1px dashed ${r ? 'var(--gold-40)' : 'var(--bdr2)'}`,
                    background: r ? 'rgba(212,165,58,0.1)' : 'var(--surf2)',
                    color: r ? 'var(--tx1)' : 'var(--tx4)', fontWeight: 700, fontSize: 14,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{r ? r.name : `Player ${i + 1}`}</div>
                )
              })}
              <button onClick={createTeam} disabled={selected.length !== 2} className="pressable" style={{
                flexShrink: 0, padding: '11px 16px', borderRadius: 10, border: 'none', cursor: selected.length === 2 ? 'pointer' : 'not-allowed',
                background: selected.length === 2 ? '#D4A53A' : 'var(--surf2)', color: selected.length === 2 ? '#1a1206' : 'var(--tx4)',
                fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6,
              }}><Plus size={15} /> Pair</button>
            </div>
          </div>

          {/* Unassigned pool */}
          <div style={{ marginBottom: 20 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${pool.length} unpaired players…`}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--tx1)', outline: 'none', marginBottom: 10 }} />
            {pool.length === 0 ? (
              <div className="glass" style={{ padding: 24, textAlign: 'center', color: 'var(--tx4)', fontSize: 13 }}>
                {roster.length === 0 ? 'Import your roster first (Roster tab).' : 'Everyone on the roster is paired. 🎉'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {poolFiltered.map(r => {
                  const on = selected.includes(r.id)
                  return (
                    <button key={r.id} onClick={() => toggleSelect(r.id)} className="pressable" style={{
                      padding: '9px 14px', borderRadius: 999, cursor: 'pointer', fontWeight: 700, fontSize: 13,
                      border: `1px solid ${on ? '#D4A53A' : 'var(--bdr)'}`,
                      background: on ? 'rgba(212,165,58,0.18)' : 'var(--surf2)',
                      color: on ? '#D4A53A' : 'var(--tx1)',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      {r.name}
                      {r.handicap != null && <span style={{ fontSize: 10, color: on ? 'rgba(212,165,58,0.7)' : 'var(--tx4)', fontVariantNumeric: 'tabular-nums' }}>· {r.handicap}</span>}
                      {r.claimed_by ? <span title="Signed up" style={{ fontSize: 10, color: '#4ade80' }}>✓</span>
                        : <span title="Not signed up yet" style={{ fontSize: 10, color: 'var(--tx4)' }}>○</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Built teams */}
          {teams.length > 0 && (
            <div>
              <div className="section-label" style={{ marginBottom: 10 }}>Teams ({teams.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {teams.map((t, i) => (
                  <div key={t.id} className="glass" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, color: 'var(--tx4)', width: 22, textAlign: 'center', flexShrink: 0 }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, color: 'var(--gold)', fontSize: 14 }}>{t.name}</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                        {([1, 2] as const).map(slot => {
                          const nm = slot === 1 ? teamMemberName(t.player1, t.p1_name) : teamMemberName(t.player2, t.p2_name)
                          return (
                            <button key={slot} onClick={() => setSwapTarget({ teamId: t.id, slot, currentName: nm })} className="pressable"
                              title="Swap this player"
                              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 999, border: '1px solid var(--bdr)', background: 'var(--surf2)', color: 'var(--tx2)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                              {nm ?? '—'} <ArrowLeftRight size={11} style={{ opacity: 0.6 }} />
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <button onClick={() => renameTeam(t)} className="pressable" style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--bdr)', background: 'var(--surf2)', color: 'var(--tx2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>Rename</button>
                    <button onClick={() => removeTeam(t)} className="pressable" aria-label="Remove team" style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#f87171', cursor: 'pointer', flexShrink: 0, display: 'flex' }}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Roster ── */}
      {tab === 'roster' && isCurrentYear && (
        <>
          <div className="glass animate-fadeUp" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx1)', marginBottom: 6 }}>Import players</div>
            <div style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 10, lineHeight: 1.5 }}>
              Paste one player per line as <code>Name, Email, Handicap</code>. Email and handicap are optional and detected automatically, so <code>Name, 12</code> or just <code>Name</code> works too — add emails later below.
            </div>
            <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} rows={6}
              placeholder={"Happy Gilmore, happy@example.com, 4\nShooter McGavin, 2\nChubbs Peterson"}
              style={{ width: '100%', padding: '11px 13px', borderRadius: 10, fontSize: 13, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--tx1)', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={importRoster} disabled={importing || !pasteText.trim()} className="btn-gold" style={{ opacity: importing || !pasteText.trim() ? 0.6 : 1 }}>
                <UserPlus size={14} /> {importing ? 'Adding…' : 'Add to roster'}
              </button>
              {roster.some(r => !r.claimed_by) && (
                <button onClick={autoMatch} className="btn-outline"><Wand2 size={14} /> Match to accounts</button>
              )}
            </div>
          </div>

          <div className="section-label" style={{ marginBottom: 10 }}>Roster ({roster.length})</div>
          {roster.length === 0 ? (
            <div className="glass" style={{ padding: 24, textAlign: 'center', color: 'var(--tx4)', fontSize: 13 }}>No one on the roster yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {roster.map(r => {
                const acct = r.claimed_by ? profiles.find(p => p.id === r.claimed_by) : null
                return (
                  <div key={r.id} className="glass-flat" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--tx1)' }}>{r.name}</span>
                        {r.handicap != null && <span style={{ fontSize: 11, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>HCP {r.handicap}</span>}
                      </div>
                      <div style={{ fontSize: 11, color: r.claimed_by ? '#4ade80' : 'var(--tx4)', margin: '2px 0 6px' }}>
                        {r.claimed_by ? `✓ Signed up${acct ? ` — ${displayName(acct)}` : ''}` : '○ Not signed up yet'}
                      </div>
                      <input
                        defaultValue={r.email ?? ''}
                        onBlur={e => { if ((e.target.value.trim() || null) !== (r.email ?? null)) updateRosterEmail(r.id, e.target.value) }}
                        placeholder="add email…"
                        type="email"
                        style={{ width: '100%', maxWidth: 260, padding: '6px 10px', borderRadius: 8, fontSize: 12, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--tx1)', outline: 'none' }}
                      />
                    </div>
                    <button onClick={() => removeRosterEntry(r.id)} aria-label="Remove" className="pressable" style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--bdr)', background: 'var(--surf2)', color: 'var(--tx3)', cursor: 'pointer', flexShrink: 0, display: 'flex' }}><Trash2 size={14} /></button>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── Swap-a-player picker ── */}
      {swapTarget && (
        <div onClick={() => setSwapTarget(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(4,6,5,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 500, background: 'var(--panel)', borderRadius: '20px 20px 0 0', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 -12px 40px rgba(0,0,0,0.6)', padding: '16px 16px calc(20px + env(safe-area-inset-bottom, 0px))', maxHeight: '70vh', overflowY: 'auto' }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 1, color: '#D4A53A', marginBottom: 2 }}>Swap out {swapTarget.currentName ?? 'player'}</div>
            <div style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 14 }}>Pick a replacement from the unpaired pool.</div>
            {pool.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--tx4)', fontSize: 13 }}>No unpaired players — remove another team to free someone up.</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {pool.map(r => (
                  <button key={r.id} onClick={() => swapMember(swapTarget.teamId, swapTarget.slot, r.id)} className="pressable" style={{
                    padding: '9px 14px', borderRadius: 999, cursor: 'pointer', fontWeight: 700, fontSize: 13,
                    border: '1px solid var(--bdr)', background: 'var(--surf2)', color: 'var(--tx1)', display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    {r.name}
                    {r.handicap != null && <span style={{ fontSize: 10, color: 'var(--tx4)' }}>· {r.handicap}</span>}
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => setSwapTarget(null)} style={{ width: '100%', marginTop: 16, padding: '10px', borderRadius: 10, border: '1px solid var(--bdr)', background: 'transparent', color: 'var(--tx3)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
