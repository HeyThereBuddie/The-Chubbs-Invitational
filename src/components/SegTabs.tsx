import { useEffect, useRef, type ReactNode, type HTMLAttributes } from 'react'

// A tab bar with a single green indicator that slides under the active tab.
// Drop-in for the existing `.pill-tabs` markup: keep the same `.pill-tab`/`active`
// buttons as children and pass the current value as `active` so it re-measures.
interface Props extends HTMLAttributes<HTMLDivElement> {
  active: string | number | null
  children: ReactNode
}

export function SegTabs({ active, children, className, ...rest }: Props) {
  const barRef = useRef<HTMLDivElement>(null)
  const indRef = useRef<HTMLSpanElement>(null)
  const first = useRef(true)

  useEffect(() => {
    const bar = barRef.current, ind = indRef.current
    if (!bar || !ind) return
    const el = bar.querySelector<HTMLElement>('.pill-tab.active')
    if (!el) { ind.style.opacity = '0'; return }
    const move = () => {
      ind.style.left = `${el.offsetLeft}px`
      ind.style.width = `${el.offsetWidth}px`
      ind.style.opacity = '1'
    }
    if (first.current) {
      // First paint: jump into place with no slide-in from the left edge.
      ind.style.transition = 'none'
      move()
      requestAnimationFrame(() => requestAnimationFrame(() => { ind.style.transition = '' }))
      first.current = false
    } else {
      move()
    }
    // keep it aligned when the label reflows or the bar resizes
    el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [active])

  useEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const onResize = () => {
      const el = bar.querySelector<HTMLElement>('.pill-tab.active'), ind = indRef.current
      if (el && ind) { ind.style.left = `${el.offsetLeft}px`; ind.style.width = `${el.offsetWidth}px` }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <div ref={barRef} className={`pill-tabs seg${className ? ` ${className}` : ''}`} {...rest}>
      <span ref={indRef} className="pill-tabs__ind" aria-hidden="true" />
      {children}
    </div>
  )
}
