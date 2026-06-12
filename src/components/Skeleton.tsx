interface SkeletonProps {
  height?: number | string
  width?: number | string
  radius?: number
  style?: React.CSSProperties
}

export function Skeleton({ height = 16, width = '100%', radius = 8, style }: SkeletonProps) {
  return (
    <div
      className="skeleton"
      style={{ height, width, borderRadius: radius, flexShrink: 0, ...style }}
    />
  )
}

// Pre-built shapes for common patterns
export function SkeletonLeaderRow() {
  return (
    <div className="glass" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <Skeleton width={32} height={20} radius={4} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Skeleton height={14} width="55%" />
        <Skeleton height={11} width="35%" />
      </div>
      <Skeleton width={44} height={22} radius={6} />
      <Skeleton width={36} height={14} radius={4} />
    </div>
  )
}

export function SkeletonContestRow() {
  return (
    <div className="glass" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <Skeleton width={28} height={28} radius={999} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Skeleton height={14} width="40%" />
        <Skeleton height={11} width="25%" />
      </div>
    </div>
  )
}

export function SkeletonPhotoCard() {
  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--bdr)' }}>
      <Skeleton height={160} radius={0} />
      <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Skeleton height={11} width="70%" />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Skeleton width={20} height={20} radius={999} />
          <Skeleton height={11} width="45%" />
        </div>
      </div>
    </div>
  )
}

export function SkeletonHoleCard() {
  return (
    <div className="glass" style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <Skeleton width={52} height={52} radius={12} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Skeleton height={14} width={60} />
        <Skeleton height={11} width={40} />
      </div>
      <div style={{ flex: 1 }} />
      <Skeleton width={56} height={56} radius={12} />
      <div style={{ display: 'flex', gap: 8 }}>
        <Skeleton width={36} height={36} radius={999} />
        <Skeleton width={36} height={36} radius={999} />
      </div>
    </div>
  )
}
