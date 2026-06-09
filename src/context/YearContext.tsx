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
  setViewingTournamentId: (id: string | null) => void
}

const YearContext = createContext<YearContextValue>({
  tournaments: [],
  activeTournamentId: null,
  viewingTournamentId: null,
  effectiveTournamentId: null,
  isCurrentYear: true,
  setViewingTournamentId: () => {},
})

export function YearProvider({ children }: { children: ReactNode }) {
  const [tournaments, setTournaments] = useState<TournamentOption[]>([])
  const [activeTournamentId, setActiveTournamentId] = useState<string | null>(null)
  const [viewingTournamentId, setViewingTournamentId] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('tournaments')
      .select('id, year, name, status')
      .is('deleted_at', null)
      .order('year', { ascending: false })
      .then(({ data }) => {
        if (!data) return
        setTournaments(data as TournamentOption[])
        const active = (data as TournamentOption[]).find(t => t.status === 'active')
        if (active) setActiveTournamentId(active.id)
      })
  }, [])

  const effectiveTournamentId = viewingTournamentId ?? activeTournamentId
  const isCurrentYear = viewingTournamentId === null || viewingTournamentId === activeTournamentId

  return (
    <YearContext.Provider value={{
      tournaments,
      activeTournamentId,
      viewingTournamentId,
      effectiveTournamentId,
      isCurrentYear,
      setViewingTournamentId,
    }}>
      {children}
    </YearContext.Provider>
  )
}

export function useYear() {
  return useContext(YearContext)
}
