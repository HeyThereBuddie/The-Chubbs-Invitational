import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'
import type { Profile } from '../lib/types'
import { ChevronDown, ChevronUp } from 'lucide-react'

type StatusTab = 'active' | 'waitlist' | 'dropped'

const STATUS_TABS: { id: StatusTab; label: string; emoji: string }[] = [
  { id: 'active', label: 'Active', emoji: '✅' },
  { id: 'waitlist', label: 'Waitlist', emoji: '⏳' },
  { id: 'dropped', label: 'Dropped', emoji: '❌' },
]

const statusColor = { active: '#22c55e', waitlist: '#f59e0b', dropped: '#ef4444' }

export default function RSVP() {
  const { showToast } = useToast()
  const [players, setPlayers] = useState<Profile[]>([])
  const [tab, setTab] = useState<StatusTab>('active')
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => { fetchPlayers() }, [])

  const fetchPlayers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'player')
      .order('name')
    setPlayers(data ?? [])
  }

  const updatePlayer = async (id: string, updates: Partial<Profile>) => {
    const { error } = await supabase.from('profiles').update(updates).eq('id', id)
    if (error) showToast(error.message, 'error')
    else fetchPlayers()
  }

  const setStatus = async (id: string, status: 'active' | 'waitlist' | 'dropped') => {
    await updatePlayer(id, { status })
    showToast(
      status === 'active' ? 'Player activated!' :
      status === 'waitlist' ? 'Moved to waitlist' :
      'Player dropped'
    )
  }

  const counts = {
    active: players.filter(p => p.status === 'active').length,
    waitlist: players.filter(p => p.status === 'waitlist').length,
    dropped: players.filter(p => p.status === 'dropped').length,
  }

  const filtered = players.filter(p => p.status === tab)

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 32, color: '#FCB514', letterSpacing: 4 }}>Player Roster</h1>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
          {counts.active} active • {counts.waitlist} waitlisted • {counts.dropped} dropped
        </p>
      </div>

      {/* Status tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {STATUS_TABS.map(({ id, label, emoji }) => (
          <button key={id} onClick={() => setTab(id)} className={`pill-tab ${tab === id ? 'active' : ''}`}>
            {emoji} {label} ({counts[id]})
          </button>
        ))}
      </div>

      {/* Player list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 && (
          <div className="glass" style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>
            No {tab} players
          </div>
        )}
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
                  fontSize: 11, fontWeight: 700,
                  color: statusColor[player.status as keyof typeof statusColor],
                  background: `${statusColor[player.status as keyof typeof statusColor]}20`,
                  padding: '4px 10px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: 1,
                }}>
                  {player.status}
                </div>
                {isExpanded
                  ? <ChevronUp size={14} color="rgba(255,255,255,0.4)" />
                  : <ChevronDown size={14} color="rgba(255,255,255,0.4)" />}
              </button>

              {isExpanded && (
                <div style={{ padding: '0 18px 18px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  {/* Status actions */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 16, paddingTop: 14, flexWrap: 'wrap' }}>
                    {player.status !== 'active' && (
                      <button
                        onClick={() => setStatus(player.id, 'active')}
                        style={{
                          padding: '8px 16px', borderRadius: 8,
                          background: 'rgba(34,197,94,0.15)',
                          border: '1px solid rgba(34,197,94,0.4)',
                          color: '#22c55e', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                        }}>
                        ✅ Activate Player
                      </button>
                    )}
                    {player.status !== 'waitlist' && (
                      <button
                        onClick={() => setStatus(player.id, 'waitlist')}
                        style={{
                          padding: '8px 16px', borderRadius: 8,
                          background: 'rgba(245,158,11,0.15)',
                          border: '1px solid rgba(245,158,11,0.4)',
                          color: '#f59e0b', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                        }}>
                        ⏳ Move to Waitlist
                      </button>
                    )}
                    {player.status !== 'dropped' && (
                      <button
                        onClick={() => setStatus(player.id, 'dropped')}
                        style={{
                          padding: '8px 16px', borderRadius: 8,
                          background: 'rgba(239,68,68,0.1)',
                          border: '1px solid rgba(239,68,68,0.3)',
                          color: '#ef4444', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                        }}>
                        ❌ Drop Player
                      </button>
                    )}
                  </div>

                  {/* Editable fields */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 4 }}>Name</label>
                      <input type="text" defaultValue={player.name}
                        onBlur={e => { if (e.target.value !== player.name) updatePlayer(player.id, { name: e.target.value }) }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 4 }}>Handicap</label>
                      <input type="number" defaultValue={player.handicap ?? ''}
                        onBlur={e => { const v = +e.target.value; if (v !== player.handicap) updatePlayer(player.id, { handicap: v || null }) }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 4 }}>Phone</label>
                      <input type="tel" defaultValue={player.phone ?? ''}
                        onBlur={e => { if (e.target.value !== (player.phone ?? '')) updatePlayer(player.id, { phone: e.target.value || null }) }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 4 }}>Shirt Size</label>
                      <input type="text" placeholder="e.g. M, L, XL" defaultValue={player.shirt_size ?? ''}
                        onBlur={e => { if (e.target.value !== (player.shirt_size ?? '')) updatePlayer(player.id, { shirt_size: e.target.value || null }) }} />
                    </div>
                    <div style={{ gridColumn: '1/-1' }}>
                      <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 4 }}>Notes</label>
                      <input type="text" placeholder="Any notes..." defaultValue={player.notes ?? ''}
                        onBlur={e => { if (e.target.value !== (player.notes ?? '')) updatePlayer(player.id, { notes: e.target.value || null }) }} />
                    </div>
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
