import { HoleCard } from './HoleCard'
import { type TeamFull, type ScoreRow, type ChulliganRow, type GroupTeam, isHoleComplete } from '../lib/scoreTypes'
import { displayName } from '../lib/types'
import { useCourse } from '../context/CourseContext'

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
  // Cross-team approval
  approvalsEnabled: boolean
  groupTeams: GroupTeam[]
  approvedScoreIds: Set<string>
  myDisputedHoles: Set<number>
  approveScore: (scoreId: string) => void
  disputeScore: (scoreId: string) => void
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
  approvalsEnabled,
  groupTeams,
  approvedScoreIds,
  myDisputedHoles,
  approveScore,
  disputeScore,
}: ScoreBottomSheetProps) {
  const mp1 = myTeam?.player1
  const mp2 = myTeam?.player2
  const twoPlayers = !!(mp1 && mp2)
  const ownComplete = hole <= 1 || isHoleComplete(myScores[hole - 1], twoPlayers)

  // Cross-team approval of the PREVIOUS hole before this one opens.
  const gHole = hole - 1
  const gActive = approvalsEnabled && hole > 1 && groupTeams.length > 0
  const groupPending = gActive
    ? groupTeams.map(gt => ({ gt, s: gt.scores[gHole] })).filter((x): x is { gt: GroupTeam; s: ScoreRow } => !!x.s && !approvedScoreIds.has(x.s.id))
    : []
  const groupWaiting = gActive ? groupTeams.filter(gt => !gt.scores[gHole]) : []
  const approvalLock = groupPending.length > 0 || groupWaiting.length > 0

  const locked = hole > 1 && (!ownComplete || approvalLock)
  const { parOf } = useCourse()
  const par = parOf(hole)

  const prevScore = locked ? myScores[hole - 1] : undefined
  const missingItems: string[] = []
  if (locked) {
    if (!prevScore) {
      missingItems.push('score')
    } else {
      if (prevScore.putts == null) missingItems.push('putts')
      if (twoPlayers && !prevScore.drive_used_id) missingItems.push('drive selection')
    }
  }

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
            background: 'rgba(0,0,0,0.58)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
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
          borderRadius: '24px 24px 0 0',
          border: '1px solid var(--bdr)',
          borderBottom: 'none',
          boxShadow: 'var(--elev-3), 0 -12px 48px -12px rgba(0,0,0,0.6)',
          maxHeight: '88vh',
          overflowY: 'auto',
          transform: open ? 'translateY(0)' : 'translateY(110%)',
          transition: 'transform 0.4s cubic-bezier(0.26, 1, 0.32, 1)',
        }}
      >
        {/* Top border-glow line */}
        <div style={{
          height: 1,
          background: 'linear-gradient(90deg, transparent 8%, var(--gold-40) 50%, transparent 92%)',
        }} />

        {/* Drag handle */}
        <div style={{ width: 40, height: 5, borderRadius: 999, background: 'var(--surf3)', margin: '10px auto 0' }} />

        {/* Header */}
        <div style={{ padding: '12px 20px 8px', textAlign: 'center' }}>
          <span style={{
            fontFamily: 'Bebas Neue', fontSize: 34, color: 'var(--gold)', letterSpacing: 3,
            lineHeight: 1, fontVariantNumeric: 'tabular-nums',
            textShadow: '0 0 24px var(--gold-25)',
          }}>
            HOLE {hole}
          </span>
          <span style={{
            fontSize: 11, fontWeight: 700, color: 'var(--tx3)', marginLeft: 12,
            letterSpacing: 2, textTransform: 'uppercase', verticalAlign: '4px',
          }}>
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

        {/* Lock reason blurb */}
        {locked && missingItems.length > 0 && (
          <div style={{
            margin: '8px 12px 0',
            padding: '12px 16px',
            borderRadius: 12,
            background: 'rgba(239,68,68,0.07)',
            border: '1px solid rgba(239,68,68,0.20)',
            boxShadow: 'var(--elev-1)',
          }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: '#f87171',
              letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6,
            }}>
              Hole {hole - 1} isn't complete yet
            </div>
            <div style={{ fontSize: 12, color: 'var(--tx3)', lineHeight: 1.6 }}>
              Go back and finish hole {hole - 1} — still missing:{' '}
              <span style={{ color: 'var(--tx2)', fontWeight: 600 }}>
                {missingItems.join(' · ')}
              </span>
            </div>
          </div>
        )}

        {/* A team flagged one of our scores */}
        {approvalsEnabled && myDisputedHoles.size > 0 && (
          <div style={{ margin: '8px 12px 0', padding: '12px 16px', borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#f87171' }}>⚠️ A team flagged your hole {[...myDisputedHoles].sort((a, b) => a - b).join(', ')}</div>
            <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 4, lineHeight: 1.5 }}>Head back and check that hole — once you fix it, they can re-approve.</div>
          </div>
        )}

        {/* Approve the group's previous hole to continue */}
        {ownComplete && approvalLock && (
          <div style={{ margin: '8px 12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#e8c766', letterSpacing: 1.2, textTransform: 'uppercase' }}>
              Approve your group's hole {gHole} to open hole {hole}
            </div>
            {groupWaiting.map(gt => (
              <div key={gt.id} style={{ padding: '11px 14px', borderRadius: 12, background: 'var(--surf2)', border: '1px solid var(--bdr)', fontSize: 13, color: 'var(--tx3)' }}>
                ⏳ Waiting for <strong style={{ color: 'var(--tx2)' }}>{gt.name}</strong> to post hole {gHole}…
              </div>
            ))}
            {groupPending.map(({ gt, s }) => {
              const drivePlayer = [gt.player1, gt.player2].find(p => p?.id === s.drive_used_id)
              const driveName = drivePlayer ? displayName(drivePlayer) : null
              const chs = gt.chulligans.filter(c => c.hole === gHole)
              return (
                <div key={gt.id} style={{ padding: '13px 15px', borderRadius: 12, background: 'rgba(212,165,58,0.06)', border: '1px solid rgba(212,165,58,0.25)' }}>
                  <div style={{ fontWeight: 800, color: 'var(--tx1)', fontSize: 14, marginBottom: 6 }}>{gt.name}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--tx3)', display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
                    <span>Score <strong style={{ color: 'var(--tx1)', fontSize: 14 }}>{s.score}</strong></span>
                    <span>Putts <strong style={{ color: 'var(--tx1)' }}>{s.putts ?? '—'}</strong></span>
                    {driveName && <span>Drive <strong style={{ color: 'var(--tx1)' }}>{driveName}</strong></span>}
                    {chs.length > 0 && <span>🍺 {chs.length}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => disputeScore(s.id)} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)', color: '#f87171', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Something's off</button>
                    <button onClick={() => approveScore(s.id)} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: '#D4A53A', color: '#1a1206', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>✓ Approve</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

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
