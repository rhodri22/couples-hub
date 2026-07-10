// Alexa-hosted Lambda for the private "Couple's Hub" skill.
// It forwards the spoken phrase to your app's /api/alexa endpoint, which parses
// it with Claude and saves the task/event. Kept thin on purpose — all the
// intelligence lives in the app.
//
// Set these environment variables on the Lambda (Alexa Developer Console →
// Code → Environment variables, or in an Alexa-hosted skill's config):
//   HUB_API_BASE       e.g. https://couples-hub.vercel.app
//   ALEXA_SHARED_SECRET  same value as ALEXA_SHARED_SECRET in Vercel
//   HUB_DEFAULT_PERSON   optional: rhodri | becky (who to assign when unspecified)

const Alexa = require('ask-sdk-core')

async function ingest(phrase) {
  const base = process.env.HUB_API_BASE
  const res = await fetch(`${base}/api/alexa`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-alexa-secret': process.env.ALEXA_SHARED_SECRET || '' },
    body: JSON.stringify({ text: phrase, person: process.env.HUB_DEFAULT_PERSON || 'both' }),
  })
  const data = await res.json().catch(() => ({}))
  return data.speech || 'Added it to your hub.'
}

const LaunchRequestHandler = {
  canHandle(h) { return Alexa.getRequestType(h.requestEnvelope) === 'LaunchRequest' },
  handle(h) {
    const speak = "Couple's Hub is ready. Try: add walk Lana tomorrow at eight."
    return h.responseBuilder.speak(speak).reprompt(speak).getResponse()
  },
}

const AddItemIntentHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(h.requestEnvelope) === 'AddItemIntent'
  },
  async handle(h) {
    const phrase = Alexa.getSlotValue(h.requestEnvelope, 'phrase')
    if (!phrase) {
      return h.responseBuilder.speak("What would you like to add?").reprompt("What would you like to add?").getResponse()
    }
    let speak
    try { speak = await ingest(phrase) } catch (e) { speak = "I couldn't reach your hub just now." }
    return h.responseBuilder.speak(speak).getResponse()
  },
}

const HelpHandler = {
  canHandle(h) { return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest' && Alexa.getIntentName(h.requestEnvelope) === 'AMAZON.HelpIntent' },
  handle(h) {
    const s = "Say something like: add pay rent on the first, or, remind me to book the vet next Tuesday."
    return h.responseBuilder.speak(s).reprompt(s).getResponse()
  },
}

const StopHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
      && ['AMAZON.CancelIntent', 'AMAZON.StopIntent'].includes(Alexa.getIntentName(h.requestEnvelope))
  },
  handle(h) { return h.responseBuilder.speak('Okay.').getResponse() },
}

const SessionEndedHandler = {
  canHandle(h) { return Alexa.getRequestType(h.requestEnvelope) === 'SessionEndedRequest' },
  handle(h) { return h.responseBuilder.getResponse() },
}

const ErrorHandler = {
  canHandle() { return true },
  handle(h, error) {
    console.error('Alexa error:', error)
    return h.responseBuilder.speak("Sorry, something went wrong.").getResponse()
  },
}

exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(LaunchRequestHandler, AddItemIntentHandler, HelpHandler, StopHandler, SessionEndedHandler)
  .addErrorHandlers(ErrorHandler)
  .lambda()
