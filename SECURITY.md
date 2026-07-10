# 🔒 Security notes

Couple's Hub was built for two trusted people sharing one URL. That's a reasonable
threat model, but it has real limits. This file is honest about them and gives you
a graduated path to tighten things without breaking your "just open the link" flow.

## Where you stand today

| Surface | State | Risk |
|---|---|---|
| Supabase tables | Open "allow all" RLS + public anon key | **Anyone who learns the URL + household id can read/write/delete everything** |
| `household_id` | A short, guessable label (`rhodri-becky-hub`) | Guessing it is the whole "auth" |
| `/api/ai` | Now rate-limited + optional shared secret | Was unbounded token spend; now blunted |
| `/api/alexa` | Shared-secret (`ALEXA_SHARED_SECRET`) | Fine |
| `/api/email-agenda?test=1` | Secret now enforced (was bypassed) | Fixed |
| `/api/send-push` | Secret-guarded (`CRON_SECRET`) | Fine |
| Server secrets (Anthropic, Resend, VAPID private) | Server-only env vars | Fine |

## Quick wins (do these now — no UX change)

1. **Make the household id unguessable.** Change `VITE_HOUSEHOLD_ID` (Vercel + `.env.local`)
   from `rhodri-becky-hub` to a long random string, e.g. `hub-3f9a1c7e42b8`. This turns the
   id into a bearer secret. ⚠️ Existing rows are keyed to the old id — either start fresh or
   run `update tasks set household_id='NEW' where household_id='OLD';` (repeat per table) in Supabase.
2. **Turn on the AI shared secret.** Set `AI_SHARED_SECRET` (Vercel) and `VITE_HUB_SECRET`
   (Vercel, same value) so only your app can call `/api/ai`. Note this is *obscurity*, not real
   auth — the value ships in the client bundle — but it stops drive-by bots. It's off until you set it.
3. **Set `ALEXA_SHARED_SECRET`** if you use the Alexa skill (see `alexa-skill/README.md`).

## The proper fix (when you want real per-couple security)

The open RLS is the real hole, and closing it *properly* means the database must know
**who** is asking. That requires authentication. The most faithful-to-the-app option:

**Supabase Auth with a shared household passphrase / magic link.**
- Turn on Supabase Auth (email magic link is lowest-friction — you each tap a link once per device).
- Add a `household_id` claim to the JWT (via a Supabase Edge Function or a `profiles` table + policy).
- Replace every `for all using (true)` policy with `for all using (household_id = auth.jwt() ->> 'household_id')`.
- The client keeps working almost unchanged — `supabase-js` attaches the session automatically.

Cost: one login step per device (breaks the current zero-login flow for Becky), so it's a
deliberate trade-off, not an automatic upgrade. If you'd rather keep zero-login, the
unguessable-household-id quick win above is the pragmatic middle ground.

Alternative (bigger rebuild): move **all** reads/writes behind serverless functions that hold
a secret, so the browser never talks to Supabase directly and the anon key/open policies are
never exposed. More work; only worth it if you outgrow the two-person model.

## Not-yet-done (tracked, lower priority)
- Real auth + scoped RLS (above).
- Per-user rate limiting on `/api/ai` beyond the current per-instance window.
