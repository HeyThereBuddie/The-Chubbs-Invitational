import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useYear } from '../context/YearContext'
import { useSyncContext } from '../context/SyncContext'
import { localDb, parseJson } from '../lib/localDb'
import { enqueue, drainQueue, getPendingCount } from '../lib/writeQueue'
import type { LogFeedEventPayload } from '../lib/writeQueue'
import type { Team, Player } from '../lib/types'
import { displayName } from '../lib/types'
import { Minus, Plus, Users } from 'lucide-react'

const HOLE_PARS = [5,4,5,3,4,4,3,4,4, 4,4,4,3,5,4,3,5,4]

function scoreFeedInfo(score: number, hole: number): { label: string; emoji: string } {
  if (score === 1) return { emoji: '🕳️', label: 'Hole in One!' }
  const par = HOLE_PARS[hole - 1]
  const d = score - par
  if (d <= -2) return { emoji: '🦅', label: 'Eagle' }
  if (d === -1) return { emoji: '🐦', label: 'Birdie' }
  if (d === 0)  return { emoji: '⛳', label: 'Par' }
  if (d === 1)  return { emoji: '😬', label: 'Bogey' }
  if (d === 2)  return { emoji: '😤', label: 'Double' }
  return { emoji: '💥', label: `+${d}` }
}

function puttFeedInfo(putts: number): { label: string; emoji: string } {
  if (putts >= 5) return { label: `${putts}-Putt`, emoji: '💀' }
  if (putts === 4) return { label: '4-Putt', emoji: '😱' }
  return { label: '3-Putt', emoji: '😰' }
}

async function logFeedEvent(
  eventType: 'score' | 'chulligan' | 'putt',
  teamId: string,
  teamName: string,
  hole: number,
  score: number | null,
  playerName: string | null,
  putts?: number,
  tournamentId?: string | null,
) {
  let label: string, emoji: string
  if (eventType === 'chulligan') {
    label = 'Chulligan'; emoji = '🍺'
  } else if (eventType === 'putt' && putts != null) {
    const info = puttFeedInfo(putts); label = info.label; emoji = info.emoji
  } else {
    const info = scoreFeedInfo(score!, hole); label = info.label; emoji = info.emoji
  }
  const { error } = await supabase.from('feed_events').insert({
    event_type: eventType,
    team_id: teamId || null,
    team_name: teamName,
    player_name: playerName,
    hole,
    score,
    label,
    emoji,
    ...(tournamentId && { tournament_id: tournamentId }),
  })
  if (error) console.error('[feed_events insert]', error.message)
}

const BASE = 'https://royalashburngolfclub.com/wp-content/uploads/2016/11'
const HOLE_DATA: { yards: number; si: number; description?: string; photo?: string }[] = [
  { yards: 484, si: 11, photo: `${BASE}/ROY-Hole-1-1.png`,  description: 'A good starting hole. Play drive squarely down the middle avoiding fairway bunkers both left and right. Long hitters can carry the corner of the dogleg to challenge this green. To ensure a par or birdie try, play second shot to the corner of the dogleg allowing for a short iron to the green.' },
  { yards: 327, si: 5,  photo: `${BASE}/ROY-Hole-2.png`,   description: '"Par here" always brings a smile. A good drive favouring the right side will kick to the left because of the tilted fairway. Make sure you select the proper club to carry your ball onto the green as this green is slightly raised. Putting from below the hole is a must to give the best chance to make a putt.' },
  { yards: 440, si: 7,  photo: `${BASE}/ROY-Hole-3.png`,   description: 'With many options from the tee, you must decide to attack the hole or play it safe as Lynde Creek waits in the distance. Be careful with your second shot as the cross bunkers and mound are at the 100 yard mark. The shot into this green will generally play close to a club longer being uphill and usually into the wind.' },
  { yards: 141, si: 15, photo: `${BASE}/ROY-Hole-4.png`,   description: 'With water on the left and a long bunker on the right, a well played tee shot is a must. Calculate your yardage accurately, as this green is 50 yards deep. Because of the size of the green, a long first putt is very common. A 3 here is a great score.' },
  { yards: 325, si: 1,  photo: `${BASE}/ROY-Hole-5.png`,   description: 'With 5 ponds and the creek to negotiate, this moderate length hole is a tough one. A well placed drive should be played down the left centre of the fairway avoiding a watery grave. The approach shot needs to carry both the creek and the pond guarding the front and left side of this green.' },
  { yards: 388, si: 3,  photo: `${BASE}/ROY-Hole-6.png`,   description: 'A well played tee shot would be played towards the 150 yard marker avoiding a series of mounds to the left of the fairway. This slight dogleg to the right always seems to play longer than the yardage on the scorecard. One of the 3 bunkers surrounding the green will often catch a wayward approach.' },
  { yards: 115, si: 17, photo: `${BASE}/ROY-Hole-7.png`,   description: 'Be aware of the pin position on this two-tier, 48 yard deep green. Remember to take more club as you are hitting uphill. This moderate length hole is quite the challenge. Play smart and avoid the big number here.' },
  { yards: 341, si: 13, photo: `${BASE}/ROY-Hole-8.png`,   description: 'A panoramic view reveals an open and inviting fairway with little trouble. A well struck tee shot will finish close to the 100 yard marker. The second shot requires a precise short iron approach to a tricky green. This triple-tiered green is guarded by 2 bunkers on the left and a horse shoe pond on the right.' },
  { yards: 325, si: 9,  photo: `${BASE}/ROY-Hole-9.png`,   description: 'This hole plays longer than its measured distance. Any drive in the fairway just past the 150 yard marker gives the best approach to the green. Don\'t fear taking an extra club approaching this green as it too is uphill and occasionally into the wind.' },
  { yards: 399, si: 2,  photo: `${BASE}/ROY-Hole-10.png`,  description: 'This hole doglegs to the right in between bunkers, mounds and trees. Play your drive to the left centre of the fairway. Three bunkers surrounding this elevated green makes this one of the most demanding shots on the back nine. A crisply hit shot has the best chance to find the green, otherwise a recovery from the rough or sand will follow.' },
  { yards: 306, si: 10, photo: `${BASE}/ROY-Hole-11.png`,  description: 'Woods and water dictate caution on this dogleg left. Select a club to play short of the pond and hit straight down the middle of the fairway. The second shot is usually with a short iron, played to the pin for a birdie opportunity. Play beyond the pin when the hole is placed on the front of the green to avoid the water.' },
  { yards: 397, si: 6,  photo: `${BASE}/ROY-Hole-12.png`,  description: 'Due to this tilted fairway, a well placed drive is hit left of centre. With out of bounds to the left and a green that falls sharply to the right and over the back, the only safe bail out area is short. The second shot is usually played with a mid iron to hybrid. You\'ll work hard for your par here.' },
  { yards: 155, si: 16, photo: `${BASE}/ROY-Hole-13.png`,  description: 'This tee shot is intimidating with Lynde Creek surrounding the entire green. It\'s important to know which way the wind is blowing before making your way into the valley, as it is difficult to detect from the tee. This narrow green makes a precision tee shot a must. Another challenging par.' },
  { yards: 505, si: 8,  photo: `${BASE}/ROY-Hole-14.png`,  description: 'A wide, inviting fairway gives you a chance to freely swing away, advancing your tee shot as far down as possible. A good drive will leave a long wood shot on this slight dogleg to the left. If successful in negotiating the first two shots, the third will be with a mid to short iron to the green. Be cautious when putting from above the hole.' },
  { yards: 418, si: 4,  photo: `${BASE}/ROY-Hole-15.png`,  description: 'This wide but tree lined fairway provides an intimidating tee shot on this long par 4. Even after a good drive, your second requires a well struck shot, usually with a hybrid or wood. The green is well protected with bunkers placed front left and back right. Any shot hit short will end up in a watery grave. A bogey is not a bad score on this hole.' },
  { yards: 132, si: 18, photo: `${BASE}/ROY-Hole-16.png`,  description: 'Our signature hole on the back nine favours an accurately hit, high flying shot. The key to this hole is a careful club selection. A misguided tee shot will find the two ponds flanking the elevated green or one of the surrounding bunkers. Putting from back to front can be quite treacherous.' },
  { yards: 494, si: 12, photo: `${BASE}/ROY-Hole-17-1.png`, description: 'This very demanding tee shot must negotiate Lynde Creek, a series of bunkers lining both sides of the fairway and usually the wind. A solidly struck second shot with a fairway wood or hybrid will leave you around the 100 yard mark. The third shot can be played aggressively to the hole reserving some caution if the pin is near the right side of the green.' },
  { yards: 345, si: 14, photo: `${BASE}/ROY-Hole-18.png`,  description: 'Depending on the wind, this hole could be a driver, fairway wood or hybrid from the tee. A well placed drive will leave a mid to short iron to a large tiered green. Locate the pin position and measure your distance accurately as this green is 50 yards in length.' },
]

function isHoleComplete(scoreRow: ScoreRow | undefined, twoPlayers: boolean): boolean {
  if (!scoreRow) return false
  if (scoreRow.putts == null) return false
  if (twoPlayers && !scoreRow.drive_used_id) return false
  return true
}

async function pingLeadCheck(payload?: { team_id: string; hole: number; score: number; is_admin_edit?: boolean }) {
  const { data: { session } } = await supabase.auth.getSession()
  supabase.functions.invoke('notify-lead-change', {
    headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
    body: payload,
  }).catch(() => { /* fire and forget */ })
}

type TeamFull = Team & { player1?: Player; player2?: Player }
type ScoreRow = { id: string; hole: number; score: number; drive_used_id: string | null; putts: number | null }
type ChulliganRow = { id: string; player_id: string; hole: number }

const SCORE_SELECT = 'id, hole, score, drive_used_id, putts'

function scoreBubbleClass(score: number, par: number): string {
  if (score === 1) return 'score-hole-in-one'
  const diff = score - par
  if (diff <= -2) return 'score-eagle'
  if (diff === -1) return 'score-birdie'
  if (diff === 0)  return 'score-par'
  if (diff === 1)  return 'score-bogey'
  if (diff === 2)  return 'score-double'
  return 'score-triple-plus'
}

function calcStats(scoreMap: Record<number, ScoreRow>) {
  const entries = Object.values(scoreMap)
  const gross = entries.reduce((a, s) => a + s.score, 0)
  const thru  = entries.length
  const toPar = gross - HOLE_PARS.slice(0, thru).reduce((a, b) => a + b, 0)
  const putts = entries.reduce((a, s) => a + (s.putts ?? 0), 0)
  return { gross, thru, toPar, putts, toParStr: toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : `${toPar}` }
}

function HoleCard({
  hole, scoreRow, isSaving, onMinus, onPlus, player1, player2, onSetDrive, driveDisabled, onSetPutts, onReset, chulligans, onToggleChulligan, readOnly, locked, holeInfo, infoExpanded, onToggleInfo,
}: {
  hole: number
  scoreRow: ScoreRow | undefined
  isSaving: boolean
  onMinus?: () => void
  onPlus?: () => void
  player1?: Player
  player2?: Player
  onSetDrive?: (playerId: string) => void
  driveDisabled?: Record<string, boolean>
  onSetPutts?: (putts: number) => void
  onReset?: () => void
  chulligans?: ChulliganRow[]
  onToggleChulligan?: (playerId: string, hole: number) => void
  readOnly?: boolean
  locked?: boolean
  holeInfo?: { yards: number; si: number; description?: string; photo?: string }
  infoExpanded?: boolean
  onToggleInfo?: () => void
}) {
  const par      = HOLE_PARS[hole - 1]
  const score    = scoreRow?.score
  const hasScore = score !== undefined
  const cls      = hasScore ? scoreBubbleClass(score, par) : 'score-empty'
  const driveId  = scoreRow?.drive_used_id ?? null
  const putts    = scoreRow?.putts ?? null

  return (
    <div className="glass animate-fadeUp" style={{
      padding: '14px 20px', opacity: isSaving ? 0.7 : 1, transition: 'opacity 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 12, flexShrink: 0,
            background: 'rgba(212,165,58,0.12)', border: '2px solid rgba(212,165,58,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, fontWeight: 900, color: '#D4A53A',
            letterSpacing: -0.5,
          }}>{hole}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--tx1)', lineHeight: 1 }}>Par {par}</span>
            {holeInfo && (
              <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--tx2)', lineHeight: 1 }}>{holeInfo.yards} yds</span>
            )}
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {hasScore ? (
          <div key={score} className={`score-bubble ${cls} score-digit-pop`} style={{ width: 56, height: 56, fontSize: 26 }}>
            {score}
          </div>
        ) : (
          <div style={{ width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 22, color: 'var(--tx5)', fontWeight: 300, lineHeight: 1 }}>—</span>
          </div>
        )}

        {!readOnly && !locked && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button
              onClick={onMinus}
              disabled={isSaving || (hasScore && score <= 1)}
              className="score-btn"
              style={{
                width: 44, height: 44, borderRadius: '50%',
                background: 'var(--surf2)', border: '1px solid var(--bdr)',
                color: 'var(--tx1)', cursor: isSaving ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              }}
            ><Minus size={16} /></button>
            <button
              onClick={onPlus}
              disabled={isSaving}
              className="score-btn"
              style={{
                width: 44, height: 44, borderRadius: '50%',
                background: 'rgba(212,165,58,0.18)', border: '1px solid rgba(212,165,58,0.4)',
                color: '#D4A53A', cursor: isSaving ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(212,165,58,0.15)',
              }}
            ><Plus size={16} /></button>
            {hasScore && onReset && (
              <button
                onClick={onReset}
                disabled={isSaving}
                title="Clear score"
                style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: 'transparent', border: '1px solid var(--bdr)',
                  color: 'var(--tx4)', cursor: isSaving ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, lineHeight: 1,
                }}
              >×</button>
            )}
          </div>
        )}
        {!readOnly && locked && (
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <span style={{ fontSize: 18, opacity: 0.22 }}>🔒</span>
            <span style={{ fontSize: 9, color: 'var(--tx5)', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>Hole {hole - 1} first</span>
          </div>
        )}
      </div>

      {readOnly && hasScore && (scoreRow?.drive_used_id || scoreRow?.putts != null) && (
        <div style={{ marginTop: 8, display: 'flex', gap: 14 }}>
          {scoreRow?.drive_used_id && (player1 || player2) && (() => {
            const driver = [player1, player2].find(p => p?.id === scoreRow.drive_used_id)
            return driver ? (
              <span style={{ fontSize: 11, color: 'var(--tx3)' }}>Drive: {displayName(driver)}</span>
            ) : null
          })()}
          {scoreRow?.putts != null && (
            <span style={{ fontSize: 11, color: 'var(--tx3)' }}>Putts: {scoreRow.putts}</span>
          )}
        </div>
      )}

      {!readOnly && !locked && hasScore && player1 && player2 && onSetDrive && (
        <div style={{
          marginTop: 10, paddingTop: 10,
          borderTop: '1px solid var(--bdr)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 11, color: 'var(--tx3)', flexShrink: 0 }}>Drive:</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {[player1, player2].map(p => {
              const active   = driveId === p.id
              const disabled = driveDisabled?.[p.id] ?? false
              return (
                <button key={p.id} onClick={() => !disabled && onSetDrive(p.id)}
                  disabled={disabled}
                  title={disabled ? 'Max 5 drives per half reached' : undefined}
                  style={{
                    padding: '4px 12px', borderRadius: 999,
                    fontSize: 12, fontWeight: 600, border: '1px solid',
                    background: active ? 'rgba(212,165,58,0.18)' : 'var(--surf2)',
                    borderColor: active ? '#D4A53A' : 'var(--bdr)',
                    color: active ? '#D4A53A' : 'var(--tx3)',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.3 : 1,
                    transition: 'all 0.15s',
                  }}>
                  {displayName(p)}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {!readOnly && !locked && hasScore && onSetPutts && (
        <div style={{
          marginTop: 10, paddingTop: 10,
          borderTop: '1px solid var(--bdr)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 11, color: 'var(--tx3)', flexShrink: 0 }}>Putts:</span>
          <div style={{ display: 'flex', gap: 5 }}>
            {[0, 1, 2, 3, 4, 5].map(n => {
              const active = putts === n
              return (
                <button key={n} onClick={() => onSetPutts(n)} style={{
                  width: 32, height: 28, borderRadius: 6,
                  fontSize: 13, fontWeight: 700, border: '1px solid',
                  background: active ? 'rgba(212,165,58,0.18)' : 'var(--surf2)',
                  borderColor: active ? '#D4A53A' : 'var(--bdr)',
                  color: active ? '#D4A53A' : 'var(--tx3)',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}>
                  {n}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {!readOnly && !locked && hasScore && player1 && player2 && onToggleChulligan && chulligans !== undefined && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--tx3)', flexShrink: 0 }}>🍺</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {[player1, player2].map(p => {
              const myC = chulligans.find(c => c.player_id === p.id)
              const usedHere      = myC?.hole === hole
              const usedElsewhere = myC && !usedHere
              return (
                <button key={p.id}
                  onClick={() => !usedElsewhere && onToggleChulligan(p.id, hole)}
                  title={usedElsewhere ? `${displayName(p)} already used chulligan on H${myC!.hole}` : undefined}
                  style={{
                    padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                    background: usedHere ? 'rgba(212,165,58,0.18)' : 'var(--surf2)',
                    border: `1px solid ${usedHere ? 'rgba(212,165,58,0.5)' : 'var(--bdr)'}`,
                    color: usedHere ? '#D4A53A' : usedElsewhere ? 'var(--tx5)' : 'var(--tx3)',
                    cursor: usedElsewhere ? 'not-allowed' : 'pointer',
                    textDecoration: usedElsewhere ? 'line-through' : 'none',
                  }}>
                  {usedHere ? '✅' : '🍺'} {displayName(p)}{usedElsewhere ? ` H${myC!.hole}` : ''}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {(holeInfo?.description || holeInfo?.photo) && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--bdr)' }}>
          <button type="button" onClick={onToggleInfo} style={{
            width: '100%', padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
            background: infoExpanded ? 'rgba(212,165,58,0.1)' : 'var(--surf2)',
            border: `1px solid ${infoExpanded ? 'rgba(212,165,58,0.35)' : 'var(--bdr)'}`,
            color: infoExpanded ? '#D4A53A' : 'var(--tx2)',
            fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <span style={{ fontSize: 15 }}>⛳</span>
            {infoExpanded ? 'Hide Hole Guide' : 'View Hole Guide'}
            <span style={{ fontSize: 11, opacity: 0.6 }}>{infoExpanded ? '▲' : '▼'}</span>
          </button>
        </div>
      )}

      {holeInfo && infoExpanded && (holeInfo.photo || holeInfo.description) && (
        <div style={{ marginTop: 10, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--bdr)' }}>
          {holeInfo.photo && (
            <img
              src={holeInfo.photo}
              alt={`Hole ${hole} diagram`}
              referrerPolicy="no-referrer"
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />
          )}
          {holeInfo.description && (
            <div style={{ padding: '10px 12px', background: 'var(--surf)', fontSize: 12, color: 'var(--tx2)', lineHeight: 1.7 }}>
              {holeInfo.description}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Scores() {
  const { profile, isAdmin } = useAuth()
  const { effectiveTournamentId, isCurrentYear } = useYear()
  const { isOnline, refreshPendingCount } = useSyncContext()
  const myTeamId = isCurrentYear ? (profile?.team_id ?? undefined) : undefined

  const [searchParams, setSearchParams] = useSearchParams()
  // Read jump target written by Leaderboard before navigating here.
  // sessionStorage is synchronous so this runs during render — no effect timing race.
  const _jump = (() => {
    try { return JSON.parse(sessionStorage.getItem('scores-jump') ?? 'null') as { teamId: string; hole: number } | null }
    catch { return null }
  })()

  const [allTeams,         setAllTeams]         = useState<TeamFull[]>([])
  const [myTeam,           setMyTeam]           = useState<TeamFull | null>(null)
  const [myScores,         setMyScores]         = useState<Record<number, ScoreRow>>({})
  const [myChulligans,     setMyChulligans]     = useState<ChulliganRow[]>([])
  const [adminScores,      setAdminScores]      = useState<Record<number, ScoreRow>>({})
  const [adminChulligans,  setAdminChulligans]  = useState<ChulliganRow[]>([])
  const [viewingTeamId, setViewingTeamId] = useState<string | null>(_jump?.teamId ?? null)
  const [viewTeam,    setViewTeam]    = useState<TeamFull | null>(null)
  const [viewScores,  setViewScores]  = useState<Record<number, ScoreRow>>({})

  const [adminTeamId,   setAdminTeamId]   = useState<string | null>(null)
  const [leaderToPar,   setLeaderToPar]   = useState<number | null>(null)
  const [selectedHole,  setSelectedHole]  = useState<number>(() => {
    const h = _jump?.hole ?? parseInt(searchParams.get('hole') ?? '1')
    return h >= 1 && h <= 18 ? h : 1
  })
  const [saving,        setSaving]        = useState<number | null>(null)
  const [teamPick,      setTeamPick]      = useState('')
  const [settingTeam,   setSettingTeam]   = useState(false)
  const [expandedHoles, setExpandedHoles] = useState<Set<number>>(new Set([1]))
  const toggleHoleInfo = (hole: number) => setExpandedHoles(prev => {
    const next = new Set(prev)
    next.has(hole) ? next.delete(hole) : next.add(hole)
    return next
  })
  const handleSelectHole = (hole: number) => {
    setSelectedHole(hole)
    setExpandedHoles(prev => new Set([...prev, hole]))
  }

  const myTeamIdRef      = useRef<string | undefined>(undefined)
  const viewingTeamIdRef = useRef<string | null>(null)
  const allTeamsRef      = useRef<TeamFull[]>([])
  // Clean up sessionStorage entry and legacy URL params on mount
  useEffect(() => {
    sessionStorage.removeItem('scores-jump')
    if (searchParams.get('hole') || searchParams.get('team')) setSearchParams({}, { replace: true })
    window.history.replaceState({}, '')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { myTeamIdRef.current = myTeamId }, [myTeamId])
  useEffect(() => { viewingTeamIdRef.current = viewingTeamId }, [viewingTeamId])
  useEffect(() => { allTeamsRef.current = allTeams }, [allTeams])

  // ── Load ────────────────────────────────────────────────────

  useEffect(() => { loadAllTeams() }, [effectiveTournamentId])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (myTeamId) loadPlayerData(myTeamId) }, [myTeamId, isOnline])
  useEffect(() => { if (adminTeamId) loadAdminScores(adminTeamId) }, [adminTeamId])
  // Default to own team only when no jump target was stored (viewingTeamId starts null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (myTeamId && !viewingTeamId) setViewingTeamId(myTeamId) }, [myTeamId])
  useEffect(() => {
    if (!viewingTeamId || viewingTeamId === myTeamId) return
    loadViewTeam(viewingTeamId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingTeamId, myTeamId])

  useEffect(() => {
    const reload = () => {
      if (myTeamIdRef.current) loadPlayerData(myTeamIdRef.current)
      if (adminTeamId) loadAdminScores(adminTeamId)
      const vId = viewingTeamIdRef.current
      if (vId && vId !== myTeamIdRef.current) loadViewTeam(vId)
      computeLeaderToPar(allTeamsRef.current)
    }
    const sub = supabase.channel('scores-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' },     reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chulligans' }, reload)
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [adminTeamId])

  const loadAllTeams = async () => {
    if (!effectiveTournamentId) { setAllTeams([]); setLeaderToPar(null); return }

    // Step 1: Show cached teams immediately (instant, works offline)
    const localTeams = await localDb.teams
      .where('tournament_id').equals(effectiveTournamentId).toArray()
    if (localTeams.length > 0) {
      // Build a profile map so we can fill in player data even if player_json is null
      const localProfiles = await localDb.profiles.toArray()
      const profMap = new Map(localProfiles.map(p => [p.id, p]))
      setAllTeams(localTeams.map(t => ({
        ...t,
        player1: ((parseJson(t.player1_json) as Player | undefined) ?? (t.p1_id ? profMap.get(t.p1_id) as unknown as Player : undefined)),
        player2: ((parseJson(t.player2_json) as Player | undefined) ?? (t.p2_id ? profMap.get(t.p2_id) as unknown as Player : undefined)),
      })) as unknown as TeamFull[])
      // Initialize adminTeamId from cache — only if not already set by user interaction
      if (isAdmin && isCurrentYear) {
        const defaultId = (myTeamId && localTeams.find(t => t.id === myTeamId)) ? myTeamId : localTeams[0].id
        setAdminTeamId(prev => prev ?? defaultId)
      }
    }

    // Step 2: Refresh from Supabase in the background
    try {
      const { data } = await supabase.from('teams')
        .select('*, player1:profiles!teams_p1_id_fkey(*), player2:profiles!teams_p2_id_fkey(*)')
        .eq('tournament_id', effectiveTournamentId)
      if (data) {
        // Preserve cached player data if Supabase join returned null (spotty connection)
        setAllTeams(prev => {
          const prevMap = new Map(prev.map((t: TeamFull) => [t.id, t]))
          return (data as TeamFull[]).map(t => ({
            ...t,
            player1: t.player1 ?? prevMap.get(t.id)?.player1,
            player2: t.player2 ?? prevMap.get(t.id)?.player2,
          }))
        })
        computeLeaderToPar(data)
        if (isAdmin && isCurrentYear && data.length) {
          const initial = (myTeamId && data.find((t: TeamFull) => t.id === myTeamId)) ? myTeamId : data[0].id
          setAdminTeamId(initial)
        }
      }
    } catch { /* offline — cached data already shown */ }
  }

  const computeLeaderToPar = async (teams: TeamFull[]) => {
    if (!teams.length) { setLeaderToPar(null); return }
    const { data: scores } = await supabase.from('scores').select('team_id, hole, score')
    if (!scores) return
    let best: number | null = null
    for (const team of teams) {
      const ts = scores.filter(s => s.team_id === team.id)
      if (!ts.length) continue
      const gross = ts.reduce((a, s) => a + s.score, 0)
      const parSoFar = HOLE_PARS.slice(0, ts.length).reduce((a, b) => a + b, 0)
      const toPar = gross - parSoFar
      if (best === null || toPar < best) best = toPar
    }
    setLeaderToPar(best)
  }

  const loadPlayerData = async (teamId: string) => {
    // Step 1: Show cached data immediately (works offline, zero latency)
    const [localScores, localCh, localTeam] = await Promise.all([
      localDb.scores.where('team_id').equals(teamId).toArray(),
      localDb.chulligans.where('team_id').equals(teamId).toArray(),
      localDb.teams.get(teamId),
    ])
    const cacheMap: Record<number, ScoreRow> = {}
    for (const s of localScores) cacheMap[s.hole] = { id: s.id, hole: s.hole, score: s.score, drive_used_id: s.drive_used_id, putts: s.putts }
    setMyScores(cacheMap)
    setMyChulligans(localCh.map(c => ({ id: c.id, player_id: c.player_id, hole: c.hole })))
    if (localTeam) {
      let p1 = parseJson(localTeam.player1_json) as Player | undefined
      let p2 = parseJson(localTeam.player2_json) as Player | undefined
      if (!p1 && localTeam.p1_id) { const r = await localDb.profiles.get(localTeam.p1_id); if (r) p1 = r as unknown as Player }
      if (!p2 && localTeam.p2_id) { const r = await localDb.profiles.get(localTeam.p2_id); if (r) p2 = r as unknown as Player }
      setMyTeam({ ...localTeam, player1: p1, player2: p2 } as unknown as TeamFull)
    }

    // Step 2: Refresh from Supabase in the background
    try {
      const { data: t } = await supabase
        .from('teams')
        .select('*, player1:profiles!teams_p1_id_fkey(*), player2:profiles!teams_p2_id_fkey(*)')
        .eq('id', teamId).single()
      if (!t) return
      // Preserve cached player data if Supabase join returned null (spotty connection)
      setMyTeam(prev => ({ ...t, player1: t.player1 ?? prev?.player1, player2: t.player2 ?? prev?.player2 } as TeamFull))

      // Only overwrite scores when no pending local writes — prevents wiping offline changes
      const pendingCount = await getPendingCount()
      if (pendingCount === 0) {
        const [{ data: scores }, { data: ch }] = await Promise.all([
          supabase.from('scores').select(SCORE_SELECT).eq('team_id', teamId),
          supabase.from('chulligans').select('id, player_id, hole').eq('team_id', teamId),
        ])
        const map: Record<number, ScoreRow> = {}
        for (const s of scores ?? []) map[s.hole] = s
        setMyScores(map)
        setMyChulligans((ch ?? []) as ChulliganRow[])
      }
    } catch { /* offline — cached data already shown */ }
  }

  const loadAdminScores = async (teamId: string) => {
    // Step 1: Show cached scores immediately (works offline)
    const [localScores, localCh] = await Promise.all([
      localDb.scores.where('team_id').equals(teamId).toArray(),
      localDb.chulligans.where('team_id').equals(teamId).toArray(),
    ])
    const cacheMap: Record<number, ScoreRow> = {}
    for (const s of localScores) cacheMap[s.hole] = { id: s.id, hole: s.hole, score: s.score, drive_used_id: s.drive_used_id, putts: s.putts }
    setAdminScores(cacheMap)
    setAdminChulligans(localCh.map(c => ({ id: c.id, player_id: c.player_id, hole: c.hole })))

    // Step 2: Refresh from Supabase in the background
    try {
      const [{ data: scores }, { data: ch }] = await Promise.all([
        supabase.from('scores').select(SCORE_SELECT).eq('team_id', teamId),
        supabase.from('chulligans').select('id, player_id, hole').eq('team_id', teamId),
      ])
      const map: Record<number, ScoreRow> = {}
      for (const s of scores ?? []) map[s.hole] = s
      if (scores) setAdminScores(map)
      if (ch) setAdminChulligans((ch ?? []) as ChulliganRow[])
    } catch { /* offline — cached data shown */ }
  }

  const loadViewTeam = async (teamId: string) => {
    // Step 1: Show cached data immediately
    const [localTeam, localScores] = await Promise.all([
      localDb.teams.get(teamId),
      localDb.scores.where('team_id').equals(teamId).toArray(),
    ])
    if (localTeam) {
      let p1 = parseJson(localTeam.player1_json) as Player | undefined
      let p2 = parseJson(localTeam.player2_json) as Player | undefined
      if (!p1 && localTeam.p1_id) { const r = await localDb.profiles.get(localTeam.p1_id); if (r) p1 = r as unknown as Player }
      if (!p2 && localTeam.p2_id) { const r = await localDb.profiles.get(localTeam.p2_id); if (r) p2 = r as unknown as Player }
      setViewTeam({ ...localTeam, player1: p1, player2: p2 } as unknown as TeamFull)
    }
    const cacheMap: Record<number, ScoreRow> = {}
    for (const s of localScores) cacheMap[s.hole] = { id: s.id, hole: s.hole, score: s.score, drive_used_id: s.drive_used_id, putts: s.putts }
    setViewScores(cacheMap)

    // Step 2: Refresh from Supabase in the background
    try {
      const [{ data: t }, { data: s }] = await Promise.all([
        supabase.from('teams').select('*, player1:profiles!teams_p1_id_fkey(*), player2:profiles!teams_p2_id_fkey(*)').eq('id', teamId).single(),
        supabase.from('scores').select(SCORE_SELECT).eq('team_id', teamId),
      ])
      if (t) {
        // Preserve cached player data if Supabase join returned null (spotty connection)
        setViewTeam(prev => ({ ...t, player1: t.player1 ?? prev?.player1, player2: t.player2 ?? prev?.player2 } as unknown as TeamFull))
        const map: Record<number, ScoreRow> = {}
        for (const row of s ?? []) map[row.hole] = row
        setViewScores(map)
      }
    } catch { /* offline — cached data already shown */ }
  }

  // ── Actions ─────────────────────────────────────────────────

  const adjustMyScore = async (hole: number, delta: number) => {
    if (!myTeamId) return
    navigator.vibrate?.(8)
    const cur  = myScores[hole]?.score ?? HOLE_PARS[hole - 1]
    const next = Math.max(1, cur + delta)
    const existing = myScores[hole]
    const isNew = !existing?.id || String(existing.id).startsWith('offline-')
    const scoreId = isNew ? `offline-${myTeamId}-${hole}` : existing!.id

    setSaving(hole)

    // Write to local cache FIRST — prevents concurrent loadPlayerData from reading stale IndexedDB
    await localDb.scores.put({
      id: scoreId,
      team_id: myTeamId,
      hole,
      score: next,
      drive_used_id: existing?.drive_used_id ?? null,
      putts: existing?.putts ?? null,
      updated_at: new Date().toISOString(),
    })

    // Optimistic update — localDb is already correct so any concurrent read returns the right value
    setMyScores(prev => ({ ...prev, [hole]: { id: scoreId, hole, score: next, drive_used_id: prev[hole]?.drive_used_id ?? null, putts: prev[hole]?.putts ?? null } }))

    // Queue the score write (LWW dedup: rapid taps keep only the latest)
    await enqueue('set_score', { team_id: myTeamId, hole, score: next }, { team_id: myTeamId, hole })

    // Queue the feed event (same conflict key ensures only the final score is posted)
    const feedInfo = scoreFeedInfo(next, hole)
    await enqueue('log_feed_event', {
      id: crypto.randomUUID(),
      event_type: 'score',
      team_id: myTeamId ?? null,
      team_name: myTeam?.name ?? '',
      player_name: null,
      voter_name: null,
      hole,
      score: next,
      label: feedInfo.label,
      emoji: feedInfo.emoji,
      tournament_id: effectiveTournamentId ?? null,
    } satisfies LogFeedEventPayload, { team_id: myTeamId, hole, ev: 'score' })

    setSaving(null)

    // Drain immediately if online; notify function is fire-and-forget after sync
    if (navigator.onLine) {
      drainQueue().then(() => pingLeadCheck({ team_id: myTeamId!, hole, score: next })).catch(() => {})
    }
    await refreshPendingCount()
  }

  const adjustAdminScore = async (hole: number, delta: number) => {
    if (!adminTeamId) return
    navigator.vibrate?.(8)
    const cur  = adminScores[hole]?.score ?? HOLE_PARS[hole - 1]
    const next = Math.max(1, cur + delta)
    setSaving(hole)
    const existing = adminScores[hole]
    if (existing?.id) {
      await supabase.from('scores').update({ score: next }).eq('id', existing.id)
      setAdminScores(prev => ({ ...prev, [hole]: { ...prev[hole], score: next } }))
    } else {
      const { data } = await supabase.from('scores')
        .insert({ team_id: adminTeamId, hole, score: next }).select('id, drive_used_id, putts').single()
      if (data) setAdminScores(prev => ({ ...prev, [hole]: { id: data.id, hole, score: next, drive_used_id: data.drive_used_id, putts: data.putts } }))
    }
    setSaving(null)
    pingLeadCheck({ team_id: adminTeamId, hole, score: next, is_admin_edit: !!existing?.id })
    const adminTeam = allTeams.find(t => t.id === adminTeamId)
    logFeedEvent('score', adminTeamId, adminTeam?.name ?? '', hole, next, null, undefined, effectiveTournamentId)
  }

  const setMyDrive = async (hole: number, playerId: string) => {
    const existing = myScores[hole]
    if (!existing?.id) return
    const newId = existing.drive_used_id === playerId ? null : playerId

    // Write localDb first so any concurrent read picks up the new value
    await localDb.scores.update(existing.id, { drive_used_id: newId })
    setMyScores(prev => ({ ...prev, [hole]: { ...prev[hole], drive_used_id: newId } }))
    await enqueue('set_drive', { team_id: myTeamId!, hole, drive_used_id: newId }, { team_id: myTeamId!, hole })
    if (navigator.onLine) drainQueue().catch(() => {})
    await refreshPendingCount()
  }

  const setAdminDrive = async (hole: number, playerId: string) => {
    const existing = adminScores[hole]
    if (!existing?.id) return
    const newId = existing.drive_used_id === playerId ? null : playerId
    await supabase.from('scores').update({ drive_used_id: newId }).eq('id', existing.id)
    setAdminScores(prev => ({ ...prev, [hole]: { ...prev[hole], drive_used_id: newId } }))
  }

  const setMyPutts = async (hole: number, putts: number) => {
    const existing = myScores[hole]
    if (!existing?.id) return
    const newPutts = existing.putts === putts ? null : putts

    // Write localDb first so any concurrent read picks up the new value
    await localDb.scores.update(existing.id, { putts: newPutts })
    setMyScores(prev => ({ ...prev, [hole]: { ...prev[hole], putts: newPutts } }))
    await enqueue('set_putts', { team_id: myTeamId!, hole, putts: newPutts }, { team_id: myTeamId!, hole })

    // Queue/replace the putt feed event; cancel it if putts dropped below 3
    const puttFeedKey = { team_id: myTeamId!, hole, ev: 'putt' }
    if (newPutts != null && newPutts >= 3) {
      const info = puttFeedInfo(newPutts)
      await enqueue('log_feed_event', {
        id: crypto.randomUUID(),
        event_type: 'putt',
        team_id: myTeamId ?? null,
        team_name: myTeam?.name ?? '',
        player_name: null,
        voter_name: null,
        hole,
        score: null,
        label: info.label,
        emoji: info.emoji,
        tournament_id: effectiveTournamentId ?? null,
      } satisfies LogFeedEventPayload, puttFeedKey)
    } else {
      // Remove any queued putt feed event for this hole (user deselected or chose < 3)
      await localDb.pending_writes
        .where('op_type').equals('log_feed_event')
        .filter(w => w.conflict_key === JSON.stringify(puttFeedKey) && w.status === 'pending')
        .delete()
    }

    if (navigator.onLine) drainQueue().catch(() => {})
    await refreshPendingCount()
  }

  const setAdminPutts = async (hole: number, putts: number) => {
    const existing = adminScores[hole]
    if (!existing?.id) return
    const newPutts = existing.putts === putts ? null : putts
    await supabase.from('scores').update({ putts: newPutts }).eq('id', existing.id)
    setAdminScores(prev => ({ ...prev, [hole]: { ...prev[hole], putts: newPutts } }))
    if (newPutts != null && newPutts >= 3) {
      const adminTeam = allTeams.find(t => t.id === adminTeamId)
      logFeedEvent('putt', adminTeamId!, adminTeam?.name ?? '', hole, null, null, newPutts, effectiveTournamentId)
    }
  }

  const resetMyScore = async (hole: number) => {
    const existing = myScores[hole]
    if (!existing?.id) return

    setMyScores(prev => { const next = { ...prev }; delete next[hole]; return next })
    await localDb.scores.delete(existing.id)

    // Cancel any queued feed events for this hole
    for (const evKey of [
      JSON.stringify({ team_id: myTeamId!, hole, ev: 'score' }),
      JSON.stringify({ team_id: myTeamId!, hole, ev: 'putt' }),
    ]) {
      await localDb.pending_writes
        .where('op_type').equals('log_feed_event')
        .filter(w => w.conflict_key === evKey && w.status === 'pending')
        .delete()
    }

    if (!String(existing.id).startsWith('offline-')) {
      // Row exists in Supabase — queue a delete
      await enqueue('delete_score', { team_id: myTeamId!, hole }, { team_id: myTeamId!, hole })
      if (navigator.onLine) drainQueue().catch(() => {})
    } else {
      // Row was never synced — just remove related queued writes
      for (const opType of ['set_score', 'set_drive', 'set_putts'] as const) {
        await localDb.pending_writes
          .where('op_type').equals(opType)
          .filter(w => w.conflict_key === JSON.stringify({ team_id: myTeamId!, hole }) && w.status === 'pending')
          .delete()
      }
    }
    await refreshPendingCount()
  }

  const resetAdminScore = async (hole: number) => {
    const existing = adminScores[hole]
    if (!existing?.id) return
    await supabase.from('scores').delete().eq('id', existing.id)
    setAdminScores(prev => { const next = { ...prev }; delete next[hole]; return next })
  }

  const toggleChulligan = async (
    teamId: string,
    playerId: string,
    hole: number,
    chulligans: ChulliganRow[],
    setter: (c: ChulliganRow[]) => void,
  ) => {
    const existing = chulligans.find(c => c.player_id === playerId)
    const team = allTeams.find(t => t.id === teamId) ?? myTeam
    const player = [team?.player1, team?.player2].find(p => p?.id === playerId)
    const teamName = team?.name ?? ''
    const playerName = player ? displayName(player) : ''
    const fakeId = `offline-ch-${teamId}-${playerId}`
    const chulFeedKey = { team_id: teamId, player_id: playerId, ev: 'chulligan' }

    const queueFeedEvent = async () => {
      await enqueue('log_feed_event', {
        id: crypto.randomUUID(),
        event_type: 'chulligan',
        team_id: teamId,
        team_name: teamName,
        player_name: playerName,
        voter_name: null,
        hole,
        score: null,
        label: 'Chulligan',
        emoji: '🍺',
        tournament_id: effectiveTournamentId ?? null,
      } satisfies LogFeedEventPayload, chulFeedKey)
    }

    if (existing) {
      if (existing.hole === hole) {
        // Removing chulligan
        setter(chulligans.filter(c => c.id !== existing.id))
        await localDb.chulligans.delete(existing.id)
        // Cancel any queued chulligan feed event for this player
        await localDb.pending_writes
          .where('op_type').equals('log_feed_event')
          .filter(w => w.conflict_key === JSON.stringify(chulFeedKey) && w.status === 'pending')
          .delete()
        await enqueue('set_chulligan', { team_id: teamId, player_id: playerId, hole, present: false }, { team_id: teamId, player_id: playerId })
      } else {
        // Moving chulligan to a new hole
        setter([...chulligans.filter(c => c.id !== existing.id), { id: fakeId, player_id: playerId, hole }])
        await localDb.chulligans.delete(existing.id)
        await localDb.chulligans.put({ id: fakeId, team_id: teamId, player_id: playerId, hole })
        await enqueue('set_chulligan', { team_id: teamId, player_id: playerId, hole, present: true }, { team_id: teamId, player_id: playerId })
        await queueFeedEvent()
      }
    } else {
      // Adding new chulligan
      setter([...chulligans, { id: fakeId, player_id: playerId, hole }])
      await localDb.chulligans.put({ id: fakeId, team_id: teamId, player_id: playerId, hole })
      await enqueue('set_chulligan', { team_id: teamId, player_id: playerId, hole, present: true }, { team_id: teamId, player_id: playerId })
      await queueFeedEvent()
    }

    if (navigator.onLine) drainQueue().catch(() => {})
    await refreshPendingCount()
  }

  const countDrives = (pid: string | null, from: number, to: number, scoreMap: Record<number, ScoreRow>) => {
    if (!pid) return 0
    let n = 0
    for (let h = from; h <= to; h++) {
      if (scoreMap[h]?.drive_used_id === pid) n++
    }
    return n
  }

  const claimTeam = async () => {
    if (!teamPick || !profile) return
    setSettingTeam(true)
    await supabase.from('profiles').update({ team_id: teamPick }).eq('id', profile.id)
    setSettingTeam(false)
    window.location.reload()
  }

  // ── Helpers ──────────────────────────────────────────────────

  const pageHeader = (
    <div style={{ marginBottom: 20 }}>
      <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 32, color: '#D4A53A', letterSpacing: 4 }}>Scores</h1>
      <p style={{ color: 'var(--tx3)', fontSize: 13 }}>Modified Scramble — one score per hole per team</p>
    </div>
  )

  // ── HoleCard ─────────────────────────────────────────────────

  // ── DriveCounter ─────────────────────────────────────────────

  const DriveCounter = ({ scoreMap, p1, p2 }: {
    scoreMap: Record<number, ScoreRow>
    p1: Player | undefined
    p2: Player | undefined
  }) => {
    if (!p1 || !p2) return null
    const halves = [
      { label: 'Front 9', from: 1,  to: 9  },
      { label: 'Back 9',  from: 10, to: 18 },
    ]
    return (
      <div className="glass" style={{ padding: '12px 16px', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
          Drive usage — min 4 each per half
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {halves.map(({ label, from, to }) => {
            const p1c = countDrives(p1.id, from, to, scoreMap)
            const p2c = countDrives(p2.id, from, to, scoreMap)
            return (
              <div key={label}>
                <div style={{ fontSize: 10, color: 'var(--tx4)', marginBottom: 6 }}>{label}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[{ name: displayName(p1), count: p1c }, { name: displayName(p2), count: p2c }].map(({ name, count }) => {
                    const ok = count >= 4
                    return (
                      <div key={name} style={{
                        flex: 1, textAlign: 'center', padding: '6px 4px', borderRadius: 8,
                        background: ok ? 'rgba(34,197,94,0.1)' : 'var(--surf2)',
                        border: `1px solid ${ok ? 'rgba(34,197,94,0.3)' : 'var(--bdr)'}`,
                      }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: ok ? '#22c55e' : 'var(--tx2)' }}>
                          {count}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 1 }}>{name}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── ChulliganDashboard ───────────────────────────────────────

  const ChulliganDashboard = ({ p1, p2, chulligans }: {
    p1: Player | undefined
    p2: Player | undefined
    chulligans: ChulliganRow[]
  }) => {
    if (!p1 || !p2) return null
    return (
      <div className="glass" style={{ padding: '12px 16px', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
          🍺 Chulligans — 1 per player per round (must chug)
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[p1, p2].map(p => {
            const c = chulligans.find(ch => ch.player_id === p.id)
            return (
              <div key={p.id} style={{
                flex: 1, textAlign: 'center', padding: '10px 8px', borderRadius: 10,
                background: c ? 'rgba(212,165,58,0.1)' : 'var(--surf2)',
                border: `1px solid ${c ? 'rgba(212,165,58,0.35)' : 'var(--bdr)'}`,
              }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>{c ? '✅' : '🍺'}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: c ? '#D4A53A' : 'var(--tx2)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {displayName(p)}
                </div>
                <div style={{ fontSize: 10, color: c ? '#D4A53A' : 'var(--tx4)' }}>
                  {c ? `Used H${c.hole}` : 'Available'}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── No team ──────────────────────────────────────────────────

  if (!isAdmin && !myTeamId && isCurrentYear) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        {pageHeader}
        <div className="glass animate-fadeUp" style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ margin: '0 auto 16px', width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surf2)', borderRadius: '50%' }}>
            <Users size={24} style={{ color: 'var(--tx4)' }} />
          </div>
          <p style={{ color: 'var(--tx2)', fontWeight: 600, marginBottom: 6 }}>You're not assigned to a team yet</p>
          <p style={{ color: 'var(--tx3)', fontSize: 13, marginBottom: 24 }}>Pick your team to start entering scores</p>
          <select value={teamPick} onChange={e => setTeamPick(e.target.value)} style={{ marginBottom: 16 }}>
            <option value="">— Select your team —</option>
            {allTeams.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}{(t.player1 || t.player2) ? ` — ${[t.player1 && displayName(t.player1), t.player2 && displayName(t.player2)].filter(Boolean).join(' & ')}` : ''}
              </option>
            ))}
          </select>
          <button className="btn-gold" onClick={claimTeam} disabled={!teamPick || settingTeam}>
            {settingTeam ? 'Saving…' : 'This is my team'}
          </button>
        </div>
      </div>
    )
  }

  // ── Hole tab row helper ──────────────────────────────────────

  const HoleTabs = ({ scoreMap, twoPlayers, locked: applyLock }: {
    scoreMap: Record<number, ScoreRow>
    twoPlayers: boolean
    locked?: boolean
  }) => (
    <div style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 6, marginBottom: 14 }}>
      {Array.from({ length: 18 }, (_, i) => i + 1).map(hole => {
        const isLocked = applyLock && hole > 1 && !isHoleComplete(scoreMap[hole - 1], twoPlayers)
        const sr  = scoreMap[hole]
        const par = HOLE_PARS[hole - 1]
        const hasScore = sr?.score !== undefined
        const diff = hasScore ? sr!.score - par : null
        const isActive = selectedHole === hole
        const dotColor = diff === null ? null
          : diff <= -2 ? '#86efac' : diff === -1 ? '#4ade80' : diff === 0 ? '#22c55e'
          : diff === 1 ? '#ef4444' : '#dc2626'
        return (
          <button key={hole} onClick={() => handleSelectHole(hole)}
            style={{
              minWidth: 38, padding: '6px 4px', borderRadius: 8, flexShrink: 0,
              border: `1px solid ${isActive ? 'rgba(212,165,58,0.5)' : 'var(--bdr)'}`,
              background: isActive ? 'rgba(212,165,58,0.12)' : 'transparent',
              cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              opacity: isLocked ? 0.38 : 1, transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: isActive ? '#D4A53A' : 'var(--tx1)', lineHeight: 1 }}>
              {hole}
            </span>
            {isLocked ? (
              <span style={{ fontSize: 9, lineHeight: 1 }}>🔒</span>
            ) : dotColor !== null ? (
              <span style={{ fontSize: 10, fontWeight: 700, color: dotColor, lineHeight: 1 }}>
                {diff === 0 ? 'E' : diff! > 0 ? `+${diff}` : `${diff}`}
              </span>
            ) : (
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--surf2)', display: 'inline-block' }} />
            )}
          </button>
        )
      })}
    </div>
  )

  // ── Admin view (current year only) ───────────────────────────

  if (isAdmin && isCurrentYear) {
    const adminTeam = allTeams.find(t => t.id === adminTeamId)
    const stats = adminTeam ? calcStats(adminScores) : null
    const adminTabTeams = myTeamId
      ? [...allTeams].sort((a, b) => (a.id === myTeamId ? -1 : b.id === myTeamId ? 1 : 0))
      : allTeams

    return (
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        {pageHeader}

        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, marginBottom: 16 }}>
          {adminTabTeams.map(t => (
            <button key={t.id} onClick={() => { setAdminTeamId(t.id); setAdminScores({}) }}
              className={`pill-tab ${adminTeamId === t.id ? 'active' : ''}`}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <span>{t.name}{t.id === myTeamId ? ' ⭐' : ''}</span>
              {(t.player1 || t.player2) && (
                <span style={{ fontSize: 9, opacity: 0.55, whiteSpace: 'nowrap' }}>
                  {[t.player1 && displayName(t.player1), t.player2 && displayName(t.player2)].filter(Boolean).join(' & ')}
                </span>
              )}
            </button>
          ))}
        </div>

        {adminTeam && stats && (
          <div className="glass animate-fadeUp" style={{ padding: '16px 20px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#D4A53A' }}>{adminTeam.name}</div>
              <div style={{ fontSize: 13, color: 'var(--tx2)', marginTop: 2 }}>
                {[adminTeam.player1 && displayName(adminTeam.player1), adminTeam.player2 && displayName(adminTeam.player2)].filter(Boolean).join(' & ')}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 20, textAlign: 'center' }}>
              <div><div style={{ fontSize: 22, fontWeight: 700, color: stats.toPar <= 0 ? '#D4A53A' : 'var(--tx1)' }}>{stats.toParStr}</div><div style={{ fontSize: 11, color: 'var(--tx3)' }}>To Par</div></div>
              <div><div style={{ fontSize: 22, fontWeight: 700, color: 'var(--tx1)' }}>{stats.thru > 0 && leaderToPar !== null && stats.toPar - leaderToPar > 0 ? stats.toPar - leaderToPar : '—'}</div><div style={{ fontSize: 11, color: 'var(--tx3)' }}>Back</div></div>
              <div><div style={{ fontSize: 22, fontWeight: 700, color: 'var(--tx1)' }}>{stats.gross || '—'}</div><div style={{ fontSize: 11, color: 'var(--tx3)' }}>Gross</div></div>
              <div><div style={{ fontSize: 22, fontWeight: 700, color: 'var(--tx1)' }}>{stats.thru}</div><div style={{ fontSize: 11, color: 'var(--tx3)' }}>Thru</div></div>
              <div><div style={{ fontSize: 22, fontWeight: 700, color: 'var(--tx1)' }}>{stats.putts || '—'}</div><div style={{ fontSize: 11, color: 'var(--tx3)' }}>Putts</div></div>
            </div>
          </div>
        )}

        <HoleTabs scoreMap={adminScores} twoPlayers={!!(adminTeam?.player1 && adminTeam?.player2)} />

        <DriveCounter scoreMap={adminScores} p1={adminTeam?.player1} p2={adminTeam?.player2} />
        <ChulliganDashboard p1={adminTeam?.player1} p2={adminTeam?.player2} chulligans={adminChulligans} />

        {(() => {
          const hole  = selectedHole
          const ap1   = adminTeam?.player1
          const ap2   = adminTeam?.player2
          const hFrom = hole <= 9 ? 1 : 10
          const hTo   = hole <= 9 ? 9 : 18
          const p1n   = countDrives(ap1?.id ?? null, hFrom, hTo, adminScores)
          const p2n   = countDrives(ap2?.id ?? null, hFrom, hTo, adminScores)
          const driveId = adminScores[hole]?.drive_used_id ?? null
          const driveDisabled: Record<string, boolean> = {
            ...(ap1 ? { [ap1.id]: p1n >= 5 && driveId !== ap1.id } : {}),
            ...(ap2 ? { [ap2.id]: p2n >= 5 && driveId !== ap2.id } : {}),
          }
          return (
            <HoleCard
              hole={hole}
              scoreRow={adminScores[hole]}
              isSaving={saving === hole}
              onMinus={() => adjustAdminScore(hole, -1)}
              onPlus={() => adjustAdminScore(hole, 1)}
              player1={ap1}
              player2={ap2}
              onSetDrive={(pid) => setAdminDrive(hole, pid)}
              driveDisabled={driveDisabled}
              onSetPutts={(n) => setAdminPutts(hole, n)}
              onReset={() => resetAdminScore(hole)}
              chulligans={adminChulligans}
              onToggleChulligan={(pid, h) => toggleChulligan(adminTeamId!, pid, h, adminChulligans, setAdminChulligans)}
              holeInfo={HOLE_DATA[hole - 1]}
              infoExpanded={expandedHoles.has(hole)}
              onToggleInfo={() => toggleHoleInfo(hole)}
            />
          )
        })()}

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16, color: 'var(--tx4)', fontSize: 12 }}>
          <span className="animate-pulseDot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#D4A53A', display: 'inline-block' }} />
          Scores sync in real-time to all connected devices
        </div>
      </div>
    )
  }

  // ── Player view ───────────────────────────────────────────────

  const isViewingMyTeam = viewingTeamId === myTeamId
  const displayTeam   = isViewingMyTeam ? myTeam   : viewTeam
  const displayScores = isViewingMyTeam ? myScores : viewScores
  const displayStats  = calcStats(displayScores)

  // Own team always pinned to the left
  const tabTeams = myTeamId
    ? [...allTeams].sort((a, b) => (a.id === myTeamId ? -1 : b.id === myTeamId ? 1 : 0))
    : allTeams

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      {pageHeader}

      {/* Team tabs — browse all scorecards; own team is editable, others are read-only */}
      {allTeams.length > 1 && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, marginBottom: 16 }}>
          {tabTeams.map(t => (
            <button key={t.id} onClick={() => setViewingTeamId(t.id)}
              className={`pill-tab ${viewingTeamId === t.id ? 'active' : ''}`}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <span>{t.name}{t.id === myTeamId ? ' ⭐' : ''}</span>
              {(t.player1 || t.player2) && (
                <span style={{ fontSize: 9, opacity: 0.55, whiteSpace: 'nowrap' }}>
                  {[t.player1 && displayName(t.player1), t.player2 && displayName(t.player2)].filter(Boolean).join(' & ')}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Team header */}
      {displayTeam && (
        <div className="glass animate-fadeUp" style={{ padding: '16px 20px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: 'var(--tx4)', textTransform: 'uppercase', marginBottom: 4 }}>
              {isViewingMyTeam ? 'Your Team' : 'Viewing'}
            </div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#D4A53A' }}>{displayTeam.name}</div>
            <div style={{ fontSize: 13, color: 'var(--tx2)', marginTop: 2 }}>
              {[displayTeam.player1 && displayName(displayTeam.player1), displayTeam.player2 && displayName(displayTeam.player2)].filter(Boolean).join(' & ')}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 20, textAlign: 'center' }}>
            <div><div style={{ fontSize: 22, fontWeight: 700, color: displayStats.toPar <= 0 ? '#D4A53A' : 'var(--tx1)' }}>{displayStats.toParStr}</div><div style={{ fontSize: 11, color: 'var(--tx3)' }}>To Par</div></div>
            <div><div style={{ fontSize: 22, fontWeight: 700, color: 'var(--tx1)' }}>{displayStats.thru > 0 && leaderToPar !== null && displayStats.toPar - leaderToPar > 0 ? displayStats.toPar - leaderToPar : '—'}</div><div style={{ fontSize: 11, color: 'var(--tx3)' }}>Back</div></div>
            <div><div style={{ fontSize: 22, fontWeight: 700, color: 'var(--tx1)' }}>{displayStats.gross || '—'}</div><div style={{ fontSize: 11, color: 'var(--tx3)' }}>Gross</div></div>
            <div><div style={{ fontSize: 22, fontWeight: 700, color: 'var(--tx1)' }}>{displayStats.thru}</div><div style={{ fontSize: 11, color: 'var(--tx3)' }}>Thru</div></div>
            <div><div style={{ fontSize: 22, fontWeight: 700, color: 'var(--tx1)' }}>{displayStats.putts || '—'}</div><div style={{ fontSize: 11, color: 'var(--tx3)' }}>Putts</div></div>
          </div>
        </div>
      )}

      {!isViewingMyTeam && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '8px 14px', borderRadius: 10, background: 'var(--surf)', border: '1px solid var(--bdr)' }}>
          <span style={{ fontSize: 13 }}>👁</span>
          <span style={{ fontSize: 12, color: 'var(--tx3)' }}>Read-only — you can only edit your own scorecard</span>
        </div>
      )}

      <HoleTabs
        scoreMap={isViewingMyTeam ? myScores : viewScores}
        twoPlayers={!!(myTeam?.player1 && myTeam?.player2)}
        locked={isViewingMyTeam}
      />

      {/* Drive counter + chulligans only for own team */}
      {isViewingMyTeam && <DriveCounter scoreMap={myScores} p1={myTeam?.player1 ?? allTeams.find(t => t.id === myTeamId)?.player1} p2={myTeam?.player2 ?? allTeams.find(t => t.id === myTeamId)?.player2} />}
      {isViewingMyTeam && <ChulliganDashboard p1={myTeam?.player1 ?? allTeams.find(t => t.id === myTeamId)?.player1} p2={myTeam?.player2 ?? allTeams.find(t => t.id === myTeamId)?.player2} chulligans={myChulligans} />}

      {(() => {
        const hole = selectedHole
        if (isViewingMyTeam) {
          // Fall back to allTeams if myTeam hasn't resolved yet (timing or fresh offline open)
          const effectiveMyTeam = myTeam ?? allTeams.find(t => t.id === myTeamId) ?? null
          const mp1 = effectiveMyTeam?.player1
          const mp2 = effectiveMyTeam?.player2
          const twoPlayers = !!(mp1 && mp2)
          const locked = hole > 1 && !isHoleComplete(myScores[hole - 1], twoPlayers)
          const hFrom = hole <= 9 ? 1 : 10
          const hTo   = hole <= 9 ? 9 : 18
          const p1n   = countDrives(mp1?.id ?? null, hFrom, hTo, myScores)
          const p2n   = countDrives(mp2?.id ?? null, hFrom, hTo, myScores)
          const driveId = myScores[hole]?.drive_used_id ?? null
          const driveDisabled: Record<string, boolean> = {
            ...(mp1 ? { [mp1.id]: p1n >= 5 && driveId !== mp1.id } : {}),
            ...(mp2 ? { [mp2.id]: p2n >= 5 && driveId !== mp2.id } : {}),
          }
          return (
            <HoleCard
              key={hole}
              hole={hole}
              scoreRow={myScores[hole]}
              isSaving={saving === hole}
              onMinus={() => adjustMyScore(hole, -1)}
              onPlus={() => adjustMyScore(hole, 1)}
              player1={mp1}
              player2={mp2}
              onSetDrive={(pid) => setMyDrive(hole, pid)}
              driveDisabled={driveDisabled}
              onSetPutts={(n) => setMyPutts(hole, n)}
              onReset={() => resetMyScore(hole)}
              chulligans={myChulligans}
              onToggleChulligan={(pid, h) => toggleChulligan(myTeamId!, pid, h, myChulligans, setMyChulligans)}
              locked={locked}
              holeInfo={HOLE_DATA[hole - 1]}
              infoExpanded={expandedHoles.has(hole)}
              onToggleInfo={() => toggleHoleInfo(hole)}
            />
          )
        }
        return (
          <HoleCard
            key={hole}
            hole={hole}
            scoreRow={viewScores[hole]}
            isSaving={false}
            player1={viewTeam?.player1}
            player2={viewTeam?.player2}
            readOnly
            holeInfo={HOLE_DATA[hole - 1]}
            infoExpanded={expandedHoles.has(hole)}
            onToggleInfo={() => toggleHoleInfo(hole)}
          />
        )
      })()}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16, color: 'var(--tx4)', fontSize: 12 }}>
        <span className="animate-pulseDot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#D4A53A', display: 'inline-block' }} />
        Scores sync in real-time to all connected devices
      </div>
    </div>
  )
}
