import type { ReactNode, CSSProperties } from 'react'

// Shared Augusta-green page header — the flag crest + a cream Bebas title, with
// an optional eyebrow and a right-hand slot (for live pills, actions, etc.).
const AUGUSTA = '#0a5c39'
const AUGUSTA_DEEP = '#063a25'
const CREAM = '#efe8d2'
const GOLD_SOFT = '#e7c877'

export function PageMasthead({ title, subtitle, icon, right, style }: {
  title: string
  subtitle?: string
  icon?: ReactNode          // emoji/element shown instead of the flag crest
  right?: ReactNode
  style?: CSSProperties
}) {
  return (
    <div className="animate-fadeUp" style={{
      display: 'flex', alignItems: 'center', gap: 13, padding: '14px 18px', marginBottom: 18,
      background: `linear-gradient(180deg, ${AUGUSTA}, ${AUGUSTA_DEEP})`, borderRadius: 16,
      border: '1px solid rgba(240,230,200,0.16)', boxShadow: '0 14px 32px -22px rgba(0,0,0,0.6)',
      ...style,
    }}>
      {icon != null ? (
        <span style={{ fontSize: 26, flexShrink: 0, lineHeight: 1 }}>{icon}</span>
      ) : (
        <svg width="38" height="38" viewBox="0 0 100 100" aria-hidden="true" style={{ flexShrink: 0 }}>
          <circle cx="50" cy="50" r="48" fill={AUGUSTA_DEEP} stroke="#d4a53a" strokeWidth="3.5" />
          <path d="M40 74 L40 28 L69 35 L40 42" fill="#e0402f" />
          <rect x="37.5" y="26" width="3" height="48" rx="1.5" fill={CREAM} />
        </svg>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        {subtitle && <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: GOLD_SOFT }}>{subtitle}</div>}
        <div style={{ fontFamily: 'Bebas Neue', fontSize: 26, letterSpacing: 2.5, color: CREAM, lineHeight: 1, marginTop: subtitle ? 3 : 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
      </div>
      {right}
    </div>
  )
}
