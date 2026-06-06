export type Role = 'admin' | 'player'

export interface Profile {
  id: string
  name: string
  email: string
  role: Role
  handicap: number | null
  joined_at: string
}

export interface Player {
  id: string
  name: string
  email: string | null
  handicap: number | null
  rsvp: 'in' | 'pending' | 'out'
  shirt_size: string | null
  notes: string | null
  created_at: string
}

export interface Team {
  id: string
  name: string
  p1_id: string | null
  p2_id: string | null
  created_at: string
  player1?: Player
  player2?: Player
}

export interface Score {
  id: string
  team_id: string
  hole: number
  score: number
  updated_at: string
}

export interface TeeTime {
  id: string
  team_id: string
  tee_time: string
  starting_hole: number
  cart: string | null
  notes: string | null
  team?: Team
}

export interface Update {
  id: string
  title: string
  body: string
  pinned: boolean
  created_at: string
  created_by: string
  author?: Profile
}

export interface Pairing {
  id: string
  player_a_id: string
  player_b_id: string
  team_name: string
  generated_at: string
  player_a?: Player
  player_b?: Player
}

export interface ContestEntry {
  id: string
  type: 'ctp' | 'ld'
  player_id: string
  hole: number
  distance: string
  photo_url: string | null
  created_at: string
  player?: Player
}

export interface LeaheyVote {
  id: string
  voter_id: string
  nominee_id: string
  created_at: string
}

export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Omit<Profile, 'joined_at'>; Update: Partial<Profile> }
      players: { Row: Player; Insert: Omit<Player, 'id' | 'created_at'>; Update: Partial<Player> }
      teams: { Row: Team; Insert: Omit<Team, 'id' | 'created_at'>; Update: Partial<Team> }
      scores: { Row: Score; Insert: Omit<Score, 'id' | 'updated_at'>; Update: Partial<Score> }
      tee_times: { Row: TeeTime; Insert: Omit<TeeTime, 'id'>; Update: Partial<TeeTime> }
      updates: { Row: Update; Insert: Omit<Update, 'id' | 'created_at'>; Update: Partial<Update> }
      pairings: { Row: Pairing; Insert: Omit<Pairing, 'id'>; Update: Partial<Pairing> }
      contest_entries: { Row: ContestEntry; Insert: Omit<ContestEntry, 'id' | 'created_at'>; Update: Partial<ContestEntry> }
      leahey_votes: { Row: LeaheyVote; Insert: Omit<LeaheyVote, 'id' | 'created_at'>; Update: Partial<LeaheyVote> }
    }
  }
}

export const COURSE_PAR = 72
export const COURSE_NAME = 'TBD Golf Club'
export const TOURNAMENT_DATE = 'Summer 2025'
export const FIRST_TEE_TIME = '8:00 AM'

export const CHUBBS_QUOTES = [
  "It's all in the hips. It's all in the hips.",
  "You're gonna be a golf legend, Happy.",
  "That's a little more like it.",
  "I'm the greatest golfer who ever lived.",
  "Don't worry about Bob Barker. He's got enough problems.",
  "You've got game, kid. Raw, ugly, terrifying game.",
  "The price is wrong, Bobby.",
  "Happy Gilmore, the most unique golfer I have ever seen.",
  "Keep your head down and follow through.",
  "I would have been a pro if it wasn't for those damn alligators.",
]
