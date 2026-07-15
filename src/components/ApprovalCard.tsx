import { type GroupTeam, type ScoreRow, scoreBubbleClass } from '../lib/scoreTypes'
import { displayName } from '../lib/types'
import { useCourse } from '../context/CourseContext'

// A review card for another team's hole entry — used both in the score sheet
// (when advancing is blocked) and in the GPS approval banner.
export function ApprovalCard({ team, score, hole, onApprove, onDispute }: {
  team: GroupTeam
  score: ScoreRow
  hole: number
  onApprove: () => void
  onDispute: () => void
}) {
  const { parOf } = useCourse()
  const par = parOf(hole)
  const drivePlayer = [team.player1, team.player2].find(p => p?.id === score.drive_used_id)
  const driveName = drivePlayer ? displayName(drivePlayer) : null
  const chs = team.chulligans.filter(c => c.hole === hole)
  const toPar = score.score - par
  const toParStr = toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : `${toPar}`

  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(240,230,200,0.18)', boxShadow: '0 12px 28px -18px rgba(0,0,0,0.6)' }}>
      {/* Augusta header — team + the score they posted */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px', background: 'linear-gradient(180deg, #0a5c39, #063a25)', borderBottom: '1px solid rgba(0,0,0,0.28)' }}>
        <svg width="26" height="26" viewBox="0 0 100 100" aria-hidden="true" style={{ flexShrink: 0 }}>
          <circle cx="50" cy="50" r="48" fill="#063a25" stroke="#d4a53a" strokeWidth="4" />
          <path d="M40 74 L40 28 L69 35 L40 42" fill="#e0402f" />
          <rect x="37.5" y="26" width="3" height="48" rx="1.5" fill="#efe8d2" />
        </svg>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.4, textTransform: 'uppercase', color: '#e7c877' }}>Review · Hole {hole}</div>
          <div style={{ fontFamily: 'Bebas Neue', fontSize: 20, letterSpacing: 1.5, color: '#efe8d2', lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{team.name}</div>
        </div>
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div className={`score-bubble ${scoreBubbleClass(score.score, par)}`} style={{ width: 42, height: 42, fontSize: 20, margin: '0 auto' }}>{score.score}</div>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, color: 'rgba(240,230,200,0.7)', marginTop: 3 }}>{toParStr} · PAR {par}</div>
        </div>
      </div>

      {/* Detail chips */}
      <div style={{ display: 'flex', gap: 8, padding: '11px 14px', background: 'var(--surf)', flexWrap: 'wrap' }}>
        <Chip label="Putts" value={score.putts ?? '—'} />
        {driveName && <Chip label="Drive" value={driveName} />}
        {chs.length > 0 && <Chip label="Chulligans" value={`🍺 ${chs.length}`} />}
        {!driveName && chs.length === 0 && score.putts != null && <Chip label="Status" value="Complete" />}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 14px', background: 'var(--panel)' }}>
        <button onClick={onDispute} className="pressable" style={{
          flex: 1, padding: '11px', borderRadius: 11, cursor: 'pointer',
          border: '1px solid rgba(224,64,47,0.45)', background: 'rgba(224,64,47,0.08)', color: '#e0402f', fontWeight: 800, fontSize: 13,
        }}>Something's off</button>
        <button onClick={onApprove} className="pressable" style={{
          flex: 1.4, padding: '11px', borderRadius: 11, border: 'none', cursor: 'pointer',
          background: 'linear-gradient(180deg, #e7c877, #d4a53a)', color: '#23180a', fontWeight: 800, fontSize: 14,
          boxShadow: '0 3px 11px -3px rgba(212,165,58,0.6), inset 0 1px 0 rgba(255,255,255,0.35)',
        }}>✓ Approve hole</button>
      </div>
    </div>
  )
}

function Chip({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ padding: '6px 12px', borderRadius: 10, background: 'var(--surf2)', border: '1px solid var(--bdr)' }}>
      <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--tx4)' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx1)', marginTop: 1 }}>{value}</div>
    </div>
  )
}
