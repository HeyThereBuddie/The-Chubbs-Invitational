import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatDistanceToNow } from 'date-fns'
import { useYear } from '../context/YearContext'

interface FeedEvent {
  id: string
  event_type: 'score' | 'chulligan' | 'putt' | 'contest'
  team_name: string
  voter_name: string | null
  player_name: string | null
  hole: number
  score: number | null
  label: string
  emoji: string
  created_at: string
}

const SCORE_COLORS: Record<string, string> = {
  'Hole in One!': '#3b82f6',
  'Eagle':        '#86efac',
  'Birdie':       '#4ade80',
  'Par':          '#22c55e',
  'Bogey':        '#ef4444',
  'Double':       '#dc2626',
}

function eventColor(ev: FeedEvent) {
  if (ev.event_type === 'contest') return '#FCB514'
  if (ev.event_type === 'chulligan') return '#f59e0b'
  if (ev.event_type === 'putt') {
    if (ev.label === '3-Putt') return '#fb923c'
    if (ev.label === '4-Putt') return '#ea580c'
    return '#c2410c'
  }
  if (ev.label.startsWith('+')) return '#991b1b'
  return SCORE_COLORS[ev.label] ?? '#ef4444'
}

function isHighlight(ev: FeedEvent) {
  return ev.event_type === 'contest' || ev.event_type === 'chulligan' || ev.event_type === 'putt' || ['Hole in One!', 'Eagle', 'Birdie'].includes(ev.label)
}

type FilterType = 'golf' | 'contests' | 'jackass'

export default function LiveFeed() {
  const { effectiveTournamentId, isCurrentYear } = useYear()
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedFilter, setSelectedFilter] = useState<FilterType | null>(null)

  const filtered = useMemo(() => {
    if (!selectedFilter) return events
    if (selectedFilter === 'golf')
      return events.filter(e => e.event_type === 'score' || e.event_type === 'putt' || e.event_type === 'chulligan')
    if (selectedFilter === 'contests')
      return events.filter(e => e.event_type === 'contest' && (e.label === 'CTP Entry' || e.label === 'LD Entry'))
    if (selectedFilter === 'jackass')
      return events.filter(e => e.event_type === 'contest' && (e.label === 'Jackass Vote' || e.label === 'Vote Changed'))
    return events
  }, [events, selectedFilter])

  const fetchEvents = async () => {
    let q = supabase.from('feed_events').select('*').order('created_at', { ascending: false }).limit(200)
    if (effectiveTournamentId) q = q.eq('tournament_id', effectiveTournamentId)
    const { data } = await q
    setEvents((data ?? []) as FeedEvent[])
    setLoading(false)
  }

  useEffect(() => {
    fetchEvents()

    if (!isCurrentYear) return

    const channel = supabase
      .channel('feed_events_livefeed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'feed_events' }, payload => {
        setEvents(prev => [payload.new as FeedEvent, ...prev].slice(0, 200))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'feed_events' }, () => {
        fetchEvents()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveTournamentId, isCurrentYear])

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <div className="glass" style={{ padding: '20px 24px', marginBottom: 20, borderRadius: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>⚡</span>
          <div>
            <div style={{ fontFamily: 'Bebas Neue', fontSize: 26, color: '#FCB514', letterSpacing: 3, lineHeight: 1 }}>
              Live Feed
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: 2, textTransform: 'uppercase', marginTop: 2 }}>
              All tournament events
            </div>
          </div>
          {isCurrentYear ? (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="animate-pulseDot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: '#22c55e', letterSpacing: 1.5, textTransform: 'uppercase' }}>Live</span>
            </div>
          ) : (
            <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: 'rgba(252,181,20,0.6)', letterSpacing: 1.5, textTransform: 'uppercase' }}>🔒 Archived</span>
          )}
        </div>
      </div>

      <div style={{ marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
        <div style={{ display: 'flex', gap: 8, minWidth: 'max-content' }}>
          {([
            { id: null,       label: 'All' },
            { id: 'golf',     label: '⛳ Golf' },
            { id: 'contests', label: '🎯 Contests' },
            { id: 'jackass',  label: '🤠 Jackass Award' },
          ] as const).map(({ id, label }) => (
            <button
              key={String(id)}
              className={selectedFilter === id ? 'pill-tab active' : 'pill-tab'}
              onClick={() => setSelectedFilter(prev => prev === id ? null : id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="glass" style={{ padding: 0, overflow: 'hidden', borderRadius: 16 }}>
        {loading ? (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <div className="animate-spin" style={{ width: 32, height: 32, border: '3px solid rgba(252,181,20,0.2)', borderTopColor: '#FCB514', borderRadius: '50%', margin: '0 auto' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⛳</div>
            <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.35)' }}>
              {selectedFilter === 'golf' ? 'No golf events yet'
                : selectedFilter === 'contests' ? 'No contest entries yet'
                : selectedFilter === 'jackass' ? 'No votes yet'
                : 'No events yet'}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', marginTop: 6 }}>Events appear here as scores and chulligans are recorded</div>
          </div>
        ) : (
          filtered.map((ev, i) => {
            const color = eventColor(ev)
            const highlight = isHighlight(ev)
            return (
              <div key={ev.id} style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px',
                borderBottom: i < filtered.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                background: highlight ? 'rgba(252,181,20,0.02)' : 'transparent',
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: highlight ? 'rgba(252,181,20,0.1)' : 'rgba(255,255,255,0.04)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18,
                }}>{ev.emoji}</div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: 1.2 }}>
                      {ev.label}
                    </span>
                    {ev.event_type === 'contest' && ev.label.includes('Vote') ? (
                      <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                        <strong style={{ color: '#fff', fontWeight: 700 }}>{ev.voter_name}</strong>
                        {' voted '}
                        <strong style={{ color: '#FCB514', fontWeight: 700 }}>{ev.player_name}</strong>
                        {' for jackass'}
                      </span>
                    ) : ev.event_type === 'contest' ? (
                      ev.player_name && (
                        <span style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>{ev.player_name}</span>
                      )
                    ) : (
                      <>
                        <span style={{ fontWeight: 700, fontSize: 14, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {ev.team_name || 'Unknown Team'}
                        </span>
                        {ev.player_name && (
                          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
                            {ev.player_name}
                          </span>
                        )}
                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
                          Hole {ev.hole}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {ev.score != null && ev.event_type === 'score' && (
                    <div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 1 }}>Score</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color, fontFamily: 'Bebas Neue', letterSpacing: 1 }}>
                        {ev.score}
                      </div>
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)' }}>
                    {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
