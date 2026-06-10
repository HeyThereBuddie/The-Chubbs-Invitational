import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { displayName } from '../lib/types'

const CHUBBS_IMG = 'https://static.wikia.nocookie.net/sandlerverse/images/8/81/Chubbs_Peterson_in_Happy_Gilmore.webp'

export default function WelcomePage() {
  const { user, profile, refreshProfile } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const finish = () => {
    sessionStorage.removeItem('chubbs-new-reg')
    navigate('/')
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    const objectUrl = URL.createObjectURL(file)
    setPreview(objectUrl)
    setUploading(true)

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${user.id}/avatar.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type })

    if (uploadErr) {
      showToast(uploadErr.message, 'error')
      setPreview(null)
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', user.id)

    setUploading(false)

    if (updateErr) {
      showToast(updateErr.message, 'error')
    } else {
      await refreshProfile()
      showToast('Looking good! Welcome to the tournament. 🏌️')
      finish()
    }
  }

  const name = profile ? displayName(profile) : 'Golfer'

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(252,181,20,0.12) 0%, transparent 70%), #080808',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 16px',
    }}>
      <div className="glass animate-fadeUp" style={{ width: '100%', maxWidth: 420, padding: '40px 36px', textAlign: 'center' }}>
        {/* Chubbs avatar */}
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          border: '3px solid #FCB514',
          boxShadow: '0 0 24px rgba(252,181,20,0.4)',
          overflow: 'hidden', margin: '0 auto 20px',
        }}>
          <img src={CHUBBS_IMG} alt="Chubbs" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>

        <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 30, letterSpacing: 4, color: '#FCB514', margin: '0 0 8px' }}>
          Welcome, {name}!
        </h1>
        <p style={{ color: 'var(--tx2)', fontSize: 14, margin: '0 0 32px', lineHeight: 1.5 }}>
          You're in. Now add a profile photo so your teammates know who they're up against.
        </p>

        {/* Photo preview circle */}
        <div
          onClick={() => !uploading && fileRef.current?.click()}
          style={{
            width: 120, height: 120, borderRadius: '50%',
            border: `2px dashed ${preview ? '#FCB514' : 'rgba(252,181,20,0.35)'}`,
            overflow: 'hidden', margin: '0 auto 20px',
            background: 'var(--surf)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: uploading ? 'wait' : 'pointer',
            transition: 'border-color 0.2s',
            flexShrink: 0,
            position: 'relative',
          }}
        >
          {preview ? (
            <img src={preview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(252,181,20,0.5)" strokeWidth="1.5">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <span style={{ fontSize: 11, color: 'rgba(252,181,20,0.5)' }}>Tap to choose</span>
            </div>
          )}
          {uploading && (
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: 'rgba(0,0,0,0.6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div className="animate-spin" style={{ width: 28, height: 28, border: '2px solid rgba(252,181,20,0.3)', borderTopColor: '#FCB514', borderRadius: '50%' }} />
            </div>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            className="btn-gold"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {uploading ? 'Uploading…' : preview ? 'Choose Different Photo' : '📷 Choose Photo'}
          </button>

          <button
            onClick={finish}
            disabled={uploading}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--tx3)', fontSize: 13, padding: '8px',
            }}
          >
            Skip for now
          </button>
        </div>

        <p style={{ fontSize: 11, color: 'var(--tx4)', marginTop: 20 }}>
          You can always add or change your photo in Account Settings.
        </p>
      </div>
    </div>
  )
}
