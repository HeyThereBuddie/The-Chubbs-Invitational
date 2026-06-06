import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Team, Player } from '../lib/types'
import { Minus, Plus } from 'lucide-react'

const HOLE_PARS = [4,4,3,5,4,3,4,5,4, 4,3,5,4,4,3,5,4,4]

function scoreBubbleClass(score: number, par: number): string {
  const diff = score - par
  if (diff <= -2) return 'score-eagle'
  if (diff === -1) return 'score-birdie'
  if (diff === 0) return 'score-par'
  if (diff === 1) return 'score-bogey'
  return 'score-double'
}

export default function Scores() {
  const [teams, setTeams] = useState<(Team & { player1?: Player; player2?: Player })[]>([])
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null)
  const [scores, setScores] = useState<Record<number, number>>({})
  const [half, setHalf] = useState<'front' | 'back'>('front')
  const [saving, setSaving] = useState<number | null>(null)

  useEffect(() => {
    fetchTeams()
  }, [])

  useEffect(() => {
    if (!selectedTeam) return
    fetchScores(selectedTeam)

    const sub = supabase.channel('scores-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, () => {
        fetchScores(selectedTeam)
      })
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  }, [selectedTeam])

  const fetchTeams = async () => {
    const { data } = await supabase
      .from('teams')
      .select('*, player1:players!teams_p1_id_fkey(*), player2:players!teams_p2_id_fkey(*)')
    if (data?.length) {
      setTeams(data)
      setSelectedTeam(data[0].id)
    }
  }

  const fetchScores = async (teamId: string) => {
    const { data } = await supabase.from('scores').select('*').eq('team_id', teamId)
    const map: Record<number, number> = {}
    for (const s of data ?? []) map[s.hole] = s.score
    setScores(map)
  }

  const saveScore = useCallback(async (hole: number, score: number) => {
    if (!selectedTeam || score < 1) return
    setSaving(hole)
    const existing = scores[hole]

    if (existing !== undefined) {
      const { data: rows } = await supabase.from('scores').select('id').eq('team_id', selectedTeam).eq('hole', hole).single()
      if (rows) {
        await supabase.from('scores').update({ score }).eq('id', rows.id)
      }
    } else {
      await supabase.from('scores').insert({ team_id: selectedTeam, hole, score })
    }

    setScores(prev => ({ ...prev, [hole]: score }))
    setSaving(null)
  }, [selectedTeam, scores])

  const adjust = (hole: number, delta: number) => {
    const cur = scores[hole] ?? HOLE_PARS[hole - 1]
    const next = Math.max(1, cur + delta)
    setScores(prev => ({ ...prev, [hole]: next }))
    saveScore(hole, next)
  }

  const holes = half === 'front' ? Array.from({ length: 9 }, (_, i) => i + 1) : Array.from({ length: 9 }, (_, i) => i + 10)
  const allScores = Object.values(scores)
  const gross = allScores.reduce((a, b) => a + b, 0)
  const thru = allScores.length
  const toPar = gross - HOLE_PARS.slice(0, thru).reduce((a, b) => a + b, 0)
  const toParStr = toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : `${toPar}`

  const selectedTeamObj = teams.find(t => t.id === selectedTeam)

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 32, color: '#FCB514', letterSpacing: 4 }}>Scores</h1>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Best ball — one score per hole per team</p>
      </div>

      {/* Team selector */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, marginBottom: 16 }}>
        {teams.map(t => (
          <button
            key={t.id}
            onClick={() => setSelectedTeam(t.id)}
            className={`pill-tab ${selectedTeam === t.id ? 'active' : ''}`}
          >
            {t.name}
          </button>
        ))}
      </div>

      {/* Selected team info + totals */}
      {selectedTeamObj && (
        <div className="glass animate-fadeUp" style={{ padding: '16px 20px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#FCB514' }}>{selectedTeamObj.name}</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
              {[selectedTeamObj.player1?.name, selectedTeamObj.player2?.name].filter(Boolean).join(' & ')}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 20, textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: toPar <= 0 ? '#FCB514' : '#fff' }}>{toParStr}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>To Par</div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{gross || '—'}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Gross</div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{thru}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Thru</div>
            </div>
          </div>
        </div>
      )}

      {/* Front / Back toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['front', 'back'] as const).map(h => (
          <button
            key={h}
            onClick={() => setHalf(h)}
            className={`pill-tab ${half === h ? 'active' : ''}`}
          >
            {h === 'front' ? 'Front 9 (1–9)' : 'Back 9 (10–18)'}
          </button>
        ))}
      </div>

      {/* Hole cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {holes.map(hole => {
          const par = HOLE_PARS[hole - 1]
          const score = scores[hole]
          const hasScore = score !== undefined
          const cls = hasScore ? scoreBubbleClass(score, par) : 'score-empty'

          return (
            <div key={hole} className="glass animate-fadeUp" style={{
              padding: '14px 20px',
              display: 'flex', alignItems: 'center', gap: 16,
              opacity: saving === hole ? 0.7 : 1,
              transition: 'opacity 0.2s',
            }}>
              <div style={{ width: 36, textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{hole}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Par {par}</div>
              </div>

              <div style={{ flex: 1 }} />

              {/* Score bubble */}
              <div className={`score-bubble ${cls}`} style={{ width: 44, height: 44, fontSize: 16 }}>
                {hasScore ? score : '—'}
              </div>

              {/* +/- buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => adjust(hole, -1)}
                  disabled={saving === hole || (hasScore && score <= 1)}
                  style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Minus size={14} />
                </button>
                <button
                  onClick={() => adjust(hole, 1)}
                  disabled={saving === hole}
                  style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: 'rgba(252,181,20,0.15)',
                    border: '1px solid rgba(252,181,20,0.3)',
                    color: '#FCB514', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Live indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16, color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
        <span className="animate-pulseDot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#FCB514', display: 'inline-block' }} />
        Scores sync in real-time to all connected devices
      </div>
    </div>
  )
}
