import { useState, useCallback } from 'react'

// Keeps a tab selection across refreshes (stored in localStorage under `key`).
// Pass the list of valid values so a stale/removed tab falls back to the default
// instead of rendering a broken/empty page.
export function usePersistedTab<T extends string>(key: string, initial: T, valid: readonly T[]): [T, (v: T) => void] {
  const [tab, setTab] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key) as T | null
      if (stored && valid.includes(stored)) return stored
    } catch { /* ignore */ }
    return initial
  })

  const set = useCallback((v: T) => {
    setTab(v)
    try { localStorage.setItem(key, v) } catch { /* ignore */ }
  }, [key])

  return [tab, set]
}
