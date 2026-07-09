import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useYear } from '../context/YearContext'
import { useSyncContext } from '../context/SyncContext'
import { localDb, parseJson } from '../lib/localDb'
import type { Player, Pairing } from '../lib/types'
import { Lock, Shuffle, Save } from 'lucide-react'

export default function Groups() {
  const { isAdmin } = useAuth()
  const { showToast } = useToast()
  const { isCurrentYear, activeTournamentId } = useYear()
  const { isOnline } = useSyncContext()
  const [players, setPlayers] = useState<Player[]>([])
  const [pairings, setPairings] = useState<(Pairing & { player_a?: Player; player_b?: Player })[]>([])
  const [draftPairings, setDraftPairings] = useState<{ a: Player; b: Player; name: string }[]>([])
  const [tab, setTab] = useState<'groups' | 'pairings'>('groups')
  const [pairingsReleased, setPairingsReleased] = useState(false)

  useEffect(() => { fetchData() }, [isOnline])

  const fetchData = async () => {
    if (!isOnline) {
      const localPairings = await localDb.pairings.toArray()
      const localProfiles = await localDb.profiles.where('status').equals('active').toArray()
      setPlayers(localProfiles as Player[])
      const mappedPairings = localPairings.map(p => ({
        id: p.id,
        player_a_id: p.player_a_id,
        player_b_id: p.player_b_id,
        team_name: p.team_name,
        generated_at: p.generated_at,
        player_a: parseJson<Player>(p.player_a_json),
        player_b: parseJson<Player>(p.player_b_json),
      } as Pairing & { player_a?: Player; player_b?: Player }))
      setPairings(mappedPairings)
      setPairingsReleased(mappedPairings.length > 0)
      return
    }
    const [playersRes, pairingsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('status', 'active').order('handicap'),
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
    if (!activeTournamentId) {
      showToast('No active tournament. Create one in the Admin panel first.', 'error')
      return
    }

    // 1. Replace pairings
    await supabase.from('pairings').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    const { error: pErr } = await supabase.from('pairings').insert(
      draftPairings.map(p => ({ player_a_id: p.a.id, player_b_id: p.b.id, team_name: p.name, generated_at: new Date().toISOString() }))
    )
    if (pErr) { showToast(pErr.message, 'error'); return }

    // 2. Clear player team assignments for existing teams in this tournament
    const { data: oldTeams } = await supabase.from('teams').select('id').eq('tournament_id', activeTournamentId)
    if (oldTeams?.length) {
      await supabase.from('profiles').update({ team_id: null }).in('team_id', oldTeams.map(t => t.id))
      await supabase.from('teams').delete().eq('tournament_id', activeTournamentId)
    }

    // 3. Create teams from pairings
    const { data: newTeams, error: tErr } = await supabase
      .from('teams')
      .insert(draftPairings.map(p => ({ name: p.name, p1_id: p.a.id, p2_id: p.b.id, tournament_id: activeTournamentId })))
      .select('id, p1_id, p2_id')
    if (tErr) { showToast(tErr.message, 'error'); return }

    // 4. Assign each player to their new team
    if (newTeams) {
      await Promise.all(
        newTeams.map(t =>
          supabase.from('profiles').update({ team_id: t.id }).in('id', [t.p1_id, t.p2_id].filter(Boolean))
        )
      )
    }

    showToast('Pairings saved — teams created and players assigned!')
    fetchData()
    setDraftPairings([])
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* Header */}
      <div className="animate-fadeUp" style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: 'var(--gold)', letterSpacing: 4, lineHeight: 1.1, margin: 0 }}>
          Groups & Pairings
        </h1>
        <p style={{ color: 'var(--tx3)', fontSize: 13, marginTop: 4 }}>{players.length} confirmed players</p>
      </div>

      {/* Tabs */}
      <div className="pill-tabs animate-fadeUp delay-100" style={{ marginBottom: 20 }}>
        {([['groups', 'Groups'], ['pairings', 'Pairings']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`pill-tab ${tab === id ? 'active' : ''}`}>{label}</button>
        ))}
      </div>

      {/* Groups tab */}
      {tab === 'groups' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {[
            { label: 'Group A', subtitle: `Low HCP (≤ ${Math.round(medianHcp)})`, players: groupA, color: 'var(--gold)' },
            { label: 'Group B', subtitle: `High HCP (> ${Math.round(medianHcp)})`, players: groupB, color: '#60a5fa' },
          ].map(({ label, subtitle, players: grpPlayers, color }, gi) => (
            <div key={label} className={`glass animate-fadeUp ${gi === 0 ? 'delay-200' : 'delay-300'}`} style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '16px', borderBottom: '1px solid var(--bdr)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: 2, color, lineHeight: 1.1 }}>{label}</div>
                  <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 2 }}>{subtitle}</div>
                </div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color, lineHeight: 1, flexShrink: 0 }}>{grpPlayers.length}</div>
              </div>
              {grpPlayers.map((p, i) => (
                <div key={p.id} style={{
                  padding: '12px 16px',
                  borderBottom: i < grpPlayers.length - 1 ? '1px solid var(--bdr)' : 'none',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--tx1)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx3)', background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 999, padding: '2px 8px', flexShrink: 0, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    HCP {p.handicap ?? '—'}
                  </div>
                </div>
              ))}
              {grpPlayers.length === 0 && (
                <div style={{ padding: 16, fontSize: 13, color: 'var(--tx4)', textAlign: 'center' }}>No players yet</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pairings tab */}
      {tab === 'pairings' && (
        <div>
          {isAdmin && isCurrentYear && (
            <div className="animate-fadeUp delay-200" style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
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
            <div className="animate-fadeUp" style={{ marginBottom: 20 }}>
              <div className="section-label" style={{ color: 'var(--gold)', marginBottom: 12 }}>
                📋 Draft — Not Yet Released
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {draftPairings.map((p, i) => (
                  <div key={i} className="glass-flat" style={{ padding: '12px 16px', border: '1px dashed var(--gold-25)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, color: 'var(--tx4)', width: 20, textAlign: 'center', flexShrink: 0 }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: 'var(--gold)', fontSize: 13, letterSpacing: 0.5 }}>{p.name}</div>
                      <div style={{ fontSize: 13, color: 'var(--tx2)', marginTop: 4 }}>
                        {p.a.name} <span style={{ fontSize: 11, color: 'var(--tx4)' }}>HCP {p.a.handicap}</span>
                        <span style={{ color: 'var(--tx4)' }}> & </span>
                        {p.b.name} <span style={{ fontSize: 11, color: 'var(--tx4)' }}>HCP {p.b.handicap}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Released pairings or locked */}
          {!pairingsReleased && draftPairings.length === 0 && !isAdmin && (
            <div className="glass animate-fadeUp delay-200" style={{ padding: '48px 24px', textAlign: 'center' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--surf2)', border: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Lock size={26} color="var(--tx3)" />
              </div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: 'var(--tx2)', letterSpacing: 3 }}>
                Pairings Not Yet Released
              </div>
              <p style={{ color: 'var(--tx4)', fontSize: 13, marginTop: 8 }}>
                The admin will release pairings before the tournament
              </p>
            </div>
          )}

          {pairingsReleased && draftPairings.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {pairings.map((p, i) => (
                <div key={p.id} className="glass animate-fadeUp" style={{ padding: '14px 16px', animationDelay: `${Math.min(i, 6) * 0.06 + 0.2}s` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <span style={{
                      width: 32, height: 32, borderRadius: 10, background: 'var(--gold-08)', border: '1px solid var(--gold-15)',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: i < 3 ? 16 : 14, fontFamily: "'Bebas Neue', sans-serif", color: 'var(--gold)', flexShrink: 0,
                    }}>
                      {i === 0 ? '⛳' : i === 1 ? '🏌️' : i === 2 ? '🎯' : i + 1}
                    </span>
                    <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 2, color: 'var(--gold)', lineHeight: 1.1 }}>
                      {p.team_name}
                    </div>
                  </div>
                  <div>
                    {[p.player_a, p.player_b].map((pl, j) => (
                      <div key={j} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                        padding: '8px 0', borderTop: j === 1 ? '1px solid var(--bdr)' : 'none',
                      }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx1)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {pl?.name ?? '—'}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--tx4)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                          HCP {pl?.handicap ?? '—'}
                        </span>
                      </div>
                    ))}
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
