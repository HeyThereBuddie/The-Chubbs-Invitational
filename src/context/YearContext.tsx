import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'

interface TournamentOption {
  id: string
  year: number
  name: string
  status: string
}

interface YearContextValue {
  tournaments: TournamentOption[]
  activeTournamentId: string | null
  viewingTournamentId: string | null
  effectiveTournamentId: string | null
  isCurrentYear: boolean
  ready: boolean
  setViewingTournamentId: (id: string | null) => void
  refreshTournaments: () => void
}

const YearContext = createContext<YearContextValue>({
  tournaments: [],
  activeTournamentId: null,
  viewingTournamentId: null,
  effectiveTournamentId: null,
  isCurrentYear: true,
  ready: false,
  setViewingTournamentId: () => {},
  refreshTournaments: () => {},
})

export function YearProvider({ children }: { children: ReactNode }) {
  const [tournaments, setTournaments] = useState<TournamentOption[]>([])
  const [activeTournamentId, setActiveTournamentId] = useState<string | null>(null)
  const [viewingTournamentId, setViewingTournamentId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  const loadTournaments = () => {
    supabase
      .from('tournaments')
      .select('id, year, name, status')
      .is('deleted_at', null)
      .order('year', { ascending: false })
      .then(({ data }) => {
        const list = (data ?? []) as TournamentOption[]
        setTournaments(list)
        const active = list.find(t => t.status === 'active')
        setActiveTournamentId(active?.id ?? null)
        setReady(true)
      })
  }

  useEffect(() => { loadTournaments() }, [])

  const effectiveTournamentId = viewingTournamentId ?? activeTournamentId
  const isCurrentYear = viewingTournamentId === null || viewingTournamentId === activeTournamentId

  return (
    <YearContext.Provider value={{
      tournaments,
      activeTournamentId,
      viewingTournamentId,
      effectiveTournamentId,
      isCurrentYear,
      ready,
      setViewingTournamentId,
      refreshTournaments: loadTournaments,
    }}>
      {children}
    </YearContext.Provider>
  )
}

export function useYear() {
  return useContext(YearContext)
}
