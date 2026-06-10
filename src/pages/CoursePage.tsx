import { useState } from 'react'
import { Flag, Ruler, Hash } from 'lucide-react'

interface HoleData {
  hole: number
  name: string
  par: number
  yards: number
  si: number
  tip: string
}

const HOLES: HoleData[] = [
  { hole: 1,  name: 'Tea Olive',           par: 4, yards: 435, si: 5,  tip: 'Aim left-centre off the tee to avoid the fairway bunker on the right.' },
  { hole: 2,  name: 'Pink Dogwood',        par: 4, yards: 420, si: 11, tip: 'Elevated green — take an extra club on your approach.' },
  { hole: 3,  name: 'Flowering Peach',     par: 3, yards: 170, si: 15, tip: 'Front bunkers are the main threat. Favour the middle of the green.' },
  { hole: 4,  name: 'Flowering Crabapple', par: 5, yards: 510, si: 3,  tip: 'Reachable in two — layup short of the creek or go for the green and risk it.' },
  { hole: 5,  name: 'Magnolia',            par: 4, yards: 450, si: 1,  tip: 'The hardest hole on the course. Long and tight. Make par and walk away happy.' },
  { hole: 6,  name: 'Juniper',             par: 3, yards: 185, si: 17, tip: 'Wind plays tricks here. Club up and aim centre — bunkers guard both sides.' },
  { hole: 7,  name: 'Pampas',              par: 4, yards: 410, si: 9,  tip: 'Stay left off the tee. The right rough leaves a blind approach.' },
  { hole: 8,  name: 'Yellow Jasmine',      par: 5, yards: 555, si: 7,  tip: 'Two big drives can reach the green in two — but the back falls away sharply.' },
  { hole: 9,  name: 'Carolina Cherry',     par: 4, yards: 460, si: 13, tip: 'Uphill approach. The green appears closer than it is — take at least two clubs extra.' },
  { hole: 10, name: 'Camellia',            par: 4, yards: 445, si: 2,  tip: 'Downhill tee shot, then uphill approach. A true two-shot hole.' },
  { hole: 11, name: 'White Dogwood',       par: 3, yards: 195, si: 16, tip: 'Water left punishes anything pulled. Aim right-centre and take two putts.' },
  { hole: 12, name: 'Golden Bell',         par: 5, yards: 520, si: 8,  tip: 'Amen Corner — creek fronts the green on the approach. Lay up or fly it clean.' },
  { hole: 13, name: 'Azalea',              par: 4, yards: 440, si: 4,  tip: 'Dogleg left — cut the corner with a big drive to open up the approach.' },
  { hole: 14, name: 'Chinese Fir',         par: 4, yards: 430, si: 10, tip: 'No bunkers, but the undulating green is the toughest read on the course.' },
  { hole: 15, name: 'Firethorn',           par: 3, yards: 165, si: 18, tip: 'Pond fronts the green. Take enough club and you\'ll have a genuine birdie putt.' },
  { hole: 16, name: 'Redbud',              par: 5, yards: 530, si: 6,  tip: 'Water guards the left all the way in. Big hitters go for it; everyone else lays up.' },
  { hole: 17, name: 'Nandina',             par: 4, yards: 440, si: 12, tip: 'Classic risk/reward second shot over bunkers to a narrow elevated green.' },
  { hole: 18, name: 'Holly',               par: 4, yards: 465, si: 14, tip: 'Uphill finishing hole with bunkers left and right. A par here feels like a birdie.' },
]

const PAR_COLORS: Record<number, { bg: string; text: string; label: string }> = {
  3: { bg: 'rgba(34,197,94,0.15)',  text: '#22c55e', label: 'Par 3' },
  4: { bg: 'var(--tx5)', text: 'var(--tx2)', label: 'Par 4' },
  5: { bg: 'rgba(252,181,20,0.15)', text: '#FCB514', label: 'Par 5' },
}

type Nine = 'front' | 'back' | 'all'

export default function CoursePage() {
  const [nine, setNine] = useState<Nine>('front')

  const holes = nine === 'front' ? HOLES.slice(0, 9) : nine === 'back' ? HOLES.slice(9) : HOLES
  const totalYards = holes.reduce((sum, h) => sum + h.yards, 0)
  const totalPar   = holes.reduce((sum, h) => sum + h.par,   0)

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>

      {/* Header */}
      <div className="glass" style={{ padding: '20px 24px', marginBottom: 20, borderRadius: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontFamily: 'Bebas Neue', fontSize: 28, color: '#FCB514', letterSpacing: 3, lineHeight: 1 }}>
              Augusta Pines GC
            </div>
            <div style={{ fontSize: 12, color: 'var(--tx3)', letterSpacing: 2, textTransform: 'uppercase', marginTop: 4 }}>
              Demo Course · Replace with your venue
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#FCB514', lineHeight: 1 }}>{totalPar}</div>
              <div style={{ fontSize: 10, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 }}>Par</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--tx1)', lineHeight: 1 }}>{totalYards.toLocaleString()}</div>
              <div style={{ fontSize: 10, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 }}>Yards</div>
            </div>
          </div>
        </div>
      </div>

      {/* Nine tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['front', 'back', 'all'] as Nine[]).map(n => (
          <button
            key={n}
            onClick={() => setNine(n)}
            className={`pill-tab${nine === n ? ' active' : ''}`}
          >
            {n === 'front' ? 'Front 9' : n === 'back' ? 'Back 9' : 'All 18'}
          </button>
        ))}
      </div>

      {/* Hole cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {holes.map(h => {
          const pc = PAR_COLORS[h.par]
          return (
            <div key={h.hole} className="glass" style={{ borderRadius: 14, overflow: 'hidden' }}>
              {/* Top row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px 10px' }}>

                {/* Hole number */}
                <div style={{
                  width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                  background: 'rgba(252,181,20,0.08)', border: '1px solid rgba(252,181,20,0.2)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                }}>
                  <div style={{ fontSize: 8, color: 'var(--tx4)', letterSpacing: 1, textTransform: 'uppercase', lineHeight: 1 }}>Hole</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#FCB514', lineHeight: 1 }}>{h.hole}</div>
                </div>

                {/* Name + par badge */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx1)' }}>{h.name}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                      background: pc.bg, color: pc.text,
                    }}>
                      {pc.label}
                    </span>
                  </div>
                </div>

                {/* Stats */}
                <div style={{ display: 'flex', gap: 14, flexShrink: 0 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                      <Ruler size={11} color="var(--tx4)" />
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx1)' }}>{h.yards}</span>
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--tx4)', textTransform: 'uppercase', letterSpacing: 1 }}>yds</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                      <Hash size={11} color="var(--tx4)" />
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx2)' }}>{h.si}</span>
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--tx4)', textTransform: 'uppercase', letterSpacing: 1 }}>SI</div>
                  </div>
                </div>
              </div>

              {/* Tip */}
              <div style={{
                margin: '0 16px 14px',
                padding: '8px 12px',
                borderRadius: 8,
                background: 'rgba(252,181,20,0.05)',
                borderLeft: '2px solid rgba(252,181,20,0.25)',
                display: 'flex', alignItems: 'flex-start', gap: 8,
              }}>
                <Flag size={12} color="#FCB514" style={{ flexShrink: 0, marginTop: 2 }} />
                <span style={{ fontSize: 12, color: 'var(--tx2)', lineHeight: 1.55 }}>{h.tip}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
