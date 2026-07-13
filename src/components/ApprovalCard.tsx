import { type GroupTeam, type ScoreRow } from '../lib/scoreTypes'
import { displayName } from '../lib/types'

// A review card for another team's hole entry — used both in the score sheet
// (when advancing is blocked) and in the GPS approval banner.
export function ApprovalCard({ team, score, hole, onApprove, onDispute }: {
  team: GroupTeam
  score: ScoreRow
  hole: number
  onApprove: () => void
  onDispute: () => void
}) {
  const drivePlayer = [team.player1, team.player2].find(p => p?.id === score.drive_used_id)
  const driveName = drivePlayer ? displayName(drivePlayer) : null
  const chs = team.chulligans.filter(c => c.hole === hole)
  return (
    <div style={{ padding: '13px 15px', borderRadius: 12, background: 'rgba(212,165,58,0.06)', border: '1px solid rgba(212,165,58,0.25)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span style={{ fontWeight: 800, color: 'var(--tx1)', fontSize: 14 }}>{team.name}</span>
        <span style={{ fontSize: 11, color: 'var(--tx4)' }}>hole {hole}</span>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--tx3)', display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
        <span>Score <strong style={{ color: 'var(--tx1)', fontSize: 14 }}>{score.score}</strong></span>
        <span>Putts <strong style={{ color: 'var(--tx1)' }}>{score.putts ?? '—'}</strong></span>
        {driveName && <span>Drive <strong style={{ color: 'var(--tx1)' }}>{driveName}</strong></span>}
        {chs.length > 0 && <span>🍺 {chs.length}</span>}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onDispute} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)', color: '#f87171', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Something's off</button>
        <button onClick={onApprove} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: '#D4A53A', color: '#1a1206', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>✓ Approve</button>
      </div>
    </div>
  )
}
