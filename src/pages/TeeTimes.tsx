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

/* Skeleton row mirroring a timeline foursome card — presentational only */
function SkeletonFoursome({ index, isLast }: { index: number; isLast: boolean }) {
  return (
    <div className={`animate-fadeUp delay-${(index + 1) * 100}`} style={{ display: 'flex', gap: 12 }}>
      {/* Timeline rail */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 12, flexShrink: 0, paddingTop: 8 }}>
        <div className="skeleton skeleton-circle" style={{ width: 10, height: 10, flexShrink: 0 }} />
        {!isLast && <div style={{ width: 2, flex: 1, background: 'var(--surf2)', marginTop: 8, borderRadius: 1 }} />}
      </div>
      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, paddingBottom: isLast ? 0 : 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div className="skeleton" style={{ width: 88, height: 24, borderRadius: 8 }} />
          <div className="skeleton skeleton-line" style={{ width: 48 }} />
          <div style={{ flex: 1 }} />
          <div className="skeleton skeleton-line" style={{ width: 76 }} />
        </div>
        <div className="glass" style={{ padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[0, 1].map(s => (
              <div key={s} style={s > 0 ? { borderLeft: '1px solid var(--bdr)', paddingLeft: 16 } : undefined}>
                <div className="skeleton skeleton-title" style={{ width: '70%', height: 14 }} />
                <div className="skeleton skeleton-line" style={{ width: '90%', marginTop: 8 }} />
                <div className="skeleton skeleton-line" style={{ width: '50%', marginTop: 8, height: 10 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function TeeTimes() {
  const { isAdmin } = useAuth()
  const { showToast } = useToast()
  const { effectiveTournamentId, isCurrentYear } = useYear()
  const { isOnline } = useSyncContext()
  const [teeTimes, setTeeTimes] = useState<TeeTimeRow[]>([])
  const [teams, setTeams] = useState<(Team & { player1?: Player; player2?: Player })[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'view' | 'arrange' | 'auto'>('view')
  const [autoInterval, setAutoInterval] = useState(10)
  const [autoStart, setAutoStart] = useState('08:00')
  const [autoStartHole, setAutoStartHole] = useState(1)
  const [saving, setSaving] = useState(false)
  const [dragTeamId, setDragTeamId] = useState<string | null>(null)
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null)

  useEffect(() => { fetchAll() }, [effectiveTournamentId, isOnline])

  const fetchAll = async () => {
    if (!effectiveTournamentId) { setTeams([]); setLoading(false); return }

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
      setLoading(false)
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
    setLoading(false)
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
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="animate-fadeUp" style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="gold-text" style={{ fontFamily: 'Bebas Neue', fontSize: 32, letterSpacing: 4, lineHeight: 1 }}>Tee Times</h1>
          {loading ? (
            <div className="skeleton skeleton-line" style={{ width: 180, marginTop: 8 }} />
          ) : (
            <p style={{ color: 'var(--tx3)', fontSize: 13, marginTop: 4 }}>
              {foursomes.length > 0
                ? `${foursomes.length} foursomes • First tee: ${formatTime(firstTime ?? '')}`
                : 'No tee times assigned yet'}
            </p>
          )}
        </div>
        {isAdmin && isCurrentYear && (
          <div className="pill-tabs">
            <button onClick={() => setTab('view')} className={`pill-tab pressable ${tab === 'view' ? 'active' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={13} /> View
            </button>
            <button onClick={() => setTab('arrange')} className={`pill-tab pressable ${tab === 'arrange' ? 'active' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <GripVertical size={13} /> Arrange
            </button>
            <button onClick={() => setTab('auto')} className={`pill-tab pressable ${tab === 'auto' ? 'active' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Zap size={13} /> Auto
            </button>
          </div>
        )}
      </div>

      {/* ── Loading skeleton — mirrors timeline layout ────────────── */}
      {loading && tab === 'view' && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {[0, 1, 2].map(i => (
            <SkeletonFoursome key={i} index={i} isLast={i === 2} />
          ))}
        </div>
      )}

      {/* ── View — tee sheet timeline ─────────────────────────────── */}
      {tab === 'view' && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {foursomes.length === 0 && (
            <div className="glass animate-fadeUp delay-100" style={{ padding: '48px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⛳</div>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: 20, letterSpacing: 2, color: 'var(--tx2)' }}>
                No tee times yet
              </div>
              <p style={{ fontSize: 13, color: 'var(--tx4)', marginTop: 4 }}>
                The tee sheet is still warming up on the range.
              </p>
            </div>
          )}
          {foursomes.map((fs, i) => {
            const isLast = i === foursomes.length - 1
            return (
              <div
                key={fs.tee_time}
                className={i < 4 ? `animate-fadeUp delay-${(i + 1) * 100}` : undefined}
                style={{ display: 'flex', gap: 12 }}
              >
                {/* Timeline rail */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 12, flexShrink: 0, paddingTop: 8 }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                    background: i === 0 ? 'var(--gold)' : 'var(--gold-40)',
                    boxShadow: i === 0 ? 'var(--elev-gold)' : 'none',
                  }} />
                  {!isLast && (
                    <div style={{
                      width: 2, flex: 1, marginTop: 8, borderRadius: 1,
                      background: 'linear-gradient(180deg, var(--gold-25), var(--gold-08))',
                    }} />
                  )}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0, paddingBottom: isLast ? 0 : 24 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 10 }}>
                    <span style={{
                      fontFamily: 'Bebas Neue', fontSize: 24, letterSpacing: 1,
                      color: 'var(--gold)', lineHeight: 1, whiteSpace: 'nowrap',
                    }}>
                      {formatTime(fs.tee_time)}
                    </span>
                    <span className="section-label" style={{ whiteSpace: 'nowrap' }}>Hole {fs.starting_hole}</span>
                    <span style={{ flex: 1 }} />
                    <span className="section-label" style={{ color: 'var(--tx4)', whiteSpace: 'nowrap' }}>
                      Foursome {i + 1}
                    </span>
                  </div>

                  <div className="glass" style={{ padding: 16 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      {fs.tts.map((tt, idx) => (
                        <div key={tt.team_id} style={idx > 0 ? { borderLeft: '1px solid var(--bdr)', paddingLeft: 16, minWidth: 0 } : { minWidth: 0 }}>
                          <div style={{ fontWeight: 700, color: 'var(--tx1)', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {tt.team?.name}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 4, lineHeight: 1.4 }}>
                            {[tt.team?.player1?.name, tt.team?.player2?.name].filter(Boolean).join(' & ')}
                          </div>
                          {tt.cart && (
                            <div style={{ fontSize: 11, color: 'var(--tx4)', marginTop: 8 }}>🛺 {tt.cart}</div>
                          )}
                          {tt.notes && (
                            <div style={{ fontSize: 11, color: 'var(--tx4)', marginTop: tt.cart ? 4 : 8 }}>📝 {tt.notes}</div>
                          )}
                        </div>
                      ))}
                      {fs.tts.length === 1 && (
                        <div style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          borderLeft: '1px solid var(--bdr)', paddingLeft: 16,
                          color: 'var(--tx4)', fontSize: 12,
                        }}>
                          Twosome
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Arrange (drag & drop) ─────────────────────────────────── */}
      {tab === 'arrange' && isAdmin && (
        <div className="animate-fadeUp">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: 'var(--tx3)', lineHeight: 1.5 }}>
              Drag a team to swap it with another or drop it into an open slot.
            </p>
            {saving && (
              <span className="animate-pulseDot" style={{ fontSize: 12, fontWeight: 600, color: 'var(--gold)', whiteSpace: 'nowrap' }}>
                Saving…
              </span>
            )}
          </div>

          {foursomes.length === 0 && (
            <div className="glass" style={{ padding: '48px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⛳</div>
              <p style={{ fontSize: 13, color: 'var(--tx4)' }}>
                No tee times yet — use Auto to assign foursomes first.
              </p>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {foursomes.map((fs, i) => (
              <div key={fs.tee_time} className={`glass ${i < 4 ? `animate-fadeUp delay-${(i + 1) * 100}` : ''}`} style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
                  <span style={{
                    fontFamily: 'Bebas Neue', fontSize: 20, letterSpacing: 1,
                    color: 'var(--gold)', lineHeight: 1, whiteSpace: 'nowrap',
                  }}>
                    {formatTime(fs.tee_time)}
                  </span>
                  <span className="section-label" style={{ color: 'var(--tx4)' }}>
                    Hole {fs.starting_hole} · Foursome {i + 1}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[0, 1].map(slotIdx => {
                    const tt = fs.tts[slotIdx]

                    if (tt) {
                      const isDragging = dragTeamId === tt.team_id
                      const isOver = dragOverTarget === tt.team_id
                      return (
                        <div
                          key={tt.team_id}
                          className="glass-flat"
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
                            padding: 12,
                            borderRadius: 12,
                            border: `1px solid ${isOver ? 'var(--gold)' : 'var(--bdr)'}`,
                            background: isOver ? 'var(--gold-15)' : 'var(--surf2)',
                            boxShadow: isOver ? 'var(--elev-gold)' : 'var(--elev-1)',
                            opacity: isDragging ? 0.35 : 1,
                            cursor: 'grab',
                            display: 'flex', alignItems: 'center', gap: 8,
                            transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
                            userSelect: 'none',
                          }}
                        >
                          <GripVertical size={14} style={{ color: 'var(--tx4)', flexShrink: 0 }} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--tx1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {tt.team?.name}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
                          padding: 12, minHeight: 60,
                          borderRadius: 12,
                          border: `1px dashed ${isOver ? 'var(--gold)' : 'var(--bdr2)'}`,
                          background: isOver ? 'var(--gold-08)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: isOver ? 'var(--gold)' : 'var(--tx5)',
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
        <div className="glass animate-fadeUp" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 12, flexShrink: 0,
              background: 'var(--gold-15)', border: '1px solid var(--gold-25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Shuffle size={16} color="var(--gold)" />
            </div>
            <h2 style={{ fontFamily: 'Bebas Neue', fontSize: 24, color: 'var(--gold)', letterSpacing: 3, margin: 0, lineHeight: 1 }}>
              Randomize Foursomes
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="section-label" style={{ display: 'block', marginBottom: 8 }}>First Tee Time</label>
              <input type="time" value={autoStart} onChange={e => setAutoStart(e.target.value)} />
            </div>
            <div>
              <label className="section-label" style={{ display: 'block', marginBottom: 8 }}>Interval (min)</label>
              <input type="number" min={5} max={30} value={autoInterval} onChange={e => setAutoInterval(+e.target.value)} />
            </div>
            <div>
              <label className="section-label" style={{ display: 'block', marginBottom: 8 }}>Starting Hole</label>
              <input type="number" min={1} max={18} value={autoStartHole} onChange={e => setAutoStartHole(+e.target.value)} />
            </div>
          </div>

          {/* Preview */}
          <div className="glass-flat" style={{ padding: '4px 16px 12px', marginBottom: 20 }}>
            <div className="section-label" style={{ padding: '12px 0 4px' }}>
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
                    display: 'flex', alignItems: 'baseline', gap: 12,
                    padding: '10px 0',
                    borderBottom: i < Math.ceil(teams.length / 2) - 1 ? '1px solid var(--bdr)' : 'none',
                    fontSize: 13,
                  }}>
                    <span style={{
                      fontFamily: 'Bebas Neue', fontSize: 16, letterSpacing: 1,
                      color: 'var(--gold)', width: 72, flexShrink: 0, lineHeight: 1,
                    }}>
                      {display}
                    </span>
                    <span style={{ color: 'var(--tx3)' }}>
                      Foursome {i + 1}{isLast ? ' · twosome (odd team count)' : ' · 2 teams'}
                    </span>
                  </div>
                )
              })
            })()}
            {teams.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--tx4)', padding: '10px 0' }}>
                No teams found — add teams in Admin first.
              </div>
            )}
          </div>

          <button className="btn-gold pressable" onClick={autoAssign} disabled={teams.length === 0}
            style={{ width: '100%', justifyContent: 'center' }}>
            <Shuffle size={15} /> Randomize &amp; Assign
          </button>
          <p style={{ fontSize: 11, color: 'var(--tx4)', marginTop: 12, textAlign: 'center', lineHeight: 1.5 }}>
            Teams are randomly paired. Use Arrange tab afterwards to swap anyone on the fly.
          </p>
        </div>
      )}
    </div>
  )
}
