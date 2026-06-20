import { useEffect, useRef, useState } from 'react'

const THRESHOLD = 72 // px of pull needed to trigger

export function usePullToRefresh(onRefresh: () => void | Promise<void>, enabled = true) {
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const startYRef = useRef(0)
  const isPullingRef = useRef(false)
  const pullDistRef = useRef(0)
  const isRefreshingRef = useRef(false)

  useEffect(() => {
    if (!enabled) return

    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY > 0) return
      startYRef.current = e.touches[0].clientY
      isPullingRef.current = true
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!isPullingRef.current) return
      const dy = e.touches[0].clientY - startYRef.current
      if (dy > 0 && window.scrollY === 0) {
        // Rubber-band: slow down pull after threshold
        const clamped = dy < THRESHOLD ? dy : THRESHOLD + (dy - THRESHOLD) * 0.3
        pullDistRef.current = Math.min(clamped, THRESHOLD * 1.6)
        setPullDistance(pullDistRef.current)
        if (dy > 8) e.preventDefault()
      } else {
        pullDistRef.current = 0
        setPullDistance(0)
      }
    }

    const onTouchEnd = async () => {
      if (!isPullingRef.current) return
      isPullingRef.current = false
      const dist = pullDistRef.current
      pullDistRef.current = 0
      setPullDistance(0)

      if (dist >= THRESHOLD && !isRefreshingRef.current) {
        isRefreshingRef.current = true
        setIsRefreshing(true)
        try {
          await onRefresh()
        } finally {
          isRefreshingRef.current = false
          setIsRefreshing(false)
        }
      }
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onTouchEnd, { passive: true })

    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [onRefresh])

  return { pullDistance, isRefreshing }
}
