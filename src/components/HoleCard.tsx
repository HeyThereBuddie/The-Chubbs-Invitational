import { Minus, Plus, MapPin } from 'lucide-react'
import { displayName } from '../lib/types'
import type { HoleGps, Player } from '../lib/types'
import { type ScoreRow, type ChulliganRow, scoreBubbleClass } from '../lib/scoreTypes'
import { useCourse } from '../context/CourseContext'

export function HoleCard({
  hole, scoreRow, isSaving, onMinus, onPlus, player1, player2, onSetDrive, driveDisabled, onSetPutts, onReset, chulligans, onToggleChulligan, readOnly, locked, holeInfo, gpsHole, onOpenGps, demoAnchors,
}: {
  hole: number
  scoreRow: ScoreRow | undefined
  isSaving: boolean
  onMinus?: () => void
  onPlus?: () => void
  player1?: Player
  player2?: Player
  onSetDrive?: (playerId: string) => void
  driveDisabled?: Record<string, boolean>
  onSetPutts?: (putts: number) => void
  onReset?: () => void
  chulligans?: ChulliganRow[]
  onToggleChulligan?: (playerId: string, hole: number) => void
  readOnly?: boolean
  locked?: boolean
  holeInfo?: { yards: number; si: number; description?: string; photo?: string }
  gpsHole?: HoleGps
  onOpenGps?: () => void
  demoAnchors?: boolean   // tag score/drive/chulligan controls for the app-tour spotlight
}) {
  const { parOf } = useCourse()
  const par      = parOf(hole)
  const score    = scoreRow?.score
  const hasScore = score !== undefined
  const cls      = hasScore ? scoreBubbleClass(score, par) : 'score-empty'
  const driveId  = scoreRow?.drive_used_id ?? null
  const putts    = scoreRow?.putts ?? null

  return (
    <div className="glass animate-fadeUp" style={{
      padding: '16px 20px', opacity: isSaving ? 0.7 : 1, transition: 'opacity 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, flexShrink: 0,
            background: 'linear-gradient(160deg, rgba(212,165,58,0.20), rgba(212,165,58,0.06))',
            border: '1px solid var(--gold-40)',
            boxShadow: 'var(--elev-1), inset 0 1px 0 rgba(255,255,255,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Bebas Neue', fontSize: 28, color: 'var(--gold)',
            fontVariantNumeric: 'tabular-nums',
          }}>{hole}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--tx1)', lineHeight: 1 }}>Par {par}</span>
            {holeInfo && (
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--tx2)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{holeInfo.yards} yds</span>
            )}
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {hasScore ? (
          <div key={score} className={`score-bubble ${cls} score-digit-pop`} style={{ width: 56, height: 56, fontSize: 26 }}>
            {score}
          </div>
        ) : (
          <div style={{ width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 22, color: 'var(--tx5)', fontWeight: 300, lineHeight: 1 }}>—</span>
          </div>
        )}

        {!readOnly && !locked && (
          <div data-tour={demoAnchors ? 'score-demo-score' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => { navigator.vibrate?.(10); onMinus?.(); }}
              disabled={isSaving || (hasScore && score <= 1)}
              className="score-btn"
              style={{
                width: 44, height: 44, borderRadius: '50%',
                background: 'var(--surf2)', border: '1px solid var(--bdr2)',
                color: 'var(--tx1)', cursor: isSaving ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: 'var(--elev-1)',
              }}
            ><Minus size={18} /></button>
            <button
              onClick={() => { navigator.vibrate?.(10); onPlus?.(); }}
              disabled={isSaving}
              className="score-btn"
              style={{
                width: 44, height: 44, borderRadius: '50%',
                background: 'linear-gradient(160deg, rgba(212,165,58,0.28), rgba(212,165,58,0.14))',
                border: '1px solid var(--gold-40)',
                color: 'var(--gold)', cursor: isSaving ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: 'var(--elev-gold), inset 0 1px 0 rgba(255,255,255,0.12)',
              }}
            ><Plus size={18} /></button>
            {hasScore && onReset && (
              <button
                onClick={onReset}
                disabled={isSaving}
                title="Clear score"
                style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: 'transparent', border: '1px solid var(--bdr)',
                  color: 'var(--tx4)', cursor: isSaving ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, lineHeight: 1,
                }}
              >×</button>
            )}
          </div>
        )}
        {!readOnly && locked && (
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <span style={{ fontSize: 18, opacity: 0.22 }}>🔒</span>
            <span style={{ fontSize: 9, color: 'var(--tx5)', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>Hole {hole - 1} first</span>
          </div>
        )}
      </div>

      {readOnly && hasScore && (scoreRow?.drive_used_id || scoreRow?.putts != null) && (
        <div style={{ marginTop: 8, display: 'flex', gap: 14 }}>
          {scoreRow?.drive_used_id && (player1 || player2) && (() => {
            const driver = [player1, player2].find(p => p?.id === scoreRow.drive_used_id)
            return driver ? (
              <span style={{ fontSize: 11, color: 'var(--tx3)' }}>Drive: {displayName(driver)}</span>
            ) : null
          })()}
          {scoreRow?.putts != null && (
            <span style={{ fontSize: 11, color: 'var(--tx3)' }}>Putts: {scoreRow.putts}</span>
          )}
        </div>
      )}

      {!readOnly && !locked && hasScore && player1 && player2 && onSetDrive && (
        <div data-tour={demoAnchors ? 'score-demo-drive' : undefined} style={{
          marginTop: 10, paddingTop: 10,
          borderTop: '1px solid var(--bdr)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 11, color: 'var(--tx3)', flexShrink: 0 }}>Drive:</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {[player1, player2].map(p => {
              const active   = driveId === p.id
              const disabled = driveDisabled?.[p.id] ?? false
              return (
                <button key={p.id} onClick={() => !disabled && onSetDrive(p.id)}
                  disabled={disabled}
                  className="pressable"
                  title={disabled ? 'Max 5 drives per half reached' : undefined}
                  style={{
                    padding: '8px 14px', minHeight: 34, borderRadius: 999,
                    fontSize: 12, fontWeight: 600, border: '1px solid',
                    background: active ? 'var(--gold-15)' : 'var(--surf2)',
                    borderColor: active ? 'var(--gold)' : 'var(--bdr)',
                    color: active ? 'var(--gold)' : 'var(--tx3)',
                    boxShadow: active ? 'var(--elev-gold)' : 'none',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.3 : 1,
                    transition: 'background 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s',
                  }}>
                  {displayName(p)}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {!readOnly && !locked && hasScore && onSetPutts && (
        <div style={{
          marginTop: 10, paddingTop: 10,
          borderTop: '1px solid var(--bdr)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 11, color: 'var(--tx3)', flexShrink: 0 }}>Putts:</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {[0, 1, 2, 3, 4, 5].map(n => {
              const active = putts === n
              return (
                <button key={n} onClick={() => onSetPutts(n)} className="pressable" style={{
                  width: 36, height: 36, borderRadius: 10,
                  fontSize: 14, fontWeight: 700, border: '1px solid',
                  fontVariantNumeric: 'tabular-nums',
                  background: active ? 'var(--gold-15)' : 'var(--surf2)',
                  borderColor: active ? 'var(--gold)' : 'var(--bdr)',
                  color: active ? 'var(--gold)' : 'var(--tx3)',
                  boxShadow: active ? 'var(--elev-gold)' : 'none',
                  cursor: 'pointer', transition: 'background 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s',
                }}>
                  {n}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {!readOnly && !locked && hasScore && player1 && player2 && onToggleChulligan && chulligans !== undefined && (
        <div data-tour={demoAnchors ? 'score-demo-chull' : undefined} style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--tx3)', flexShrink: 0 }}>🍺</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {[player1, player2].map(p => {
              const myC = chulligans.find(c => c.player_id === p.id)
              const usedHere      = myC?.hole === hole
              const usedElsewhere = myC && !usedHere
              return (
                <button key={p.id}
                  onClick={() => !usedElsewhere && onToggleChulligan(p.id, hole)}
                  className="pressable"
                  title={usedElsewhere ? `${displayName(p)} already used chulligan on H${myC!.hole}` : undefined}
                  style={{
                    padding: '7px 12px', minHeight: 32, borderRadius: 999, fontSize: 11, fontWeight: 600,
                    background: usedHere ? 'var(--gold-15)' : 'var(--surf2)',
                    border: `1px solid ${usedHere ? 'var(--gold-dim)' : 'var(--bdr)'}`,
                    color: usedHere ? 'var(--gold)' : usedElsewhere ? 'var(--tx5)' : 'var(--tx3)',
                    cursor: usedElsewhere ? 'not-allowed' : 'pointer',
                    textDecoration: usedElsewhere ? 'line-through' : 'none',
                  }}>
                  {usedHere ? '✅' : '🍺'} {displayName(p)}{usedElsewhere ? ` H${myC!.hole}` : ''}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {gpsHole?.green.center && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--bdr)', display: 'flex', gap: 6 }}>
          <button type="button" onClick={onOpenGps} className="pressable" style={{
            flex: 1, padding: '10px 14px', minHeight: 40, borderRadius: 10, cursor: 'pointer',
            background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.32)',
            color: '#22c55e', fontSize: 13, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            boxShadow: 'var(--elev-1)',
          }}>
            <MapPin size={14} />
            Open GPS
          </button>
        </div>
      )}
    </div>
  )
}
