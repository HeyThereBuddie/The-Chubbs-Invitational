import { useEffect, useState, useRef, useCallback } from 'react'
import JSZip from 'jszip'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useYear } from '../context/YearContext'
import { localDb, parseJson } from '../lib/localDb'
import type { LocalPhoto } from '../lib/localDb'
import { Camera, Upload, X, ChevronLeft, ChevronRight, Trash2, Download } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { displayName } from '../lib/types'
import { SkeletonPhotoCard } from '../components/Skeleton'

interface PhotoItem extends LocalPhoto {
  uploader?: { name: string | null; nickname: string | null; avatar_url: string | null }
}

const HAPPY_QUOTES = [
  { q: "It's all in the hips. It's all in the hips.", by: "Chubbs" },
  { q: "Just tap it in. Just tap it in. Give it a little tappy.", by: "Happy" },
  { q: "The price is wrong, Bob!", by: "Happy" },
  { q: "I'm gonna destroy you!", by: "Happy" },
  { q: "You're in my world now, Grandma!", by: "Happy" },
  { q: "You can trouble me for a warm glass of shut-the-hell-up.", by: "Bob Barker" },
]

function avatarInitials(name: string | null, nickname: string | null): string {
  const n = nickname?.trim() || name?.trim() || '?'
  return n.slice(0, 1).toUpperCase()
}

export default function HappysPlace() {
  const { profile, isAdmin } = useAuth()
  const { showToast } = useToast()
  const { effectiveTournamentId, isCurrentYear, tournaments } = useYear()
  const tournamentYear = tournaments.find(t => t.id === effectiveTournamentId)?.year ?? new Date().getFullYear()

  const [photos, setPhotos]               = useState<PhotoItem[]>([])
  const [loading, setLoading]             = useState(true)
  const [showUpload, setShowUpload]       = useState(false)
  const [photoFile, setPhotoFile]         = useState<File | null>(null)
  const [preview, setPreview]             = useState<string | null>(null)
  const [caption, setCaption]             = useState('')
  const [uploading, setUploading]         = useState(false)
  const [lightboxIdx, setLightboxIdx]     = useState<number | null>(null)
  const [newCount, setNewCount]           = useState(0)
  const [downloading, setDownloading]     = useState(false)
  const [quote]                           = useState(() => HAPPY_QUOTES[Math.floor(Math.random() * HAPPY_QUOTES.length)])

  const fileRef   = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const fetchPhotos = useCallback(async () => {
    if (!effectiveTournamentId) { setPhotos([]); setLoading(false); return }

    // Step 1: cached data immediately
    const cached = await localDb.photos
      .where('tournament_id').equals(effectiveTournamentId)
      .reverse().sortBy('created_at')
    if (cached.length > 0) {
      setPhotos(cached.map(p => ({ ...p, uploader: parseJson(p.uploader_json) })))
      setLoading(false)
    }

    // Step 2: refresh from Supabase
    try {
      const { data } = await supabase
        .from('photos')
        .select('*, uploader:profiles(name, nickname, avatar_url)')
        .eq('tournament_id', effectiveTournamentId)
        .order('created_at', { ascending: false })
        .limit(200)

      if (data) {
        setPhotos(data as PhotoItem[])
        setLoading(false)
        await localDb.photos.bulkPut(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data.map((p: any) => ({
            id: p.id, uploader_id: p.uploader_id, photo_url: p.photo_url,
            caption: p.caption, tournament_id: p.tournament_id, created_at: p.created_at,
            uploader_json: p.uploader ? JSON.stringify(p.uploader) : null,
          }))
        )
      }
    } catch { setLoading(false) /* offline — cached data shown */ }
  }, [effectiveTournamentId])

  useEffect(() => {
    fetchPhotos()
    if (!effectiveTournamentId) return
    const sub = supabase.channel('happys-place-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'photos' }, payload => {
        const p = payload.new as PhotoItem
        if (p.tournament_id !== effectiveTournamentId) return
        if (p.uploader_id === profile?.id) return // we already added it optimistically
        setNewCount(n => n + 1)
        fetchPhotos()
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'photos' }, () => {
        fetchPhotos()
      })
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [effectiveTournamentId, fetchPhotos, profile?.id])

  // Lightbox keyboard navigation
  useEffect(() => {
    if (lightboxIdx === null) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIdx(null)
      if (e.key === 'ArrowRight') setLightboxIdx(i => i !== null && i < photos.length - 1 ? i + 1 : i)
      if (e.key === 'ArrowLeft')  setLightboxIdx(i => i !== null && i > 0 ? i - 1 : i)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lightboxIdx, photos.length])

  const pickFile = (file: File) => {
    setPhotoFile(file)
    setPreview(URL.createObjectURL(file))
  }

  const clearFile = () => {
    setPhotoFile(null)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
  }

  const handleUpload = async () => {
    if (!photoFile || !profile) return
    if (!navigator.onLine) { showToast('Photos need a connection — try again when online', 'error'); return }

    setUploading(true)
    const ext  = photoFile.name.split('.').pop() ?? 'jpg'
    const path = `gallery/${profile.id}/${Date.now()}.${ext}`

    const { error: uploadErr } = await supabase.storage.from('contest-photos').upload(path, photoFile)
    if (uploadErr) { showToast(`Upload failed: ${uploadErr.message}`, 'error'); setUploading(false); return }

    const { data: urlData } = supabase.storage.from('contest-photos').getPublicUrl(path)

    const { data: inserted, error } = await supabase.from('photos').insert({
      uploader_id: profile.id,
      photo_url: urlData.publicUrl,
      caption: caption.trim() || null,
      tournament_id: effectiveTournamentId,
    }).select('*').single()

    if (error || !inserted) {
      showToast(error?.message ?? 'Upload failed', 'error')
      setUploading(false)
      return
    }

    // Optimistic local add
    const newPhoto: PhotoItem = {
      ...(inserted as PhotoItem),
      uploader: { name: profile.name, nickname: profile.nickname, avatar_url: profile.avatar_url },
    }
    setPhotos(prev => [newPhoto, ...prev])

    navigator.vibrate?.([10, 150, 10])
    showToast('Shot posted! 📸')
    setShowUpload(false)
    clearFile()
    setCaption('')
    setUploading(false)
  }

  const downloadPhoto = async (photo: PhotoItem) => {
    navigator.vibrate?.(8)
    try {
      const res = await fetch(photo.photo_url)
      const blob = await res.blob()
      const ext = photo.photo_url.split('.').pop()?.split('?')[0] ?? 'jpg'
      const filename = `happys-place-${tournamentYear}-${photo.id.slice(0, 8)}.${ext}`
      const file = new File([blob], filename, { type: blob.type })

      // Use native share sheet on mobile (iOS → "Save Image" → camera roll)
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Happy\'s Place' })
        showToast('Image saved 📸')
        return
      }

      // Desktop fallback: trigger browser download
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      showToast('Image saved 📸')
    } catch (err) {
      // AbortError = user cancelled the share sheet — not an error
      if ((err as Error).name !== 'AbortError') showToast('Download failed', 'error')
    }
  }

  const downloadAll = async () => {
    if (photos.length === 0) return
    setDownloading(true)
    showToast(`Bundling ${photos.length} photo${photos.length !== 1 ? 's' : ''}… hang tight 📦`)
    try {
      const zip = new JSZip()
      const folder = zip.folder(`happys-place-${tournamentYear}`)!
      await Promise.all(photos.map(async (photo, i) => {
        try {
          const res = await fetch(photo.photo_url)
          const blob = await res.blob()
          const ext = photo.photo_url.split('.').pop()?.split('?')[0] ?? 'jpg'
          const uploader = photo.uploader
            ? displayName(photo.uploader as { name: string; nickname: string | null })
            : 'unknown'
          folder.file(`${String(i + 1).padStart(3, '0')}-${uploader}.${ext}`, blob)
        } catch { /* skip any photo that fails to fetch */ }
      }))
      const content = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(content)
      const a = document.createElement('a')
      a.href = url
      a.download = `happys-place-${tournamentYear}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      showToast(`${photos.length} photos downloaded! 🎳`)
    } catch { showToast('Download failed', 'error') }
    setDownloading(false)
  }

  const deletePhoto = async (id: string) => {
    if (!confirm('Delete this photo?')) return
    navigator.vibrate?.([8, 100, 8, 100, 8])
    await supabase.from('photos').delete().eq('id', id)
    await localDb.photos.delete(id)
    setPhotos(prev => prev.filter(p => p.id !== id))
    if (lightboxIdx !== null) setLightboxIdx(null)
    showToast('Photo deleted')
  }

  const lightboxPhoto = lightboxIdx !== null ? photos[lightboxIdx] : null
  const canDeleteLightbox = lightboxPhoto && (isAdmin || (isCurrentYear && lightboxPhoto.uploader_id === profile?.id))

  // Split into two columns for masonry layout
  const col1 = photos.filter((_, i) => i % 2 === 0)
  const col2 = photos.filter((_, i) => i % 2 === 1)

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>

      {/* ── Lightbox ── */}
      {lightboxIdx !== null && lightboxPhoto && (
        <div
          onClick={() => setLightboxIdx(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.97)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          {/* Close */}
          <button
            onClick={() => setLightboxIdx(null)}
            style={{ position: 'absolute', top: 16, right: 16, zIndex: 10, background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 40, height: 40, color: '#fff', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >×</button>

          {/* Delete + Download row (top-left) */}
          <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 10, display: 'flex', gap: 8 }}>
            {canDeleteLightbox && (
              <button
                onClick={e => { e.stopPropagation(); deletePhoto(lightboxPhoto.id) }}
                style={{ background: 'rgba(239,68,68,0.25)', border: '1px solid rgba(239,68,68,0.5)', borderRadius: '50%', width: 40, height: 40, color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Trash2 size={16} />
              </button>
            )}
            <button
              onClick={e => { e.stopPropagation(); downloadPhoto(lightboxPhoto) }}
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50%', width: 40, height: 40, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title="Save to camera roll"
            >
              <Download size={16} />
            </button>
          </div>

          {/* Prev / Next */}
          {lightboxIdx > 0 && (
            <button onClick={e => { e.stopPropagation(); navigator.vibrate?.(6); setLightboxIdx(lightboxIdx - 1) }}
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 44, height: 44, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronLeft size={22} />
            </button>
          )}
          {lightboxIdx < photos.length - 1 && (
            <button onClick={e => { e.stopPropagation(); navigator.vibrate?.(6); setLightboxIdx(lightboxIdx + 1) }}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 44, height: 44, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronRight size={22} />
            </button>
          )}

          {/* Image */}
          <img
            src={lightboxPhoto.photo_url}
            alt=""
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: 8 }}
          />

          {/* Caption + uploader */}
          <div onClick={e => e.stopPropagation()} style={{ marginTop: 16, textAlign: 'center', padding: '0 24px' }}>
            {lightboxPhoto.caption && (
              <p style={{ color: '#fff', fontSize: 15, fontStyle: 'italic', marginBottom: 6 }}>"{lightboxPhoto.caption}"</p>
            )}
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
              {lightboxPhoto.uploader
                ? displayName(lightboxPhoto.uploader as { name: string; nickname: string | null })
                : 'Unknown'}
              {' · '}
              {formatDistanceToNow(new Date(lightboxPhoto.created_at), { addSuffix: true })}
            </p>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 4 }}>
              {lightboxIdx + 1} / {photos.length}
            </p>
          </div>
        </div>
      )}

      {/* ── Upload Modal ── */}
      {showUpload && (
        <div
          onClick={() => { if (!uploading) { setShowUpload(false); clearFile(); setCaption('') } }}
          style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 500, background: 'var(--panel)', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: '20px 20px calc(20px + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid rgba(212,165,58,0.2)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontFamily: 'Bebas Neue', fontSize: 22, color: '#D4A53A', letterSpacing: 3 }}>Add Your Shot</span>
              <button onClick={() => { if (!uploading) { setShowUpload(false); clearFile(); setCaption('') } }}
                style={{ background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', fontSize: 20 }}>
                <X size={20} />
              </button>
            </div>

            {/* Hidden inputs */}
            <input ref={fileRef}   type="file" accept="image/*"                    style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f); e.target.value = '' }} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f); e.target.value = '' }} />

            {!preview ? (
              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                <button className="btn-ghost" onClick={() => cameraRef.current?.click()}
                  style={{ flex: 1, justifyContent: 'center', padding: '14px', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                  <Camera size={22} />
                  Take Photo
                </button>
                <button className="btn-ghost" onClick={() => fileRef.current?.click()}
                  style={{ flex: 1, justifyContent: 'center', padding: '14px', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                  <Upload size={22} />
                  Choose Photo
                </button>
              </div>
            ) : (
              <div style={{ position: 'relative', marginBottom: 14, borderRadius: 12, overflow: 'hidden', background: 'var(--surf2)' }}>
                <img src={preview} alt="" style={{ width: '100%', maxHeight: 280, objectFit: 'cover', display: 'block' }} />
                <button
                  onClick={clearFile}
                  style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: 32, height: 32, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={16} />
                </button>
              </div>
            )}

            <textarea
              placeholder="Add a caption… &quot;It's all in the hips.&quot;"
              value={caption}
              onChange={e => setCaption(e.target.value)}
              maxLength={160}
              rows={2}
              style={{ width: '100%', resize: 'none', fontSize: 14, padding: '10px 12px', borderRadius: 10, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--tx1)', outline: 'none', marginBottom: 14, boxSizing: 'border-box' }}
            />

            <button
              className="btn-gold"
              onClick={handleUpload}
              disabled={!photoFile || uploading}
              style={{ width: '100%', justifyContent: 'center', fontSize: 15, padding: '14px', opacity: !photoFile ? 0.4 : 1 }}
            >
              {uploading ? 'Uploading…' : '📸 Post to Happy\'s Place'}
            </button>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 36, color: '#D4A53A', letterSpacing: 5, margin: 0 }}>
            Happy's Place
          </h1>
          <span style={{ fontSize: 24 }}>🎳</span>
        </div>
        <p style={{ color: 'var(--tx3)', fontSize: 13, marginTop: 2, marginBottom: 10 }}>
          Your shots. Your glory. Your complete disasters.
        </p>
        <div style={{ background: 'rgba(212,165,58,0.06)', border: '1px solid rgba(212,165,58,0.18)', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontStyle: 'italic' }}>
          <span style={{ color: 'rgba(212,165,58,0.7)' }}>"{quote.q}"</span>
          <span style={{ color: 'var(--tx4)', marginLeft: 6 }}>— {quote.by}</span>
        </div>
      </div>

      {/* ── New photos banner ── */}
      {newCount > 0 && (
        <button
          onClick={() => { setNewCount(0); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
          style={{ width: '100%', marginBottom: 12, padding: '10px', background: 'rgba(212,165,58,0.15)', border: '1px solid rgba(212,165,58,0.4)', borderRadius: 10, color: '#D4A53A', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
        >
          🆕 {newCount} new photo{newCount !== 1 ? 's' : ''} — tap to refresh
        </button>
      )}

      {/* ── Upload CTA ── */}
      {isCurrentYear && (
        <button
          className="btn-gold"
          onClick={() => { navigator.vibrate?.(8); setShowUpload(true) }}
          style={{ width: '100%', justifyContent: 'center', fontSize: 15, padding: '14px', marginBottom: 20 }}
        >
          <Camera size={18} /> Add Your Shot
        </button>
      )}

      {/* ── Photo count + Download All ── */}
      {photos.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <p style={{ fontSize: 12, color: 'var(--tx4)', margin: 0 }}>
            {photos.length} photo{photos.length !== 1 ? 's' : ''} on the wall
          </p>
          <button
            onClick={downloadAll}
            disabled={downloading}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--tx2)', fontSize: 12, fontWeight: 600, cursor: downloading ? 'not-allowed' : 'pointer', opacity: downloading ? 0.6 : 1 }}
          >
            <Download size={13} />
            {downloading ? 'Bundling…' : `Save All (${tournamentYear})`}
          </button>
        </div>
      )}

      {/* ── Skeleton grid ── */}
      {loading && photos.length === 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[0, 1, 2].map(i => <SkeletonPhotoCard key={i} />)}
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[3, 4, 5].map(i => <SkeletonPhotoCard key={i} />)}
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && photos.length === 0 && (
        <div className="glass animate-fadeUp" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>⛳</div>
          <div style={{ fontFamily: 'Bebas Neue', fontSize: 24, color: '#D4A53A', letterSpacing: 3, marginBottom: 8 }}>
            The Wall Is Empty
          </div>
          <p style={{ color: 'var(--tx3)', fontSize: 14, lineHeight: 1.6, maxWidth: 280, margin: '0 auto 20px' }}>
            Nobody's got shots to share? Get out there, make some memories, and document them.
          </p>
          {isCurrentYear && (
            <button className="btn-gold" onClick={() => setShowUpload(true)} style={{ margin: '0 auto' }}>
              <Camera size={16} /> Be the first
            </button>
          )}
        </div>
      )}

      {/* ── Masonry grid ── */}
      {photos.length > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          {[col1, col2].map((col, ci) => (
            <div key={ci} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {col.map(photo => {
                const globalIdx = photos.indexOf(photo)
                const uploaderName = photo.uploader
                  ? displayName(photo.uploader as { name: string; nickname: string | null })
                  : 'Unknown'
                const initials = avatarInitials(photo.uploader?.name ?? null, photo.uploader?.nickname ?? null)
                const canDelete = isAdmin || (isCurrentYear && photo.uploader_id === profile?.id)
                const staggerDelay = `${Math.min(globalIdx * 55, 600)}ms`

                return (
                  <div
                    key={photo.id}
                    className="animate-fadeUp"
                    onClick={() => { navigator.vibrate?.(8); setLightboxIdx(globalIdx) }}
                    style={{
                      borderRadius: 12,
                      overflow: 'hidden',
                      border: '1px solid var(--bdr)',
                      background: 'var(--surf)',
                      cursor: 'zoom-in',
                      position: 'relative',
                      transition: 'transform 0.15s, border-color 0.15s',
                      animationDelay: staggerDelay,
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(212,165,58,0.5)'; (e.currentTarget as HTMLElement).style.transform = 'scale(1.01)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--bdr)'; (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
                  >
                    <img
                      src={photo.photo_url}
                      alt=""
                      loading="lazy"
                      style={{ width: '100%', display: 'block', objectFit: 'cover' }}
                    />

                    {/* Action buttons */}
                    <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4 }}>
                      <button
                        onClick={e => { e.stopPropagation(); downloadPhoto(photo) }}
                        style={{ background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: '50%', width: 28, height: 28, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.7 }}
                        title="Save to camera roll"
                      >
                        <Download size={12} />
                      </button>
                      {canDelete && (
                        <button
                          onClick={e => { e.stopPropagation(); deletePhoto(photo.id) }}
                          style={{ background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: '50%', width: 28, height: 28, color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.7 }}
                          title="Delete"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>

                    {/* Bottom bar */}
                    <div style={{ padding: '8px 10px' }}>
                      {photo.caption && (
                        <p style={{ fontSize: 12, color: 'var(--tx2)', fontStyle: 'italic', marginBottom: 5, lineHeight: 1.4 }}>
                          "{photo.caption}"
                        </p>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(212,165,58,0.25)', border: '1px solid rgba(212,165,58,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#D4A53A', flexShrink: 0 }}>
                          {initials}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {uploaderName}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--tx4)' }}>
                            {formatDistanceToNow(new Date(photo.created_at), { addSuffix: true })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      <div style={{ height: 20 }} />
    </div>
  )
}
