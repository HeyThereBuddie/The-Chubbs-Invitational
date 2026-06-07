import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import type { TeeTime, Team, Player } from '../lib/types'
import { Clock, Edit2, Zap } from 'lucide-react'

type TeeTimeWithTeam = TeeTime & {
  team?: Team & { player1?: Player; player2?: Player }
}

export default function TeeTimes() {
  const { isAdmin } = useAuth()
  const { showToast } = useToast()
  const [teeTimes, setTeeTimes] = useState<TeeTimeWithTeam[]>([])
  const [teams, setTeams] = useState<(Team & { player1?: Player; player2?: Player })[]>([])
  const [tab, setTab] = useState<'view' | 'edit' | 'auto'>('view')
  const [editing, setEditing] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ tee_time: '', starting_hole: 1, cart: '', notes: '' })
  const [autoInterval, setAutoInterval] = useState(10)
  const [autoStart, setAutoStart] = useState('08:00')
  const [autoStartHole, setAutoStartHole] = useState(1)

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    const [ttRes, teamsRes] = await Promise.all([
      supabase.from('tee_times').select('*, team:teams(*, player1:profiles!teams_p1_id_fkey(*), player2:profiles!teams_p2_id_fkey(*))').order('tee_time'),
      supabase.from('teams').select('*, player1:profiles!teams_p1_id_fkey(*), player2:profiles!teams_p2_id_fkey(*)'),
    ])
    setTeeTimes(ttRes.data ?? [])
    setTeams(teamsRes.data ?? [])
  }

  const saveEdit = async (id: string) => {
    const { error } = await supabase.from('tee_times').update(editForm).eq('id', id)
    if (error) showToast(error.message, 'error')
    else { showToast('Tee time updated!'); setEditing(null); fetchAll() }
  }

  const autoAssign = async () => {
    const teamsToAssign = teams.slice()
    const [h, m] = autoStart.split(':').map(Number)
    let currentMinutes = h * 60 + m

    const upserts = teamsToAssign.map((team, i) => {
      const mins = currentMinutes + i * autoInterval
      const hh = String(Math.floor(mins / 60)).padStart(2, '0')
      const mm = String(mins % 60).padStart(2, '0')
      return {
        team_id: team.id,
        tee_time: `${hh}:${mm}:00`,
        starting_hole: autoStartHole,
        cart: null, notes: null,
      }
    })

    // Delete existing and re-insert
    await supabase.from('tee_times').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    const { error } = await supabase.from('tee_times').insert(upserts)
    if (error) showToast(error.message, 'error')
    else { showToast(`Assigned ${upserts.length} tee times!`); fetchAll(); setTab('view') }
  }

  const grouped = teeTimes.reduce<Record<string, TeeTimeWithTeam[]>>((acc, tt) => {
    const key = tt.tee_time
    if (!acc[key]) acc[key] = []
    acc[key].push(tt)
    return acc
  }, {})

  const formatTime = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    const ampm = h >= 12 ? 'PM' : 'AM'
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 32, color: '#FCB514', letterSpacing: 4 }}>Tee Times</h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
            {teeTimes.length > 0
              ? `${teeTimes.length} groups scheduled • First tee: ${formatTime(Object.keys(grouped)[0] ?? '')}`
              : 'No tee times assigned yet'}
          </p>
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { id: 'view', icon: <Clock size={14} />, label: 'View' },
              { id: 'edit', icon: <Edit2 size={14} />, label: 'Edit' },
              { id: 'auto', icon: <Zap size={14} />, label: 'Auto' },
            ].map(({ id, icon, label }) => (
              <button key={id} onClick={() => setTab(id as 'view' | 'edit' | 'auto')}
                className={`pill-tab ${tab === id ? 'active' : ''}`}
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {icon}{label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* View */}
      {tab === 'view' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {Object.keys(grouped).length === 0 && (
            <div className="glass" style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>
              No tee times scheduled yet
            </div>
          )}
          {Object.entries(grouped).map(([time, tts]) => (
            <div key={time}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{
                  background: 'rgba(252,181,20,0.15)', border: '1px solid rgba(252,181,20,0.4)',
                  borderRadius: 999, padding: '4px 14px',
                  fontSize: 14, fontWeight: 700, color: '#FCB514',
                }}>
                  {formatTime(time)}
                </div>
                <div style={{ flex: 1, height: 1, background: 'rgba(252,181,20,0.1)' }} />
              </div>
              {tts.map(tt => (
                <div key={tt.id} className="glass" style={{ padding: '14px 18px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: '#fff' }}>{tt.team?.name}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                      {[tt.team?.player1?.name, tt.team?.player2?.name].filter(Boolean).join(' & ')}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                    <div>Hole {tt.starting_hole}</div>
                    {tt.cart && <div>🛺 {tt.cart}</div>}
                    {tt.notes && <div style={{ color: 'rgba(255,255,255,0.3)' }}>{tt.notes}</div>}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Edit (admin) */}
      {tab === 'edit' && isAdmin && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {teams.map(team => {
            const existing = teeTimes.find(t => t.team_id === team.id)
            const isEditing = editing === team.id

            return (
              <div key={team.id} className="glass" style={{ padding: '14px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: '#fff' }}>{team.name}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                      {existing ? formatTime(existing.tee_time) + ` • Hole ${existing.starting_hole}` : 'Not assigned'}
                    </div>
                  </div>
                  <button className="btn-outline" style={{ padding: '6px 14px', fontSize: 12 }}
                    onClick={() => {
                      if (isEditing) { setEditing(null); return }
                      setEditing(team.id)
                      setEditForm({
                        tee_time: existing?.tee_time?.substring(0, 5) ?? '08:00',
                        starting_hole: existing?.starting_hole ?? 1,
                        cart: existing?.cart ?? '',
                        notes: existing?.notes ?? '',
                      })
                    }}>
                    {isEditing ? 'Cancel' : 'Edit'}
                  </button>
                </div>
                {isEditing && (
                  <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 4 }}>Tee Time</label>
                      <input type="time" value={editForm.tee_time} onChange={e => setEditForm(f => ({ ...f, tee_time: e.target.value }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 4 }}>Starting Hole</label>
                      <input type="number" min={1} max={18} value={editForm.starting_hole} onChange={e => setEditForm(f => ({ ...f, starting_hole: +e.target.value }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 4 }}>Cart #</label>
                      <input type="text" value={editForm.cart} onChange={e => setEditForm(f => ({ ...f, cart: e.target.value }))} placeholder="e.g. Cart 4" />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 4 }}>Notes</label>
                      <input type="text" value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
                    </div>
                    <div style={{ gridColumn: '1/-1' }}>
                      {existing
                        ? <button className="btn-gold" style={{ width: '100%', justifyContent: 'center' }} onClick={() => saveEdit(existing.id)}>Save Changes</button>
                        : <button className="btn-gold" style={{ width: '100%', justifyContent: 'center' }} onClick={async () => {
                            await supabase.from('tee_times').insert({ team_id: team.id, tee_time: editForm.tee_time + ':00', starting_hole: editForm.starting_hole, cart: editForm.cart || null, notes: editForm.notes || null })
                            showToast('Tee time added!'); setEditing(null); fetchAll()
                          }}>Add Tee Time</button>
                      }
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Auto-assign (admin) */}
      {tab === 'auto' && isAdmin && (
        <div className="glass" style={{ padding: 24 }}>
          <h2 style={{ fontFamily: 'Bebas Neue', fontSize: 22, color: '#FCB514', letterSpacing: 3, marginBottom: 20 }}>Auto-Assign Tee Times</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
            <div>
              <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }}>First Tee Time</label>
              <input type="time" value={autoStart} onChange={e => setAutoStart(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }}>Interval (min)</label>
              <input type="number" min={5} max={30} value={autoInterval} onChange={e => setAutoInterval(+e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }}>Starting Hole</label>
              <input type="number" min={1} max={18} value={autoStartHole} onChange={e => setAutoStartHole(+e.target.value)} />
            </div>
          </div>

          {/* Preview */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>Preview</div>
            {teams.map((team, i) => {
              const [h, m] = autoStart.split(':').map(Number)
              const mins = h * 60 + m + i * autoInterval
              const hh = Math.floor(mins / 60)
              const mm = mins % 60
              const ampm = hh >= 12 ? 'PM' : 'AM'
              const display = `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${ampm}`
              return (
                <div key={team.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 13 }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)' }}>{team.name}</span>
                  <span style={{ color: '#FCB514', fontWeight: 600 }}>{display} • Hole {autoStartHole}</span>
                </div>
              )
            })}
          </div>

          <button className="btn-gold" onClick={autoAssign} style={{ width: '100%', justifyContent: 'center' }}>
            ⚡ Assign All Tee Times
          </button>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 8, textAlign: 'center' }}>
            This will overwrite all existing tee times
          </p>
        </div>
      )}
    </div>
  )
}
