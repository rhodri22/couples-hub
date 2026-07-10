// /api/ai.js — Vercel serverless function: the app's "brain".
// Reads ANTHROPIC_API_KEY from the environment (server-side only — never sent
// to the browser). Supports three modes: week_plan, date_ideas, suggest.
//
// Set the key in Vercel:  Project → Settings → Environment Variables
//   ANTHROPIC_API_KEY = sk-ant-...      (optionally ANTHROPIC_MODEL)

const DEFAULT_MODEL = 'claude-sonnet-4-6'

// Best-effort per-instance rate limit (blunts abuse of this token-spending
// endpoint; serverless instances are reused within a burst).
const _hits = new Map()
function rateLimited(ip, max = 30, windowMs = 60000) {
  const now = Date.now()
  const rec = _hits.get(ip)
  if (!rec || now - rec.start > windowMs) { _hits.set(ip, { start: now, n: 1 }); return false }
  rec.n++
  return rec.n > max
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return }

  // Optional shared-secret gate (set AI_SHARED_SECRET in Vercel + VITE_HUB_SECRET
  // for the client). Off by default so nothing breaks until you enable it.
  if (process.env.AI_SHARED_SECRET && req.headers['x-hub-secret'] !== process.env.AI_SHARED_SECRET) {
    res.status(401).json({ error: 'unauthorized' }); return
  }
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown'
  if (rateLimited(ip)) { res.status(429).json({ error: 'rate_limited' }); return }

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
  } else if (mode === 'create_item') {
    // Voice / natural-language capture → one structured task or calendar event.
    maxTokens = 700
    const today = payload.today || ''
    const tz = payload.tz || 'Europe/Berlin'
    system = [
      'You turn a short spoken or typed instruction from a couple (Rhodri, Becky; dog Lana) into ONE structured item for their shared hub.',
      `Today is ${today} in timezone ${tz}. Resolve relative dates ("tomorrow", "next Friday", "the 22nd") to an absolute YYYY-MM-DD.`,
      'Decide "kind": a calendar EVENT for appointments, birthdays, anniversaries, holidays/trips, social plans, or anything with a specific time; a TASK for chores, errands, to-dos and reminders.',
      'Keep the title natural and COMPLETE — never strip the subject. "Walk Lana" stays "Walk Lana", not "Walk".',
      'assignee is one of rhodri, becky, both, lana (default both). category (tasks) one of home, errands, social, dates, finance, health. event_type (events) one of birthday, anniversary, holiday, appointment, social, other.',
      'recur is one of none, daily, weekly, monthly, yearly. Set a time only if one was clearly stated (24h "HH:MM"); otherwise time null and all_day true for events.',
      'Respond with ONLY valid JSON (no markdown, no preamble):',
      '{"kind":"task|event","title":"...","assignee":"rhodri|becky|both|lana","category":"home|errands|social|dates|finance|health","event_type":"birthday|anniversary|holiday|appointment|social|other","date":"YYYY-MM-DD or null","time":"HH:MM or null","all_day":true,"recur":"none|daily|weekly|monthly|yearly","notes":""}',
    ].join(' ')
    user = String(payload.text || '').slice(0, 800)
  } else if (mode === 'parse_travel') {
    // Paste a flight/hotel/train confirmation → structured calendar events.
    maxTokens = 1600
    const today = payload.today || ''
    const tz = payload.tz || 'Europe/Berlin'
    system = [
      'You extract travel bookings (flights, hotels, trains, car hire) from a forwarded confirmation email or pasted text, for a couple\'s shared calendar.',
      `Today is ${today}; assume timezone ${tz} unless the text says otherwise. Use absolute YYYY-MM-DD dates.`,
      'Create one event per leg/booking. Flights: title like "✈️ BER → FCO" plus flight number in notes; start_date/start_time = departure, all_day false. Hotels: title "🏨 <hotel name>"; start_date = check-in, end_date = check-out, all_day true. Trains: "🚄 <from> → <to>". Car hire: "🚗 <company>".',
      'Put confirmation/booking references, times, terminals and addresses in notes. Use event_type "holiday" for all travel. If nothing travel-related is found, return an empty events array.',
      'Respond with ONLY valid JSON (no markdown, no preamble):',
      '{"events":[{"title":"...","event_type":"holiday","start_date":"YYYY-MM-DD","start_time":"HH:MM or null","end_date":"YYYY-MM-DD or null","all_day":true,"notes":""}]}',
    ].join(' ')
    user = String(payload.text || '').slice(0, 12000)
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
