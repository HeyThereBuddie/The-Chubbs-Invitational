import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatDistanceToNow } from 'date-fns'

interface FeedEvent {
  id: string
  event_type: 'score' | 'chulligan' | 'putt'
  team_name: string
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
  return ev.event_type === 'chulligan' || ev.event_type === 'putt' || ['Hole in One!', 'Eagle', 'Birdie'].includes(ev.label)
}

export default function LiveFeed() {
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [loading, setLoading] = useState(true)

  const fetchEvents = async () => {
    const { data } = await supabase
      .from('feed_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
    setEvents((data ?? []) as FeedEvent[])
    setLoading(false)
  }

  useEffect(() => {
    fetchEvents()

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
  }, [])

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
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="animate-pulseDot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: '#22c55e', letterSpacing: 1.5, textTransform: 'uppercase' }}>Live</span>
          </div>
        </div>
      </div>

      <div className="glass" style={{ padding: 0, overflow: 'hidden', borderRadius: 16 }}>
        {loading ? (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <div className="animate-spin" style={{ width: 32, height: 32, border: '3px solid rgba(252,181,20,0.2)', borderTopColor: '#FCB514', borderRadius: '50%', margin: '0 auto' }} />
          </div>
        ) : events.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⛳</div>
            <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.35)' }}>No events yet</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', marginTop: 6 }}>Events appear here as scores and chulligans are recorded</div>
          </div>
        ) : (
          events.map((ev, i) => {
            const color = eventColor(ev)
            const highlight = isHighlight(ev)
            return (
              <div key={ev.id} style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px',
                borderBottom: i < events.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
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
