// Shared "which scores actually count" logic for the leaderboard and Ryder Cup.
//
// When cross-team approvals are ON, a foursome's scores for a hole stay hidden
// until that FOURSOME is fully settled for that hole — i.e. every team in the
// group has posted AND every team has approved every other team's score (mutual).
// Only then do all of that group's scores for that hole count. Gating is strictly
// per-foursome (grouped by tee time) — other foursomes never affect each other.
// An approval only counts if it's newer than the score's last edit, so any change
// drops the group back to "pending" until it's re-approved.

export type ScoreLite = { id: string; team_id: string; hole?: number | null; updated_at?: string | null }
export type ApprovalRow = { score_id: string; approving_team_id: string; status: string; updated_at: string }

const tsms = (s?: string | null) => (s ? Date.parse(s) : 0)

// Map each team → the full list of teams in its foursome (including itself).
export function buildGroups(teeTimes: { team_id: string; tee_time: string | number }[]): Map<string, string[]> {
  const byTime = new Map<string, string[]>()
  for (const tt of teeTimes) {
    const k = String(tt.tee_time)
    const arr = byTime.get(k) ?? []
    arr.push(tt.team_id)
    byTime.set(k, arr)
  }
  const teamGroup = new Map<string, string[]>()
  for (const arr of byTime.values()) {
    for (const id of arr) teamGroup.set(id, arr)
  }
  return teamGroup
}

// Set of score ids that count — every score belonging to a foursome+hole that is
// fully, mutually approved. A team with no foursome-mates counts automatically.
export function approvedScoreIds(
  scores: ScoreLite[],
  approvals: ApprovalRow[],
  teamGroup: Map<string, string[]>,
): Set<string> {
  const scoreUpdated = new Map(scores.map(s => [s.id, s.updated_at]))
  const validApprovers = new Map<string, Set<string>>()
  for (const a of approvals) {
    if (a.status !== 'approved') continue
    if (tsms(a.updated_at) < tsms(scoreUpdated.get(a.score_id))) continue  // stale — score changed after
    ;(validApprovers.get(a.score_id) ?? validApprovers.set(a.score_id, new Set()).get(a.score_id)!).add(a.approving_team_id)
  }

  // Fast lookup: a team's score id for a given hole.
  const scoreByTeamHole = new Map<string, string>()
  for (const s of scores) if (s.hole != null) scoreByTeamHole.set(`${s.team_id}:${s.hole}`, s.id)

  // Is an entire foursome mutually approved for one hole?
  const settledCache = new Map<string, boolean>()
  const groupSettled = (group: string[], hole: number): boolean => {
    if (group.length <= 1) return true  // nobody to approve
    const key = `${[...group].sort().join(',')}:${hole}`
    const cached = settledCache.get(key)
    if (cached !== undefined) return cached
    let ok = true
    for (const g of group) {
      const sid = scoreByTeamHole.get(`${g}:${hole}`)
      if (!sid) { ok = false; break }                          // this team hasn't posted the hole
      const appr = validApprovers.get(sid)
      const mates = group.filter(x => x !== g)
      if (!appr || !mates.every(m => appr.has(m))) { ok = false; break }  // not everyone approved it
    }
    settledCache.set(key, ok)
    return ok
  }

  const out = new Set<string>()
  for (const s of scores) {
    if (s.hole == null) { out.add(s.id); continue }
    const group = teamGroup.get(s.team_id) ?? [s.team_id]
    if (groupSettled(group, s.hole)) out.add(s.id)
  }
  return out
}
