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

const CACHE_KEY = 'chubbs-tournaments-v1'

function readCache(): TournamentOption[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as TournamentOption[]) : []
  } catch { return [] }
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
  const cachedList = readCache()
  const cachedActive = cachedList.find(t => t.status === 'active')?.id ?? null

  const [tournaments, setTournaments] = useState<TournamentOption[]>(cachedList)
  const [activeTournamentId, setActiveTournamentId] = useState<string | null>(cachedActive)
  const [viewingTournamentId, setViewingTournamentId] = useState<string | null>(null)
  const [ready, setReady] = useState(cachedList.length > 0)

  const loadTournaments = async () => {
    try {
      const { data } = await supabase
        .from('tournaments')
        .select('id, year, name, status')
        .is('deleted_at', null)
        .order('year', { ascending: false })
      if (data) {
        localStorage.setItem(CACHE_KEY, JSON.stringify(data))
        const list = data as TournamentOption[]
        setTournaments(list)
        const active = list.find(t => t.status === 'active')
        setActiveTournamentId(active?.id ?? null)
      }
    } catch { /* offline — keep cached values */ }
    setReady(true)
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
