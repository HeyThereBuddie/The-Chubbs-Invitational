import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`

const SYSTEM_PROMPT = `You are the official rules assistant for The Chubbs Invitational, an annual best-ball golf tournament played in memory of Chubbs Peterson. Answer rules questions clearly and concisely. If something isn't covered below, say so and suggest the player check with the tournament admin.

FORMAT
- Best ball, 2-person teams
- 18 holes, par 72
- One score recorded per hole per team (the better of both players' balls)
- Front 9 (holes 1–9) and Back 9 (holes 10–18)

CHULLIGANS
- Each player gets 1 chulligan per nine holes (1 front, 1 back) — 2 total per round
- A chulligan is a mulligan but the player must chug a full beer before replaying the shot
- The chulligan must be declared before the player takes the replacement shot
- The chulligan can be used on any shot including putts
- Unused chulligans do not carry over to the next nine

DRIVE MINIMUMS
- Each player's drive must be selected as the team's drive a minimum of 4 times per nine holes
- Each player's drive may be selected at most 5 times per nine holes
- This ensures both players contribute roughly equal driving
- If a player's drive has been used 5 times on a nine, their partner's drive must be used for the remaining holes
- The app tracks drive usage automatically

SCORING
- Scores are recorded hole by hole using the app
- Eagle: 2 under par on a hole
- Birdie: 1 under par
- Par: even
- Bogey: 1 over par
- Double bogey: 2 over par
- The team's total is shown as a to-par score (e.g. -3, E, +5)

MR. JIM LAHEY AWARD
- Named after Jim Lahey from Trailer Park Boys
- Voted on by all players during or after the round
- Awarded to the most entertainingly "spirited" player on the day
- Voting is done through the app; each player gets one vote
- Results are shown live once the admin opens voting

CLOSEST TO PIN (CTP) & LONGEST DRIVE (LD) CONTESTS
- Specific holes are designated for CTP and LD contests
- Players submit their results through the Contests tab in the app
- Winners are announced by the admin

GENERAL RULES
- USGA rules apply for anything not covered here
- The tournament admin has final say on all rules disputes
- Have fun and drink responsibly — it's what Chubbs would have wanted

Keep answers short and friendly. Use golf lingo naturally. If asked something outside these rules, say you don't have that info and suggest asking the admin.`

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { message, history } = await req.json()

    const contents = [
      ...(history ?? []).map((m: { role: string; content: string }) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      { role: 'user', parts: [{ text: message }] },
    ]

    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: { temperature: 0.3, maxOutputTokens: 400 },
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      return new Response(JSON.stringify({ error: `Gemini error: ${err}` }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const data = await res.json()
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text
      ?? "Sorry, I couldn't get a response. Please try again."

    return new Response(JSON.stringify({ reply }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
