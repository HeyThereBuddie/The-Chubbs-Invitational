// GPS-tracked shots: types, per-club stats, and a "was it ugly?" helper Chubbs
// uses to rib the player on their previous shot.

export interface Shot {
  id: string
  tournament_id: string | null
  player_id: string
  hole: number | null
  club: string | null
  start_lat: number | null
  start_lng: number | null
  end_lat: number | null
  end_lng: number | null
  distance_yds: number | null
  offline_yds: number | null   // + right of aim, - left
  created_at: string
}

export interface ClubStat {
  club: string
  count: number
  avg: number
  longest: number
  avgOffline: number                        // signed
  tendency: 'left' | 'right' | 'straight'
}

export function clubStats(shots: Shot[]): ClubStat[] {
  const by: Record<string, Shot[]> = {}
  for (const s of shots) {
    if (!s.club || s.distance_yds == null) continue
    ;(by[s.club] ??= []).push(s)
  }
  return Object.entries(by).map(([club, list]) => {
    const dists = list.map(s => s.distance_yds!).filter(d => d > 0)
    const offs = list.map(s => s.offline_yds).filter((o): o is number => o != null)
    const avg = dists.length ? Math.round(dists.reduce((a, b) => a + b, 0) / dists.length) : 0
    const longest = dists.length ? Math.max(...dists) : 0
    const avgOffline = offs.length ? Math.round(offs.reduce((a, b) => a + b, 0) / offs.length) : 0
    const tendency: ClubStat['tendency'] = Math.abs(avgOffline) < 6 ? 'straight' : avgOffline > 0 ? 'right' : 'left'
    return { club, count: dists.length, avg, longest, avgOffline, tendency }
  }).sort((a, b) => b.avg - a.avg)
}

// Was the shot ugly? Used only to let Chubbs poke fun — never to change advice.
// `expectedCarry` is the club's bag distance when known.
export function shotQuality(shot: Shot, expectedCarry?: number | null): { bad: boolean; note: string } {
  const d = shot.distance_yds
  const off = shot.offline_yds
  const parts: string[] = []
  let bad = false
  if (off != null && Math.abs(off) >= 22) {
    bad = true
    parts.push(`${Math.abs(off)}y ${off > 0 ? 'right' : 'left'} of the line`)
  }
  if (d != null && expectedCarry && expectedCarry > 0) {
    const ratio = d / expectedCarry
    if (ratio <= 0.72) { bad = true; parts.push(`came up ~${Math.round(expectedCarry - d)}y short`) }
    else if (ratio >= 1.3) { bad = true; parts.push(`flew it ~${Math.round(d - expectedCarry)}y long`) }
  }
  const desc = `${shot.club ?? 'club'}${d != null ? ` went ${d}y` : ''}${parts.length ? ` (${parts.join(', ')})` : ''}`
  return { bad, note: desc }
}
