import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const RESEND_API_KEY      = Deno.env.get('RESEND_API_KEY')!
const FROM_EMAIL          = Deno.env.get('RESEND_FROM_EMAIL') ?? 'The Chubbs Memorial <onboarding@resend.dev>'
const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY   = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type RecipientGroup = 'active' | 'waitlist' | 'admins'

interface ResendEmail {
  from: string
  to: string
  subject: string
  html: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // ── 1. Verify caller is an admin ────────────────────────
    const authHeader = req.headers.get('Authorization')
    console.log('[auth] header present:', !!authHeader)
    if (!authHeader) return json({ error: 'Unauthorized - no header' }, 401)

    const token = authHeader.replace('Bearer ', '')
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { data: { user }, error: userErr } = await adminClient.auth.getUser(token)
    console.log('[auth] user:', user?.id ?? null, 'err:', userErr?.message ?? null)
    if (!user) return json({ error: 'Unauthorized - no user', detail: userErr?.message }, 401)

    const { data: caller } = await adminClient.from('profiles').select('role').eq('id', user.id).single()
    console.log('[auth] caller role:', caller?.role)
    if (caller?.role !== 'admin') return json({ error: 'Forbidden' }, 403)

    // ── 2. Use service role for data access ─────────────────
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const body = await req.json()
    const { type } = body

    let emails: ResendEmail[] = []

    if (type === 'blast') {
      emails = await buildBlastEmails(db, body)
    } else if (type === 'tee-time') {
      emails = await buildTeeTimeEmails(db)
    } else if (type === 'update') {
      emails = await buildUpdateEmails(db, body)
    } else if (type === 'welcome') {
      emails = await buildWelcomeEmails(db, body)
    } else {
      return json({ error: `Unknown type: ${type}` }, 400)
    }

    if (emails.length === 0) return json({ error: 'No recipients found', sent: 0 })

    const sent = await sendViaResend(emails)
    return json({ sent })
  } catch (err) {
    console.error(err)
    return json({ error: String(err) }, 500)
  }
})

// ── Email builders ─────────────────────────────────────────

async function buildBlastEmails(
  db: ReturnType<typeof createClient>,
  body: { subject: string; message: string; groups: RecipientGroup[] }
): Promise<ResendEmail[]> {
  const addrs = await fetchEmails(db, body.groups)
  return addrs.map(to => ({
    from: FROM_EMAIL,
    to,
    subject: body.subject,
    html: blastHtml(body.subject, body.message),
  }))
}

async function buildTeeTimeEmails(db: ReturnType<typeof createClient>): Promise<ResendEmail[]> {
  const { data: tts } = await db
    .from('tee_times')
    .select('tee_time, starting_hole, team:teams(name, player1:profiles!teams_p1_id_fkey(name, email), player2:profiles!teams_p2_id_fkey(name, email))')

  if (!tts) return []

  // Group by tee_time to find foursomes
  const byTime: Record<string, typeof tts> = {}
  for (const tt of tts) {
    if (!byTime[tt.tee_time]) byTime[tt.tee_time] = []
    byTime[tt.tee_time].push(tt)
  }

  const fmtTime = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
  }

  const results: ResendEmail[] = []

  for (const tt of tts) {
    // All players in this foursome
    const foursomePlayers: string[] = []
    for (const slot of byTime[tt.tee_time]) {
      if (slot.team?.player1?.name) foursomePlayers.push(slot.team.player1.name)
      if (slot.team?.player2?.name) foursomePlayers.push(slot.team.player2.name)
    }

    for (const player of [tt.team?.player1, tt.team?.player2]) {
      if (!player?.email) continue
      results.push({
        from: FROM_EMAIL,
        to: player.email,
        subject: 'Your Tee Time — The Chubbs Memorial',
        html: teeTimeHtml({
          playerName: player.name,
          teamName: tt.team.name,
          teeTime: fmtTime(tt.tee_time),
          startingHole: tt.starting_hole,
          partners: foursomePlayers.filter(n => n !== player.name),
        }),
      })
    }
  }

  return results
}

async function buildUpdateEmails(
  db: ReturnType<typeof createClient>,
  body: { updateId: string; groups: RecipientGroup[] }
): Promise<ResendEmail[]> {
  const [{ data: upd }, addrs] = await Promise.all([
    db.from('updates').select('title, body').eq('id', body.updateId).single(),
    fetchEmails(db, body.groups),
  ])
  if (!upd) return []
  return addrs.map(to => ({
    from: FROM_EMAIL,
    to,
    subject: `Update: ${upd.title}`,
    html: updateHtml(upd.title, upd.body),
  }))
}

async function buildWelcomeEmails(
  db: ReturnType<typeof createClient>,
  body: { playerIds: string[] }
): Promise<ResendEmail[]> {
  const { data: players } = await db.from('profiles').select('name, email').in('id', body.playerIds)
  return (players ?? [])
    .filter((p: { email: string }) => p.email)
    .map((p: { name: string; email: string }) => ({
      from: FROM_EMAIL,
      to: p.email,
      subject: 'Welcome to The Chubbs Memorial! ⛳',
      html: welcomeHtml(p.name),
    }))
}

// ── Helpers ────────────────────────────────────────────────

async function fetchEmails(db: ReturnType<typeof createClient>, groups: RecipientGroup[]): Promise<string[]> {
  const { data } = await db.from('profiles').select('email, status, role')
  const seen = new Set<string>()
  return (data ?? [])
    .filter((p: { status: string; role: string; email: string }) => {
      if (groups.includes('active')   && p.status === 'active')   return true
      if (groups.includes('waitlist') && p.status === 'waitlist') return true
      if (groups.includes('admins')   && p.role   === 'admin')    return true
      return false
    })
    .map((p: { email: string }) => p.email)
    .filter((e: string) => {
      if (!e || seen.has(e)) return false
      seen.add(e)
      return true
    })
}

async function sendViaResend(emails: ResendEmail[]): Promise<number> {
  const url  = emails.length === 1 ? 'https://api.resend.com/emails' : 'https://api.resend.com/emails/batch'
  const body = emails.length === 1 ? emails[0] : emails

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.message ?? `Resend error ${res.status}`)
  }
  return emails.length
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// ── HTML Templates ─────────────────────────────────────────

function wrap(content: string): string {
  return `<!DOCTYPE html><html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background:#0a0800;margin:0;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
  <tr><td style="background:#0d0900;border:1px solid #4a3800;border-bottom:none;border-radius:16px 16px 0 0;padding:28px 32px;text-align:center;">
    <div style="font-size:28px;color:#FCB514;font-weight:900;letter-spacing:3px;font-family:Georgia,serif;">THE CHUBBS MEMORIAL</div>
    <div style="color:#554030;font-size:11px;margin-top:6px;letter-spacing:3px;text-transform:uppercase;">Annual Golf Tournament</div>
  </td></tr>
  <tr><td style="background:#111008;border-left:1px solid #2a2000;border-right:1px solid #2a2000;padding:32px;">
    ${content}
  </td></tr>
  <tr><td style="background:#0a0800;border:1px solid #2a2000;border-top:1px solid #1a1400;border-radius:0 0 16px 16px;padding:20px 32px;text-align:center;">
    <div style="color:#3a3020;font-size:12px;font-style:italic;line-height:1.6;">&#x1F40A; "I would have been a pro if it wasn't for those damn alligators." — Chubbs Peterson</div>
  </td></tr>
</table></td></tr></table>
</body></html>`
}

function blastHtml(subject: string, message: string): string {
  return wrap(`
    <h1 style="color:#FCB514;font-size:22px;margin:0 0 20px;font-family:Georgia,serif;">${escHtml(subject)}</h1>
    <div style="color:#ccb88a;font-size:15px;line-height:1.8;white-space:pre-wrap;">${escHtml(message)}</div>
    <div style="margin-top:28px;padding-top:20px;border-top:1px solid #1a1400;">
      <div style="color:#554030;font-size:12px;">See you on the course! &#x26F3;</div>
    </div>
  `)
}

function teeTimeHtml(d: { playerName: string; teamName: string; teeTime: string; startingHole: number; partners: string[] }): string {
  const partnersRow = d.partners.length
    ? `<tr><td style="color:#554030;font-size:10px;text-transform:uppercase;letter-spacing:1px;padding:5px 0 2px;" width="130">Playing With</td><td style="color:#ccb88a;font-size:14px;padding:5px 0 2px;">${escHtml(d.partners.join(', '))}</td></tr>`
    : ''
  return wrap(`
    <h1 style="color:#FCB514;font-size:22px;margin:0 0 6px;font-family:Georgia,serif;">Tee Time Confirmed &#x26F3;</h1>
    <p style="color:#554030;font-size:13px;margin:0 0 24px;">Your details for The Chubbs Memorial:</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1200;border:1px solid #4a3800;border-radius:12px;margin-bottom:20px;">
      <tr><td style="padding:20px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="color:#554030;font-size:10px;text-transform:uppercase;letter-spacing:1px;padding:5px 0 2px;" width="130">Player</td><td style="color:#fff;font-size:15px;font-weight:bold;padding:5px 0 2px;">${escHtml(d.playerName)}</td></tr>
          <tr><td style="color:#554030;font-size:10px;text-transform:uppercase;letter-spacing:1px;padding:5px 0 2px;">Team</td><td style="color:#fff;font-size:15px;font-weight:bold;padding:5px 0 2px;">${escHtml(d.teamName)}</td></tr>
          <tr><td style="color:#554030;font-size:10px;text-transform:uppercase;letter-spacing:1px;padding:8px 0 2px;">Tee Time</td><td style="color:#FCB514;font-size:24px;font-weight:bold;font-family:Georgia,serif;padding:8px 0 2px;">${escHtml(d.teeTime)}</td></tr>
          <tr><td style="color:#554030;font-size:10px;text-transform:uppercase;letter-spacing:1px;padding:5px 0 2px;">Starting Hole</td><td style="color:#fff;font-size:15px;font-weight:bold;padding:5px 0 2px;">Hole ${d.startingHole}</td></tr>
          ${partnersRow}
        </table>
      </td></tr>
    </table>
    <p style="color:#887860;font-size:13px;line-height:1.7;margin:0;">Please arrive at least 15 minutes early. Remember: it's all in the hips! &#x1F3CC;</p>
  `)
}

function updateHtml(title: string, body: string): string {
  return wrap(`
    <div style="display:inline-block;background:#2a1c00;border:1px solid #4a3800;border-radius:999px;padding:4px 14px;margin-bottom:16px;">
      <span style="color:#FCB514;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:2px;">Tournament Update</span>
    </div>
    <h1 style="color:#fff;font-size:20px;margin:0 0 16px;font-family:Georgia,serif;line-height:1.3;">${escHtml(title)}</h1>
    <div style="color:#ccb88a;font-size:14px;line-height:1.8;border-left:3px solid #FCB514;padding-left:16px;white-space:pre-wrap;">${escHtml(body)}</div>
  `)
}

function welcomeHtml(playerName: string): string {
  return wrap(`
    <div style="text-align:center;margin-bottom:28px;">
      <div style="font-size:48px;">&#x26F3;</div>
      <h1 style="color:#FCB514;font-size:24px;margin:12px 0 8px;font-family:Georgia,serif;">You're In, ${escHtml(playerName)}!</h1>
      <p style="color:#554030;font-size:14px;margin:0;">Welcome to The Chubbs Memorial</p>
    </div>
    <div style="background:#1a1200;border:1px solid #4a3800;border-radius:12px;padding:24px;margin-bottom:20px;">
      <p style="color:#ccb88a;font-size:14px;line-height:1.8;margin:0 0 14px;">You've been registered for The Chubbs Memorial — a best ball golf tournament in honor of the greatest one-handed golfer who never was.</p>
      <p style="color:#ccb88a;font-size:14px;line-height:1.8;margin:0;">Check the app for tee times, live scores, and tournament updates. And remember: it's all in the hips. &#x1F3CC;</p>
    </div>
    <div style="color:#3a3020;font-size:12px;font-style:italic;text-align:center;padding-top:16px;border-top:1px solid #1a1400;">"You're gonna be a golf legend." — Chubbs Peterson</div>
  `)
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
