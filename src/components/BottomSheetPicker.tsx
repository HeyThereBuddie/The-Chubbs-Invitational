import { useState, useEffect, useRef } from 'react'
import { ChevronDown, Check, Search } from 'lucide-react'

export interface PickerOption {
  value: string
  label: string
  detail?: string
}

interface BottomSheetPickerProps {
  options: PickerOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  searchable?: boolean
  disabled?: boolean
}

export default function BottomSheetPicker({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  searchable = false,
  disabled = false,
}: BottomSheetPickerProps) {
  const [open, setOpen]         = useState(false)
  const [exiting, setExiting]   = useState(false)
  const [query, setQuery]       = useState('')
  const searchRef               = useRef<HTMLInputElement>(null)

  const selected = options.find(o => o.value === value)

  const close = () => {
    setExiting(true)
    setTimeout(() => { setOpen(false); setExiting(false); setQuery('') }, 220)
  }

  const pick = (val: string) => {
    onChange(val)
    close()
  }

  // Focus search input when sheet opens
  useEffect(() => {
    if (open && searchable) {
      setTimeout(() => searchRef.current?.focus(), 60)
    }
  }, [open, searchable])

  // Close on back-button / escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const filtered = searchable && query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  return (
    <>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { if (!disabled) setOpen(true) }}
        disabled={disabled}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '11px 14px',
          background: 'var(--surf)',
          border: '1px solid var(--bdr2)',
          borderRadius: 10,
          color: selected ? 'var(--tx1)' : 'var(--tx4)',
          fontSize: 14,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          textAlign: 'left',
          gap: 8,
          transition: 'border-color 0.15s',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={16} color="var(--tx4)" style={{ flexShrink: 0, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>

      {/* Sheet */}
      {open && (
        <div
          onClick={close}
          style={{
            position: 'fixed', inset: 0, zIndex: 600,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className={exiting ? 'sheet-exit' : 'sheet-enter'}
            style={{
              width: '100%',
              maxWidth: 500,
              background: 'var(--panel)',
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              borderTop: '1px solid var(--bdr2)',
              paddingBottom: 'env(safe-area-inset-bottom, 8px)',
              maxHeight: '70vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Handle */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 4, flexShrink: 0 }}>
              <div style={{ width: 36, height: 4, borderRadius: 999, background: 'var(--bdr2)' }} />
            </div>

            {/* Search */}
            {searchable && (
              <div style={{ padding: '8px 16px 0', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 10, padding: '9px 12px' }}>
                  <Search size={14} color="var(--tx4)" />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search…"
                    style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 14, color: 'var(--tx1)' }}
                  />
                </div>
              </div>
            )}

            {/* Options */}
            <div style={{ overflowY: 'auto', paddingBottom: 8, paddingTop: 8 }}>
              {filtered.length === 0 && (
                <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--tx4)', fontSize: 14 }}>
                  No results
                </div>
              )}
              {filtered.map(opt => {
                const isSelected = opt.value === value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => pick(opt.value)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '14px 20px',
                      background: isSelected ? 'rgba(252,181,20,0.1)' : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      WebkitTapHighlightColor: 'transparent',
                      transition: 'background 0.12s',
                    }}
                  >
                    {/* Initial avatar */}
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      background: isSelected ? 'rgba(252,181,20,0.2)' : 'var(--surf2)',
                      border: `1px solid ${isSelected ? 'rgba(252,181,20,0.4)' : 'var(--bdr)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 700,
                      color: isSelected ? '#FCB514' : 'var(--tx3)',
                    }}>
                      {opt.label.slice(0, 1).toUpperCase()}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: isSelected ? 700 : 500, color: isSelected ? '#FCB514' : 'var(--tx1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {opt.label}
                      </div>
                      {opt.detail && (
                        <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 2 }}>{opt.detail}</div>
                      )}
                    </div>

                    {isSelected && <Check size={18} color="#FCB514" style={{ flexShrink: 0 }} />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
