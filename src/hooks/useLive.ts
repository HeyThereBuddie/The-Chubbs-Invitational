import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Whether the tournament is live (scoring open) vs in pre-launch Preview mode.
// Optimistically starts `live` so nothing flashes "preview" before the flag loads;
// the database write-lock is the real guarantee either way.
export function useLive(): { live: boolean; loading: boolean } {
  const [live, setLive] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data } = await supabase.from('tournament_settings').select('live').eq('id', 1).single()
      if (cancelled) return
      setLive(data?.live !== false)   // treat missing column / null as live
      setLoading(false)
    }
    load()
    // Unique channel name per hook instance — the same page can mount useLive
    // several times (Layout + page + usePlayerScoring), and reusing one channel
    // topic throws on the duplicate subscribe.
    const sub = supabase.channel(`tournament-live-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_settings' }, load)
      .subscribe()
    return () => { cancelled = true; supabase.removeChannel(sub) }
  }, [])

  return { live, loading }
}
