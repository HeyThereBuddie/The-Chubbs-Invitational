import { DEFAULT_PARS } from './pars'
import type { ClubDist } from './clubs'

export type Role = 'admin' | 'player'

export interface Profile {
  id: string
  name: string
  nickname: string | null
  email: string
  role: Role
  handicap: number | null
  joined_at: string
  team_id: string | null
  status: 'active' | 'waitlist' | 'dropped'
  notes: string | null
  phone: string | null
  avatar_url: string | null
  invite_token: string | null
  invite_response: 'yes' | 'no' | null
  invite_response_at: string | null
  club_distances?: ClubDist[] | null
}

export function displayName(p: Pick<Profile, 'name' | 'nickname'>): string {
  return (p.nickname?.trim()) || p.name
}

// Profile IS the player — one unified record per person
export type Player = Profile

export interface Foursome {
  id: string
  team_a_id: string
  team_b_id: string
  created_at: string
}

export interface ScoreApproval {
  id: string
  score_id: string
  approving_team_id: string
  approved_at: string
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
  putts: number | null
  drive_used_id: string | null
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
  distance_yds?: number | null   // GPS-measured (LD: drive yards, CTP: yards to pin)
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

export const COURSE_PAR = DEFAULT_PARS.reduce((a, b) => a + b, 0)
export const COURSE_NAME = 'TBD Golf Club'
export const TOURNAMENT_DATE = 'Summer 2025'
export const FIRST_TEE_TIME = '8:00 AM'

export const CHUBBS_QUOTES = [
  "It's all in the hips. It's all in the hips.",
  "You're gonna be a golf legend, Happy.",
  "That's a little more like it.",
  "Don't worry about Bob Barker. He's got enough problems.",
  "You've got game, kid. Raw, ugly, terrifying game.",
  "Happy Gilmore, the most unique golfer I have ever seen.",
  "Keep your head down and follow through.",
  "I would have been a pro if it wasn't for those damn alligators.",
  "Just tap it in. Give it a little tappy.",
  "You're learning, big guy. You're learning.",
  "A good attitude and a good short game — that's all it takes.",
  "Easy, big fella. The ball's not going anywhere.",
  "Relax. Let the club do the work.",
  "Every great golfer starts somewhere.",
  "That swing's going to break some hearts out there.",
]

export const ALL_QUOTES: { quote: string; by: string }[] = [
  { quote: "It's all in the hips. It's all in the hips.", by: "Chubbs Peterson" },
  { quote: "You're gonna be a golf legend, Happy.", by: "Chubbs Peterson" },
  { quote: "I would have been a pro if it wasn't for those damn alligators.", by: "Chubbs Peterson" },
  { quote: "Don't worry about Bob Barker. He's got enough problems.", by: "Chubbs Peterson" },
  { quote: "You've got game, kid. Raw, ugly, terrifying game.", by: "Chubbs Peterson" },
  { quote: "The price is wrong, Bob!", by: "Happy Gilmore" },
  { quote: "Just tap it in. Just tap it in. Give it a little tappy. Tap-tap-taparoo.", by: "Happy Gilmore" },
  { quote: "I'm going to have to use my imaginary hockey skates here.", by: "Happy Gilmore" },
  { quote: "You're in my world now, Grandma!", by: "Happy Gilmore" },
  { quote: "Relax. Let the club do the work.", by: "Chubbs Peterson" },
  { quote: "Every great golfer starts somewhere.", by: "Chubbs Peterson" },
  { quote: "Happy Gilmore — the most unique golfer I have ever seen.", by: "Chubbs Peterson" },
]

// ── GPS types ──────────────────────────────────────────────────────────────

export interface LatLng { lat: number; lng: number }

export interface HoleGps {
  hole: number
  par?: number | null              // course-specific par (falls back to DEFAULT_PARS)
  tee: LatLng | null
  green: {
    front:  LatLng | null
    center: LatLng | null
    back:   LatLng | null
  }
  fairway?: LatLng[][] | null
  bunkers?: LatLng[][] | null
  water?:   LatLng[][] | null
  landingZone?: LatLng | null      // center of ideal tee-shot landing area
  avoidZones?:  LatLng[][] | null  // danger areas beyond mapped hazards
  tip?: string | null              // AI-generated playing tip
  contest?: 'ctp' | 'ld' | null    // this hole hosts Closest-to-Pin or Longest-Drive
}

// Upgrades holes saved before fairway became LatLng[][] (old format was LatLng[])
export function normalizeFairways(holes: HoleGps[]): HoleGps[] {
  return holes.map(h => {
    if (!h.fairway || h.fairway.length === 0) return h
    const isOldFormat = !Array.isArray((h.fairway as unknown[])[0])
    return isOldFormat ? { ...h, fairway: [h.fairway as unknown as LatLng[]] } : h
  })
}

export interface CourseGps {
  id: string
  name: string
  lat: number | null
  lng: number | null
  holes: HoleGps[]
  created_at: string
}
