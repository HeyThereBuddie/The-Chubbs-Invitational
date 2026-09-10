// Shared team-name label logic so every board reads the same way.
//
// A team label is "LastA & LastB". When a last name is shared by another player
// in the field we add the first initial ("A. Manouk"); if the initial ALSO clashes
// (Andrew/Alex/Anto Manouk) we use the full first name so nobody is ambiguous.

export const lastToken = (name: string) => name.trim().split(/\s+/).slice(-1)[0] || name.trim()

export function shortLabel(fullName: string, pool: string[]): string {
  const last = lastToken(fullName)
  if (!last) return ''
  const clash = pool.filter(n => lastToken(n).toLowerCase() === last.toLowerCase())
  if (clash.length <= 1) return last
  const initial = (fullName.trim()[0] ?? '').toUpperCase()
  const sameInitial = clash.filter(n => (n.trim()[0] ?? '').toUpperCase() === initial)
  if (sameInitial.length <= 1) return `${initial}. ${last}`
  return `${fullName.trim().split(/\s+/)[0]} ${last}`
}

export function makeTeamName(n1: string, n2: string, pool: string[]): string {
  const all = Array.from(new Set([...pool, n1, n2].map(s => s.trim()).filter(Boolean)))
  return `${shortLabel(n1, all)} & ${shortLabel(n2, all)}`
}

// A minimal shape every board already has for a team.
type TeamLike = {
  name?: string | null
  p1_name?: string | null
  p2_name?: string | null
  player1?: { name?: string | null } | null
  player2?: { name?: string | null } | null
}

const memberFull = (p: { name?: string | null } | null | undefined, fallback: string | null | undefined) =>
  (p?.name || fallback || '').trim()

// Every current member name in the field — the disambiguation pool.
export function memberPool(teams: TeamLike[]): string[] {
  return teams.flatMap(t => [memberFull(t.player1, t.p1_name), memberFull(t.player2, t.p2_name)]).filter(Boolean)
}

// The canonical label for a team, computed LIVE from its current members so it can
// never drift from who's actually on the team or from the other boards. Falls back
// to the stored name only if a team has no members yet.
export function teamLabel(t: TeamLike, pool: string[]): string {
  const n1 = memberFull(t.player1, t.p1_name)
  const n2 = memberFull(t.player2, t.p2_name)
  if (!n1 && !n2) return t.name || ''
  if (!n1 || !n2) return (t.name || `${shortLabel(n1 || n2, pool)}`)
  return makeTeamName(n1, n2, pool)
}
