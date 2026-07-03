import type { HoleGps } from './types'

// Single source of truth for par. The default table matches the GPS course
// (Royal Ashburn); per-course pars entered in the admin GPS setup override it.
export const DEFAULT_PARS: number[] = [4, 4, 3, 5, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 5, 4, 4]

// Resolve the par for a hole: the course's own par (from course_gps holes)
// when set, otherwise the default table, otherwise 4.
export function resolvePar(hole: number, courseHoles?: HoleGps[] | null): number {
  const coursePar = courseHoles?.find(h => h.hole === hole)?.par
  return coursePar ?? DEFAULT_PARS[hole - 1] ?? 4
}
