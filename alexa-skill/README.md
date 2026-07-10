# 🗣️ Private Alexa skill — "Couple's Hub"

Add tasks & calendar entries to your hub by talking to your Echo:

> "Alexa, tell Couple's Hub to add walk Lana tomorrow at eight."
> "Alexa, ask Couple's Hub to remind me to book the vet next Tuesday."

It's a **private skill in Development stage** — it installs on the Echos signed
into *your* Amazon account with **no certification and no account-linking**. The
skill stays thin; your app's `/api/alexa` does the parsing (via Claude) and saving.

## How it fits together

```
"Alexa, tell Couple's Hub to add …"
        │  spoken phrase
        ▼
Alexa skill (Lambda)  ──POST /api/alexa (x-alexa-secret)──▶  your app on Vercel
                                                              → /api/ai (Claude parses)
                                                              → insert task/event in Supabase
                                                              → realtime + push update both phones
```

## Prerequisites
- The app deployed (so `/api/alexa` and `/api/ai` exist) with `ANTHROPIC_API_KEY` set.
- In Vercel, set **`ALEXA_SHARED_SECRET`** to any long random string.

## Setup (≈20 min, one time)

1. **Create the skill.** Go to [developer.amazon.com/alexa/console/ask](https://developer.amazon.com/alexa/console/ask) → **Create Skill** → name "Couple's Hub" → **Custom** model → **Alexa-hosted (Node.js)**.
2. **Interaction model.** In **Build → JSON Editor**, paste [`interaction-model.json`](interaction-model.json), then **Save** and **Build Model**. (Invocation name is `couples hub`.)
3. **Lambda code.** In **Code**, replace `index.js` with [`lambda/index.js`](lambda/index.js) and set `package.json` to [`lambda/package.json`](lambda/package.json) (adds `ask-sdk-core`). **Deploy**.
4. **Environment variables** (Code → the `...` menu → *Environment variables*, or the hosting config):
   - `HUB_API_BASE` = `https://YOUR-APP.vercel.app`
   - `ALEXA_SHARED_SECRET` = the same value you set in Vercel
   - `HUB_DEFAULT_PERSON` = `rhodri` or `becky` *(optional; who to assign when the phrase doesn't say)*
5. **Test.** In the **Test** tab, enable testing in *Development*, then type or say *"tell Couple's Hub to add pay rent on the first"*. It should reply "Added pay rent…". Because the skill is in Development, it's already live on your own Echos — just talk to them.

## Notes & limits
- **No publishing/certification needed** for personal use — leave it in *Development*.
- If you and Becky are on **separate Amazon accounts**, add hers via **Beta Testing** (still no certification).
- Alexa can't tell who's speaking, so items default to `HUB_DEFAULT_PERSON` (or "both"). Claude still picks up an explicit "for Becky" in the phrase.
- The shared secret keeps random traffic out of `/api/alexa`; keep it out of git.
- Node 18+ Lambda runtime has global `fetch` (used by the handler). Alexa-hosted skills already run a recent Node.
