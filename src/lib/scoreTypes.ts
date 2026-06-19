import type { Team, Player } from './types'

export type TeamFull = Team & { player1?: Player; player2?: Player }
export type ScoreRow = { id: string; hole: number; score: number; drive_used_id: string | null; putts: number | null }
export type ChulliganRow = { id: string; player_id: string; hole: number }

export const HOLE_PARS = [5,4,5,3,4,4,3,4,4, 4,4,4,3,5,4,3,5,4] as const

export const SCORE_SELECT = 'id, hole, score, drive_used_id, putts'

export function scoreFeedInfo(score: number, hole: number): { label: string; emoji: string } {
  if (score === 1) return { emoji: '🕳️', label: 'Hole in One!' }
  const par = HOLE_PARS[hole - 1]
  const d = score - par
  if (d <= -2) return { emoji: '🦅', label: 'Eagle' }
  if (d === -1) return { emoji: '🐦', label: 'Birdie' }
  if (d === 0)  return { emoji: '⛳', label: 'Par' }
  if (d === 1)  return { emoji: '😬', label: 'Bogey' }
  if (d === 2)  return { emoji: '😤', label: 'Double' }
  return { emoji: '💥', label: `+${d}` }
}

export function puttFeedInfo(putts: number): { label: string; emoji: string } {
  if (putts >= 5) return { label: `${putts}-Putt`, emoji: '💀' }
  if (putts === 4) return { label: '4-Putt', emoji: '😱' }
  return { label: '3-Putt', emoji: '😰' }
}

export function scoreBubbleClass(score: number, par: number): string {
  if (score === 1) return 'score-hole-in-one'
  const diff = score - par
  if (diff <= -2) return 'score-eagle'
  if (diff === -1) return 'score-birdie'
  if (diff === 0)  return 'score-par'
  if (diff === 1)  return 'score-bogey'
  if (diff === 2)  return 'score-double'
  return 'score-triple-plus'
}

export function isHoleComplete(scoreRow: ScoreRow | undefined, twoPlayers: boolean): boolean {
  if (!scoreRow) return false
  if (scoreRow.putts == null) return false
  if (twoPlayers && !scoreRow.drive_used_id) return false
  return true
}
