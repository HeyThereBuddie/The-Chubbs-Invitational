// Shared "which scores actually count" logic for the leaderboard and Ryder Cup.
// When cross-team approvals are ON, a team's hole score only counts once every
// OTHER team in its foursome has approved it — and that approval must be newer
// than the score's last edit, so any change drops it back off until re-approved.

export type ScoreLite = { id: string; team_id: string; updated_at?: string | null }
export type ApprovalRow = { score_id: string; approving_team_id: string; status: string; updated_at: string }

const tsms = (s?: string | null) => (s ? Date.parse(s) : 0)

// Map each team → the other team(s) sharing its tee time (its foursome).
export function buildGroupMates(teeTimes: { team_id: string; tee_time: string | number }[]): Map<string, string[]> {
  const byTime = new Map<string, string[]>()
  for (const tt of teeTimes) {
    const k = String(tt.tee_time)
    const arr = byTime.get(k) ?? []
    arr.push(tt.team_id)
    byTime.set(k, arr)
  }
  const mates = new Map<string, string[]>()
  for (const arr of byTime.values()) {
    for (const id of arr) mates.set(id, arr.filter(x => x !== id))
  }
  return mates
}

// Set of score ids that are approved (all foursome-mates approved, newer than the
// score's last edit). A team with no foursome-mates counts automatically.
export function approvedScoreIds(
  scores: ScoreLite[],
  approvals: ApprovalRow[],
  groupMates: Map<string, string[]>,
): Set<string> {
  const scoreUpdated = new Map(scores.map(s => [s.id, s.updated_at]))
  const validApprovers = new Map<string, Set<string>>()
  for (const a of approvals) {
    if (a.status !== 'approved') continue
    if (tsms(a.updated_at) < tsms(scoreUpdated.get(a.score_id))) continue  // stale — score changed after
    ;(validApprovers.get(a.score_id) ?? validApprovers.set(a.score_id, new Set()).get(a.score_id)!).add(a.approving_team_id)
  }
  const out = new Set<string>()
  for (const s of scores) {
    const mates = groupMates.get(s.team_id) ?? []
    if (mates.length === 0) { out.add(s.id); continue }  // nobody to approve → it counts
    const appr = validApprovers.get(s.id)
    if (appr && mates.every(m => appr.has(m))) out.add(s.id)
  }
  return out
}
