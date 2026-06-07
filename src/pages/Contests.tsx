import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import type { ContestEntry, Player, LeaheyVote } from '../lib/types'
import { Target, Upload } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

type ContestType = 'ctp' | 'ld' | 'lahey'

export default function Contests() {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const [tab, setTab] = useState<ContestType>('ctp')

  // CTP / LD state
  const [entries, setEntries] = useState<(ContestEntry & { player?: Player })[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [form, setForm] = useState({ player_id: '', hole: '1' })
  const [photo, setPhoto] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Lahey state
  const [votes, setVotes] = useState<LeaheyVote[]>([])
  const [myVote, setMyVote] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [casting, setCasting] = useState(false)

  useEffect(() => {
    if (tab === 'lahey') {
      fetchLaheyData()
      const sub = supabase.channel('leahey-rt')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'leahey_votes' }, fetchLaheyData)
        .subscribe()
      return () => { supabase.removeChannel(sub) }
    } else {
      fetchContestData()
      const sub = supabase.channel('contests-rt')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'contest_entries' }, fetchContestData)
        .subscribe()
      return () => { supabase.removeChannel(sub) }
    }
  }, [tab])

  useEffect(() => {
    if (profile && votes.length > 0) {
      const mine = votes.find(v => v.voter_id === profile.id)
      setMyVote(mine?.nominee_id ?? null)
      if (mine) setSelected(mine.nominee_id)
    } else if (profile && votes.length === 0) {
      setMyVote(null)
    }
  }, [votes, profile])

  const fetchContestData = async () => {
    const [entriesRes, playersRes] = await Promise.all([
      supabase.from('contest_entries').select('*, player:profiles(*)').eq('type', tab).order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').eq('status', 'active').order('name'),
    ])
    setEntries(entriesRes.data ?? [])
    setPlayers(playersRes.data ?? [])
  }

  const fetchLaheyData = async () => {
    const [playersRes, votesRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('status', 'active').order('name'),
      supabase.from('leahey_votes').select('*'),
    ])
    setPlayers(playersRes.data ?? [])
    setVotes(votesRes.data ?? [])
  }

  const submitContest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.player_id) { showToast('Select a player', 'error'); return }

    setSubmitting(true)
    let photo_url: string | null = null

    if (photo) {
      const ext = photo.name.split('.').pop()
      const path = `${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage.from('contest-photos').upload(path, photo)
      if (uploadErr) { showToast('Photo upload failed', 'error'); setSubmitting(false); return }
      const { data: urlData } = supabase.storage.from('contest-photos').getPublicUrl(path)
      photo_url = urlData.publicUrl
    }

    const { error } = await supabase.from('contest_entries').insert({
      type: tab,
      player_id: form.player_id,
      hole: +form.hole,
      distance: '',
      photo_url,
    })

    setSubmitting(false)
    if (error) showToast(error.message, 'error')
    else {
      showToast('Entry submitted! 🎯')
      setForm({ player_id: '', hole: '1' })
      setPhoto(null)
      fetchContestData()
    }
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
      fetchLaheyData()
    }
  }

  // ── Lahey vote tally helpers ─────────────────────────────────

  const voteCounts = players.reduce<Record<string, number>>((acc, p) => {
    acc[p.id] = votes.filter(v => v.nominee_id === p.id).length
    return acc
  }, {})

  const maxVotes = Math.max(1, ...Object.values(voteCounts))
  const frontrunnerEntry = Object.entries(voteCounts).sort(([, a], [, b]) => b - a)[0]
  const frontrunnerPlayer = frontrunnerEntry && frontrunnerEntry[1] > 0
    ? players.find(p => p.id === frontrunnerEntry[0])
    : null

  // ── Render ───────────────────────────────────────────────────

  const leader = entries[0]

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 32, color: '#FCB514', letterSpacing: 4 }}>Contests</h1>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Closest to Pin, Longest Drive & The Lahey</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <button onClick={() => setTab('ctp')} className={`pill-tab ${tab === 'ctp' ? 'active' : ''}`}>🎯 Closest to Pin</button>
        <button onClick={() => setTab('ld')}  className={`pill-tab ${tab === 'ld'  ? 'active' : ''}`}>💥 Longest Drive</button>
        <button onClick={() => setTab('lahey')} className={`pill-tab ${tab === 'lahey' ? 'active' : ''}`}>🍺 Jim Lahey Award</button>
      </div>

      {/* ── CTP / LD ─────────────────────────────────────────────── */}
      {(tab === 'ctp' || tab === 'ld') && (
        <>
          {leader && (
            <div className="glass animate-fadeUp" style={{ padding: '14px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14, borderColor: 'rgba(252,181,20,0.4)', background: 'rgba(252,181,20,0.05)' }}>
              <span style={{ fontSize: 28 }}>{tab === 'ctp' ? '🎯' : '💥'}</span>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(252,181,20,0.7)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Current Leader</div>
                <div style={{ fontWeight: 700, color: '#FCB514', fontSize: 16 }}>{leader.player?.name}</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Hole {leader.hole}</div>
              </div>
            </div>
          )}

          <div className="glass" style={{ padding: 20, marginBottom: 20 }}>
            <div style={{ fontWeight: 700, color: '#FCB514', marginBottom: 14, fontSize: 14 }}>
              <Target size={14} style={{ display: 'inline', marginRight: 6 }} />
              Submit Entry
            </div>
            <form onSubmit={submitContest}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 4 }}>Player *</label>
                  <select value={form.player_id} onChange={e => setForm(f => ({ ...f, player_id: e.target.value }))}>
                    <option value="">Select player</option>
                    {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 4 }}>Hole *</label>
                  <input type="number" min={1} max={18} value={form.hole} onChange={e => setForm(f => ({ ...f, hole: e.target.value }))} />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 6 }}>Photo (optional)</label>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => setPhoto(e.target.files?.[0] ?? null)} />
                <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()}>
                  <Upload size={13} /> {photo ? photo.name : 'Upload Photo'}
                </button>
              </div>
              <button type="submit" className="btn-gold" disabled={submitting}>
                {submitting ? 'Submitting…' : `Submit ${tab === 'ctp' ? 'CTP' : 'LD'} Entry`}
              </button>
            </form>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {entries.length === 0 && (
              <div className="glass" style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>
                No entries yet — be the first!
              </div>
            )}
            {entries.map((entry, i) => (
              <div key={entry.id} className="glass animate-fadeUp" style={{
                padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14,
                borderColor: i === 0 ? 'rgba(252,181,20,0.3)' : undefined,
              }}>
                <div style={{ fontSize: 20, width: 28, textAlign: 'center' }}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: '#fff', fontSize: 14 }}>{entry.player?.name}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                    Hole {entry.hole} • {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                  </div>
                </div>
                {entry.photo_url && (
                  <img src={entry.photo_url} alt="Entry photo"
                    style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(252,181,20,0.2)' }} />
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Mr. Jim Lahey Award ──────────────────────────────────── */}
      {tab === 'lahey' && (
        <>
          <div className="glass animate-fadeUp" style={{
            padding: '28px 24px', marginBottom: 20, textAlign: 'center',
            background: 'linear-gradient(135deg, rgba(18,14,6,0.95) 0%, rgba(40,20,0,0.9) 100%)',
            borderColor: 'rgba(252,181,20,0.3)',
          }}>
            <div style={{ fontSize: 48, marginBottom: 10 }}>🍺</div>
            <h2 style={{ fontFamily: 'Bebas Neue', fontSize: 30, color: '#FCB514', letterSpacing: 4, margin: '0 0 10px', textShadow: '0 0 20px rgba(252,181,20,0.4)' }}>
              Mr. Jim Lahey Award
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, lineHeight: 1.7, maxWidth: 480, margin: '0 auto 10px' }}>
              Presented to the player who best embodies the spirit of Jim Lahey — simultaneously the drunkest <em>and</em> highest individual on the course. Bonus points if they tried to give a liquor speech on the 9th tee. One vote per person. No take-backs. The shitwinds have spoken.
            </p>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>
              "The liquor's calling the shots now, Randy." — Jim Lahey
            </div>
          </div>

          {frontrunnerPlayer && (
            <div className="glass animate-fadeUp" style={{ padding: '14px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14, borderColor: 'rgba(252,181,20,0.3)' }}>
              <span style={{ fontSize: 28 }}>👑</span>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(252,181,20,0.7)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Current Front-Runner</div>
                <div style={{ fontWeight: 700, color: '#FCB514', fontSize: 16 }}>{frontrunnerPlayer.name}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{frontrunnerEntry[1]} vote{frontrunnerEntry[1] !== 1 ? 's' : ''}</div>
              </div>
            </div>
          )}

          {myVote && (
            <div style={{ background: 'rgba(252,181,20,0.08)', border: '1px solid rgba(252,181,20,0.25)', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: 'rgba(252,181,20,0.8)' }}>
              ✅ Your vote is in. The shitwinds are blowing in their direction.
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, marginBottom: 20 }}>
            {players.map(player => {
              const isSelected = selected === player.id
              const isMyVote   = myVote === player.id
              return (
                <button
                  key={player.id}
                  onClick={() => { if (!myVote) setSelected(player.id) }}
                  disabled={!!myVote}
                  style={{
                    padding: '12px', borderRadius: 12, border: '1px solid',
                    borderColor: isSelected ? '#FCB514' : 'rgba(255,255,255,0.1)',
                    background: isSelected ? 'rgba(252,181,20,0.15)' : isMyVote ? 'rgba(252,181,20,0.08)' : 'rgba(18,14,6,0.8)',
                    color: isSelected ? '#FCB514' : isMyVote ? 'rgba(252,181,20,0.7)' : 'rgba(255,255,255,0.8)',
                    cursor: myVote ? 'default' : 'pointer',
                    fontWeight: 600, fontSize: 13, transition: 'all 0.2s', textAlign: 'center',
                  }}
                >
                  {isMyVote && '✅ '}{player.name}
                </button>
              )
            })}
          </div>

          {!myVote && (
            <button
              className="btn-gold"
              onClick={castVote}
              disabled={!selected || casting}
              style={{ width: '100%', justifyContent: 'center', marginBottom: 28, fontSize: 16, padding: '14px' }}
            >
              {casting ? 'Casting Vote…' : '🍺 Cast My Vote'}
            </button>
          )}

          <div className="glass" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 700, color: '#FCB514', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              Live Vote Tally
              <span className="animate-pulseDot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#FCB514', display: 'inline-block' }} />
            </div>
            {players
              .filter(p => voteCounts[p.id] > 0)
              .sort((a, b) => voteCounts[b.id] - voteCounts[a.id])
              .map((player, i) => {
                const count = voteCounts[player.id]
                const pct   = Math.round((count / votes.length) * 100)
                return (
                  <div key={player.id} style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: i === 0 ? '#FCB514' : '#fff' }}>
                        {i === 0 ? '👑 ' : ''}{player.name}
                      </span>
                      <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{count} vote{count !== 1 ? 's' : ''} ({pct}%)</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 999, transition: 'width 0.5s ease',
                        width: `${(count / maxVotes) * 100}%`,
                        background: i === 0 ? 'linear-gradient(90deg, #FCB514, #e0a010)' : 'rgba(252,181,20,0.4)',
                      }} />
                    </div>
                  </div>
                )
              })}
            {votes.length === 0 && (
              <div style={{ padding: '32px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>
                No votes yet. Who's already on their third drink? 🍺
              </div>
            )}
            {votes.length > 0 && (
              <div style={{ padding: '10px 20px', fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'right' }}>
                {votes.length} total vote{votes.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
