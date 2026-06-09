import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { X, Send } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const SUGGESTED = [
  'What is a chulligan?',
  'How do drive minimums work?',
  'What is the Lahey Award?',
  'How is scoring calculated?',
]

export default function RulesChat() {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

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
    let reply: string
    if (error) {
      reply = `Invoke error: ${error.message ?? JSON.stringify(error)}`
    } else if (data?.error) {
      reply = `API error: ${data.error}`
    } else {
      reply = data?.reply ?? "No reply returned."
    }
    setMessages(prev => [...prev, { role: 'assistant', content: reply }])
  }

  const btnBottom = isDesktop ? 32 : 90
  const btnRight  = isDesktop ? 40 : 16

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="Ask about tournament rules"
          style={{
            position: 'fixed', bottom: btnBottom, right: btnRight, zIndex: 200,
            width: 52, height: 52, borderRadius: '50%',
            background: 'linear-gradient(135deg, #FCB514 0%, #e09900 100%)',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22,
            boxShadow: '0 4px 20px rgba(252,181,20,0.45), 0 2px 8px rgba(0,0,0,0.4)',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
        >
          ⛳
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div style={{
          position: 'fixed',
          bottom: isDesktop ? 32 : 90,
          right: btnRight,
          left: isDesktop ? 'auto' : btnRight,
          width: isDesktop ? 370 : 'auto',
          height: isDesktop ? 520 : 'min(500px, calc(100dvh - 170px))',
          zIndex: 200,
          background: 'rgba(10,7,2,0.97)',
          border: '1px solid rgba(252,181,20,0.28)',
          borderRadius: 20,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 8px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(252,181,20,0.08)',
        }}>

          {/* Header */}
          <div style={{
            padding: '13px 16px',
            background: 'linear-gradient(135deg, rgba(252,181,20,0.12), rgba(252,181,20,0.05))',
            borderBottom: '1px solid rgba(252,181,20,0.12)',
            display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%',
              background: 'linear-gradient(135deg, #FCB514, #e09900)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0,
            }}>⛳</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#FCB514', lineHeight: 1 }}>Rules Assistant</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>Powered by Claude · Ask anything</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', padding: 4, display: 'flex', alignItems: 'center' }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>

            {messages.length === 0 && (
              <div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', textAlign: 'center', padding: '12px 0 14px', lineHeight: 1.6 }}>
                  Ask me anything about the tournament rules
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {SUGGESTED.map(q => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      style={{
                        textAlign: 'left', padding: '9px 13px', borderRadius: 11, fontSize: 13,
                        background: 'rgba(252,181,20,0.07)', border: '1px solid rgba(252,181,20,0.18)',
                        color: 'rgba(255,255,255,0.6)', cursor: 'pointer', transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(252,181,20,0.13)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(252,181,20,0.07)' }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '85%', padding: '9px 13px',
                  borderRadius: 14,
                  borderBottomRightRadius: m.role === 'user' ? 4 : 14,
                  borderBottomLeftRadius:  m.role === 'assistant' ? 4 : 14,
                  fontSize: 13, lineHeight: 1.6,
                  background: m.role === 'user' ? 'rgba(252,181,20,0.15)' : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${m.role === 'user' ? 'rgba(252,181,20,0.3)' : 'rgba(255,255,255,0.08)'}`,
                  color: m.role === 'user' ? '#FCB514' : 'rgba(255,255,255,0.85)',
                  whiteSpace: 'pre-wrap',
                }}>
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{
                  padding: '10px 14px', borderRadius: 14, borderBottomLeftRadius: 4,
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex', gap: 5, alignItems: 'center',
                }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: 'rgba(252,181,20,0.6)',
                      animation: `rca-bounce 1.2s ease-in-out ${i * 0.18}s infinite`,
                    }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: '10px 12px', flexShrink: 0,
            borderTop: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(0,0,0,0.35)',
            display: 'flex', gap: 8, alignItems: 'center',
          }}>
            <input
              ref={inputRef}
              type="text"
              placeholder="Ask a rules question…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              disabled={loading}
              style={{
                flex: 1, padding: '9px 12px', borderRadius: 10, fontSize: 13,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                color: '#fff', outline: 'none',
              }}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: input.trim() && !loading ? 'rgba(252,181,20,0.18)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${input.trim() && !loading ? 'rgba(252,181,20,0.35)' : 'rgba(255,255,255,0.07)'}`,
                color: input.trim() && !loading ? '#FCB514' : 'rgba(255,255,255,0.2)',
                cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s, border-color 0.15s',
              }}
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes rca-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.45; }
          40% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
    </>
  )
}
