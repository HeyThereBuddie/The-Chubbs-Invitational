import { useState } from 'react'
import { createPortal } from 'react-dom'
import { HoleCard } from './HoleCard'
import { ApprovalCard } from './ApprovalCard'
import { type TeamFull, type ScoreRow, type ChulliganRow, type GroupTeam } from '../lib/scoreTypes'
import type { Player } from '../lib/types'
import { useCourse } from '../context/CourseContext'
import { groupScoreReady } from '../hooks/usePlayerScoring'

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
  myDisputedScoreIds: Set<string>   // other-team scores I've challenged (for the "sent" state)
  myDisputedHoles: Set<number>
  myApprovedHoles: Set<number>
  forcedHoles: Set<number>          // holes an admin force-settled for this foursome
  approveScore: (scoreId: string) => void
  disputeScore: (scoreId: string) => void
  onSubmit: (hole: number) => void   // post this hole → notify + instantly prompt the group
  onUnlock: (hole: number) => void   // reopen a posted hole for editing (clears the shared lock)
  demo?: boolean   // app-tour sandbox: tag controls for the spotlight
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
  myDisputedScoreIds,
  myDisputedHoles,
  myApprovedHoles,
  forcedHoles,
  approveScore,
  disputeScore,
  onSubmit,
  onUnlock,
  demo,
}: ScoreBottomSheetProps) {
  // Use the registered profile when available, else a stand-in built from the
  // drawn team name — so drive & chulligan controls still show for a 2-person
  // team even before a partner has registered their account.
  const drawn = (p: Player | undefined, id: string | null, name: string | null | undefined): Player | undefined =>
    p ?? (name ? ({ id: id ?? `drawn:${name}`, name, nickname: null } as Player) : undefined)
  const mp1 = drawn(myTeam?.player1, myTeam?.p1_id ?? myTeam?.p1_roster_id ?? null, myTeam?.p1_name)
  const mp2 = drawn(myTeam?.player2, myTeam?.p2_id ?? myTeam?.p2_roster_id ?? null, myTeam?.p2_name)
  const twoPlayers = !!(mp1 && mp2)
  const { parOf } = useCourse()
  const par = parOf(hole)

  // Post-submit lock (client-side, per device). A submitted hole goes read-only so
  // it can't be fumbled; it unlocks automatically if the group challenges it, or
  // when the player taps "Change score". `submitted` tracks holes posted this
  // session; approved holes stay locked across reloads via myApprovedHoles below.
  const [submitted, setSubmitted] = useState<Set<number>>(new Set())
  const [editing, setEditing]     = useState<Set<number>>(new Set())
  const addTo = (set: Set<number>, h: number) => { const n = new Set(set); n.add(h); return n }
  const delFrom = (set: Set<number>, h: number) => { const n = new Set(set); n.delete(h); return n }
  const postHole = () => { onSubmit(hole); setSubmitted(s => addTo(s, hole)); setEditing(s => delFrom(s, hole)) }
  const changeScore = () => { onUnlock(hole); setEditing(s => addTo(s, hole)); setSubmitted(s => delFrom(s, hole)) }

  // This hole is "posted" once it has a score + putts (+ a drive for 2-player
  // teams). Chulligans are never required.
  const curScore = myScores[hole]
  const curMissing: string[] = []
  if (!curScore) curMissing.push('a score')
  else {
    if (curScore.putts == null) curMissing.push('putts')
    if (twoPlayers && !curScore.drive_used_id) curMissing.push('a drive')
  }
  const curComplete = curMissing.length === 0

  // Cross-team approval settles THIS hole before the group moves on: both teams
  // post their score, then approve each other. Only when it's fully approved does
  // the app advance to the next hole — never before.
  // A hole only counts as "posted by them" once it's finished (score + putts +
  // drive) — a still-in-progress hole shouldn't show up as approvable.
  const gA = approvalsEnabled && groupTeams.length > 0
  const othersWaiting = gA ? groupTeams.filter(gt => { const s = gt.scores[hole]; return !s || !groupScoreReady(gt, s) }) : []
  const iNeedToApprove = gA
    ? groupTeams.map(gt => ({ gt, s: gt.scores[hole] })).filter((x): x is { gt: GroupTeam; s: ScoreRow } => !!x.s && groupScoreReady(x.gt, x.s) && !approvedScoreIds.has(x.s.id))
    : []
  const theyApprovedMe = myApprovedHoles.has(hole)
  // Admin force-settle bypasses the mutual gate for this foursome/hole.
  const forced = forcedHoles.has(hole)
  const fullyApproved = gA && curComplete && (forced || (othersWaiting.length === 0 && iNeedToApprove.length === 0 && theyApprovedMe))
  const showSettlement = gA && (curComplete || iNeedToApprove.length > 0)

  // The hole is locked once posted — shared across teammates via curScore.submitted_at
  // (persisted), with the per-session `submitted` set as a fallback before migration
  // 053 is applied. Unlocked if the group challenged it (they need it fixed) or the
  // player chose to edit. Approved holes stay locked too.
  const isDisputedMine = myDisputedHoles.has(hole)
  const isPosted = !!curScore?.submitted_at || submitted.has(hole)
  const isLocked = gA && !!curScore && !editing.has(hole) && !isDisputedMine && (theyApprovedMe || isPosted || forced)

  // NOTE: auto-advance now lives in GpsPage (keyed on the hole being fully settled)
  // so it fires whether or not this sheet is open — a player who approves from the
  // GPS reminder banner still moves on. Here we only render the settled UI.

  const hFrom = hole <= 9 ? 1 : 10
  const hTo   = hole <= 9 ? 9 : 18
  const p1n   = countDrives(mp1?.id ?? null, hFrom, hTo)
  const p2n   = countDrives(mp2?.id ?? null, hFrom, hTo)
  const driveId = myScores[hole]?.drive_used_id ?? null
  const driveDisabled: Record<string, boolean> = {
    ...(mp1 ? { [mp1.id]: p1n >= 5 && driveId !== mp1.id } : {}),
    ...(mp2 ? { [mp2.id]: p2n >= 5 && driveId !== mp2.id } : {}),
  }

  // Rendered via a portal at <body> so the sheet sits ABOVE the bottom nav
  // (otherwise the nav's layer paints over the sheet's footer).
  return createPortal(
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
          maxHeight: '94dvh',
          overflowY: 'auto',
          transform: open ? 'translateY(0)' : 'translateY(110%)',
          transition: 'transform 0.4s cubic-bezier(0.26, 1, 0.32, 1)',
        }}
      >
        {/* Top border-glow line */}
        <div style={{
          height: 1,
          background: 'linear-gradient(90deg, transparent 8%, rgba(10,92,57,0.7) 50%, transparent 92%)',
        }} />

        {/* Drag handle */}
        <div style={{ width: 40, height: 5, borderRadius: 999, background: 'var(--surf3)', margin: '10px auto 12px' }} />

        {/* Augusta hole header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '0 12px 8px', padding: '13px 16px', borderRadius: 14, background: 'linear-gradient(180deg, #0a5c39, #063a25)', border: '1px solid rgba(240,230,200,0.16)' }}>
          <svg width="30" height="30" viewBox="0 0 100 100" aria-hidden="true" style={{ flexShrink: 0 }}>
            <circle cx="50" cy="50" r="48" fill="#063a25" stroke="#d4a53a" strokeWidth="4" />
            <path d="M40 74 L40 28 L69 35 L40 42" fill="#e0402f" />
            <rect x="37.5" y="26" width="3" height="48" rx="1.5" fill="#efe8d2" />
          </svg>
          <span style={{ fontFamily: 'Bebas Neue', fontSize: 30, letterSpacing: 3, color: '#efe8d2', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>Hole {hole}</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', color: '#e7c877', background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(240,230,200,0.22)', borderRadius: 999, padding: '5px 12px' }}>Par {par}</span>
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
              locked={false}
              readOnly={isLocked}
              demoAnchors={demo}
            />
          )}
        </div>

        {/* A team challenged one of our scores — fix it and they re-approve */}
        {approvalsEnabled && myDisputedHoles.size > 0 && (
          <div style={{ margin: '8px 12px 0', padding: '12px 16px', borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#f87171' }}>⚠️ Your group challenged hole {[...myDisputedHoles].sort((a, b) => a - b).join(', ')}</div>
            <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 4, lineHeight: 1.5 }}>Go to that hole and fix the score — once you do, they'll be asked to approve the corrected number.</div>
          </div>
        )}

        {/* Cross-team settlement for THIS hole — approve each other before moving on */}
        {showSettlement && (
          <div data-tour={demo ? 'score-demo-approval' : undefined} style={{ margin: '8px 12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {fullyApproved ? (
              <div data-tour={demo ? 'score-demo-advance' : undefined} style={{ padding: '13px 16px', borderRadius: 12, background: 'rgba(52,211,153,0.10)', border: '1px solid rgba(52,211,153,0.4)', fontSize: 14, fontWeight: 800, color: '#34d399', textAlign: 'center' }}>
                {forced ? '🛠️ Hole ' + hole + ' settled by an admin' : '✓ Hole ' + hole + ' approved'}{hole < 18 ? ` — on to hole ${hole + 1}…` : ' — round complete!'}
              </div>
            ) : (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#e8c766', letterSpacing: 1.2, textTransform: 'uppercase' }}>
                  Get hole {hole} approved to move on
                </div>
                {/* Other teams that haven't posted this hole yet */}
                {othersWaiting.map(gt => (
                  <div key={gt.id} style={{ padding: '11px 14px', borderRadius: 12, background: 'var(--surf2)', border: '1px solid var(--bdr)', fontSize: 13, color: 'var(--tx3)' }}>
                    ⏳ Waiting for <strong style={{ color: 'var(--tx2)' }}>{gt.name}</strong> to post hole {hole}…
                  </div>
                ))}
                {/* Their hole for me to approve or challenge (score + drive + putts, one tap) */}
                {iNeedToApprove.map(({ gt, s }) => (
                  <ApprovalCard key={gt.id} team={gt} score={s} hole={hole}
                    onApprove={() => approveScore(s.id)} onDispute={() => disputeScore(s.id)}
                    disputed={myDisputedScoreIds.has(s.id)} />
                ))}
                {/* Mine is posted + I've done my part — waiting on them */}
                {curComplete && othersWaiting.length === 0 && iNeedToApprove.length === 0 && !theyApprovedMe && (
                  <div style={{ padding: '11px 14px', borderRadius: 12, background: 'var(--surf2)', border: '1px solid var(--bdr)', fontSize: 13, color: 'var(--tx3)' }}>
                    ⏳ Waiting for your group to approve <strong style={{ color: 'var(--tx2)' }}>your hole {hole}</strong>…
                  </div>
                )}
                {/* I still need to post my own hole */}
                {!curComplete && (
                  <div style={{ padding: '11px 14px', borderRadius: 12, background: 'var(--surf2)', border: '1px solid var(--bdr)', fontSize: 13, color: 'var(--tx3)' }}>
                    Post your hole ({curMissing.join(' & ')}) so your group can approve it.
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{
          padding: '16px 20px',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 34px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          {(() => {
            const greenBtn: React.CSSProperties = {
              width: '100%', padding: '15px', borderRadius: 12,
              background: 'linear-gradient(180deg, #0d6a43, #063a25)', border: '1px solid rgba(240,230,200,0.22)',
              color: '#efe8d2', fontSize: 16, fontWeight: 800, cursor: 'pointer', letterSpacing: 0.5,
              boxShadow: '0 4px 14px -4px rgba(10,92,57,0.8), inset 0 1px 0 rgba(255,255,255,0.1)',
            }
            const goldBtn: React.CSSProperties = {
              width: '100%', padding: '15px', borderRadius: 12,
              background: 'linear-gradient(180deg, #e7c877, #d4a53a)', border: 'none',
              color: '#23180a', fontSize: 16, fontWeight: 800, cursor: 'pointer', letterSpacing: 0.5,
              boxShadow: '0 4px 14px -4px rgba(212,165,58,0.6), inset 0 1px 0 rgba(255,255,255,0.35)',
            }
            const ghostBtn: React.CSSProperties = {
              width: '100%', padding: '11px', borderRadius: 12, background: 'transparent',
              border: '1px solid var(--bdr2)', color: 'var(--tx2)', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }
            const hint = (text: string) => (
              <div style={{ fontSize: 12, color: '#e0a90a', fontWeight: 700, textAlign: 'center', lineHeight: 1.5 }}>{text}</div>
            )
            const changeScoreBtn = <button onClick={changeScore} style={ghostBtn}>✏️ Change score</button>

            // Approvals ON: the group settles the hole; advance only when fully approved.
            if (gA) {
              if (fullyApproved) {
                // Approved & done — but a team can still reopen it (re-approval kicks
                // in automatically once anything changes).
                return (
                  <>
                    {hole < 18
                      ? <button data-tour={demo ? 'score-demo-save' : undefined} onClick={onNextHole} style={greenBtn}>Next Hole →</button>
                      : <button onClick={onClose} style={goldBtn}>Finish Round ✓</button>}
                    {changeScoreBtn}
                  </>
                )
              }
              if (!curComplete) return hint(`Add ${curMissing.join(' & ')} to post this hole.`)
              // Posted & locked, waiting on the group to approve.
              if (isLocked) {
                return (
                  <>
                    {hint(`Hole ${hole} submitted 🔒 — you'll move on automatically once everyone approves.`)}
                    {changeScoreBtn}
                  </>
                )
              }
              // Complete and unlocked: the player controls when the group is prompted.
              // Submitting posts + notifies the foursome instantly and locks the hole.
              return (
                <>
                  <button data-tour={demo ? 'score-demo-submit' : undefined} onClick={postHole} style={goldBtn}>📣 Submit hole {hole} for approval</button>
                  {hint(`Your group gets pinged to approve. Your score locks until they do (or challenge it).`)}
                </>
              )
            }

            // Approvals OFF: advance as soon as the hole is complete.
            return (
              <>
                {!curComplete && hint(`Add ${curMissing.join(' & ')} to ${hole < 18 ? 'move on' : 'finish'}.`)}
                {hole < 18 ? (
                  <button data-tour={demo ? 'score-demo-save' : undefined} onClick={onNextHole} disabled={!curComplete}
                    style={{ ...greenBtn, cursor: curComplete ? 'pointer' : 'not-allowed', opacity: curComplete ? 1 : 0.4 }}>
                    Next Hole →
                  </button>
                ) : (
                  <button onClick={onClose} disabled={!curComplete}
                    style={{ ...goldBtn, cursor: curComplete ? 'pointer' : 'not-allowed', opacity: curComplete ? 1 : 0.4 }}>
                    Finish Round ✓
                  </button>
                )}
              </>
            )
          })()}
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
    </>,
    document.body,
  )
}
