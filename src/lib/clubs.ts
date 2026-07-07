// Club carry distances ("My Bag") + recommendation logic for the GPS screen.
// A player's bag is stored on their profile (club_distances JSONB); when unset we
// fall back to DEFAULT_BAG — average-amateur carries so recommendations work out
// of the box. Recommendations are matched against the *plays-like* distance
// (wind + elevation adjusted), which is the whole point of doing it in-app.

export interface ClubDist {
  club: string   // short label, e.g. "7i", "PW", "Dr"
  carry: number  // carry distance in yards
  enabled: boolean
}

// Long → short. 7i anchored at 150y (the reference for the one-number scaler).
export const DEFAULT_BAG: ClubDist[] = [
  { club: 'Dr',  carry: 230, enabled: true },
  { club: '3W',  carry: 210, enabled: true },
  { club: '5W',  carry: 195, enabled: true },
  { club: 'Hyb', carry: 185, enabled: true },
  { club: '3i',  carry: 190, enabled: true },
  { club: '4i',  carry: 180, enabled: true },
  { club: '5i',  carry: 170, enabled: true },
  { club: '6i',  carry: 160, enabled: true },
  { club: '7i',  carry: 150, enabled: true },
  { club: '8i',  carry: 140, enabled: true },
  { club: '9i',  carry: 130, enabled: true },
  { club: 'PW',  carry: 115, enabled: true },
  { club: 'GW',  carry: 100, enabled: true },
  { club: 'SW',  carry: 85,  enabled: true },
  { club: 'LW',  carry: 70,  enabled: true },
]

const REF_7I = 150

// Scale the whole default bag proportionally so the 7-iron carries `carry7`.
export function scaleBagTo7Iron(carry7: number): ClubDist[] {
  const f = carry7 > 0 ? carry7 / REF_7I : 1
  return DEFAULT_BAG.map(c => ({ ...c, carry: Math.round(c.carry * f) }))
}

// A player's usable bag: their saved distances, or the default when unset/empty.
export function resolveBag(saved: ClubDist[] | null | undefined): ClubDist[] {
  return Array.isArray(saved) && saved.length ? saved : DEFAULT_BAG
}

export interface ClubRec { club: string; note?: string }

// Recommend the club for a target distance (feed it the plays-like number).
// Picks the shortest enabled club that still reaches; flags between-club cases.
export function recommendClub(target: number | null, bag: ClubDist[]): ClubRec | null {
  if (target == null || target <= 0) return null
  const clubs = bag.filter(c => c.enabled && c.carry > 0).sort((a, b) => a.carry - b.carry)
  if (!clubs.length) return null

  const longest = clubs[clubs.length - 1]
  if (target > longest.carry) return { club: longest.club, note: 'or lay up' }

  const idx = clubs.findIndex(c => c.carry >= target)
  const chosen = clubs[idx]
  const prev = idx > 0 ? clubs[idx - 1] : null
  if (prev) {
    const over = chosen.carry - target      // how much the chosen club flies past
    const under = target - prev.carry        // how far the shorter club comes up short
    if (over > 6 && under <= over) return { club: chosen.club, note: `or ${prev.club} hard` }
  }
  return { club: chosen.club }
}
