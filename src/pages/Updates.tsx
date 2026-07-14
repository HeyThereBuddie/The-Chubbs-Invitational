import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { PageMasthead } from '../components/PageMasthead'
import type { Update } from '../lib/types'
import { formatDistanceToNow } from 'date-fns'
import { Pin, PinOff, Trash2, Plus, X } from 'lucide-react'

export default function Updates() {
  const { isAdmin, profile } = useAuth()
  const { showToast } = useToast()
  const [updates, setUpdates] = useState<Update[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', body: '', pinned: false })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchUpdates()
    const sub = supabase.channel('updates-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'updates' }, fetchUpdates)
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [])

  const fetchUpdates = async () => {
    const { data } = await supabase
      .from('updates')
      .select('*')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
    setUpdates(data ?? [])
  }

  const postUpdate = async () => {
    if (!form.title.trim() || !form.body.trim()) { showToast('Title and body required', 'error'); return }
    if (!profile) return
    setSubmitting(true)
    const { error } = await supabase.from('updates').insert({
      title: form.title.trim(),
      body: form.body.trim(),
      pinned: form.pinned,
      created_by: profile.id,
    })
    setSubmitting(false)
    if (error) showToast(error.message, 'error')
    else {
      showToast('Update posted! 📢')
      setForm({ title: '', body: '', pinned: false })
      setShowForm(false)
      fetchUpdates()
    }
  }

  const togglePin = async (update: Update) => {
    await supabase.from('updates').update({ pinned: !update.pinned }).eq('id', update.id)
    fetchUpdates()
  }

  const deleteUpdate = async (id: string) => {
    if (!confirm('Delete this update?')) return
    await supabase.from('updates').delete().eq('id', id)
    fetchUpdates()
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <PageMasthead title="Updates" subtitle="Announcements & news" icon="📣" right={
        isAdmin ? (
          <button className="btn-gold" onClick={() => setShowForm(!showForm)} style={{ flexShrink: 0 }}>
            {showForm ? <><X size={14} /> Cancel</> : <><Plus size={14} /> Post Update</>}
          </button>
        ) : undefined
      } />

      {/* Post form */}
      {showForm && isAdmin && (
        <div className="glass animate-fadeUp" style={{ padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input type="text" placeholder="Title *" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            <textarea
              placeholder="Body *"
              value={form.body}
              onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              rows={4}
              style={{ resize: 'vertical' }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: 'var(--tx2)' }}>
              <input
                type="checkbox"
                checked={form.pinned}
                onChange={e => setForm(f => ({ ...f, pinned: e.target.checked }))}
                style={{ width: 16, height: 16, accentColor: '#D4A53A' }}
              />
              📌 Pin this update
            </label>
            <button className="btn-gold" onClick={postUpdate} disabled={submitting} style={{ alignSelf: 'flex-start' }}>
              {submitting ? 'Posting…' : '📢 Post Update'}
            </button>
          </div>
        </div>
      )}

      {/* Updates list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {updates.length === 0 && (
          <div className="glass" style={{ padding: 48, textAlign: 'center', color: 'var(--tx4)' }}>
            No updates yet
          </div>
        )}
        {updates.map((u, i) => (
          <div key={u.id} className="glass animate-fadeUp" style={{
            padding: '20px 22px',
            animationDelay: `${i * 0.05}s`,
            borderColor: u.pinned ? 'rgba(212,165,58,0.4)' : undefined,
            boxShadow: u.pinned ? '0 0 16px rgba(212,165,58,0.08)' : undefined,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  {u.pinned && (
                    <span style={{ fontSize: 10, color: '#D4A53A', background: 'rgba(212,165,58,0.15)', padding: '2px 8px', borderRadius: 999, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
                      📌 Pinned
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: 'var(--tx4)', marginLeft: 'auto' }}>
                    {formatDistanceToNow(new Date(u.created_at), { addSuffix: true })}
                  </span>
                </div>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--tx1)', marginBottom: 8 }}>{u.title}</h2>
                <p style={{ fontSize: 14, color: 'var(--tx2)', lineHeight: 1.6 }}>{u.body}</p>
              </div>

              {isAdmin && (
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button
                    onClick={() => togglePin(u)}
                    title={u.pinned ? 'Unpin' : 'Pin'}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: u.pinned ? '#D4A53A' : 'var(--tx4)' }}>
                    {u.pinned ? <PinOff size={15} /> : <Pin size={15} />}
                  </button>
                  <button
                    onClick={() => deleteUpdate(u.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'rgba(239,68,68,0.6)' }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
