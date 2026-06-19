import { HoleCard } from './HoleCard'
import { type TeamFull, type ScoreRow, type ChulliganRow, HOLE_PARS, isHoleComplete } from '../lib/scoreTypes'

interface ScoreBottomSheetProps {
  open: boolean
  hole: number
  onClose: () => void
  onNextHole: () => void
  // from usePlayerScoring:
  myTeam: TeamFull | null
  myScores: Record<number, ScoreRow>
  myChulligans: ChulliganRow[]
  saving: number | null
  adjustMyScore: (hole: number, delta: number) => void
  setMyDrive: (hole: number, playerId: string) => void
  setMyPutts: (hole: number, putts: number) => void
  resetMyScore: (hole: number) => void
  toggleMyChulligan: (playerId: string, hole: number) => void
  countDrives: (pid: string | null, from: number, to: number) => number
}

export function ScoreBottomSheet({
  open,
  hole,
  onClose,
  onNextHole,
  myTeam,
  myScores,
  myChulligans,
  saving,
  adjustMyScore,
  setMyDrive,
  setMyPutts,
  resetMyScore,
  toggleMyChulligan,
  countDrives,
}: ScoreBottomSheetProps) {
  const mp1 = myTeam?.player1
  const mp2 = myTeam?.player2
  const twoPlayers = !!(mp1 && mp2)
  const locked = hole > 1 && !isHoleComplete(myScores[hole - 1], twoPlayers)
  const par = HOLE_PARS[hole - 1]

  const hFrom = hole <= 9 ? 1 : 10
  const hTo   = hole <= 9 ? 9 : 18
  const p1n   = countDrives(mp1?.id ?? null, hFrom, hTo)
  const p2n   = countDrives(mp2?.id ?? null, hFrom, hTo)
  const driveId = myScores[hole]?.drive_used_id ?? null
  const driveDisabled: Record<string, boolean> = {
    ...(mp1 ? { [mp1.id]: p1n >= 5 && driveId !== mp1.id } : {}),
    ...(mp2 ? { [mp2.id]: p2n >= 5 && driveId !== mp2.id } : {}),
  }

  return (
    <>
      {/* Backdrop — only rendered when open */}
      {open && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(2px)',
          }}
        />
      )}

      {/* Sheet — always in DOM so transition works */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 201,
          background: 'var(--panel)',
          borderRadius: '20px 20px 0 0',
          maxHeight: '88vh',
          overflowY: 'auto',
          transform: open ? 'translateY(0)' : 'translateY(110%)',
          transition: 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        {/* Drag handle */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--bdr2)', margin: '12px auto 0' }} />

        {/* Header */}
        <div style={{ padding: '12px 20px 8px', textAlign: 'center' }}>
          <span style={{ fontFamily: 'Bebas Neue', fontSize: 32, color: '#D4A53A', letterSpacing: 2 }}>
            HOLE {hole}
          </span>
          <span style={{ fontSize: 14, color: 'var(--tx3)', marginLeft: 10 }}>
            PAR {par}
          </span>
        </div>

        {/* HoleCard content or no-team message */}
        <div style={{ padding: '0 12px' }}>
          {!myTeam ? (
            <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--tx3)', fontSize: 14, lineHeight: 1.6 }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>👥</div>
              You're not assigned to a team yet.{'\n'}
              <span style={{ color: 'var(--tx4)', fontSize: 12 }}>Go to Scores → pick your team first.</span>
            </div>
          ) : (
            <HoleCard
              key={hole}
              hole={hole}
              scoreRow={myScores[hole]}
              isSaving={saving === hole}
              onMinus={() => adjustMyScore(hole, -1)}
              onPlus={() => adjustMyScore(hole, 1)}
              player1={mp1}
              player2={mp2}
              onSetDrive={(pid) => setMyDrive(hole, pid)}
              driveDisabled={driveDisabled}
              onSetPutts={(n) => setMyPutts(hole, n)}
              onReset={() => resetMyScore(hole)}
              chulligans={myChulligans}
              onToggleChulligan={(pid, h) => toggleMyChulligan(pid, h)}
              locked={locked}
            />
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 20px',
          paddingBottom: 'max(24px, env(safe-area-inset-bottom, 0px))',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          {hole < 18 ? (
            <button
              onClick={onNextHole}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: 12,
                background: 'rgba(212,165,58,0.90)',
                border: '1px solid rgba(212,165,58,0.6)',
                color: '#000',
                fontSize: 16,
                fontWeight: 800,
                cursor: 'pointer',
                letterSpacing: 0.5,
              }}
            >
              Next Hole →
            </button>
          ) : (
            <button
              onClick={onClose}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: 12,
                background: 'rgba(212,165,58,0.90)',
                border: '1px solid rgba(212,165,58,0.6)',
                color: '#000',
                fontSize: 16,
                fontWeight: 800,
                cursor: 'pointer',
                letterSpacing: 0.5,
              }}
            >
              Finish Round ✓
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--tx4)',
              fontSize: 13,
              cursor: 'pointer',
              textAlign: 'center',
              padding: '4px',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </>
  )
}
