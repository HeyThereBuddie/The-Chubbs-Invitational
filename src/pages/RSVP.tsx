import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'
import type { Profile } from '../lib/types'
import { ChevronDown, ChevronUp, Download } from 'lucide-react'

type StatusTab = 'active' | 'waitlist' | 'dropped'

const STATUS_TABS: { id: StatusTab; label: string; emoji: string }[] = [
  { id: 'active',   label: 'Active',   emoji: '✅' },
  { id: 'waitlist', label: 'Waitlist', emoji: '⏳' },
  { id: 'dropped',  label: 'Dropped',  emoji: '❌' },
]

const statusColor = { active: '#22c55e', waitlist: '#f59e0b', dropped: '#ef4444' }

const responseLabel: Record<string, { icon: string; color: string; text: string }> = {
  yes:  { icon: '✅', color: '#22c55e', text: 'Confirmed In' },
  no:   { icon: '❌', color: '#ef4444', text: 'Declined' },
}

function fmt(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function RSVP() {
  const { showToast } = useToast()
  const [players,      setPlayers]      = useState<Profile[]>([])
  const [tab,          setTab]          = useState<StatusTab>('active')
  const [expanded,     setExpanded]     = useState<string | null>(null)
  const [selected,     setSelected]     = useState<Set<string>>(new Set())
  const [activating,   setActivating]   = useState(false)
  const [resetting,    setResetting]    = useState(false)
  const [resetConfirm, setResetConfirm] = useState(false)
  const [returningIds, setReturningIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchPlayers()
    fetchReturning()
  }, [])

  const fetchPlayers = async () => {
    const { data } = await supabase.from('profiles').select('*').order('name')
    setPlayers(data ?? [])
  }

  const fetchReturning = async () => {
    const { data } = await supabase
      .from('tournaments')
      .select('participants_json')
      .eq('status', 'completed')
      .not('participants_json', 'is', null)
      .order('year', { ascending: false })
      .limit(1)
      .single()
    if (data?.participants_json) {
      const ids = new Set((data.participants_json as { id: string }[]).map(p => p.id))
      setReturningIds(ids)
    }
  }

  const updatePlayer = async (id: string, updates: Partial<Profile>) => {
    const { error } = await supabase.from('profiles').update(updates).eq('id', id)
    if (error) showToast(error.message, 'error')
    else fetchPlayers()
  }

  const setStatus = async (id: string, status: 'active' | 'waitlist' | 'dropped') => {
    await updatePlayer(id, { status })
    showToast(
      status === 'active'   ? 'Player activated!'   :
      status === 'waitlist' ? 'Moved to waitlist'   :
      'Player dropped'
    )
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const activateSelected = async () => {
    const ids = [...selected]
    if (!ids.length) return
    setActivating(true)
    await supabase.from('profiles').update({ status: 'active' }).in('id', ids)
    setSelected(new Set())
    await fetchPlayers()
    setActivating(false)
    showToast(`${ids.length} player${ids.length !== 1 ? 's' : ''} activated`)
  }

  const resetRoster = async () => {
    setResetting(true)
    await supabase.from('profiles').update({ status: 'waitlist' }).eq('status', 'active').neq('role', 'admin')
    setResetConfirm(false)
    await fetchPlayers()
    setResetting(false)
    showToast('Roster reset — all players moved to waitlist')
  }

  const exportBrevoCSV = () => {
    const exportable = players.filter(p => p.status === 'active' || p.status === 'waitlist')
    const rows = [
      ['EMAIL', 'FIRSTNAME', 'LASTNAME', 'INVITE_TOKEN', 'STATUS'],
      ...exportable.map(p => {
        const parts = p.name.trim().split(' ')
        const first = parts[0] ?? ''
        const last  = parts.slice(1).join(' ') ?? ''
        return [p.email, first, last, p.invite_token ?? '', p.status]
      }),
    ]
    const csv  = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = 'chubbs-memorial-brevo.csv'
    a.click()
    URL.revokeObjectURL(url)
    showToast(`Exported ${exportable.length} players for Brevo`)
  }

  const counts = {
    active:   players.filter(p => p.status === 'active').length,
    waitlist: players.filter(p => p.status === 'waitlist').length,
    dropped:  players.filter(p => p.status === 'dropped').length,
  }

  const responseCounts = {
    yes:     players.filter(p => p.invite_response === 'yes').length,
    no:      players.filter(p => p.invite_response === 'no').length,
    pending: players.filter(p => p.status !== 'dropped' && !p.invite_response).length,
  }

  const filtered = players.filter(p => p.status === tab)

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 32, color: '#D4A53A', letterSpacing: 4 }}>Player Roster</h1>
        <p style={{ color: 'var(--tx3)', fontSize: 13 }}>
          {counts.active} active · {counts.waitlist} waitlisted · {counts.dropped} dropped
        </p>
      </div>

      {/* Invite response summary */}
      {(responseCounts.yes + responseCounts.no) > 0 && (
        <div className="glass" style={{ padding: '16px 20px', marginBottom: 16, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: 'var(--tx3)', textTransform: 'uppercase' }}>
            Invite Responses
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <span style={{ fontSize: 13, color: '#22c55e', fontWeight: 700 }}>✅ {responseCounts.yes} In</span>
            <span style={{ fontSize: 13, color: '#ef4444', fontWeight: 700 }}>❌ {responseCounts.no} Out</span>
            <span style={{ fontSize: 13, color: 'var(--tx3)' }}>⏳ {responseCounts.pending} No reply</span>
          </div>
        </div>
      )}

      {/* Status tabs + export */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {STATUS_TABS.map(({ id, label, emoji }) => (
          <button key={id} onClick={() => { setTab(id); setSelected(new Set()) }} className={`pill-tab ${tab === id ? 'active' : ''}`}>
            {emoji} {label} ({counts[id]})
          </button>
        ))}
        <button
          onClick={exportBrevoCSV}
          style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 999,
            background: 'rgba(212,165,58,0.1)', border: '1px solid rgba(212,165,58,0.3)',
            color: '#D4A53A', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Download size={12} /> Export for Brevo
        </button>
      </div>

      {/* Waitlist bulk-select toolbar */}
      {tab === 'waitlist' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => {
              if (selected.size === filtered.length) {
                setSelected(new Set())
              } else {
                setSelected(new Set(filtered.map(p => p.id)))
              }
            }}
            style={{
              padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600,
              background: 'var(--surf2)', border: '1px solid var(--bdr2)',
              color: 'var(--tx2)', cursor: 'pointer',
            }}
          >
            {selected.size === filtered.length && filtered.length > 0 ? 'Deselect All' : 'Select All'}
          </button>
          {selected.size > 0 && (
            <button
              onClick={activateSelected}
              disabled={activating}
              className="btn-gold"
              style={{ padding: '6px 18px', fontSize: 13 }}
            >
              {activating ? 'Activating…' : `✅ Activate Selected (${selected.size})`}
            </button>
          )}
          {returningIds.size > 0 && selected.size === 0 && (
            <span style={{ fontSize: 12, color: 'var(--tx3)' }}>
              ↩ {filtered.filter(p => returningIds.has(p.id)).length} returning from last year
            </span>
          )}
        </div>
      )}

      {/* Player list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 && (
          <div className="glass" style={{ padding: 40, textAlign: 'center', color: 'var(--tx4)' }}>
            No {tab} players
          </div>
        )}
        {filtered.map(player => {
          const isExpanded = expanded === player.id
          const resp = player.invite_response ? responseLabel[player.invite_response] : null
          const isReturning = returningIds.has(player.id)
          const isChecked = selected.has(player.id)
          return (
            <div key={player.id} className="glass" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                {/* Checkbox for waitlist tab */}
                {tab === 'waitlist' && (
                  <div
                    onClick={() => toggleSelect(player.id)}
                    style={{
                      width: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', flexShrink: 0, alignSelf: 'stretch',
                    }}
                  >
                    <div style={{
                      width: 18, height: 18, borderRadius: 5,
                      border: `2px solid ${isChecked ? '#D4A53A' : 'var(--bdr2)'}`,
                      background: isChecked ? 'rgba(212,165,58,0.2)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s',
                    }}>
                      {isChecked && <span style={{ fontSize: 11, color: '#D4A53A', lineHeight: 1 }}>✓</span>}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setExpanded(isExpanded ? null : player.id)}
                  style={{
                    flex: 1, background: 'none', border: 'none', cursor: 'pointer',
                    padding: tab === 'waitlist' ? '14px 18px 14px 4px' : '14px 18px',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}
                >
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 700, color: 'var(--tx1)', fontSize: 15 }}>{player.name}</span>
                      {/* "↩ Returning" badge for waitlisted players who played last year */}
                      {tab === 'waitlist' && isReturning && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, color: '#D4A53A',
                          background: 'rgba(212,165,58,0.15)', border: '1px solid rgba(212,165,58,0.35)',
                          padding: '2px 7px', borderRadius: 999, whiteSpace: 'nowrap',
                        }}>
                          ↩ Returning
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 2 }}>
                      HCP {player.handicap ?? '—'} {player.email && `· ${player.email}`}
                    </div>
                  </div>

                  {/* Invite response badge */}
                  {resp && (
                    <div style={{
                      fontSize: 11, fontWeight: 700, color: resp.color,
                      background: `${resp.color}18`,
                      padding: '3px 8px', borderRadius: 999,
                      whiteSpace: 'nowrap',
                    }}>
                      {resp.icon} {resp.text}{player.invite_response_at ? ` · ${fmt(player.invite_response_at)}` : ''}
                    </div>
                  )}

                  <div style={{
                    fontSize: 11, fontWeight: 700,
                    color: statusColor[player.status as keyof typeof statusColor],
                    background: `${statusColor[player.status as keyof typeof statusColor]}20`,
                    padding: '4px 10px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: 1,
                  }}>
                    {player.status}
                  </div>
                  {isExpanded
                    ? <ChevronUp size={14} color="var(--tx3)" />
                    : <ChevronDown size={14} color="var(--tx3)" />}
                </button>
              </div>

              {isExpanded && (
                <div style={{ padding: '0 18px 18px', borderTop: '1px solid var(--bdr)' }}>
                  {/* Status actions */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 16, paddingTop: 14, flexWrap: 'wrap' }}>
                    {player.status !== 'active' && (
                      <button onClick={() => setStatus(player.id, 'active')} style={actionBtn('#22c55e')}>✅ Activate</button>
                    )}
                    {player.status !== 'waitlist' && (
                      <button onClick={() => setStatus(player.id, 'waitlist')} style={actionBtn('#f59e0b')}>⏳ Waitlist</button>
                    )}
                    {player.status !== 'dropped' && (
                      <button onClick={() => setStatus(player.id, 'dropped')} style={actionBtn('#ef4444')}>❌ Drop</button>
                    )}
                  </div>

                  {/* Editable fields */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                    <div>
                      <label style={lblStyle}>Name</label>
                      <input type="text" defaultValue={player.name}
                        onBlur={e => { if (e.target.value !== player.name) updatePlayer(player.id, { name: e.target.value }) }} />
                    </div>
                    <div>
                      <label style={lblStyle}>Handicap</label>
                      <input type="number" defaultValue={player.handicap ?? ''}
                        onBlur={e => { const v = +e.target.value; if (v !== player.handicap) updatePlayer(player.id, { handicap: v || null }) }} />
                    </div>
                    <div>
                      <label style={lblStyle}>Phone</label>
                      <input type="tel" defaultValue={player.phone ?? ''}
                        onBlur={e => { if (e.target.value !== (player.phone ?? '')) updatePlayer(player.id, { phone: e.target.value || null }) }} />
                    </div>
                    <div style={{ gridColumn: '1/-1' }}>
                      <label style={lblStyle}>Notes</label>
                      <input type="text" placeholder="Any notes..." defaultValue={player.notes ?? ''}
                        onBlur={e => { if (e.target.value !== (player.notes ?? '')) updatePlayer(player.id, { notes: e.target.value || null }) }} />
                    </div>
                  </div>

                  {/* Invite token (for manual use) */}
                  {player.invite_token && (
                    <div style={{ marginTop: 12 }}>
                      <label style={lblStyle}>Invite Token</label>
                      <div style={{
                        fontFamily: 'monospace', fontSize: 11, color: 'var(--tx4)',
                        background: 'var(--surf)', border: '1px solid var(--bdr)',
                        borderRadius: 6, padding: '6px 10px', wordBreak: 'break-all',
                      }}>
                        {player.invite_token}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Reset Roster danger zone */}
      {tab === 'active' && counts.active > 0 && (
        <div style={{ marginTop: 32, padding: '20px', borderRadius: 14, border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.05)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', marginBottom: 6 }}>Reset Roster</div>
          <p style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 14 }}>
            Moves all active players back to waitlist. Use this at the start of a new season to hand-pick this year's lineup.
          </p>
          {!resetConfirm ? (
            <button
              onClick={() => setResetConfirm(true)}
              style={{
                padding: '8px 18px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                background: 'transparent', border: '1px solid rgba(239,68,68,0.5)',
                color: '#ef4444', cursor: 'pointer',
              }}
            >
              Reset Roster ({counts.active} players)
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--tx2)' }}>Move {counts.active} players to waitlist?</span>
              <button
                onClick={resetRoster}
                disabled={resetting}
                style={{
                  padding: '8px 18px', borderRadius: 999, fontSize: 13, fontWeight: 700,
                  background: '#ef4444', border: 'none', color: '#fff', cursor: 'pointer',
                }}
              >
                {resetting ? 'Resetting…' : 'Yes, Reset'}
              </button>
              <button
                onClick={() => setResetConfirm(false)}
                style={{
                  padding: '8px 18px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                  background: 'transparent', border: '1px solid var(--bdr2)',
                  color: 'var(--tx2)', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const lblStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--tx3)', display: 'block', marginBottom: 4,
}

function actionBtn(color: string): React.CSSProperties {
  return {
    padding: '8px 16px', borderRadius: 8,
    background: `${color}18`, border: `1px solid ${color}55`,
    color, cursor: 'pointer', fontSize: 13, fontWeight: 600,
  }
}
