import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { query } = await req.json()
    if (!query) return new Response(JSON.stringify({ error: 'Missing query' }), { status: 400, headers: CORS })

    const body = `data=${encodeURIComponent(query)}`
    const fetchHeaders = { 'Content-Type': 'application/x-www-form-urlencoded' }

    const attempt = async (url: string) => {
      const r = await fetch(url, { method: 'POST', headers: fetchHeaders, body })
      if (!r.ok) throw new Error(`HTTP ${r.status} from ${url}`)
      return r.json()
    }

    const data = await Promise.any(MIRRORS.map(attempt))
    return new Response(JSON.stringify(data), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 502,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
