import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'
import type { ContestEntry, Player } from '../lib/types'
import { Target, Upload } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

type ContestType = 'ctp' | 'ld'

export default function Contests() {
  const { showToast } = useToast()
  const [tab, setTab] = useState<ContestType>('ctp')
  const [entries, setEntries] = useState<(ContestEntry & { player?: Player })[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [form, setForm] = useState({ player_id: '', hole: '1' })
  const [photo, setPhoto] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchData()
    const sub = supabase.channel('contests-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contest_entries' }, fetchData)
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [tab])

  const fetchData = async () => {
    const [entriesRes, playersRes] = await Promise.all([
      supabase.from('contest_entries').select('*, player:profiles(*)').eq('type', tab).order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').eq('status', 'active').order('name'),
    ])
    setEntries(entriesRes.data ?? [])
    setPlayers(playersRes.data ?? [])
  }

  const submit = async (e: React.FormEvent) => {
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
      fetchData()
    }
  }

  const leader = entries[0]

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 32, color: '#FCB514', letterSpacing: 4 }}>Contests</h1>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Closest to Pin & Longest Drive</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button onClick={() => setTab('ctp')} className={`pill-tab ${tab === 'ctp' ? 'active' : ''}`}>🎯 Closest to Pin</button>
        <button onClick={() => setTab('ld')} className={`pill-tab ${tab === 'ld' ? 'active' : ''}`}>💥 Longest Drive</button>
      </div>

      {/* Current leader */}
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

      {/* Submit form */}
      <div className="glass" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ fontWeight: 700, color: '#FCB514', marginBottom: 14, fontSize: 14 }}>
          <Target size={14} style={{ display: 'inline', marginRight: 6 }} />
          Submit Entry
        </div>
        <form onSubmit={submit}>
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

      {/* Entries list */}
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
              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}`}
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
    </div>
  )
}
