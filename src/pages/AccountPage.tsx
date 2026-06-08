import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { displayName } from '../lib/types'

export default function AccountPage() {
  const { profile, user, refreshProfile } = useAuth()
  const { showToast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const [profileForm, setProfileForm] = useState({
    nickname: '',
    phone: '',
    handicap: '',
  })
  const [emailForm, setEmailForm] = useState({ email: '' })
  const [passwordForm, setPasswordForm] = useState({ password: '', confirm: '' })
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingEmail, setSavingEmail] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)

  useEffect(() => {
    if (profile) {
      setProfileForm({
        nickname: profile.nickname ?? '',
        phone: profile.phone ?? '',
        handicap: profile.handicap != null ? String(profile.handicap) : '',
      })
      setEmailForm({ email: profile.email ?? '' })
    }
  }, [profile])

  const saveProfile = async () => {
    if (!profile) return
    setSavingProfile(true)
    const { error } = await supabase.from('profiles').update({
      nickname: profileForm.nickname.trim() || null,
      phone: profileForm.phone.trim() || null,
      handicap: profileForm.handicap !== '' ? parseFloat(profileForm.handicap) : null,
    }).eq('id', profile.id)
    setSavingProfile(false)
    if (error) showToast(error.message, 'error')
    else showToast('Profile saved!')
  }

  const saveEmail = async () => {
    const newEmail = emailForm.email.trim()
    if (!newEmail || newEmail === profile?.email) return
    setSavingEmail(true)
    const { error } = await supabase.auth.updateUser({ email: newEmail })
    setSavingEmail(false)
    if (error) showToast(error.message, 'error')
    else showToast('Check your new email for a confirmation link.')
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !profile) return

    const objectUrl = URL.createObjectURL(file)
    setAvatarPreview(objectUrl)
    setUploadingAvatar(true)

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${profile.id}/avatar.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type })

    if (uploadErr) {
      showToast(uploadErr.message, 'error')
      setAvatarPreview(null)
      setUploadingAvatar(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', profile.id)

    setUploadingAvatar(false)
    if (updateErr) {
      showToast(updateErr.message, 'error')
    } else {
      await refreshProfile()
      showToast('Profile photo updated!')
    }
  }

  const removeAvatar = async () => {
    if (!profile?.avatar_url) return
    setUploadingAvatar(true)
    await supabase.from('profiles').update({ avatar_url: null }).eq('id', profile.id)
    setAvatarPreview(null)
    await refreshProfile()
    setUploadingAvatar(false)
    showToast('Photo removed.')
  }

  const savePassword = async () => {
    if (passwordForm.password.length < 6) {
      showToast('Password must be at least 6 characters', 'error'); return
    }
    if (passwordForm.password !== passwordForm.confirm) {
      showToast('Passwords do not match', 'error'); return
    }
    setSavingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: passwordForm.password })
    setSavingPassword(false)
    if (error) showToast(error.message, 'error')
    else {
      showToast('Password updated!')
      setPasswordForm({ password: '', confirm: '' })
    }
  }

  if (!profile) return null

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 32, color: '#FCB514', letterSpacing: 4, margin: 0 }}>
          My Account
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, marginTop: 4 }}>
          {displayName(profile)} · {profile.email}
        </p>
      </div>

      {/* ── Profile Photo ── */}
      <div className="glass" style={{ padding: '24px 26px', marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 18 }}>
          Profile Photo
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            border: '2px solid rgba(252,181,20,0.35)',
            overflow: 'hidden', flexShrink: 0,
            background: 'rgba(255,255,255,0.05)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative',
          }}>
            {(avatarPreview || profile.avatar_url) ? (
              <img
                src={avatarPreview || profile.avatar_url!}
                alt="Profile"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={() => setAvatarPreview(null)}
              />
            ) : (
              <span style={{ fontSize: 30, color: 'rgba(255,255,255,0.25)', fontFamily: 'Bebas Neue' }}>
                {displayName(profile).charAt(0).toUpperCase()}
              </span>
            )}
            {uploadingAvatar && (
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                background: 'rgba(0,0,0,0.55)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div className="animate-spin" style={{ width: 24, height: 24, border: '2px solid rgba(252,181,20,0.3)', borderTopColor: '#FCB514', borderRadius: '50%' }} />
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              style={{ display: 'none' }}
              onChange={handleAvatarChange}
            />
            <button
              className="btn-gold"
              onClick={() => fileRef.current?.click()}
              disabled={uploadingAvatar}
              style={{ fontSize: 13 }}
            >
              {uploadingAvatar ? 'Uploading…' : profile.avatar_url ? 'Change Photo' : 'Upload Photo'}
            </button>
            {(profile.avatar_url || avatarPreview) && !uploadingAvatar && (
              <button
                onClick={removeAvatar}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', fontSize: 12, padding: 0, textAlign: 'left' }}
              >
                Remove photo
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Profile info ── */}
      <div className="glass" style={{ padding: '24px 26px', marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 18 }}>
          Profile
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Full Name</label>
            <input value={profile.name} disabled style={{ ...inputStyle, opacity: 0.4, cursor: 'not-allowed' }} />
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>Contact an admin to change your name.</div>
          </div>

          <div>
            <label style={labelStyle}>Nickname <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>(optional)</span></label>
            <input
              type="text"
              placeholder='e.g. "Big Easy", "The Shark"'
              value={profileForm.nickname}
              onChange={e => setProfileForm(f => ({ ...f, nickname: e.target.value }))}
              maxLength={30}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Phone</label>
            <input
              type="tel"
              placeholder="e.g. 555-867-5309"
              value={profileForm.phone}
              onChange={e => setProfileForm(f => ({ ...f, phone: e.target.value }))}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Handicap</label>
            <input
              type="number"
              placeholder="e.g. 14"
              value={profileForm.handicap}
              onChange={e => setProfileForm(f => ({ ...f, handicap: e.target.value }))}
              min={0} max={54} step={0.1}
              style={inputStyle}
            />
          </div>

          <button className="btn-gold" onClick={saveProfile} disabled={savingProfile} style={{ alignSelf: 'flex-start', minWidth: 120 }}>
            {savingProfile ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      </div>

      {/* ── Email ── */}
      <div className="glass" style={{ padding: '24px 26px', marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 18 }}>
          Email Address
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>New Email</label>
            <input
              type="email"
              value={emailForm.email}
              onChange={e => setEmailForm({ email: e.target.value })}
              style={inputStyle}
            />
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>
              A confirmation link will be sent to the new address.
            </div>
          </div>
          <button
            className="btn-gold"
            onClick={saveEmail}
            disabled={savingEmail || emailForm.email === profile.email}
            style={{ alignSelf: 'flex-start', minWidth: 140 }}
          >
            {savingEmail ? 'Sending…' : 'Update Email'}
          </button>
        </div>
      </div>

      {/* ── Password ── */}
      {user?.app_metadata?.provider !== 'google' && (
        <div className="glass" style={{ padding: '24px 26px', marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 18 }}>
            Change Password
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>New Password</label>
              <input
                type="password"
                placeholder="Min. 6 characters"
                value={passwordForm.password}
                onChange={e => setPasswordForm(f => ({ ...f, password: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Confirm Password</label>
              <input
                type="password"
                placeholder="Repeat new password"
                value={passwordForm.confirm}
                onChange={e => setPasswordForm(f => ({ ...f, confirm: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <button
              className="btn-gold"
              onClick={savePassword}
              disabled={savingPassword || !passwordForm.password}
              style={{ alignSelf: 'flex-start', minWidth: 160 }}
            >
              {savingPassword ? 'Saving…' : 'Change Password'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'rgba(255,255,255,0.45)',
  textTransform: 'uppercase',
  letterSpacing: 1,
  marginBottom: 6,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
}
