import { useState } from 'react'

export interface ReactionGroup {
  emoji: string
  playerIds: string[]
}

interface Props {
  eventId: string
  label: string
  reactions: ReactionGroup[]
  currentUserId: string | null
  onToggle: (eventId: string, emoji: string, hasReacted: boolean) => void
}

function getSuggestions(label: string): string[] {
  if (label === 'Hole in One!' || label === 'Eagle') return ['🤯', '🦅', '👑', '🔥']
  if (label === 'Birdie') return ['🔥', '🐦', '👏']
  if (label === 'Par') return ['👍', '⛳']
  if (label === 'Bogey') return ['😬', '😅']
  if (label === 'Double' || label.startsWith('+')) return ['💀', '😤', '😂']
  if (label === '3-Putt') return ['😰', '💀']
  if (label === '4-Putt') return ['😱', '💀', '😭']
  if (label === 'Chulligan') return ['🍺', '😂', '😬']
  if (label === 'CTP Entry' || label === 'LD Entry') return ['🎯', '👏', '💪']
  if (label.includes('Vote')) return ['🤠', '😂', '👀']
  return ['👍', '🔥', '😂', '👀']
}

export default function ReactionBar({ eventId, label, reactions, currentUserId, onToggle }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false)

  const canReact = !!currentUserId
  const hasReactions = reactions.length > 0
  const usedEmojis = new Set(reactions.map(r => r.emoji))
  // picker only shows suggestions nobody has used yet
  const pickerOptions = getSuggestions(label).filter(e => !usedEmojis.has(e))
  const hasPicker = canReact && pickerOptions.length > 0

  const myEmojis = new Set(
    reactions
      .filter(r => currentUserId && r.playerIds.includes(currentUserId))
      .map(r => r.emoji)
  )

  if (!hasReactions && !canReact) return null

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'center',
      gap: 5, marginTop: 7, marginLeft: 50,
    }}>
      {/* Existing reaction chips */}
      {reactions.map(({ emoji, playerIds }) => {
        const mine = myEmojis.has(emoji)
        return (
          <button
            key={emoji}
            onClick={() => canReact && onToggle(eventId, emoji, mine)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 8px', borderRadius: 20,
              background: mine ? 'rgba(252,181,20,0.15)' : 'rgba(255,255,255,0.07)',
              border: `1px solid ${mine ? 'rgba(252,181,20,0.35)' : 'var(--tx5)'}`,
              cursor: canReact ? 'pointer' : 'default',
              fontSize: 13, color: mine ? '#FCB514' : 'var(--tx2)',
              fontWeight: mine ? 700 : 400,
              transition: 'background 0.12s, border-color 0.12s',
            }}
          >
            <span>{emoji}</span>
            <span style={{ fontSize: 11 }}>{playerIds.length}</span>
          </button>
        )
      })}

      {/* + button to open picker for new emojis */}
      {hasPicker && (
        <button
          onClick={() => setPickerOpen(p => !p)}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 26, height: 22, padding: 0, borderRadius: 20,
            background: pickerOpen ? 'rgba(252,181,20,0.1)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${pickerOpen ? 'rgba(252,181,20,0.3)' : 'var(--tx5)'}`,
            cursor: 'pointer', fontSize: 15, lineHeight: 1,
            color: pickerOpen ? '#FCB514' : 'var(--tx3)',
            transition: 'background 0.12s, border-color 0.12s',
          }}
        >
          {pickerOpen ? '×' : '+'}
        </button>
      )}

      {/* Picker: suggested emojis not yet used */}
      {pickerOpen && pickerOptions.map(emoji => (
        <button
          key={`pick-${emoji}`}
          onClick={() => { onToggle(eventId, emoji, false); setPickerOpen(false) }}
          style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '2px 7px', borderRadius: 20,
            background: 'var(--surf)',
            border: '1px solid var(--bdr)',
            cursor: 'pointer', fontSize: 15,
            transition: 'background 0.12s',
          }}
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}
