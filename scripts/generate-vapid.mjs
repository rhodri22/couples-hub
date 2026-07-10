// Generate a VAPID key pair for Web Push.
//
//   npm install          # once, so web-push is available
//   node scripts/generate-vapid.mjs
//
// Then:
//   • VITE_VAPID_PUBLIC_KEY  → set in .env.local AND in Vercel (client build)
//   • VAPID_PUBLIC_KEY       → set in Vercel (server, same value as above)
//   • VAPID_PRIVATE_KEY      → set in Vercel ONLY. Never commit it, never expose it.

import webpush from 'web-push'

const keys = webpush.generateVAPIDKeys()

console.log('\nVAPID key pair generated. Add these to your environment:\n')
console.log('VITE_VAPID_PUBLIC_KEY=' + keys.publicKey)
console.log('VAPID_PUBLIC_KEY=' + keys.publicKey)
console.log('VAPID_PRIVATE_KEY=' + keys.privateKey)
console.log('\nKeep VAPID_PRIVATE_KEY secret (Vercel env only).\n')
