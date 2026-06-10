import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useYear } from '../context/YearContext'
import { useSyncContext } from '../context/SyncContext'
import { localDb, parseJson } from '../lib/localDb'
import type { TeeTime, Team, Player } from '../lib/types'
import { Clock, GripVertical, Zap, Shuffle } from 'lucide-react'

type TeeTimeRow = TeeTime & {
  team?: Team & { player1?: Player; player2?: Player }
}

interface Foursome {
  tee_time: string
  starting_hole: number
  tts: TeeTimeRow[]
}

function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function buildFoursomes(teeTimes: TeeTimeRow[]): Foursome[] {
  const map: Record<string, Foursome> = {}
  for (const tt of teeTimes) {
    if (!map[tt.tee_time]) map[tt.tee_time] = { tee_time: tt.tee_time, starting_hole: tt.starting_hole, tts: [] }
    map[tt.tee_time].tts.push(tt)
  }
  return Object.values(map).sort((a, b) => a.tee_time.localeCompare(b.tee_time))
}

export default function TeeTimes() {
  const { isAdmin } = useAuth()
  const { showToast } = useToast()
  const { effectiveTournamentId, isCurrentYear } = useYear()
  const { isOnline } = useSyncContext()
  const [teeTimes, setTeeTimes] = useState<TeeTimeRow[]>([])
  const [teams, setTeams] = useState<(Team & { player1?: Player; player2?: Player })[]>([])
  const [tab, setTab] = useState<'view' | 'arrange' | 'auto'>('view')
  const [autoInterval, setAutoInterval] = useState(10)
  const [autoStart, setAutoStart] = useState('08:00')
  const [autoStartHole, setAutoStartHole] = useState(1)
  const [saving, setSaving] = useState(false)
  const [dragTeamId, setDragTeamId] = useState<string | null>(null)
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null)

  useEffect(() => { fetchAll() }, [effectiveTournamentId, isOnline])

  const fetchAll = async () => {
    if (!effectiveTournamentId) { setTeams([]); return }

    if (!isOnline) {
      const localTTs = await localDb.tee_times.toArray()
      const mappedTTs: TeeTimeRow[] = localTTs.map(tt => {
        const teamObj = parseJson<Team & { player1?: Player; player2?: Player }>(tt.team_json)
        return {
          id: tt.id,
          team_id: tt.team_id,
          tee_time: tt.tee_time,
          starting_hole: tt.starting_hole,
          cart: tt.cart,
          notes: tt.notes,
          team: teamObj,
        } as TeeTimeRow
      })
      setTeeTimes(mappedTTs)
      setTeams([])
      return
    }

    let teamsQ = supabase.from('teams').select('*, player1:profiles!teams_p1_id_fkey(*), player2:profiles!teams_p2_id_fkey(*)')
    teamsQ = teamsQ.eq('tournament_id', effectiveTournamentId)
    const [ttRes, teamsRes] = await Promise.all([
      supabase.from('tee_times')
        .select('*, team:teams(*, player1:profiles!teams_p1_id_fkey(*), player2:profiles!teams_p2_id_fkey(*))')
        .order('tee_time'),
      teamsQ,
    ])
    setTeeTimes(ttRes.data ?? [])
    setTeams(teamsRes.data ?? [])
  }

  const autoAssign = async () => {
    const shuffled = [...teams].sort(() => Math.random() - 0.5)
    const [h, m] = autoStart.split(':').map(Number)
    let mins = h * 60 + m
    const upserts: { team_id: string; tee_time: string; starting_hole: number; cart: null; notes: null }[] = []

    for (let i = 0; i < shuffled.length; i += 2) {
      const hh = String(Math.floor(mins / 60)).padStart(2, '0')
      const mm = String(mins % 60).padStart(2, '0')
      const time = `${hh}:${mm}:00`
      upserts.push({ team_id: shuffled[i].id, tee_time: time, starting_hole: autoStartHole, cart: null, notes: null })
      if (shuffled[i + 1]) {
        upserts.push({ team_id: shuffled[i + 1].id, tee_time: time, starting_hole: autoStartHole, cart: null, notes: null })
      }
      mins += autoInterval
    }

    await supabase.from('tee_times').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    const { error } = await supabase.from('tee_times').insert(upserts)
    if (error) showToast(error.message, 'error')
    else {
      showToast(`${Math.ceil(shuffled.length / 2)} foursomes assigned!`)
      fetchAll()
      setTab('view')
    }
  }

  const swapTeams = async (aId: string, bId: string) => {
    if (aId === bId) return
    const ttA = teeTimes.find(t => t.team_id === aId)
    const ttB = teeTimes.find(t => t.team_id === bId)
    if (!ttA || !ttB || ttA.tee_time === ttB.tee_time) return
    setSaving(true)
    await Promise.all([
      supabase.from('tee_times').update({ tee_time: ttB.tee_time, starting_hole: ttB.starting_hole }).eq('id', ttA.id),
      supabase.from('tee_times').update({ tee_time: ttA.tee_time, starting_hole: ttA.starting_hole }).eq('id', ttB.id),
    ])
    setSaving(false)
    showToast('Foursome updated!')
    fetchAll()
  }

  const moveTeamToTime = async (teamId: string, targetTime: string, targetHole: number) => {
    const tt = teeTimes.find(t => t.team_id === teamId)
    if (!tt || tt.tee_time === targetTime) return
    setSaving(true)
    await supabase.from('tee_times').update({ tee_time: targetTime, starting_hole: targetHole }).eq('id', tt.id)
    setSaving(false)
    showToast('Team moved!')
    fetchAll()
  }

  const onDragStart = (teamId: string) => setDragTeamId(teamId)
  const onDragEnd = () => { setDragTeamId(null); setDragOverTarget(null) }

  const foursomes = buildFoursomes(teeTimes)
  const firstTime = foursomes[0]?.tee_time

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 32, color: '#FCB514', letterSpacing: 4 }}>Tee Times</h1>
          <p style={{ color: 'var(--tx3)', fontSize: 13 }}>
            {foursomes.length > 0
              ? `${foursomes.length} foursomes • First tee: ${formatTime(firstTime ?? '')}`
              : 'No tee times assigned yet'}
          </p>
        </div>
        {isAdmin && isCurrentYear && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setTab('view')} className={`pill-tab ${tab === 'view' ? 'active' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={13} /> View
            </button>
            <button onClick={() => setTab('arrange')} className={`pill-tab ${tab === 'arrange' ? 'active' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <GripVertical size={13} /> Arrange
            </button>
            <button onClick={() => setTab('auto')} className={`pill-tab ${tab === 'auto' ? 'active' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Zap size={13} /> Auto
            </button>
          </div>
        )}
      </div>

      {/* ── View ──────────────────────────────────────────────────── */}
      {tab === 'view' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {foursomes.length === 0 && (
            <div className="glass" style={{ padding: 40, textAlign: 'center', color: 'var(--tx4)' }}>
              No tee times scheduled yet
            </div>
          )}
          {foursomes.map((fs, i) => (
            <div key={fs.tee_time}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{
                  background: 'rgba(252,181,20,0.15)', border: '1px solid rgba(252,181,20,0.4)',
                  borderRadius: 999, padding: '4px 14px',
                  fontSize: 14, fontWeight: 700, color: '#FCB514',
                }}>
                  {formatTime(fs.tee_time)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--tx3)' }}>Hole {fs.starting_hole}</div>
                <div style={{ flex: 1, height: 1, background: 'rgba(252,181,20,0.1)' }} />
                <div style={{ fontSize: 11, color: 'var(--tx4)', fontWeight: 700, letterSpacing: 1 }}>
                  FOURSOME {i + 1}
                </div>
              </div>
              <div className="glass" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  {fs.tts.map(tt => (
                    <div key={tt.team_id}>
                      <div style={{ fontWeight: 700, color: 'var(--tx1)', fontSize: 14 }}>{tt.team?.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 2 }}>
                        {[tt.team?.player1?.name, tt.team?.player2?.name].filter(Boolean).join(' & ')}
                      </div>
                      {tt.cart && <div style={{ fontSize: 11, color: 'var(--tx4)', marginTop: 2 }}>🛺 {tt.cart}</div>}
                    </div>
                  ))}
                  {fs.tts.length === 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', color: 'var(--tx4)', fontSize: 12 }}>
                      Twosome
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Arrange (drag & drop) ─────────────────────────────────── */}
      {tab === 'arrange' && isAdmin && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <p style={{ fontSize: 13, color: 'var(--tx3)' }}>
              Drag a team to swap it with another or drop it into an open slot.
            </p>
            {saving && <span style={{ fontSize: 12, color: '#FCB514' }}>Saving…</span>}
          </div>

          {foursomes.length === 0 && (
            <div className="glass" style={{ padding: 40, textAlign: 'center', color: 'var(--tx4)' }}>
              No tee times yet — use Auto to assign foursomes first.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {foursomes.map((fs, i) => (
              <div key={fs.tee_time} className="glass" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <div style={{
                    background: 'rgba(252,181,20,0.15)', border: '1px solid rgba(252,181,20,0.4)',
                    borderRadius: 999, padding: '3px 12px',
                    fontSize: 13, fontWeight: 700, color: '#FCB514',
                  }}>
                    {formatTime(fs.tee_time)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--tx4)' }}>
                    Hole {fs.starting_hole} · Foursome {i + 1}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[0, 1].map(slotIdx => {
                    const tt = fs.tts[slotIdx]

                    if (tt) {
                      const isDragging = dragTeamId === tt.team_id
                      const isOver = dragOverTarget === tt.team_id
                      return (
                        <div
                          key={tt.team_id}
                          draggable
                          onDragStart={() => onDragStart(tt.team_id)}
                          onDragEnd={onDragEnd}
                          onDragOver={e => { e.preventDefault(); setDragOverTarget(tt.team_id) }}
                          onDragLeave={e => {
                            if (!e.currentTarget.contains(e.relatedTarget as Node))
                              setDragOverTarget(null)
                          }}
                          onDrop={e => {
                            e.preventDefault()
                            if (dragTeamId && dragTeamId !== tt.team_id) swapTeams(dragTeamId, tt.team_id)
                            setDragOverTarget(null)
                          }}
                          style={{
                            padding: '12px 14px',
                            borderRadius: 10,
                            border: `1px solid ${isOver ? '#FCB514' : 'var(--bdr)'}`,
                            background: isOver ? 'rgba(252,181,20,0.1)' : 'var(--surf2)',
                            opacity: isDragging ? 0.35 : 1,
                            cursor: 'grab',
                            display: 'flex', alignItems: 'center', gap: 8,
                            transition: 'border-color 0.15s, background 0.15s',
                            userSelect: 'none',
                          }}
                        >
                          <GripVertical size={14} style={{ color: 'var(--tx4)', flexShrink: 0 }} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--tx1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {tt.team?.name}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--tx3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {[tt.team?.player1?.name, tt.team?.player2?.name].filter(Boolean).join(' & ')}
                            </div>
                          </div>
                        </div>
                      )
                    }

                    // Empty slot — drop target
                    const emptyKey = `empty:${fs.tee_time}`
                    const isOver = dragOverTarget === emptyKey && !!dragTeamId
                    return (
                      <div
                        key={`empty-${slotIdx}`}
                        onDragOver={e => { e.preventDefault(); setDragOverTarget(emptyKey) }}
                        onDragLeave={e => {
                          if (!e.currentTarget.contains(e.relatedTarget as Node))
                            setDragOverTarget(null)
                        }}
                        onDrop={e => {
                          e.preventDefault()
                          if (dragTeamId) moveTeamToTime(dragTeamId, fs.tee_time, fs.starting_hole)
                          setDragOverTarget(null)
                        }}
                        style={{
                          padding: '12px 14px', minHeight: 60,
                          borderRadius: 10,
                          border: `1px dashed ${isOver ? '#FCB514' : 'var(--bdr)'}`,
                          background: isOver ? 'rgba(252,181,20,0.07)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: isOver ? '#FCB514' : 'var(--tx5)',
                          fontSize: 12, fontWeight: isOver ? 600 : 400,
                          transition: 'all 0.15s',
                        }}
                      >
                        {isOver ? '↓ Drop here' : 'Open slot'}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Auto-assign ───────────────────────────────────────────── */}
      {tab === 'auto' && isAdmin && (
        <div className="glass" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <Shuffle size={18} color="#FCB514" />
            <h2 style={{ fontFamily: 'Bebas Neue', fontSize: 22, color: '#FCB514', letterSpacing: 3, margin: 0 }}>
              Randomize Foursomes
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--tx2)', display: 'block', marginBottom: 6 }}>First Tee Time</label>
              <input type="time" value={autoStart} onChange={e => setAutoStart(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--tx2)', display: 'block', marginBottom: 6 }}>Interval (min)</label>
              <input type="number" min={5} max={30} value={autoInterval} onChange={e => setAutoInterval(+e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--tx2)', display: 'block', marginBottom: 6 }}>Starting Hole</label>
              <input type="number" min={1} max={18} value={autoStartHole} onChange={e => setAutoStartHole(+e.target.value)} />
            </div>
          </div>

          {/* Preview */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 10 }}>
              Preview — {Math.ceil(teams.length / 2)} foursomes from {teams.length} teams
            </div>
            {(() => {
              const [h, m] = autoStart.split(':').map(Number)
              return Array.from({ length: Math.ceil(teams.length / 2) }, (_, i) => {
                const totalMins = h * 60 + m + i * autoInterval
                const hh = Math.floor(totalMins / 60)
                const mm = totalMins % 60
                const display = `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}`
                const isLast = i === Math.ceil(teams.length / 2) - 1 && teams.length % 2 !== 0
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '9px 0', borderBottom: '1px solid var(--bdr)', fontSize: 13,
                  }}>
                    <span style={{ color: '#FCB514', fontWeight: 700, width: 80, flexShrink: 0 }}>{display}</span>
                    <span style={{ color: 'var(--tx3)' }}>
                      Foursome {i + 1}{isLast ? ' · twosome (odd team count)' : ' · 2 teams'}
                    </span>
                  </div>
                )
              })
            })()}
            {teams.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--tx4)' }}>No teams found — add teams in Admin first.</div>
            )}
          </div>

          <button className="btn-gold" onClick={autoAssign} disabled={teams.length === 0}
            style={{ width: '100%', justifyContent: 'center' }}>
            <Shuffle size={15} /> Randomize &amp; Assign
          </button>
          <p style={{ fontSize: 11, color: 'var(--tx4)', marginTop: 8, textAlign: 'center' }}>
            Teams are randomly paired. Use Arrange tab afterwards to swap anyone on the fly.
          </p>
        </div>
      )}
    </div>
  )
}
