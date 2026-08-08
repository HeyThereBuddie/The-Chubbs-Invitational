import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { useYear } from './YearContext'
import { syncAll } from '../lib/syncService'
import { localDb } from '../lib/localDb'
import { drainQueue, getPendingCount } from '../lib/writeQueue'
import { precacheMapTiles } from '../lib/precacheMapTiles'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined

interface SyncContextValue {
  isOnline: boolean
  isSyncing: boolean
  lastSynced: Date | null
  pendingCount: number
  refreshPendingCount: () => Promise<void>
}

const SyncContext = createContext<SyncContextValue>({
  isOnline: true,
  isSyncing: false,
  lastSynced: null,
  pendingCount: 0,
  refreshPendingCount: async () => {},
})

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { effectiveTournamentId } = useYear()
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSynced, setLastSynced] = useState<Date | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const syncedForRef = useRef<string | null>(null)

  const refreshPendingCount = useCallback(async () => {
    setPendingCount(await getPendingCount())
  }, [])

  const runSync = useCallback(async (tournamentId: string) => {
    if (!navigator.onLine) return
    setIsSyncing(true)
    try {
      await drainQueue()
      await syncAll(tournamentId)
      syncedForRef.current = tournamentId
      setLastSynced(new Date())
      setPendingCount(await getPendingCount())

      // Pre-fetch satellite tiles for the course so the GPS map works offline.
      // Runs in background — never blocks or throws into the sync error handler.
      if (MAPBOX_TOKEN) {
        localDb.course_gps.get(tournamentId).then(cached => {
          if (cached?.lat && cached?.lng) {
            precacheMapTiles(cached.lat, cached.lng, cached.holes_json, MAPBOX_TOKEN!).catch(() => {})
          }
        }).catch(() => {})
      }
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
    getPendingCount().then(setPendingCount)
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

  // Listen for Background Sync messages from the service worker (Chrome/Android)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'SW_SYNC_QUEUE' && effectiveTournamentId) {
        runSync(effectiveTournamentId)
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [effectiveTournamentId, runSync])

  return (
    <SyncContext.Provider value={{ isOnline, isSyncing, lastSynced, pendingCount, refreshPendingCount }}>
      {children}
    </SyncContext.Provider>
  )
}

export const useSyncContext = () => useContext(SyncContext)
