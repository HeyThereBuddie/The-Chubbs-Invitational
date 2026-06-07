import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import type { Player, Pairing } from '../lib/types'
import { Lock, Shuffle, Save } from 'lucide-react'

export default function Groups() {
  const { isAdmin } = useAuth()
  const { showToast } = useToast()
  const [players, setPlayers] = useState<Player[]>([])
  const [pairings, setPairings] = useState<(Pairing & { player_a?: Player; player_b?: Player })[]>([])
  const [draftPairings, setDraftPairings] = useState<{ a: Player; b: Player; name: string }[]>([])
  const [tab, setTab] = useState<'groups' | 'pairings'>('groups')
  const [pairingsReleased, setPairingsReleased] = useState(false)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const [playersRes, pairingsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('status', 'active').eq('role', 'player').order('handicap'),
      supabase.from('pairings').select('*, player_a:profiles!pairings_player_a_id_fkey(*), player_b:profiles!pairings_player_b_id_fkey(*)').order('generated_at', { ascending: false }),
    ])
    setPlayers(playersRes.data ?? [])
    const saved = pairingsRes.data ?? []
    setPairings(saved)
    setPairingsReleased(saved.length > 0)
  }

  const median = (arr: number[]) => {
    if (!arr.length) return 0
    const sorted = [...arr].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  }

  const medianHcp = median(players.map(p => p.handicap ?? 18))
  const groupA = players.filter(p => (p.handicap ?? 18) <= medianHcp)
  const groupB = players.filter(p => (p.handicap ?? 18) > medianHcp)

  const generatePairings = () => {
    const a = [...groupA].sort(() => Math.random() - 0.5)
    const b = [...groupB].sort(() => Math.random() - 0.5)
    const count = Math.min(a.length, b.length)
    const draft = Array.from({ length: count }, (_, i) => ({
      a: a[i], b: b[i],
      name: `Team ${i + 1}`,
    }))
    setDraftPairings(draft)
  }

  const savePairings = async () => {
    // Clear existing
    await supabase.from('pairings').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    const inserts = draftPairings.map(p => ({
      player_a_id: p.a.id,
      player_b_id: p.b.id,
      team_name: p.name,
      generated_at: new Date().toISOString(),
    }))
    const { error } = await supabase.from('pairings').insert(inserts)
    if (error) showToast(error.message, 'error')
    else { showToast('Pairings saved and released!'); fetchData(); setDraftPairings([]) }
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 32, color: '#FCB514', letterSpacing: 4 }}>Groups & Pairings</h1>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>{players.length} confirmed players</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {([['groups', 'Groups'], ['pairings', 'Pairings']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`pill-tab ${tab === id ? 'active' : ''}`}>{label}</button>
        ))}
      </div>

      {/* Groups tab */}
      {tab === 'groups' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          {[
            { label: 'Group A', subtitle: `Low HCP (≤ ${Math.round(medianHcp)})`, players: groupA, color: '#FCB514' },
            { label: 'Group B', subtitle: `High HCP (> ${Math.round(medianHcp)})`, players: groupB, color: '#60a5fa' },
          ].map(({ label, subtitle, players: grpPlayers, color }) => (
            <div key={label} className="glass" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, color, fontSize: 15 }}>{label}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{subtitle}</div>
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color }}>{grpPlayers.length}</div>
              </div>
              {grpPlayers.map((p, i) => (
                <div key={p.id} style={{
                  padding: '10px 18px',
                  borderBottom: i < grpPlayers.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#fff' }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>HCP {p.handicap ?? '—'}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Pairings tab */}
      {tab === 'pairings' && (
        <div>
          {isAdmin && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
              <button className="btn-gold" onClick={generatePairings}>
                <Shuffle size={14} /> Generate Pairings
              </button>
              {draftPairings.length > 0 && (
                <button className="btn-outline" onClick={savePairings}>
                  <Save size={14} /> Save & Release
                </button>
              )}
            </div>
          )}

          {/* Draft pairings preview */}
          {draftPairings.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: 'rgba(252,181,20,0.7)', marginBottom: 10, fontWeight: 600 }}>
                📋 Draft — Not Yet Released
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {draftPairings.map((p, i) => (
                  <div key={i} className="glass" style={{ padding: '12px 18px', borderColor: 'rgba(252,181,20,0.2)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', width: 20 }}>{i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, color: '#FCB514', fontSize: 14 }}>{p.name}</div>
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
                        {p.a.name} (HCP {p.a.handicap}) & {p.b.name} (HCP {p.b.handicap})
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Released pairings or locked */}
          {!pairingsReleased && draftPairings.length === 0 && !isAdmin && (
            <div className="glass" style={{ padding: 48, textAlign: 'center' }}>
              <Lock size={40} color="rgba(255,255,255,0.2)" style={{ margin: '0 auto 16px' }} />
              <div style={{ fontFamily: 'Bebas Neue', fontSize: 24, color: 'rgba(255,255,255,0.4)', letterSpacing: 3 }}>
                Pairings Not Yet Released
              </div>
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 8 }}>
                The admin will release pairings before the tournament
              </p>
            </div>
          )}

          {pairingsReleased && draftPairings.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pairings.map((p, i) => (
                <div key={p.id} className="glass" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 20, width: 24 }}>
                    {i === 0 ? '⛳' : i === 1 ? '🏌️' : i === 2 ? '🎯' : `${i+1}`}
                  </span>
                  <div>
                    <div style={{ fontWeight: 700, color: '#FCB514', fontSize: 14 }}>{p.team_name}</div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
                      {p.player_a?.name} & {p.player_b?.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>
                      HCP {p.player_a?.handicap ?? '—'} & HCP {p.player_b?.handicap ?? '—'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
