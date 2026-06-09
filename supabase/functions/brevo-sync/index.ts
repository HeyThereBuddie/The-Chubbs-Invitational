import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const BREVO_API_KEY     = Deno.env.get('BREVO_API_KEY')!
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // Verify caller is an admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { data: { user }, error: authErr } = await createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!)
      .auth.getUser(authHeader.replace('Bearer ', ''))
    if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: CORS })

    if (!BREVO_API_KEY) return new Response(JSON.stringify({ error: 'BREVO_API_KEY secret not set' }), { status: 500, headers: CORS })

    // Fetch active + waitlist players
    const { data: players, error: dbErr } = await supabase
      .from('profiles')
      .select('email, name, nickname, phone, status')
      .in('status', ['active', 'waitlist'])
      .order('name')

    if (dbErr) {
      console.log('[brevo] db error:', dbErr.message)
      return new Response(JSON.stringify({ error: `DB error: ${dbErr.message}` }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    if (!players?.length) {
      return new Response(
        JSON.stringify({ error: `DB returned 0 players (has_brevo_key: ${!!BREVO_API_KEY})` }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const results = await Promise.all(players.map(async p => {
      const parts = p.name.trim().split(' ')
      const first = p.nickname?.trim() || parts[0] || ''
      const last  = parts.slice(1).join(' ') || ''

      const res = await fetch('https://api.brevo.com/v3/contacts', {
        method: 'POST',
        headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: p.email,
          updateEnabled: true,
          attributes: {
            FIRSTNAME: first,
            LASTNAME: last,
            ...(p.phone ? { SMS: p.phone } : {}),
          },
        }),
      })

      const text = await res.text()
      console.log(`[brevo] ${p.email} → ${res.status}: ${text}`)
      return { email: p.email, status: res.status, ok: res.ok }
    }))

    const synced  = results.filter(r => r.ok).length
    const failed  = results.filter(r => !r.ok)
    console.log(`[brevo] synced=${synced} failed=${failed.length}`, JSON.stringify(failed))

    if (synced === 0 && failed.length > 0) {
      const sample = failed[0]
      return new Response(
        JSON.stringify({ error: `Brevo rejected contacts — status ${sample.status} for ${sample.email}. Check API key has Contacts permission.` }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(JSON.stringify({ synced, failed: failed.length }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})
