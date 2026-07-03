import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { localDb } from '../lib/localDb'
import { resolvePar } from '../lib/pars'
import type { HoleGps } from '../lib/types'
import { useYear } from './YearContext'

interface CourseContextValue {
  holes: HoleGps[]
  // Par for a hole: the active course's own par when set, else the default table.
  parOf: (hole: number) => number
  ready: boolean
}

const CourseContext = createContext<CourseContextValue>({
  holes: [],
  parOf: (hole: number) => resolvePar(hole, null),
  ready: false,
})

export function CourseProvider({ children }: { children: ReactNode }) {
  const { effectiveTournamentId } = useYear()
  const [holes, setHoles] = useState<HoleGps[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!effectiveTournamentId) { setHoles([]); setReady(true); return }
    setReady(false)

    // 1. Instant hydrate from the local cache (also populated by syncService).
    localDb.course_gps.get(effectiveTournamentId).then(cached => {
      if (cancelled || !cached) return
      try { setHoles(JSON.parse(cached.holes_json) as HoleGps[]) } catch { /* ignore */ }
    })

    // 2. Refresh from Supabase (same FK-embed pattern GpsPage/syncService use).
    ;(async () => {
      try {
        const { data } = await (supabase.from('tournaments')
          .select('course_gps:course_gps_id(holes)')
          .eq('id', effectiveTournamentId).single() as unknown as Promise<{ data: { course_gps?: { holes?: HoleGps[] } } | null }>)
        const gpsHoles = data?.course_gps?.holes
        if (!cancelled && gpsHoles) setHoles(gpsHoles)
      } catch { /* offline — cached holes already applied */ }
      if (!cancelled) setReady(true)
    })()

    return () => { cancelled = true }
  }, [effectiveTournamentId])

  const parOf = (hole: number) => resolvePar(hole, holes)

  return (
    <CourseContext.Provider value={{ holes, parOf, ready }}>
      {children}
    </CourseContext.Provider>
  )
}

export function useCourse() {
  return useContext(CourseContext)
}
