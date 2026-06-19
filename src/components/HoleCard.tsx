import { Minus, Plus, MapPin } from 'lucide-react'
import { displayName } from '../lib/types'
import type { HoleGps, Player } from '../lib/types'
import { type ScoreRow, type ChulliganRow, HOLE_PARS, scoreBubbleClass } from '../lib/scoreTypes'

export function HoleCard({
  hole, scoreRow, isSaving, onMinus, onPlus, player1, player2, onSetDrive, driveDisabled, onSetPutts, onReset, chulligans, onToggleChulligan, readOnly, locked, holeInfo, infoExpanded, onToggleInfo, gpsHole, onOpenGps,
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
  infoExpanded?: boolean
  onToggleInfo?: () => void
  gpsHole?: HoleGps
  onOpenGps?: () => void
}) {
  const par      = HOLE_PARS[hole - 1]
  const score    = scoreRow?.score
  const hasScore = score !== undefined
  const cls      = hasScore ? scoreBubbleClass(score, par) : 'score-empty'
  const driveId  = scoreRow?.drive_used_id ?? null
  const putts    = scoreRow?.putts ?? null

  return (
    <div className="glass animate-fadeUp" style={{
      padding: '14px 20px', opacity: isSaving ? 0.7 : 1, transition: 'opacity 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 12, flexShrink: 0,
            background: 'rgba(212,165,58,0.12)', border: '2px solid rgba(212,165,58,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, fontWeight: 900, color: '#D4A53A',
            letterSpacing: -0.5,
          }}>{hole}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--tx1)', lineHeight: 1 }}>Par {par}</span>
            {holeInfo && (
              <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--tx2)', lineHeight: 1 }}>{holeInfo.yards} yds</span>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => { navigator.vibrate?.(10); onMinus?.(); }}
              disabled={isSaving || (hasScore && score <= 1)}
              className="score-btn"
              style={{
                width: 44, height: 44, borderRadius: '50%',
                background: 'var(--surf2)', border: '1px solid var(--bdr)',
                color: 'var(--tx1)', cursor: isSaving ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              }}
            ><Minus size={16} /></button>
            <button
              onClick={() => { navigator.vibrate?.(10); onPlus?.(); }}
              disabled={isSaving}
              className="score-btn"
              style={{
                width: 44, height: 44, borderRadius: '50%',
                background: 'rgba(212,165,58,0.18)', border: '1px solid rgba(212,165,58,0.4)',
                color: '#D4A53A', cursor: isSaving ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(212,165,58,0.15)',
              }}
            ><Plus size={16} /></button>
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
        <div style={{
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
                  title={disabled ? 'Max 5 drives per half reached' : undefined}
                  style={{
                    padding: '4px 12px', borderRadius: 999,
                    fontSize: 12, fontWeight: 600, border: '1px solid',
                    background: active ? 'rgba(212,165,58,0.18)' : 'var(--surf2)',
                    borderColor: active ? '#D4A53A' : 'var(--bdr)',
                    color: active ? '#D4A53A' : 'var(--tx3)',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.3 : 1,
                    transition: 'all 0.15s',
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
          <div style={{ display: 'flex', gap: 5 }}>
            {[0, 1, 2, 3, 4, 5].map(n => {
              const active = putts === n
              return (
                <button key={n} onClick={() => onSetPutts(n)} style={{
                  width: 32, height: 28, borderRadius: 6,
                  fontSize: 13, fontWeight: 700, border: '1px solid',
                  background: active ? 'rgba(212,165,58,0.18)' : 'var(--surf2)',
                  borderColor: active ? '#D4A53A' : 'var(--bdr)',
                  color: active ? '#D4A53A' : 'var(--tx3)',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}>
                  {n}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {!readOnly && !locked && hasScore && player1 && player2 && onToggleChulligan && chulligans !== undefined && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--tx3)', flexShrink: 0 }}>🍺</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {[player1, player2].map(p => {
              const myC = chulligans.find(c => c.player_id === p.id)
              const usedHere      = myC?.hole === hole
              const usedElsewhere = myC && !usedHere
              return (
                <button key={p.id}
                  onClick={() => !usedElsewhere && onToggleChulligan(p.id, hole)}
                  title={usedElsewhere ? `${displayName(p)} already used chulligan on H${myC!.hole}` : undefined}
                  style={{
                    padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                    background: usedHere ? 'rgba(212,165,58,0.18)' : 'var(--surf2)',
                    border: `1px solid ${usedHere ? 'rgba(212,165,58,0.5)' : 'var(--bdr)'}`,
                    color: usedHere ? '#D4A53A' : usedElsewhere ? 'var(--tx5)' : 'var(--tx3)',
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

      {(() => {
        const gpsReady = !!(gpsHole?.green.center)
        const hasGuide = !!(holeInfo?.description || holeInfo?.photo)
        if (!gpsReady && !hasGuide) return null
        return (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--bdr)', display: 'flex', gap: 6 }}>
            {gpsReady && (
              <button type="button" onClick={onOpenGps} style={{
                flex: 1, padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.32)',
                color: '#22c55e', fontSize: 13, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <MapPin size={14} />
                Open GPS
              </button>
            )}
            {hasGuide && (
              <button type="button" onClick={onToggleInfo} style={{
                flex: 1, padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                background: infoExpanded ? 'rgba(212,165,58,0.1)' : 'var(--surf2)',
                border: `1px solid ${infoExpanded ? 'rgba(212,165,58,0.35)' : 'var(--bdr)'}`,
                color: infoExpanded ? '#D4A53A' : 'var(--tx2)',
                fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <span style={{ fontSize: 15 }}>⛳</span>
                {infoExpanded ? 'Hide Hole Guide' : 'View Hole Guide'}
                <span style={{ fontSize: 11, opacity: 0.6 }}>{infoExpanded ? '▲' : '▼'}</span>
              </button>
            )}
          </div>
        )
      })()}

      {holeInfo && infoExpanded && (holeInfo.photo || holeInfo.description) && (
        <div style={{ marginTop: 10, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--bdr)' }}>
          {holeInfo.photo && (
            <img
              src={holeInfo.photo}
              alt={`Hole ${hole} diagram`}
              referrerPolicy="no-referrer"
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />
          )}
          {holeInfo.description && (
            <div style={{ padding: '10px 12px', background: 'var(--surf)', fontSize: 12, color: 'var(--tx2)', lineHeight: 1.7 }}>
              {holeInfo.description}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
