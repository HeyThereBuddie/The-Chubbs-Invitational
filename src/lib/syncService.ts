import { supabase } from './supabase'
import { localDb } from './localDb'

export async function syncAll(tournamentId: string): Promise<void> {
  const [
    { data: teams },
    { data: profiles },
    { data: scores },
    { data: chulligans },
    { data: teeTimes },
    { data: contestEntries },
    { data: leaheyVotes },
    { data: feedEvents },
    { data: pairings },
  ] = await Promise.all([
    supabase.from('teams')
      .select('*, player1:profiles!teams_p1_id_fkey(*), player2:profiles!teams_p2_id_fkey(*)')
      .eq('tournament_id', tournamentId),
    supabase.from('profiles').select('*').eq('status', 'active'),
    supabase.from('scores').select('*'),
    supabase.from('chulligans').select('id, team_id, player_id, hole'),
    supabase.from('tee_times')
      .select('*, team:teams(*, player1:profiles!teams_p1_id_fkey(*), player2:profiles!teams_p2_id_fkey(*))')
      .order('tee_time'),
    supabase.from('contest_entries')
      .select('*, player:profiles(*)')
      .eq('tournament_id', tournamentId),
    supabase.from('leahey_votes').select('*').eq('tournament_id', tournamentId),
    supabase.from('feed_events')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('pairings')
      .select('*, player_a:profiles!pairings_player_a_id_fkey(*), player_b:profiles!pairings_player_b_id_fkey(*)')
      .order('generated_at', { ascending: false }),
  ])

  await localDb.transaction('rw', [
    localDb.teams, localDb.profiles, localDb.scores, localDb.chulligans,
    localDb.tee_times, localDb.contest_entries, localDb.leahey_votes,
    localDb.feed_events, localDb.feed_reactions, localDb.pairings, localDb.sync_meta,
  ], async () => {
    if (teams?.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await localDb.teams.bulkPut(teams.map((t: any) => ({
        id: t.id, name: t.name, tournament_id: t.tournament_id,
        p1_id: t.p1_id ?? null, p2_id: t.p2_id ?? null,
        player1_json: t.player1 ? JSON.stringify(t.player1) : null,
        player2_json: t.player2 ? JSON.stringify(t.player2) : null,
      })))
    }
    if (profiles?.length) await localDb.profiles.bulkPut(profiles)
    if (scores?.length)   await localDb.scores.bulkPut(scores)
    if (chulligans?.length) await localDb.chulligans.bulkPut(chulligans)
    if (teeTimes?.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await localDb.tee_times.bulkPut(teeTimes.map((t: any) => ({
        id: t.id, team_id: t.team_id ?? null, tee_time: t.tee_time,
        starting_hole: t.starting_hole ?? null, cart: t.cart ?? null, notes: t.notes ?? null,
        team_json: t.team ? JSON.stringify(t.team) : null,
      })))
    }
    if (contestEntries?.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await localDb.contest_entries.bulkPut(contestEntries.map((e: any) => ({
        id: e.id, type: e.type, player_id: e.player_id,
        hole: e.hole ?? null, distance: e.distance ?? null, photo_url: e.photo_url ?? null,
        created_at: e.created_at, tournament_id: tournamentId,
        player_json: e.player ? JSON.stringify(e.player) : null,
      })))
    }
    if (leaheyVotes?.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await localDb.leahey_votes.bulkPut(leaheyVotes.map((v: any) => ({ ...v, tournament_id: tournamentId })))
    }
    if (feedEvents?.length) {
      await localDb.feed_events.bulkPut(feedEvents)
      const eventIds = feedEvents.map((e: { id: string }) => e.id)
      const { data: reactions } = await supabase
        .from('feed_reactions').select('event_id, player_id, emoji')
        .in('event_id', eventIds)
      if (reactions?.length) {
        await localDb.feed_reactions.bulkPut(
          reactions.map((r: { event_id: string; player_id: string; emoji: string }) => ({
            id: `${r.event_id}:${r.player_id}:${r.emoji}`,
            event_id: r.event_id, player_id: r.player_id, emoji: r.emoji,
          }))
        )
      }
    }
    if (pairings?.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await localDb.pairings.bulkPut(pairings.map((p: any) => ({
        id: p.id, player_a_id: p.player_a_id, player_b_id: p.player_b_id,
        team_name: p.team_name ?? null, generated_at: p.generated_at,
        player_a_json: p.player_a ? JSON.stringify(p.player_a) : null,
        player_b_json: p.player_b ? JSON.stringify(p.player_b) : null,
      })))
    }

    await localDb.sync_meta.put({ key: 'lastSynced', value: new Date().toISOString() })
    await localDb.sync_meta.put({ key: 'syncedTournamentId', value: tournamentId })
  })
}
