import { localDb } from './localDb'
import { supabase } from './supabase'

// Payload types for each operation
export type SetScorePayload    = { team_id: string; hole: number; score: number }
export type SetDrivePayload    = { team_id: string; hole: number; drive_used_id: string | null }
export type SetPuttsPayload    = { team_id: string; hole: number; putts: number | null }
export type DeleteScorePayload = { team_id: string; hole: number }
export type SetChulliganPayload = { team_id: string; player_id: string; hole: number; present: boolean }

type OpPayload = SetScorePayload | SetDrivePayload | SetPuttsPayload | DeleteScorePayload | SetChulliganPayload

/**
 * Add a write to the queue. Deduplicates: removes any existing pending write
 * with the same op_type + conflict_key before adding the new one (LWW).
 */
export async function enqueue(
  op_type: 'set_score' | 'set_drive' | 'set_putts' | 'delete_score' | 'set_chulligan',
  payload: OpPayload,
  conflict_key: Record<string, unknown>,
): Promise<void> {
  const keyStr = JSON.stringify(conflict_key)
  // Remove older writes for the same operation + key (keep only latest = LWW)
  await localDb.pending_writes
    .where('op_type').equals(op_type)
    .filter(w => w.conflict_key === keyStr && w.status === 'pending')
    .delete()
  await localDb.pending_writes.add({
    op_type,
    payload: JSON.stringify(payload),
    conflict_key: keyStr,
    client_ts: new Date().toISOString(),
    status: 'pending',
  })
}

/**
 * Drain all pending writes. Process in client_ts order.
 * Returns counts of succeeded and failed operations.
 */
export async function drainQueue(): Promise<{ succeeded: number; failed: number }> {
  const pending = await localDb.pending_writes
    .where('status').equals('pending')
    .sortBy('client_ts')

  let succeeded = 0
  let failed = 0

  for (const write of pending) {
    try {
      await executeWrite(write.op_type, JSON.parse(write.payload))
      await localDb.pending_writes.delete(write.id!)
      succeeded++
    } catch (err) {
      console.error('[writeQueue] failed to sync:', write.op_type, err)
      // After 3 failures mark as failed so it doesn't block forever
      if ((write.retries ?? 0) >= 2) {
        await localDb.pending_writes.update(write.id!, { status: 'failed' })
      } else {
        await localDb.pending_writes.update(write.id!, { retries: (write.retries ?? 0) + 1 })
      }
      failed++
    }
  }

  return { succeeded, failed }
}

async function executeWrite(op_type: string, payload: any): Promise<void> {
  switch (op_type) {
    case 'set_score': {
      const { team_id, hole, score } = payload as SetScorePayload
      // Check if score row exists for this team+hole
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
        // Delete any existing chulligan for this player then insert
        await supabase.from('chulligans').delete().eq('team_id', team_id).eq('player_id', player_id)
        const { error } = await supabase.from('chulligans').insert({ team_id, player_id, hole })
        if (error) throw error
      } else {
        const { error } = await supabase.from('chulligans').delete().eq('team_id', team_id).eq('player_id', player_id)
        if (error) throw error
      }
      break
    }
    default:
      throw new Error(`Unknown op_type: ${op_type}`)
  }
}

export async function getPendingCount(): Promise<number> {
  return localDb.pending_writes.where('status').equals('pending').count()
}
