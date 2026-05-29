// /api/ai.js — Vercel serverless function: the app's "brain".
// Reads ANTHROPIC_API_KEY from the environment (server-side only — never sent
// to the browser). Supports three modes: week_plan, date_ideas, suggest.
//
// Set the key in Vercel:  Project → Settings → Environment Variables
//   ANTHROPIC_API_KEY = sk-ant-...      (optionally ANTHROPIC_MODEL)

const DEFAULT_MODEL = 'claude-sonnet-4-6'

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return }

  const KEY = process.env.ANTHROPIC_API_KEY
  if (!KEY) { res.status(503).json({ error: 'no_key' }); return }
  const MODEL = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL

  let body = req.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
  const { mode, payload = {} } = body || {}

  let system = '', user = '', maxTokens = 1500, wantsJSON = true
  if (mode === 'week_plan') {
    maxTokens = 2000
    system = [
      'You are a warm, practical household assistant for a couple (Rhodri and Becky) who share tasks, plus their dog Lana.',
      'You help them plan a fair, realistic week. Balance the workload between Rhodri and Becky (Lana and "both" are not people who do chores).',
      'Consider due dates, anyone marked away (they should get fewer/no tasks), and avoid overloading a single day.',
      'Respond with ONLY valid JSON (no markdown fences, no preamble) of the shape:',
      '{"summary":"one or two friendly sentences","suggestions":[{"id":"<existing task id or null>","title":"task title","assigned_to":"rhodri|becky|both","date":"YYYY-MM-DD","note":"short why"}]}',
      'Use the real task ids provided for tasks that already exist (to reschedule/reassign them). Use null id only for brand-new tasks you propose.',
    ].join(' ')
    user = JSON.stringify(payload)
  } else if (mode === 'date_ideas') {
    system = [
      'You are a creative date-night concierge for a couple in the UK (Rhodri and Becky, dog Lana).',
      'Generate fun, specific, doable date ideas matching their chosen vibe, budget and time.',
      'Budgets: Free, £ (cheap), ££ (moderate), £££ (splurge). Keep ideas concrete and a little playful.',
      'Respond with ONLY valid JSON (no markdown, no preamble):',
      '{"ideas":[{"title":"short catchy title","description":"1-2 vivid sentences","vibe":"<vibe>","budget":"<budget>"}]}',
      'Return 4 ideas.',
    ].join(' ')
    user = JSON.stringify(payload)
  } else if (mode === 'suggest') {
    wantsJSON = false
    system = [
      'You are a warm, concise household & relationship assistant for a couple (Rhodri, Becky) and their dog Lana.',
      'Give brief, practical, kind suggestions. A few sentences max unless asked for more. No medical or clinical claims.',
    ].join(' ')
    user = `Context: ${JSON.stringify(payload.context || {})}\n\nQuestion: ${payload.question || 'Any suggestions for us this week?'}`
  } else {
    res.status(400).json({ error: 'bad_mode' }); return
  }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
    })
    if (!r.ok) {
      const txt = await r.text()
      res.status(502).json({ error: 'upstream', detail: txt.slice(0, 300) })
      return
    }
    const data = await r.json()
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim()

    if (!wantsJSON) { res.status(200).json({ ok: true, text }); return }
    // Strip accidental code fences, then parse JSON
    const clean = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
    let parsed
    try { parsed = JSON.parse(clean) }
    catch { const m = clean.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null }
    if (!parsed) { res.status(200).json({ ok: true, text, parsed: null }); return }
    res.status(200).json({ ok: true, parsed })
  } catch (e) {
    res.status(500).json({ error: 'server', detail: String(e).slice(0, 200) })
  }
}
