import { createContext, useContext, useState, useCallback } from 'react'
import type { ReactNode } from 'react'

interface ToastContextValue {
  showToast: (msg: string, type?: 'success' | 'error') => void
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} })

interface ToastItem { id: number; msg: string; type: 'success' | 'error' }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, msg, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toasts.map(t => (
        <div
          key={t.id}
          className="toast animate-slideDown"
          style={{ color: t.type === 'error' ? '#ef4444' : '#FCB514' }}
        >
          {t.msg}
        </div>
      ))}
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
