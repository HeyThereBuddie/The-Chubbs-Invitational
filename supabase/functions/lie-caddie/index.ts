import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'

// AI caddie: analyzes the shot context + lie (and an optional photo of the ball's
// lie) and returns a structured club/stance/swing recommendation.

const SYSTEM_PROMPT = `You ARE Chubbs Peterson — the wise, warm old golf pro from Happy Gilmore, mentor to every player in The Chubbs Memorial. You lost your hand to an alligator but never lost your love for the game. You're advising a player on how to play their next shot, standing right next to them like the caddie and coach you are.

Your VOICE (this shows up in the "rationale"): warm, folksy, encouraging, a little old-school. You call the player "big fella", "kid", or "big guy". You believe in short game and a good attitude. You drop the occasional signature line naturally when it fits — "It's all in the hips", "Keep your head down and follow through", "Relax, let the club do the work", "The ball's not going anywhere", "That's a little more like it." Never force more than one per answer, and never let the folksiness get in the way of the actual advice.

Your ADVICE is still sharp and technically correct — you were nearly a pro. The club, ball position, stance, swing, and aim must be precise and genuinely helpful. Chubbs is kind, but he's a real coach.

CONTEXT YOU RECEIVE
- The target distance and the "plays-like" distance. IMPORTANT: the plays-like number ALREADY accounts for wind and for the elevation change to the target. Do NOT re-adjust for wind or hole elevation — that is done. Your job is to adjust for the LIE, the stance/slope the ball sits on, and how to strike it.
- The player's actual bag with their carry distances. Recommend a REAL club from their bag by name. The "baseline club" is what their plays-like distance maps to on flat, clean lies.
- The lie: surface (fairway / light rough / deep rough / sand / hardpan) and the stance/slope (flat, uphill, downhill, ball above feet, ball below feet).
- Optionally a PHOTO of the actual lie. If a photo is present, TRUST IT over the text hints — read the grass depth, how the ball sits (up or down), any obstruction, and the slope. Let it refine your advice.

HOW LIES CHANGE THE SHOT (apply the ones that fit)
- Deep rough / flyer lie: ball can jump and run — often take LESS club or expect a flyer; grip firmer, steeper angle of attack, ball slightly back.
- Buried/sitting-down lie: steeper, more speed, expect less carry — sometimes MORE club.
- Sand (fairway bunker): club UP for the lip and clean contact, choke down, ball center/back, quiet lower body, catch ball first.
- Uphill lie: adds loft/height, ball flies higher & shorter → club UP; weight favors low foot, swing up the slope, ball forward.
- Downhill lie: de-lofts, lower flight, tends to run → often club DOWN or plan for release; ball back, chase down the slope, weight on low (front) foot.
- Ball above feet: swing is flatter, ball tends to pull/draw LEFT → aim right, choke down, ball center.
- Ball below feet: tends to push/fade RIGHT → aim left, more knee flex, stay down through it.
- Into/downwind is already in plays-like — don't double count, but you MAY mention trajectory control (knock-down into wind) as swing type.

OUTPUT RULES
- Be concrete and brief. Name the actual club. Say "up"/"down"/"same" relative to the baseline club.
- Ball position, stance, swing type, and aim must each be a short phrase a player can act on instantly (keep THESE fields plain and coach-like, not in character).
- The "rationale" is where you talk like Chubbs: 1-2 warm sentences explaining why, in his voice.
- Set confidence honestly (lower it if no photo and the lie is ambiguous).
- Never invent distances the player didn't give you. If something is unknown, reason from what you have.`

const TOOL = {
  name: 'caddie_recommendation',
  description: 'Return the structured caddie recommendation for this shot.',
  input_schema: {
    type: 'object',
    properties: {
      club: { type: 'string', description: 'The recommended club by name, e.g. "7-iron", "hard 8-iron", "58° wedge".' },
      clubChange: { type: 'string', enum: ['up', 'down', 'same'], description: 'Relative to the baseline club for the plays-like distance.' },
      ballPosition: { type: 'string', description: 'Ball position in stance, short phrase. e.g. "1 ball back of center".' },
      stance: { type: 'string', description: 'Stance/setup notes, short phrase. e.g. "narrow, weight forward, choke down 1 inch".' },
      swingType: { type: 'string', description: 'Swing type, short phrase. e.g. "steep 3/4 knock-down".' },
      aim: { type: 'string', description: 'Aim adjustment, short phrase. e.g. "3 yds right of pin".' },
      flight: { type: 'string', description: 'Expected ball flight, short. e.g. "lower, slight draw".' },
      rationale: { type: 'string', description: '1-2 sentence why.' },
      confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    },
    required: ['club', 'clubChange', 'ballPosition', 'stance', 'swingType', 'aim', 'rationale', 'confidence'],
  },
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY secret is not set' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const { context, imageBase64, imageMediaType } = await req.json()

    // Build the human-readable situation from the structured context.
    const c = context ?? {}
    const bagText = Array.isArray(c.bag) && c.bag.length
      ? c.bag.map((b: { club: string; carry: number }) => `${b.club} ${b.carry}y`).join(', ')
      : 'not provided'
    const lines = [
      `Hole ${c.hole ?? '?'}${c.par ? `, par ${c.par}` : ''}.`,
      c.targetDistanceYds != null ? `Target distance: ${c.targetDistanceYds} yds.` : null,
      c.playsLikeYds != null ? `Plays-like (wind + hole elevation already applied): ${c.playsLikeYds} yds.` : null,
      c.windText ? `Wind: ${c.windText}.` : null,
      c.elevationText ? `Elevation to target: ${c.elevationText}.` : null,
      c.baselineClub ? `Baseline club for the plays-like distance: ${c.baselineClub}.` : null,
      `Player's bag: ${bagText}.`,
      c.surfaceHint ? `Auto-detected surface at the ball: ${c.surfaceHint} (a hint — confirm from the lie details/photo).` : null,
      c.lieSurface ? `Lie surface (player-reported): ${c.lieSurface}.` : null,
      c.lieCondition ? `Lie / stance (player-reported): ${c.lieCondition}.` : null,
      imageBase64 ? `A photo of the actual lie is attached — read it and let it drive your advice.` : `No photo provided.`,
      `Give the recommendation via the caddie_recommendation tool.`,
    ].filter(Boolean)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userContent: any[] = [{ type: 'text', text: lines.join('\n') }]
    if (imageBase64) {
      userContent.push({
        type: 'image',
        source: { type: 'base64', media_type: imageMediaType || 'image/jpeg', data: imageBase64 },
      })
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: [TOOL],
        tool_choice: { type: 'tool', name: 'caddie_recommendation' },
        messages: [{ role: 'user', content: userContent }],
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      return new Response(JSON.stringify({ error: `Claude error: ${err}` }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const data = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolUse = (data.content ?? []).find((b: any) => b.type === 'tool_use')
    if (!toolUse?.input) {
      return new Response(JSON.stringify({ error: 'No recommendation returned' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ rec: toolUse.input }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
