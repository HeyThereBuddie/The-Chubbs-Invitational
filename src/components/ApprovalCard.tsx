import { type GroupTeam, type ScoreRow, scoreBubbleClass } from '../lib/scoreTypes'
import { displayName } from '../lib/types'
import { useCourse } from '../context/CourseContext'

// A review card for another team's hole entry — used both in the score sheet
// (when advancing is blocked) and in the GPS approval banner.
export function ApprovalCard({ team, score, hole, onApprove }: {
  team: GroupTeam
  score: ScoreRow
  hole: number
  onApprove: () => void
}) {
  const { parOf } = useCourse()
  const par = parOf(hole)
  const drivePlayer = [team.player1, team.player2].find(p => p?.id === score.drive_used_id)
  const driveName = drivePlayer ? displayName(drivePlayer) : null
  const chs = team.chulligans.filter(c => c.hole === hole)
  // Name who took each chulligan on this hole (first name), so it's clear.
  const chNames = chs.map(c => {
    const p = [team.player1, team.player2].find(x => x?.id === c.player_id)
    return p ? displayName(p).split(/\s+/)[0] : null
  }).filter(Boolean) as string[]
  const chulliganValue = chs.length === 0 ? 'None' : chNames.length ? `🍺 ${chNames.join(' & ')}` : `🍺 ${chs.length}`
  const toPar = score.score - par
  const toParStr = toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : `${toPar}`

  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(240,230,200,0.18)', boxShadow: '0 12px 28px -18px rgba(0,0,0,0.6)' }}>
      {/* Augusta header — team + the score they posted */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', background: 'linear-gradient(180deg, #0a5c39, #063a25)', borderBottom: '1px solid rgba(0,0,0,0.28)' }}>
        <svg width="30" height="30" viewBox="0 0 100 100" aria-hidden="true" style={{ flexShrink: 0 }}>
          <circle cx="50" cy="50" r="48" fill="#063a25" stroke="#d4a53a" strokeWidth="4" />
          <path d="M40 74 L40 28 L69 35 L40 42" fill="#e0402f" />
          <rect x="37.5" y="26" width="3" height="48" rx="1.5" fill="#efe8d2" />
        </svg>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(240,230,200,0.72)' }}>Review · Hole {hole}</div>
          <div style={{ fontFamily: 'Bebas Neue', fontSize: 25, letterSpacing: 1.5, color: '#ffffff', lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{team.name}</div>
        </div>
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div className={`score-bubble ${scoreBubbleClass(score.score, par)}`} style={{ width: 58, height: 58, fontSize: 32, color: '#ffffff', fontWeight: 800, margin: '0 auto' }}>{score.score}</div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: 'rgba(240,230,200,0.82)', marginTop: 5 }}>{toParStr} · PAR {par}</div>
        </div>
      </div>

      {/* Detail chips */}
      <div style={{ display: 'flex', gap: 8, padding: '13px 16px', background: 'var(--surf)', flexWrap: 'wrap' }}>
        <Chip label="Putts" value={score.putts ?? '—'} />
        {driveName && <Chip label="Drive" value={driveName} />}
        <Chip label={chs.length === 1 ? 'Chulligan' : 'Chulligans'} value={chulliganValue} />
      </div>

      {/* Action — approve only. Groups sort out any discrepancy in person, then approve. */}
      <div style={{ padding: '14px 16px', background: 'var(--panel)' }}>
        <button onClick={onApprove} className="pressable" style={{
          width: '100%', padding: '14px', borderRadius: 12, border: 'none', cursor: 'pointer',
          background: 'linear-gradient(180deg, #e7c877, #d4a53a)', color: '#23180a', fontWeight: 800, fontSize: 16,
          boxShadow: '0 3px 11px -3px rgba(212,165,58,0.6), inset 0 1px 0 rgba(255,255,255,0.35)',
        }}>✓ Approve hole</button>
      </div>
    </div>
  )
}

function Chip({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ padding: '8px 14px', borderRadius: 11, background: 'var(--surf2)', border: '1px solid var(--bdr)' }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--tx3)' }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--tx1)', marginTop: 2 }}>{value}</div>
    </div>
  )
}
