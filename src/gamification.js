// gamification.js — XP economy, couple levels, badge unlocking, date-idea bank
import { parseISO, startOfDay, isSameDay, subDays } from 'date-fns'
import { XP, BADGES } from './constants'
import { computeStreak, weeklyLeaderboard } from './stats'

// ── Lifetime XP earned by the couple ──
export function earnedXP({ tasks = [], dateIdeas = [], moods = [] }) {
  let xp = 0
  tasks.filter(t => t.completed).forEach(t => {
    xp += XP.task
    if (t.due_date && t.completed_at) {
      const onTime = startOfDay(parseISO(t.completed_at)) <= startOfDay(parseISO(t.due_date))
      if (onTime) xp += XP.ontime
    }
  })
  xp += dateIdeas.filter(d => d.done).length * XP.date
  // pulse: max one scoring check-in per person per day (avoid farming)
  const seen = new Set()
  moods.forEach(m => { const k = `${m.person}:${m.date}`; if (!seen.has(k)) { seen.add(k); xp += XP.pulse } })
  return xp
}

// ── XP spent redeeming coupons ──
export function spentXP({ rewards = [] }) {
  return rewards.filter(r => r.redeemed_at).reduce((s, r) => s + (r.cost || 0), 0)
}

// ── Couple level from lifetime earned XP (escalating curve) ──
export function coupleLevel(earned) {
  let level = 1, need = 150, remaining = earned, prevNeed = 0
  while (remaining >= need) { remaining -= need; level++; prevNeed = need; need = Math.round(need * 1.35) }
  return { level, intoLevel: remaining, neededForNext: need, pct: Math.round((remaining / need) * 100) }
}

// ── Which badges are unlocked, given all the data ──
export function unlockedBadges(data) {
  const { tasks = [], dateIdeas = [], moods = [], rewards = [] } = data
  const doneTasks = tasks.filter(t => t.completed).length
  const doneDates = dateIdeas.filter(d => d.done).length
  const streak = computeStreak(tasks)
  const earned = earnedXP(data)
  const { level } = coupleLevel(earned)
  const board = weeklyLeaderboard(tasks)
  const r = board.rhodri || 0, b = board.becky || 0
  const totalWeek = r + b
  const balanced = totalWeek >= 6 && Math.abs(r - b) <= Math.ceil(totalWeek * 0.2)
  const pulseCount = moods.length

  const checks = {
    first_task: doneTasks >= 1,
    roll: streak >= 3,
    week: streak >= 7,
    team25: doneTasks >= 25,
    century: doneTasks >= 100,
    fair: balanced,
    date1: doneDates >= 1,
    date5: doneDates >= 5,
    pulse7: pulseCount >= 7,
    generous: rewards.length > 0,
    treat: rewards.some(x => x.redeemed_at),
    level5: level >= 5,
  }
  return BADGES.map(badge => ({ ...badge, unlocked: !!checks[badge.id] }))
}

// ── Local date-idea bank (fallback when AI key absent / offline) ──
const BANK = {
  Romantic: [
    ['Sunset picnic', 'Cheese, wine, a blanket and golden hour somewhere green.'],
    ['Stargazing drive', 'Find a dark spot out of town, bring blankets and a flask.'],
    ['Recreate your first date', 'Same place (or a tribute to it) and reminisce.'],
  ],
  Adventurous: [
    ['Blindfold map pin', 'Drop a pin within an hour, go explore wherever it lands.'],
    ['Sunrise hike', 'Set an early alarm, summit something, coffee at the top.'],
    ['Try a new sport', 'Bouldering, kayaking, archery — first-timers welcome.'],
  ],
  Cozy: [
    ['Blanket fort cinema', 'Build a fort, pick a theme, snacks mandatory.'],
    ['Bake-off for two', 'Same recipe, separate bowls, judge each other kindly.'],
    ['Puzzle & playlist night', '1000 pieces, a shared playlist, no phones.'],
  ],
  Foodie: [
    ['Cook a random country', 'Pick blind, cook a dish from wherever you land.'],
    ['DIY tasting menu', 'Three tiny courses each, surprise the other.'],
    ['Street-food crawl', 'Three stops, one bite each, rate as you go.'],
  ],
  Cultured: [
    ['Gallery + invent the backstory', 'Make up the story behind each piece.'],
    ['Live music night', 'Find a small local gig, go in blind.'],
    ['Bookshop swap', 'Each pick a book for the other, read first chapters over coffee.'],
  ],
  Active: [
    ['Sunset run + smoothie', 'Easy jog somewhere scenic, reward smoothie after.'],
    ['Dance class drop-in', 'Salsa, swing, anything — laugh through it.'],
    ['Bike picnic', 'Cycle somewhere new, picnic when you arrive.'],
  ],
  Spontaneous: [
    ['£20 adventure', 'Twenty quid, three hours, see how far it gets you.'],
    ['Yes day (mini)', 'Take turns; the other says yes to every (reasonable) idea.'],
    ['Tourist in your own town', 'Do the thing locals never do.'],
  ],
  Chilled: [
    ['Spa night in', 'Face masks, candles, the works. Phones in a drawer.'],
    ['Slow morning', 'Pastries, good coffee, nowhere to be.'],
    ['Sunset + takeaway', 'Best view you can find, favourite takeaway in hand.'],
  ],
}
export function localDateIdeas(vibe = 'Romantic', n = 3) {
  const pool = BANK[vibe] || BANK.Romantic
  const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, n)
  return shuffled.map(([title, description]) => ({ title, description, vibe }))
}
