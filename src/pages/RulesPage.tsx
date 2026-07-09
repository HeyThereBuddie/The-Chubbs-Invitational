import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Send } from 'lucide-react'

interface Message { role: 'user' | 'assistant'; content: string }

const CHUBBS_IMG = 'https://static.wikia.nocookie.net/sandlerverse/images/8/81/Chubbs_Peterson_in_Happy_Gilmore.webp'
const SUGGESTED = [
  'What is a chulligan?',
  'How do drive minimums work?',
  'What is the Lahey Award?',
  'How is scoring calculated?',
]

export default function RulesPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  const send = async (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || loading) return
    setInput('')
    const history = messages
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setLoading(true)
    const { data, error } = await supabase.functions.invoke('rules-chat', {
      body: { message: msg, history: history.map(m => ({ role: m.role, content: m.content })) },
    })
    setLoading(false)
    const reply = error ? `Invoke error: ${error.message ?? JSON.stringify(error)}`
      : data?.error ? `API error: ${data.error}`
      : data?.reply ?? 'No reply returned.'
    setMessages(prev => [...prev, { role: 'assistant', content: reply }])
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column', minHeight: 'calc(100dvh - 160px)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <img src={CHUBBS_IMG} alt="Chubbs" style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover', border: '2px solid #D4A53A' }} />
        <div>
          <div className="section-label" style={{ marginBottom: 2 }}>Rules Assistant</div>
          <h1 className="gold-text" style={{ fontFamily: 'Bebas Neue', fontSize: 30, letterSpacing: 2, lineHeight: 1 }}>Ask Chubbs the Rules</h1>
        </div>
      </div>

      {/* Messages */}
      <div className="glass" style={{ flex: 1, overflowY: 'auto', padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
        {messages.length === 0 && (
          <div>
            <div style={{ fontSize: 13, color: 'var(--tx3)', textAlign: 'center', padding: '8px 0 14px', lineHeight: 1.6 }}>
              Ask me anything about the Chubbs Memorial rules — scramble format, chulligans, contests, penalties, you name it.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {SUGGESTED.map(q => (
                <button key={q} onClick={() => send(q)} className="pressable" style={{
                  textAlign: 'left', padding: '10px 13px', borderRadius: 11, fontSize: 13,
                  background: 'rgba(212,165,58,0.07)', border: '1px solid rgba(212,165,58,0.18)',
                  color: 'var(--tx2)', cursor: 'pointer',
                }}>{q}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '85%', padding: '9px 13px', borderRadius: 14,
              borderBottomRightRadius: m.role === 'user' ? 4 : 14,
              borderBottomLeftRadius: m.role === 'assistant' ? 4 : 14,
              fontSize: 13.5, lineHeight: 1.6,
              background: m.role === 'user' ? 'rgba(212,165,58,0.15)' : 'var(--surf2)',
              border: `1px solid ${m.role === 'user' ? 'rgba(212,165,58,0.3)' : 'var(--bdr)'}`,
              color: m.role === 'user' ? '#D4A53A' : 'var(--tx1)', whiteSpace: 'pre-wrap',
            }}>{m.content}</div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ padding: '10px 14px', borderRadius: 14, borderBottomLeftRadius: 4, background: 'var(--surf2)', border: '1px solid var(--bdr)', display: 'flex', gap: 5, alignItems: 'center' }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(212,165,58,0.6)', animation: `rca-bounce 1.2s ease-in-out ${i * 0.18}s infinite` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingBottom: 8 }}>
        <input
          type="text" placeholder="Ask a rules question…" value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          disabled={loading}
          style={{ flex: 1, padding: '11px 14px', borderRadius: 12, fontSize: 14, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--tx1)', outline: 'none' }}
        />
        <button onClick={() => send()} disabled={!input.trim() || loading} style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: input.trim() && !loading ? '#D4A53A' : 'var(--surf2)',
          border: 'none', color: input.trim() && !loading ? '#1a1206' : 'var(--tx4)',
          cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><Send size={18} /></button>
      </div>
    </div>
  )
}
