// /api/alexa.js — ingest endpoint for the private Alexa skill (and any voice/webhook
// source). Takes a spoken phrase, parses it with the app's own /api/ai create_item
// mode, and inserts the resulting task or event into Supabase.
//
// Secured by a shared secret: the Alexa Lambda sends it as the `x-alexa-secret`
// header (set ALEXA_SHARED_SECRET in Vercel). Reuses /api/ai so there's one place
// that understands natural language.
//
// Body: { "text": "walk Lana tomorrow 8am", "person": "rhodri" }   (person optional)

function env(...names) { for (const n of names) if (process.env[n]) return process.env[n]; return undefined }
function uuid() { try { return crypto.randomUUID() } catch { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.floor(Math.random() * 16); return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16) }) } }

export default async function handler(req, res) {
  const SECRET = process.env.ALEXA_SHARED_SECRET
  if (SECRET && req.headers['x-alexa-secret'] !== SECRET) { res.status(401).json({ error: 'unauthorized' }); return }

  let body = req.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
  const text = String(body?.text || '').slice(0, 500).trim()
  const person = ['rhodri', 'becky'].includes(body?.person) ? body.person : 'both'
  if (!text) { res.status(400).json({ error: 'no_text', speech: "Sorry, I didn't catch that." }); return }

  const SUPABASE_URL = env('SUPABASE_URL', 'VITE_SUPABASE_URL')
  const SUPABASE_KEY = env('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY')
  const HID = env('HOUSEHOLD_ID', 'VITE_HOUSEHOLD_ID') || 'demo-household'
  const TZ = process.env.HOUSEHOLD_TZ || 'Europe/Berlin'
  if (!SUPABASE_URL || !SUPABASE_KEY) { res.status(503).json({ error: 'no_supabase_env' }); return }

  const base = `https://${req.headers.host}`
  const today = new Date().toISOString().slice(0, 10)

  try {
    // Step 1: parse the phrase into a structured item via the existing AI endpoint.
    const aiHeaders = { 'content-type': 'application/json' }
    if (process.env.AI_SHARED_SECRET) aiHeaders['x-hub-secret'] = process.env.AI_SHARED_SECRET
    const aiRes = await fetch(`${base}/api/ai`, {
      method: 'POST', headers: aiHeaders,
      body: JSON.stringify({ mode: 'create_item', payload: { text, today, tz: TZ } }),
    })
    const ai = await aiRes.json().catch(() => null)
    const p = ai && ai.parsed
    if (!p || !p.title) { res.status(200).json({ ok: false, speech: "Sorry, I couldn't work out what to add." }); return }

    const assignee = (p.assignee && p.assignee !== 'both') ? p.assignee : person
    const now = new Date().toISOString()

    // Step 2: insert the task or event.
    let row, table
    if (p.kind === 'event') {
      const timed = !!p.time && p.all_day === false
      table = 'events'
      row = {
        id: uuid(), household_id: HID, title: p.title, event_type: p.event_type || 'other', assigned_to: assignee,
        start_date: p.date || today, end_date: p.end_date || p.date || today, all_day: !timed,
        start_time: timed ? p.time : null, recur: p.recur || 'none', reminder_minutes: 1440, notes: p.notes || '', created_at: now,
      }
    } else {
      table = 'tasks'
      row = {
        id: uuid(), household_id: HID, title: p.title, category: p.category || 'home', assigned_to: assignee,
        status: 'todo', due_date: p.date || null, reminder_minutes: p.date ? 1440 : null, completed: false,
        recur: p.recur || 'none', completed_at: null, snoozed_until: null, rotation: null, subtasks: [], created_at: now,
      }
    }

    const ins = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}`, 'content-type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    })
    if (!ins.ok) { const t = await ins.text(); res.status(502).json({ error: 'insert_failed', detail: t.slice(0, 200), speech: 'I had trouble saving that.' }); return }

    const whenTxt = p.date ? ` for ${p.date}` : ''
    res.status(200).json({ ok: true, kind: p.kind || 'task', title: p.title, speech: `Added ${p.title}${whenTxt} to your hub.` })
  } catch (e) {
    res.status(500).json({ error: 'server', detail: String(e).slice(0, 200), speech: 'Something went wrong.' })
  }
}
