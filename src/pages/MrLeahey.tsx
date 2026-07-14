import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import type { Player, LeaheyVote } from '../lib/types'

export default function MrLeahey() {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const [players, setPlayers] = useState<Player[]>([])
  const [votes, setVotes] = useState<LeaheyVote[]>([])
  const [myVote, setMyVote] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [casting, setCasting] = useState(false)

  useEffect(() => {
    fetchData()
    const sub = supabase.channel('leahey-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leahey_votes' }, fetchData)
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [])

  useEffect(() => {
    if (profile && votes.length > 0) {
      const mine = votes.find(v => v.voter_id === profile.id)
      setMyVote(mine?.nominee_id ?? null)
      if (mine) setSelected(mine.nominee_id)
    }
  }, [votes, profile])

  const fetchData = async () => {
    const [playersRes, votesRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('status', 'active').order('name'),
      supabase.from('leahey_votes').select('*'),
    ])
    setPlayers(playersRes.data ?? [])
    setVotes(votesRes.data ?? [])
  }

  const castVote = async () => {
    if (!selected || !profile || myVote) return
    setCasting(true)
    const { error } = await supabase.from('leahey_votes').insert({
      voter_id: profile.id,
      nominee_id: selected,
    })
    setCasting(false)
    if (error) {
      if (error.code === '23505') showToast('You already voted!', 'error')
      else showToast(error.message, 'error')
    } else {
      showToast('Vote cast! 🍺 The spirits are with you.')
      fetchData()
    }
  }

  const voteCounts = players.reduce<Record<string, number>>((acc, p) => {
    acc[p.id] = votes.filter(v => v.nominee_id === p.id).length
    return acc
  }, {})

  const maxVotes = Math.max(1, ...Object.values(voteCounts))
  const frontrunner = Object.entries(voteCounts).sort(([,a],[,b]) => b - a)[0]
  const frontrunnerPlayer = players.find(p => p.id === frontrunner?.[0])

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      {/* Header card */}
      <div className="glass animate-fadeUp" style={{
        padding: '32px 28px',
        marginBottom: 24,
        textAlign: 'center',
        background: 'linear-gradient(160deg, #0a5c39 0%, #063a25 100%)',
        borderColor: 'rgba(240,230,200,0.22)',
      }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>🍺</div>
        <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 36, color: '#efe8d2', letterSpacing: 5, margin: '0 0 6px', textShadow: '0 0 24px rgba(0,0,0,0.4)' }}>
          Mr. Leahey Award
        </h1>
        <div style={{ color: 'rgba(240,230,200,0.85)', fontSize: 14 }}>Most Spirited Player of the Tournament</div>
        <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(240,230,200,0.55)', fontStyle: 'italic' }}>
          "I am the liquor." — Jim Lahey
        </div>
      </div>

      {/* Frontrunner */}
      {frontrunnerPlayer && frontrunner[1] > 0 && (
        <div className="glass animate-fadeUp delay-100" style={{ padding: '16px 22px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14, borderColor: 'rgba(212,165,58,0.3)' }}>
          <span style={{ fontSize: 28 }}>👑</span>
          <div>
            <div style={{ fontSize: 11, color: 'rgba(212,165,58,0.7)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
              Current Front-Runner
            </div>
            <div style={{ fontWeight: 700, color: '#D4A53A', fontSize: 17 }}>{frontrunnerPlayer.name}</div>
            <div style={{ fontSize: 12, color: 'var(--tx3)' }}>{frontrunner[1]} vote{frontrunner[1] !== 1 ? 's' : ''}</div>
          </div>
        </div>
      )}

      {/* Already voted notice */}
      {myVote && (
        <div style={{ background: 'rgba(212,165,58,0.08)', border: '1px solid rgba(212,165,58,0.25)', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: 'rgba(212,165,58,0.8)' }}>
          ✅ You've already cast your vote. Live results below.
        </div>
      )}

      {/* Vote grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, marginBottom: 20 }}>
        {players.map(player => {
          const isSelected = selected === player.id
          const isMyVote = myVote === player.id
          return (
            <button
              key={player.id}
              onClick={() => { if (!myVote) setSelected(player.id) }}
              disabled={!!myVote}
              style={{
                padding: '12px',
                borderRadius: 12,
                border: '1px solid',
                borderColor: isSelected ? '#D4A53A' : 'var(--bdr)',
                background: isSelected ? 'rgba(212,165,58,0.15)' : isMyVote ? 'rgba(212,165,58,0.08)' : 'rgba(18,14,6,0.8)',
                color: isSelected ? '#D4A53A' : isMyVote ? 'rgba(212,165,58,0.7)' : 'var(--tx1)',
                cursor: myVote ? 'default' : 'pointer',
                fontWeight: 600, fontSize: 13,
                transition: 'all 0.2s',
                textAlign: 'center',
              }}
            >
              {isMyVote && '✅ '}
              {player.name}
            </button>
          )
        })}
      </div>

      {/* Cast vote button */}
      {!myVote && (
        <button
          className="btn-gold"
          onClick={castVote}
          disabled={!selected || casting}
          style={{ width: '100%', justifyContent: 'center', marginBottom: 28, fontSize: 16, padding: '14px' }}
        >
          {casting ? 'Casting Vote…' : '🍺 Cast Vote'}
        </button>
      )}

      {/* Vote tally */}
      <div className="glass" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--bdr)', fontWeight: 700, color: '#D4A53A', fontSize: 14 }}>
          Live Vote Tally
          <span className="animate-pulseDot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#D4A53A', display: 'inline-block', marginLeft: 8 }} />
        </div>
        {players
          .filter(p => voteCounts[p.id] > 0)
          .sort((a, b) => voteCounts[b.id] - voteCounts[a.id])
          .map((player, i) => {
            const count = voteCounts[player.id]
            const pct = Math.round((count / votes.length) * 100)
            return (
              <div key={player.id} style={{ padding: '12px 20px', borderBottom: '1px solid var(--bdr)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: i === 0 ? '#D4A53A' : 'var(--tx1)' }}>
                    {i === 0 ? '👑 ' : ''}{player.name}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--tx2)' }}>{count} vote{count !== 1 ? 's' : ''} ({pct}%)</span>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: 'var(--surf2)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${(count / maxVotes) * 100}%`,
                    background: i === 0 ? 'linear-gradient(90deg, #D4A53A, #e0a010)' : 'rgba(212,165,58,0.4)',
                    borderRadius: 999,
                    transition: 'width 0.5s ease',
                  }} />
                </div>
              </div>
            )
          })}
        {votes.length === 0 && (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--tx4)', fontSize: 14 }}>
            No votes yet — be the first to raise a glass! 🍺
          </div>
        )}
        {votes.length > 0 && (
          <div style={{ padding: '10px 20px', fontSize: 12, color: 'var(--tx4)', textAlign: 'right' }}>
            {votes.length} total vote{votes.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  )
}
