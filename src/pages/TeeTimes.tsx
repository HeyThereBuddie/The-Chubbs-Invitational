import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useYear } from '../context/YearContext'
import { useSyncContext } from '../context/SyncContext'
import { localDb, parseJson } from '../lib/localDb'
import type { TeeTime, Team, Player } from '../lib/types'
import { displayName, teamMemberName } from '../lib/types'
import { Clock, GripVertical, Zap, Shuffle } from 'lucide-react'
import { usePersistedTab } from '../hooks/usePersistedTab'

// Augusta scoreboard palette — matches the Leaderboard / Dashboard / Hall of Fame.
const AUGUSTA = '#0a5c39'
const AUGUSTA_DEEP = '#063a25'
const CREAM = '#efe8d2'
const GOLD_SOFT = '#e7c877'

const MASTHEAD = `linear-gradient(180deg, ${AUGUSTA}, ${AUGUSTA_DEEP})`

function Crest({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="50" cy="50" r="48" fill={AUGUSTA_DEEP} stroke="#d4a53a" strokeWidth="3.5" />
      <path d="M40 74 L40 28 L69 35 L40 42" fill="#e0402f" />
      <rect x="37.5" y="26" width="3" height="48" rx="1.5" fill={CREAM} />
    </svg>
  )
}

// Small round avatar — the player's uploaded photo if they have one, else initials.
function Avatar({ player, size = 34 }: { player?: Player; size?: number }) {
  const initials = player ? displayName(player).split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() : '?'
  if (player?.avatar_url) {
    return <img src={player.avatar_url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1.5px solid var(--bdr2)' }} />
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
      fontSize: size * 0.38, fontWeight: 800, color: AUGUSTA_DEEP,
      background: `linear-gradient(160deg, ${GOLD_SOFT}, #d4a53a)`, border: '1.5px solid rgba(240,230,200,0.3)',
    }}>{initials}</div>
  )
}

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
  const { isAdmin, profile } = useAuth()
  const { showToast } = useToast()
  const { effectiveTournamentId, isCurrentYear } = useYear()
  const { isOnline } = useSyncContext()
  const [teeTimes, setTeeTimes] = useState<TeeTimeRow[]>([])
  const [teams, setTeams] = useState<(Team & { player1?: Player; player2?: Player })[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = usePersistedTab<'view' | 'arrange' | 'auto'>('teetimes.tab', 'view', ['view', 'arrange', 'auto'])
  const [autoInterval, setAutoInterval] = useState(10)
  const [autoStart, setAutoStart] = useState('08:00')
  const [autoStartHole, setAutoStartHole] = useState(1)
  const [saving, setSaving] = useState(false)
  const [dragTeamId, setDragTeamId] = useState<string | null>(null)
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null)
  const [pickedTeamId, setPickedTeamId] = useState<string | null>(null)   // tap-to-swap (works on touch)

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

  // Tap-to-swap — the mobile-friendly path (HTML5 drag events never fire on touch).
  // Tap a team to pick it up, tap another team to swap, or an open slot to move it.
  const tapTeam = (teamId: string) => {
    if (!pickedTeamId) { setPickedTeamId(teamId); return }
    if (pickedTeamId === teamId) { setPickedTeamId(null); return }
    swapTeams(pickedTeamId, teamId); setPickedTeamId(null)
  }
  const tapSlot = (targetTime: string, targetHole: number) => {
    if (!pickedTeamId) return
    moveTeamToTime(pickedTeamId, targetTime, targetHole); setPickedTeamId(null)
  }

  const foursomes = buildFoursomes(teeTimes)
  const firstTime = foursomes[0]?.tee_time

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      {/* ── Admin mode switch ─────────────────────────────────────── */}
      {isAdmin && isCurrentYear && (
        <div className="pill-tabs animate-fadeUp" style={{ marginBottom: 16 }}>
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

      {/* ── Loading skeleton — mirrors timeline layout ────────────── */}
      {loading && tab === 'view' && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {[0, 1, 2].map(i => (
            <SkeletonFoursome key={i} index={i} isLast={i === 2} />
          ))}
        </div>
      )}

      {/* ── View — Augusta tee sheet ──────────────────────────────── */}
      {tab === 'view' && !loading && (
        <div className="glass animate-fadeUp" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Masthead */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 18px', background: MASTHEAD, borderBottom: '2px solid rgba(240,230,200,0.18)' }}>
            <Crest size={38} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: 24, letterSpacing: 2.5, color: CREAM, lineHeight: 1 }}>Tee Times</div>
              <div style={{ fontSize: 10.5, letterSpacing: 1.5, textTransform: 'uppercase', color: GOLD_SOFT, marginTop: 4 }}>
                {foursomes.length > 0 ? `${foursomes.length} groups · First tee ${formatTime(firstTime ?? '')}` : 'Not set yet'}
              </div>
            </div>
          </div>

          {foursomes.length === 0 ? (
            <div style={{ padding: '44px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⛳</div>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: 20, letterSpacing: 2, color: 'var(--tx2)' }}>No tee times yet</div>
              <p style={{ fontSize: 13, color: 'var(--tx4)', marginTop: 4 }}>The tee sheet is still warming up on the range.</p>
            </div>
          ) : foursomes.map((fs, i) => {
            const mine = fs.tts.some(tt => tt.team_id && tt.team_id === profile?.team_id)
            return (
              <div key={fs.tee_time} style={{
                borderBottom: '1px solid var(--bdr)',
                background: mine ? 'linear-gradient(90deg, var(--gold-08), transparent 62%)' : undefined,
                boxShadow: mine ? 'inset 3px 0 0 var(--gold)' : undefined,
              }}>
                {/* Group header */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '12px 18px 4px' }}>
                  <span style={{ fontFamily: 'Bebas Neue', fontSize: 22, letterSpacing: 1, color: i === 0 ? 'var(--gold)' : 'var(--tx2)', lineHeight: 1, whiteSpace: 'nowrap' }}>
                    {formatTime(fs.tee_time)}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--tx4)', background: 'var(--surf2)', border: '1px solid var(--bdr)', padding: '3px 9px', borderRadius: 999 }}>Hole {fs.starting_hole}</span>
                  {mine && <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--gold)', border: '1px solid var(--gold-40)', borderRadius: 6, padding: '2px 6px' }}>Your group</span>}
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: 'var(--tx4)' }}>Group {i + 1}</span>
                </div>
                {/* Teams */}
                {fs.tts.map(tt => (
                  <div key={tt.team_id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 18px' }}>
                    <Avatar player={tt.team?.player1} size={30} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--tx1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tt.team?.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {[teamMemberName(tt.team?.player1, tt.team?.p1_name), teamMemberName(tt.team?.player2, tt.team?.p2_name)].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    {tt.cart && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)', background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 8, padding: '3px 8px', flexShrink: 0 }}>🛺 {tt.cart}</span>}
                  </div>
                ))}
                {fs.tts.length === 1 && (
                  <div style={{ padding: '4px 18px 12px', fontSize: 11, color: 'var(--tx4)', fontStyle: 'italic' }}>Twosome — open slot</div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Arrange (tap-to-swap) ─────────────────────────────────── */}
      {tab === 'arrange' && isAdmin && (
        <div className="glass animate-fadeUp" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Masthead */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 18px', background: MASTHEAD, borderBottom: '2px solid rgba(240,230,200,0.18)' }}>
            <Crest size={38} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: 24, letterSpacing: 2.5, color: CREAM, lineHeight: 1 }}>Arrange Groups</div>
              <div style={{ fontSize: 10.5, letterSpacing: 1.5, textTransform: 'uppercase', color: GOLD_SOFT, marginTop: 4 }}>Tap to swap · {foursomes.length} groups</div>
            </div>
            {saving && <span className="animate-pulseDot" style={{ fontSize: 11, fontWeight: 700, color: CREAM, whiteSpace: 'nowrap' }}>Saving…</span>}
          </div>

          {/* Instruction */}
          <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--bdr)', fontSize: 12.5, lineHeight: 1.5, color: pickedTeamId ? 'var(--gold)' : 'var(--tx3)', fontWeight: pickedTeamId ? 600 : 400 }}>
            {pickedTeamId
              ? '👆 Now tap another team to swap, or an open slot to move it there.'
              : 'Tap a team to pick it up, then tap another to swap.'}
          </div>

          {foursomes.length === 0 ? (
            <div style={{ padding: '44px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⛳</div>
              <p style={{ fontSize: 13, color: 'var(--tx4)' }}>No tee times yet — use Auto to assign foursomes first.</p>
            </div>
          ) : foursomes.map((fs, i) => (
            <div key={fs.tee_time} style={{ borderBottom: '1px solid var(--bdr)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '12px 16px 6px' }}>
                <span style={{ fontFamily: 'Bebas Neue', fontSize: 20, letterSpacing: 1, color: 'var(--gold)', lineHeight: 1, whiteSpace: 'nowrap' }}>{formatTime(fs.tee_time)}</span>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--tx4)' }}>Hole {fs.starting_hole} · Group {i + 1}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 16px 14px' }}>
                {[0, 1].map(slotIdx => {
                  const tt = fs.tts[slotIdx]
                  if (tt) {
                    const isDragging = dragTeamId === tt.team_id
                    const isOver = dragOverTarget === tt.team_id
                    const isPicked = pickedTeamId === tt.team_id
                    const highlight = isOver || isPicked
                    return (
                      <div
                        key={tt.team_id}
                        className="pressable"
                        draggable
                        onClick={() => tapTeam(tt.team_id)}
                        onDragStart={() => onDragStart(tt.team_id)}
                        onDragEnd={onDragEnd}
                        onDragOver={e => { e.preventDefault(); setDragOverTarget(tt.team_id) }}
                        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverTarget(null) }}
                        onDrop={e => { e.preventDefault(); if (dragTeamId && dragTeamId !== tt.team_id) swapTeams(dragTeamId, tt.team_id); setDragOverTarget(null) }}
                        style={{
                          padding: '10px 12px', borderRadius: 12,
                          border: `1px solid ${highlight ? 'var(--gold)' : 'var(--bdr)'}`,
                          background: highlight ? 'var(--gold-15)' : 'var(--surf2)',
                          boxShadow: highlight ? 'var(--elev-gold)' : 'var(--elev-1)',
                          opacity: isDragging ? 0.35 : 1, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 10,
                          transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s', userSelect: 'none',
                        }}
                      >
                        <Avatar player={tt.team?.player1} size={32} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--tx1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tt.team?.name}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {[teamMemberName(tt.team?.player1, tt.team?.p1_name), teamMemberName(tt.team?.player2, tt.team?.p2_name)].filter(Boolean).join(' & ')}
                          </div>
                        </div>
                        <span style={{ fontSize: 15, flexShrink: 0, opacity: isPicked ? 1 : 0.35 }}>{isPicked ? '✋' : '⇅'}</span>
                      </div>
                    )
                  }
                  const emptyKey = `empty:${fs.tee_time}`
                  const isOver = dragOverTarget === emptyKey && !!dragTeamId
                  const canDrop = isOver || !!pickedTeamId
                  return (
                    <div
                      key={`empty-${slotIdx}`}
                      onClick={() => tapSlot(fs.tee_time, fs.starting_hole)}
                      onDragOver={e => { e.preventDefault(); setDragOverTarget(emptyKey) }}
                      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverTarget(null) }}
                      onDrop={e => { e.preventDefault(); if (dragTeamId) moveTeamToTime(dragTeamId, fs.tee_time, fs.starting_hole); setDragOverTarget(null) }}
                      style={{
                        padding: '14px 12px', borderRadius: 12,
                        border: `1px dashed ${isOver ? 'var(--gold)' : 'var(--bdr2)'}`,
                        background: isOver ? 'var(--gold-08)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: canDrop ? 'var(--gold)' : 'var(--tx5)',
                        fontSize: 12, fontWeight: canDrop ? 600 : 400, cursor: pickedTeamId ? 'pointer' : 'default',
                        transition: 'all 0.15s',
                      }}
                    >
                      {isOver ? '↓ Drop here' : pickedTeamId ? 'Tap to move here' : 'Open slot'}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Auto-assign ───────────────────────────────────────────── */}
      {tab === 'auto' && isAdmin && (
        <div className="glass animate-fadeUp" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 18px', background: MASTHEAD, borderBottom: '2px solid rgba(240,230,200,0.18)' }}>
            <Crest size={38} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: 24, letterSpacing: 2.5, color: CREAM, lineHeight: 1 }}>Randomize Foursomes</div>
              <div style={{ fontSize: 10.5, letterSpacing: 1.5, textTransform: 'uppercase', color: GOLD_SOFT, marginTop: 4 }}>Auto-assign · {teams.length} teams</div>
            </div>
          </div>

          <div style={{ padding: 20 }}>
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
        </div>
      )}
    </div>
  )
}
