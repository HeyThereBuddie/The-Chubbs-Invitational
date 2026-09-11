import { useRyderCup, fmtPts, type RyderMatch } from '../hooks/useRyderCup'

const BLUE = '#2563eb'
const RED = '#e0402f'
const AUGUSTA = '#0a5c39'
const AUGUSTA_DEEP = '#063a25'
const CREAM = '#efe8d2'
const GOLD_SOFT = '#e7c877'

// Read-only Ryder Cup scoreboard. Sits as its own tile on the leaderboard and
// never touches the tournament standings.
export function RyderCupTile({ live }: { live?: boolean }) {
  const r = useRyderCup()
  if (r.loading || !r.enabled) return null

  const total = r.squadATotal + r.squadBTotal
  const aPct = total > 0 ? (r.squadATotal / total) * 100 : 50

  return (
    <div data-tour="ryder-tile" className="glass animate-fadeUp" style={{ padding: 0, overflow: 'hidden', borderColor: 'var(--bdr)', marginBottom: 16 }}>
      {/* Title strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: `linear-gradient(180deg, ${AUGUSTA}, ${AUGUSTA_DEEP})` }}>
        <span style={{ fontSize: 17 }}>🏅</span>
        <span style={{ fontFamily: 'Bebas Neue', fontSize: 20, letterSpacing: 2.5, color: CREAM }}>Waterbury Open</span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {r.target > 0 && (
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: GOLD_SOFT, textTransform: 'uppercase' }}>First to {fmtPts(r.target)}</span>
          )}
          {live && (
            <>
              <span className="animate-pulseDot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', display: 'inline-block' }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: '#bbf7d0', letterSpacing: 1.5, textTransform: 'uppercase' }}>Live</span>
            </>
          )}
        </span>
      </div>

      {r.matches.length === 0 ? (
        <div style={{ padding: '26px 20px', textAlign: 'center', color: 'var(--tx4)', fontSize: 13, lineHeight: 1.6 }}>
          Waiting for pairings — assign teams to squads and set tee times, and the matches show up here.
        </div>
      ) : (
        <>
          {/* Header scoreboard */}
          <div style={{ padding: '16px 18px 14px', background: 'linear-gradient(180deg, rgba(0,0,0,0.02), transparent)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <div style={{ textAlign: 'left', minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: BLUE, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.squadAName}</div>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: 52, lineHeight: 0.9, color: BLUE, fontVariantNumeric: 'tabular-nums' }}>{fmtPts(r.squadATotal)}</div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx4)', paddingBottom: 10, flexShrink: 0, padding: '0 10px 10px' }}>vs</div>
              <div style={{ textAlign: 'right', minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: RED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.squadBName}</div>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: 52, lineHeight: 0.9, color: RED, fontVariantNumeric: 'tabular-nums' }}>{fmtPts(r.squadBTotal)}</div>
              </div>
            </div>
            {/* split bar */}
            <div style={{ marginTop: 12, height: 10, borderRadius: 6, overflow: 'hidden', display: 'flex', background: 'var(--surf2)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.12)' }}>
              <div style={{ width: `${aPct}%`, background: `linear-gradient(90deg, ${BLUE}, #3b82f6)`, transition: 'width 0.4s ease' }} />
              <div style={{ width: `${100 - aPct}%`, background: `linear-gradient(90deg, #ef5344, ${RED})`, transition: 'width 0.4s ease' }} />
            </div>
            <div style={{ textAlign: 'center', marginTop: 7, fontSize: 11, color: 'var(--tx4)', fontWeight: 600 }}>
              {fmtPts(r.pointsPlayed)} of {r.pointsPossible} points played
              {r.pointsPossible - r.pointsPlayed > 0 ? ` · ${fmtPts(r.pointsPossible - r.pointsPlayed)} still on the course` : ''}
            </div>
          </div>

          {/* Match list */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '6px 18px', background: 'var(--surf)', fontSize: 10, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--tx4)' }}>
            <span style={{ flex: 1 }}>Matches</span>
            <span>Points</span>
          </div>
          {r.matches.map(m => <MatchRow key={m.key} m={m} aName={r.squadAName} bName={r.squadBName} />)}
        </>
      )}
    </div>
  )
}

// The distinctive word of a squad name for the compact status line ("Team Drew" → "DREW").
const shortLabel = (name: string) => (name.trim().split(/\s+/).pop() || name).toUpperCase()

function MatchRow({ m, aName, bName }: { m: RyderMatch; aName: string; bName: string }) {
  const diff = m.left.points - m.right.points
  const leadColor = diff > 0 ? BLUE : diff < 0 ? RED : 'var(--tx4)'
  // Colour each team's name by its squad so you can see who's on which side.
  const squadColor = (s: 'A' | 'B' | null) => (s === 'A' ? BLUE : s === 'B' ? RED : 'var(--tx1)')
  const leader = diff > 0 ? m.left : m.right
  const leaderLabel = shortLabel(leader.squad === 'A' ? aName : leader.squad === 'B' ? bName : leader.pairing)

  let status: string
  if (m.complete) {
    status = diff === 0 ? 'HALVED · FINAL' : `${leaderLabel} WINS · FINAL`
  } else if (diff === 0) {
    status = `ALL SQUARE · THRU ${m.thru}`
  } else {
    status = `${leaderLabel} ${fmtPts(Math.abs(diff))} UP · THRU ${m.thru}`
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderTop: '1px solid var(--bdr)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: diff >= 0 ? 800 : 600, color: squadColor(m.left.squad), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.left.pairing}</div>
        <div style={{ fontSize: 14, fontWeight: diff <= 0 ? 800 : 600, color: squadColor(m.right.squad), marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.right.pairing}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
          <span style={{ fontFamily: 'Bebas Neue', fontSize: 20, color: diff >= 0 ? BLUE : 'var(--tx4)', fontVariantNumeric: 'tabular-nums' }}>{fmtPts(m.left.points)}</span>
          <span style={{ fontSize: 11, color: 'var(--tx4)' }}>—</span>
          <span style={{ fontFamily: 'Bebas Neue', fontSize: 20, color: diff <= 0 ? RED : 'var(--tx4)', fontVariantNumeric: 'tabular-nums' }}>{fmtPts(m.right.points)}</span>
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, color: leadColor, letterSpacing: 0.5, marginTop: 2 }}>{status}</div>
      </div>
    </div>
  )
}
