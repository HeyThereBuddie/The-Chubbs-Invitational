import { useSyncContext } from '../context/SyncContext'
import { formatDistanceToNow } from 'date-fns'

export default function OfflineBanner() {
  const { isOnline, isSyncing, lastSynced, pendingCount } = useSyncContext()

  // Nothing to show: online, not syncing, no pending writes
  if (isOnline && !isSyncing && pendingCount === 0) return null

  const isSyncingOrPending = isSyncing || (isOnline && pendingCount > 0)

  return (
    <div style={{
      position: 'fixed',
      bottom: 72,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9000,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 16px',
      borderRadius: 999,
      background: isSyncingOrPending ? 'rgba(252,181,20,0.15)' : 'rgba(239,68,68,0.15)',
      border: `1px solid ${isSyncingOrPending ? 'rgba(252,181,20,0.4)' : 'rgba(239,68,68,0.4)'}`,
      backdropFilter: 'blur(12px)',
      whiteSpace: 'nowrap',
      boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
    }}>
      <div style={{
        width: 7, height: 7, borderRadius: '50%',
        background: isSyncingOrPending ? '#FCB514' : '#ef4444',
        animation: isSyncing ? 'pulseDot 1s ease-in-out infinite' : undefined,
      }} />
      <span style={{ fontSize: 12, fontWeight: 600, color: isSyncingOrPending ? '#FCB514' : '#ef4444' }}>
        {isSyncing
          ? 'Syncing…'
          : isOnline && pendingCount > 0
            ? `${pendingCount} change${pendingCount > 1 ? 's' : ''} pending sync`
            : 'Offline'}
      </span>
      {!isSyncing && !isOnline && lastSynced && (
        <span style={{ fontSize: 11, color: 'var(--tx3)' }}>
          · cached {formatDistanceToNow(lastSynced, { addSuffix: true })}
        </span>
      )}
    </div>
  )
}
