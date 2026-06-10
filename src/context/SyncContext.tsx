import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { useYear } from './YearContext'
import { syncAll } from '../lib/syncService'
import { localDb } from '../lib/localDb'

interface SyncContextValue {
  isOnline: boolean
  isSyncing: boolean
  lastSynced: Date | null
}

const SyncContext = createContext<SyncContextValue>({
  isOnline: true,
  isSyncing: false,
  lastSynced: null,
})

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { effectiveTournamentId } = useYear()
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSynced, setLastSynced] = useState<Date | null>(null)
  const syncedForRef = useRef<string | null>(null)

  const runSync = useCallback(async (tournamentId: string) => {
    if (!navigator.onLine) return
    setIsSyncing(true)
    try {
      await syncAll(tournamentId)
      syncedForRef.current = tournamentId
      setLastSynced(new Date())
    } catch {
      // silent — offline fallback will kick in
    } finally {
      setIsSyncing(false)
    }
  }, [])

  // Restore lastSynced from IndexedDB on mount
  useEffect(() => {
    localDb.sync_meta.get('lastSynced').then(row => {
      if (row) setLastSynced(new Date(row.value))
    })
  }, [])

  // Sync when tournament changes or when coming back online
  useEffect(() => {
    if (!effectiveTournamentId) return
    if (syncedForRef.current === effectiveTournamentId && !isOnline) return
    if (isOnline) runSync(effectiveTournamentId)
  }, [effectiveTournamentId, isOnline, runSync])

  // Online / offline listeners
  useEffect(() => {
    const goOnline  = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online',  goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online',  goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return (
    <SyncContext.Provider value={{ isOnline, isSyncing, lastSynced }}>
      {children}
    </SyncContext.Provider>
  )
}

export const useSyncContext = () => useContext(SyncContext)
