import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'
import type { Player } from '../lib/types'
import { Plus, ChevronDown, ChevronUp, Trash2, Mail, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'

type FilterType = 'all' | 'in' | 'pending' | 'out'

const FILTER_OPTIONS: { id: FilterType; label: string; emoji: string }[] = [
  { id: 'all', label: 'All', emoji: '' },
  { id: 'in', label: 'In', emoji: '✅' },
  { id: 'pending', label: 'Pending', emoji: '⏳' },
  { id: 'out', label: 'Out', emoji: '❌' },
]

export default function RSVP() {
  const { showToast } = useToast()
  const [players, setPlayers] = useState<Player[]>([])
  const [filter, setFilter] = useState<FilterType>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', email: '', handicap: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchPlayers() }, [])

  const fetchPlayers = async () => {
    const { data } = await supabase.from('players').select('*').order('name')
    setPlayers(data ?? [])
  }

  const updatePlayer = async (id: string, updates: Partial<Player>) => {
    const { error } = await supabase.from('players').update(updates).eq('id', id)
    if (error) showToast(error.message, 'error')
    else { fetchPlayers() }
  }

  const removePlayer = async (id: string) => {
    if (!confirm('Remove this player?')) return
    await supabase.from('players').delete().eq('id', id)
    fetchPlayers()
  }

  const addPlayer = async () => {
    if (!addForm.name.trim()) return
    setSaving(true)
    const { error } = await supabase.from('players').insert({
      name: addForm.name.trim(),
      email: addForm.email || null,
      handicap: addForm.handicap ? +addForm.handicap : null,
      rsvp: 'pending',
    })
    setSaving(false)
    if (error) showToast(error.message, 'error')
    else {
      showToast('Player added!')
      setAddForm({ name: '', email: '', handicap: '' })
      setShowAdd(false)
      fetchPlayers()
    }
  }

  const filtered = filter === 'all' ? players : players.filter(p => p.rsvp === filter)

  const rsvpColor = { in: '#22c55e', pending: '#f59e0b', out: '#ef4444' }
  const rsvpLabel = { in: '✅ In', pending: '⏳ Pending', out: '❌ Out' }

  const counts = {
    all: players.length,
    in: players.filter(p => p.rsvp === 'in').length,
    pending: players.filter(p => p.rsvp === 'pending').length,
    out: players.filter(p => p.rsvp === 'out').length,
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 32, color: '#FCB514', letterSpacing: 4 }}>RSVP Manager</h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>{counts.in} confirmed • {counts.pending} pending • {counts.out} out</p>
        </div>
        <button className="btn-gold" onClick={() => setShowAdd(!showAdd)}>
          <Plus size={14} /> Add Player
        </button>
      </div>

      {/* Add player form */}
      {showAdd && (
        <div className="glass animate-fadeUp" style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <input type="text" placeholder="Name *" value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} />
            <input type="email" placeholder="Email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} />
            <input type="number" placeholder="Handicap" value={addForm.handicap} onChange={e => setAddForm(f => ({ ...f, handicap: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-gold" onClick={addPlayer} disabled={saving || !addForm.name.trim()}>
              {saving ? 'Adding…' : 'Add Player'}
            </button>
            <button className="btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
        {FILTER_OPTIONS.map(({ id, label, emoji }) => (
          <button key={id} onClick={() => setFilter(id)} className={`pill-tab ${filter === id ? 'active' : ''}`}>
            {emoji} {label} ({counts[id]})
          </button>
        ))}
      </div>

      {/* Player list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map(player => {
          const isExpanded = expanded === player.id

          return (
            <div key={player.id} className="glass" style={{ padding: 0, overflow: 'hidden' }}>
              <button
                onClick={() => setExpanded(isExpanded ? null : player.id)}
                style={{
                  width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                  padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12,
                }}
              >
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontWeight: 700, color: '#fff', fontSize: 15 }}>{player.name}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                    HCP {player.handicap ?? '—'} {player.email && `• ${player.email}`}
                  </div>
                </div>
                <div style={{
                  fontSize: 12, fontWeight: 600,
                  color: rsvpColor[player.rsvp as keyof typeof rsvpColor] ?? '#fff',
                  background: `${rsvpColor[player.rsvp as keyof typeof rsvpColor]}20`,
                  padding: '4px 10px', borderRadius: 999,
                }}>
                  {rsvpLabel[player.rsvp as keyof typeof rsvpLabel] ?? player.rsvp}
                </div>
                {isExpanded ? <ChevronUp size={14} color="rgba(255,255,255,0.4)" /> : <ChevronDown size={14} color="rgba(255,255,255,0.4)" />}
              </button>

              {isExpanded && (
                <div style={{ padding: '0 18px 18px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  {/* RSVP toggle */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 16, paddingTop: 14 }}>
                    {(['in', 'pending', 'out'] as const).map(status => (
                      <button key={status}
                        onClick={() => updatePlayer(player.id, { rsvp: status })}
                        style={{
                          flex: 1, padding: '8px', borderRadius: 8, border: '1px solid',
                          background: player.rsvp === status ? `${rsvpColor[status]}20` : 'transparent',
                          borderColor: player.rsvp === status ? rsvpColor[status] : 'rgba(255,255,255,0.1)',
                          color: player.rsvp === status ? rsvpColor[status] : 'rgba(255,255,255,0.5)',
                          cursor: 'pointer', fontSize: 13, fontWeight: 600,
                        }}>
                        {rsvpLabel[status]}
                      </button>
                    ))}
                  </div>

                  {/* Editable fields */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
                    <div>
                      <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 4 }}>Name</label>
                      <input type="text" defaultValue={player.name}
                        onBlur={e => { if (e.target.value !== player.name) updatePlayer(player.id, { name: e.target.value }) }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 4 }}>Email</label>
                      <input type="email" defaultValue={player.email ?? ''}
                        onBlur={e => { if (e.target.value !== (player.email ?? '')) updatePlayer(player.id, { email: e.target.value || null }) }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 4 }}>Handicap</label>
                      <input type="number" defaultValue={player.handicap ?? ''}
                        onBlur={e => { if (+e.target.value !== player.handicap) updatePlayer(player.id, { handicap: +e.target.value || null }) }} />
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Link to={`/rsvp-landing?player=${player.id}`} target="_blank">
                      <button className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ExternalLink size={12} /> Preview RSVP Page
                      </button>
                    </Link>
                    <button className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Mail size={12} /> Send Invite
                    </button>
                    <button
                      onClick={() => removePlayer(player.id)}
                      style={{
                        background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                        border: '1px solid rgba(239,68,68,0.3)', borderRadius: 999,
                        padding: '6px 14px', fontSize: 12, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                      <Trash2 size={12} /> Remove
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
