import { localDb } from './localDb'
import { supabase } from './supabase'

// Payload types for each operation
export type SetScorePayload     = { team_id: string; hole: number; score: number }
export type SetDrivePayload     = { team_id: string; hole: number; drive_used_id: string | null }
export type SetPuttsPayload     = { team_id: string; hole: number; putts: number | null }
export type DeleteScorePayload  = { team_id: string; hole: number }
export type SetChulliganPayload = { team_id: string; player_id: string; hole: number; present: boolean }
export type LogFeedEventPayload = {
  id: string
  event_type: string
  team_id: string | null
  team_name: string
  player_name: string | null
  voter_name: string | null
  hole: number
  score: number | null
  label: string
  emoji: string
  tournament_id: string | null
}
export type UpsertLeaheyVotePayload = {
  voter_id: string
  nominee_id: string
  tournament_id: string | null
}
export type SubmitContestEntryPayload = {
  id: string
  type: 'ctp' | 'ld'
  player_id: string
  tournament_id: string | null
}

type OpPayload =
  | SetScorePayload | SetDrivePayload | SetPuttsPayload
  | DeleteScorePayload | SetChulliganPayload
  | LogFeedEventPayload | UpsertLeaheyVotePayload
  | SubmitContestEntryPayload

// Prevent concurrent drains from running the same write twice
let draining = false

/**
 * Add a write to the queue. Deduplicates: removes any existing pending write
 * with the same op_type + conflict_key before adding the new one (LWW).
 */
export async function enqueue(
  op_type: 'set_score' | 'set_drive' | 'set_putts' | 'delete_score' | 'set_chulligan' | 'log_feed_event' | 'upsert_leahey_vote' | 'submit_contest_entry',
  payload: OpPayload,
  conflict_key: Record<string, unknown>,
): Promise<void> {
  const keyStr = JSON.stringify(conflict_key)
  await localDb.pending_writes
    .where('op_type').equals(op_type)
    .filter(w => w.conflict_key === keyStr)
    .delete()
  await localDb.pending_writes.add({
    op_type,
    payload: JSON.stringify(payload),
    conflict_key: keyStr,
    client_ts: new Date().toISOString(),
    status: 'pending',
  })
  // Register Background Sync so the browser retries even after the tab closes
  // (Chrome/Android only — progressive enhancement, Safari silently ignores)
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    try {
      const reg = await navigator.serviceWorker.ready
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (reg as any).sync.register('drain-write-queue')
    } catch { /* not supported on this browser */ }
  }
}

/**
 * Drain all pending writes. Process in client_ts order.
 * Returns counts of succeeded and failed operations.
 */
export async function drainQueue(): Promise<{ succeeded: number; failed: number }> {
  if (draining) return { succeeded: 0, failed: 0 }
  draining = true

  let succeeded = 0
  let failed = 0

  try {
    const pending = await localDb.pending_writes
      .where('status').equals('pending')
      .sortBy('client_ts')

    for (const write of pending) {
      try {
        await executeWrite(write.op_type, JSON.parse(write.payload))
        await localDb.pending_writes.delete(write.id!)
        succeeded++
      } catch (err) {
        console.error('[writeQueue] failed to sync:', write.op_type, err)
        await localDb.pending_writes.update(write.id!, { retries: (write.retries ?? 0) + 1 })
        failed++
      }
    }
  } finally {
    draining = false
  }

  return { succeeded, failed }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function executeWrite(op_type: string, payload: any): Promise<void> {
  switch (op_type) {
    case 'set_score': {
      const { team_id, hole, score } = payload as SetScorePayload
      const { data: existing } = await supabase
        .from('scores').select('id').eq('team_id', team_id).eq('hole', hole).maybeSingle()
      if (existing?.id) {
        const { error } = await supabase.from('scores').update({ score }).eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('scores').insert({ team_id, hole, score })
        if (error) throw error
      }
      break
    }
    case 'set_drive': {
      const { team_id, hole, drive_used_id } = payload as SetDrivePayload
      const { data: existing } = await supabase
        .from('scores').select('id').eq('team_id', team_id).eq('hole', hole).maybeSingle()
      if (existing?.id) {
        const { error } = await supabase.from('scores').update({ drive_used_id }).eq('id', existing.id)
        if (error) throw error
      }
      break
    }
    case 'set_putts': {
      const { team_id, hole, putts } = payload as SetPuttsPayload
      const { data: existing } = await supabase
        .from('scores').select('id').eq('team_id', team_id).eq('hole', hole).maybeSingle()
      if (existing?.id) {
        const { error } = await supabase.from('scores').update({ putts }).eq('id', existing.id)
        if (error) throw error
      }
      break
    }
    case 'delete_score': {
      const { team_id, hole } = payload as DeleteScorePayload
      const { data: existing } = await supabase
        .from('scores').select('id').eq('team_id', team_id).eq('hole', hole).maybeSingle()
      if (existing?.id) {
        const { error } = await supabase.from('scores').delete().eq('id', existing.id)
        if (error) throw error
      }
      break
    }
    case 'set_chulligan': {
      const { team_id, player_id, hole, present } = payload as SetChulliganPayload
      if (present) {
        await supabase.from('chulligans').delete().eq('team_id', team_id).eq('player_id', player_id)
        const { error } = await supabase.from('chulligans').insert({ team_id, player_id, hole })
        if (error) throw error
      } else {
        const { error } = await supabase.from('chulligans').delete().eq('team_id', team_id).eq('player_id', player_id)
        if (error) throw error
      }
      break
    }
    case 'log_feed_event': {
      const p = payload as LogFeedEventPayload
      const { error } = await supabase.from('feed_events').upsert({
        id: p.id,
        event_type: p.event_type,
        team_id: p.team_id ?? null,
        team_name: p.team_name,
        player_name: p.player_name,
        voter_name: p.voter_name,
        hole: p.hole,
        score: p.score,
        label: p.label,
        emoji: p.emoji,
        ...(p.tournament_id ? { tournament_id: p.tournament_id } : {}),
      }, { onConflict: 'id' })
      if (error) throw error
      break
    }
    case 'upsert_leahey_vote': {
      const { voter_id, nominee_id, tournament_id } = payload as UpsertLeaheyVotePayload
      // Delete any existing vote then insert — handles both new votes and changes idempotently
      await supabase.from('leahey_votes').delete().eq('voter_id', voter_id).eq('tournament_id', tournament_id)
      const { error } = await supabase.from('leahey_votes').insert({ voter_id, nominee_id, tournament_id })
      if (error) throw error
      break
    }
    case 'submit_contest_entry': {
      const { id, type, player_id, tournament_id } = payload as SubmitContestEntryPayload
      // LWW: remove any existing entry for this player + type before inserting
      await supabase.from('contest_entries').delete().eq('type', type).eq('player_id', player_id)
      const { error } = await supabase.from('contest_entries').insert({
        id, type, player_id, hole: 1, distance: '',
        ...(tournament_id ? { tournament_id } : {}),
      })
      if (error) throw error
      break
    }
    default:
      throw new Error(`Unknown op_type: ${op_type}`)
  }
}

export async function getPendingCount(): Promise<number> {
  return localDb.pending_writes.count()
}
