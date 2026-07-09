import { useState } from 'react'
import TeeTimes from './TeeTimes'
import Groups from './Groups'

// Combined "Tourney" tab: tee times + groups behind one nav item.
export default function Tourney() {
  const [tab, setTab] = useState<'tees' | 'groups'>('tees')
  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="pill-tabs animate-fadeUp" style={{ marginBottom: 16 }}>
        <button onClick={() => { navigator.vibrate?.(8); setTab('tees') }} className={`pill-tab pressable ${tab === 'tees' ? 'active' : ''}`}>🕐 Tee Times</button>
        <button onClick={() => { navigator.vibrate?.(8); setTab('groups') }} className={`pill-tab pressable ${tab === 'groups' ? 'active' : ''}`}>👥 Groups</button>
      </div>
      {tab === 'tees' ? <TeeTimes /> : <Groups />}
    </div>
  )
}
