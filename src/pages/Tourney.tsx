import { useState } from 'react'
import TeeTimes from './TeeTimes'
import MyTeamPage from './MyTeamPage'
import HallOfFame from './HallOfFame'

// Combined "Tourney" tab: tee times, teams and hall of fame behind one nav item.
export default function Tourney() {
  const [tab, setTab] = useState<'tees' | 'teams' | 'hof'>('tees')
  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="pill-tabs animate-fadeUp" style={{ marginBottom: 16 }}>
        <button onClick={() => { navigator.vibrate?.(8); setTab('tees') }} className={`pill-tab pressable ${tab === 'tees' ? 'active' : ''}`}>🕐 Tee Times</button>
        <button onClick={() => { navigator.vibrate?.(8); setTab('teams') }} className={`pill-tab pressable ${tab === 'teams' ? 'active' : ''}`}>👥 Teams</button>
        <button onClick={() => { navigator.vibrate?.(8); setTab('hof') }} className={`pill-tab pressable ${tab === 'hof' ? 'active' : ''}`}>🏆 Hall of Fame</button>
      </div>
      {tab === 'tees' ? <TeeTimes /> : tab === 'teams' ? <MyTeamPage /> : <HallOfFame />}
    </div>
  )
}
