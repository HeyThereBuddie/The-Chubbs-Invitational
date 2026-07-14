import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

// Chubbs' AI contest predictions. Admin-triggered only (cost control): gathers the
// field's handicaps + club distances, asks Claude to predict each contest in
// character (savage roasts), and stores the board.

const SYSTEM_PROMPT = `You ARE Chubbs Peterson from Happy Gilmore — the warm old golf pro, but today you're the ANNOUNCER on a TSN-style prediction desk for "The Chubbs Memorial", a rowdy buddies golf tournament. You are predicting the winners of the side contests.

VOICE: loud, funny, savage. This is a buddy tournament, not a corporate event — so ROAST these guys hard. Bust their chops mercilessly but with love. Nicknames, chirping, calling out their handicaps and their games. Drop the occasional signature line ("It's all in the hips", "Just tap it in"). Be genuinely funny.

THE CONTESTS:
- Overall Champion (overall): THE BIG ONE — predict who wins the whole tournament. This is a 2-player team event. If TEAMS are provided, predict the top-3 TEAMS (use the team's name and both players in your note). If teams aren't drawn yet, give a top-3 power ranking of the individual players most likely to take it all. Lean HARD on history: repeat champions are the team to beat, and a team that's choked before catches hell. Weight handicaps and consistency. Put this contest FIRST.
- Longest Drive (ld): predict who bombs it farthest. Base it on their DRIVER carry distance — but factor handicap, because the drive must stay IN THE FAIRWAY (a wild long hitter who sprays it gets dinged). Higher handicap = more likely to spray it.
- Closest to Pin (ctp): predict who's most accurate on a par 3. Lower handicaps and shorter, controlled players are favored. Factor handicap heavily and their short-iron/wedge distances.
- Jackass of the Day (jackass): pure comedy — predict who's most likely to be the drunkest, sloppiest, most Happy-Gilmore disaster of the day. No data, just roast whoever you like based on their name/handicap. Have fun.

For EACH contest give a top-3 podium (1st, 2nd, 3rd) with a short savage note per player/team, plus a one-line headline hot take. Return the contests in this order: overall, ld, ctp, jackass. Open with an "intro" — your savage desk monologue kicking off the broadcast.

HISTORY: if PAST RESULTS are provided, USE them. Chirp the defending champions, roast whoever finished dead last (the wooden spoon), call back to old rivalries and blowups. Nothing lands harder than a receipt from last year.

MANDATORY: somewhere in the broadcast you MUST roast Patrick Losey at least once about the fact that he carries TWELVE different putters. Work it in naturally, but it has to be there.

Use ONLY the players in the provided field. Return everything through the contest_predictions tool.`

const TOOL = {
  name: 'contest_predictions',
  description: "Return Chubbs' predicted podiums for each contest.",
  input_schema: {
    type: 'object',
    properties: {
      intro: { type: 'string', description: "Chubbs' opening desk monologue for the broadcast — savage and funny." },
      contests: {
        type: 'array',
        description: 'One entry per contest, in order: overall champion, longest drive, closest to pin, jackass of the day.',
        items: {
          type: 'object',
          properties: {
            contest: { type: 'string', enum: ['overall', 'ld', 'ctp', 'jackass'] },
            headline: { type: 'string', description: "Chubbs' one-line hot take for this contest." },
            podium: {
              type: 'array',
              description: 'Predicted top 3, best first.',
              items: {
                type: 'object',
                properties: {
                  player: { type: 'string', description: 'Exact player name from the field.' },
                  note: { type: 'string', description: 'Short savage roast / reasoning for this pick.' },
                },
                required: ['player'],
              },
            },
          },
          required: ['contest', 'headline', 'podium'],
        },
      },
    },
    required: ['intro', 'contests'],
  },
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
    if (!ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY secret is not set' }, 500)

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(SUPABASE_URL, SVC)

    // Only admins may spend the tokens.
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')
    const { data: userData } = await supabase.auth.getUser(token)
    const uid = userData?.user?.id
    if (!uid) return json({ error: 'Not authenticated' }, 401)
    const { data: me } = await supabase.from('profiles').select('role').eq('id', uid).single()
    if (me?.role !== 'admin') return json({ error: 'Admins only' }, 403)

    const { data: tourn } = await supabase.from('tournaments').select('id').eq('status', 'active').order('year', { ascending: false }).limit(1).single()
    if (!tourn?.id) return json({ error: 'No active tournament' }, 400)

    // The field = the tournament roster (name + handicap is the source of truth).
    // Club distances come from a player's claimed profile once they've logged
    // real numbers; otherwise the roster's demo/estimated bag; otherwise standard.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type Bag = { club: string; carry: number; enabled?: boolean }[]
    const describe = (name: string, handicap: number | null, bag: Bag | null) => {
      const dr = bag?.find(c => c.club === 'Dr')?.carry
      const short = bag ? bag.filter(c => ['PW', 'GW', 'SW', '9i', '8i'].includes(c.club)).map(c => `${c.club} ${c.carry}y`).join('/') : ''
      return `- ${name}: HCP ${handicap ?? '?'}, driver ${dr ? dr + 'y' : 'standard'}, short game ${short || 'standard'}`
    }

    let lines: string[] = []
    const { data: roster } = await supabase.from('roster')
      .select('name, handicap, club_distances, profile:claimed_by(nickname, club_distances)')
      .eq('tournament_id', tourn.id).order('name')

    if (roster && roster.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lines = roster.map((r: any) => {
        const prof = Array.isArray(r.profile) ? r.profile[0] : r.profile
        const name = (prof?.nickname?.trim()) || r.name
        const bag: Bag | null = (Array.isArray(prof?.club_distances) ? prof.club_distances : null)
          ?? (Array.isArray(r.club_distances) ? r.club_distances : null)
        return describe(name, r.handicap, bag)
      })
    } else {
      // No roster seeded — fall back to real registered profiles.
      const { data: players } = await supabase.from('profiles')
        .select('name, nickname, handicap, club_distances')
        .eq('status', 'active').neq('role', 'admin').order('name')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lines = (players ?? []).map((p: any) => {
        const name = (p.nickname?.trim()) || p.name
        const bag: Bag | null = Array.isArray(p.club_distances) ? p.club_distances : null
        return describe(name, p.handicap, bag)
      })
    }

    const field = lines.join('\n')
    if (!field) return json({ error: 'No players in the field yet' }, 400)

    // Past results — so Chubbs can chirp defending champs / last year's wooden spoon.
    const fmtPar = (n: number | null | undefined) => n == null ? '' : n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`
    const { data: past } = await supabase.from('tournaments')
      .select('year, name, final_standings, tournament_results(category, team_name, player1_name, player2_name, score_to_par)')
      .eq('status', 'completed').is('deleted_at', null).neq('id', tourn.id)
      .order('year', { ascending: false }).limit(5)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const history = (past ?? []).map((t: any) => {
      const standings: { teamName: string; p1Name: string; p2Name: string; toPar: number; noScore?: boolean }[] =
        Array.isArray(t.final_standings) ? t.final_standings : []
      const board = standings.map((s, i) => `  ${i + 1}. ${s.teamName} (${s.p1Name} & ${s.p2Name}) ${s.noScore ? 'NO SCORE POSTED' : fmtPar(s.toPar)}`).join('\n')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results: any[] = Array.isArray(t.tournament_results) ? t.tournament_results : []
      const champ = results.find(r => r.category === 'champion')
      const spoon = standings.length ? standings[standings.length - 1] : null
      let head = `${t.year} ${t.name}:`
      if (champ) head += ` CHAMPIONS ${champ.team_name} (${champ.player1_name} & ${champ.player2_name})`
      if (spoon) head += `; DEAD LAST ${spoon.teamName} (${spoon.p1Name} & ${spoon.p2Name}) ${spoon.noScore ? 'NO SCORE POSTED' : fmtPar(spoon.toPar)}`
      return board ? `${head}\n${board}` : head
    }).filter(Boolean).join('\n\n')

    // This year's drawn teams (if the draw has happened) so Chubbs can pick actual teams.
    const { data: teamRows } = await supabase.from('teams')
      .select('name, p1_name, p2_name, p1:p1_id(name,nickname), p2:p2_id(name,nickname), r1:p1_roster_id(name), r2:p2_roster_id(name)')
      .eq('tournament_id', tourn.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pick = (prof: any, drawn: string | null, roster: any) => {
      const p = Array.isArray(prof) ? prof[0] : prof
      const r = Array.isArray(roster) ? roster[0] : roster
      return (p?.nickname?.trim()) || p?.name || drawn || r?.name || null
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const teams = (teamRows ?? []).map((t: any) => {
      const a = pick(t.p1, t.p1_name, t.r1); const b = pick(t.p2, t.p2_name, t.r2)
      if (!a && !b) return null
      const who = [a, b].filter(Boolean).join(' & ')
      return t.name ? `- ${t.name}: ${who}` : `- ${who}`
    }).filter(Boolean).join('\n')

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        tools: [TOOL],
        tool_choice: { type: 'tool', name: 'contest_predictions' },
        messages: [{ role: 'user', content: `The field for The Chubbs Memorial (name, handicap, driver carry, short game):\n${field}\n\n${teams ? `THIS YEAR'S TEAMS (drawn) — predict the Overall Champion from these teams:\n${teams}\n\n` : `TEAMS AREN'T DRAWN YET — for Overall Champion, give a power ranking of the individual players most likely to win it all.\n\n`}${history ? `PAST RESULTS — use these to chirp defending champs, wooden-spoon finishers, and old rivalries:\n${history}\n\n` : ''}Give your predictions for the Overall Champion, Longest Drive, Closest to Pin, and Jackass of the Day (in that order) via the contest_predictions tool. Be savage.` }],
      }),
    })
    const data = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolUse = (data.content ?? []).find((b: any) => b.type === 'tool_use')
    if (!toolUse) return json({ error: 'AI returned no prediction', raw: data }, 502)
    const payload = toolUse.input

    const { error: insErr } = await supabase.from('contest_predictions').insert({ tournament_id: tourn.id, payload, generated_by: uid })
    if (insErr) return json({ error: insErr.message }, 500)

    return json({ ok: true, payload })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
