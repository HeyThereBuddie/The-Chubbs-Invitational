import Dexie, { type Table } from 'dexie'

export interface LocalTeam {
  id: string
  name: string
  tournament_id: string
  p1_id: string | null
  p2_id: string | null
  player1_json: string | null
  player2_json: string | null
}

export interface LocalProfile {
  id: string
  name: string | null
  nickname: string | null
  email: string | null
  role: string | null
  handicap: number | null
  status: string | null
  team_id: string | null
  avatar_url: string | null
  phone: string | null
  notes: string | null
}

export interface LocalScore {
  id: string
  team_id: string
  hole: number
  score: number
  putts: number | null
  drive_used_id: string | null
  updated_at: string | null
}

export interface LocalChulligan {
  id: string
  team_id: string
  player_id: string
  hole: number
}

export interface LocalTeeTime {
  id: string
  team_id: string | null
  tee_time: string
  starting_hole: number | null
  cart: boolean | null
  notes: string | null
  team_json: string | null
}

export interface LocalContestEntry {
  id: string
  type: string
  player_id: string
  hole: number | null
  distance: number | null
  photo_url: string | null
  created_at: string
  tournament_id: string
  player_json: string | null
}

export interface LocalLeaheyVote {
  id: string
  voter_id: string
  nominee_id: string
  created_at: string
  tournament_id: string
}

export interface LocalFeedEvent {
  id: string
  event_type: string
  team_name: string | null
  voter_name: string | null
  player_name: string | null
  hole: number | null
  score: number | null
  label: string
  emoji: string
  created_at: string
  tournament_id: string
}

export interface LocalFeedReaction {
  id: string
  event_id: string
  player_id: string
  emoji: string
}

export interface LocalPairing {
  id: string
  player_a_id: string
  player_b_id: string
  team_name: string | null
  generated_at: string
  player_a_json: string | null
  player_b_json: string | null
}

export interface SyncMeta {
  key: string
  value: string
}

class ChubbsLocalDB extends Dexie {
  teams!: Table<LocalTeam>
  profiles!: Table<LocalProfile>
  scores!: Table<LocalScore>
  chulligans!: Table<LocalChulligan>
  tee_times!: Table<LocalTeeTime>
  contest_entries!: Table<LocalContestEntry>
  leahey_votes!: Table<LocalLeaheyVote>
  feed_events!: Table<LocalFeedEvent>
  feed_reactions!: Table<LocalFeedReaction>
  pairings!: Table<LocalPairing>
  sync_meta!: Table<SyncMeta>

  constructor() {
    super('chubbs-memorial')
    this.version(1).stores({
      teams:           'id, tournament_id',
      profiles:        'id, status',
      scores:          'id, team_id',
      chulligans:      'id, team_id, player_id',
      tee_times:       'id',
      contest_entries: 'id, type, tournament_id',
      leahey_votes:    'id, voter_id, tournament_id',
      feed_events:     'id, tournament_id, event_type',
      feed_reactions:  'id, event_id',
      pairings:        'id',
      sync_meta:       'key',
    })
  }
}

export const localDb = new ChubbsLocalDB()

// Helper: parse a player/team JSON blob stored in local DB
export function parseJson<T>(json: string | null): T | undefined {
  if (!json) return undefined
  try { return JSON.parse(json) as T } catch { return undefined }
}
