// Mock matchroom + player-profile data feeding a simple credit-score model.
// There is no real matchroom game to pull stats from yet, so this generates
// deterministic fake rosters the same way FakeMatchrooms.jsx already fakes
// pool amounts — see that file for the disclaimer shown in the UI.

const MATCHUPS = [
  ['Delta Force', 'Claymen'],
  ['Nightshade', 'Ironclad'],
  ['Vantage', 'Blacklist'],
  ['Wraith', 'Havoc'],
  ['Sentinel', 'Outlaws'],
]

const GUNS = { Sniper: 5, Rifle: 4, Shotgun: 3, SMG: 3, Pistol: 2 }
const RARITIES = { Legendary: 5, Epic: 3, Rare: 2, Common: 1 }
const GUN_TYPES = Object.keys(GUNS)
const RARITY_TIERS = Object.keys(RARITIES)

// Deterministic PRNG so a given room id always renders the same "stats"
// instead of reshuffling on every re-render.
function mulberry32(seed) {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick(rand, arr) {
  return arr[Math.floor(rand() * arr.length)]
}

function buildPlayer(rand, tag) {
  const kills = 5 + Math.floor(rand() * 36)
  const matchesWon = 1 + Math.floor(rand() * 20)
  const gun = pick(rand, GUN_TYPES)
  const rarity = pick(rand, RARITY_TIERS)
  const score = kills + matchesWon * 2 + RARITIES[rarity] * 4 + GUNS[gun] * 3
  return { tag, kills, matchesWon, gun, rarity, score }
}

function buildTeam(rand, name, rosterSize) {
  const roster = Array.from({ length: rosterSize }, (_, i) => buildPlayer(rand, `${name[0]}${i + 1}`))
  const creditScore = roster.reduce((sum, p) => sum + p.score, 0)
  return { name, roster, creditScore }
}

// American odds from a win probability: favorite gets a negative price,
// underdog a positive one, dead-even shows as "EVEN".
function toAmericanOdds(p) {
  if (Math.abs(p - 0.5) < 0.005) return 0
  return p > 0.5 ? -Math.round((p / (1 - p)) * 100) : Math.round(((1 - p) / p) * 100)
}

export function formatOdds(odds) {
  if (odds === 0) return 'EVEN'
  return odds > 0 ? `+${odds}` : `${odds}`
}

export function recomputeOdds(creditA, creditB) {
  const total = creditA + creditB
  const pA = total > 0 ? creditA / total : 0.5
  const pB = 1 - pA
  return { pA, pB, oddsA: toAmericanOdds(pA), oddsB: toAmericanOdds(pB) }
}

export function buildMatchup(seed, index, rosterSize) {
  const rand = mulberry32(seed)
  const [nameA, nameB] = MATCHUPS[index % MATCHUPS.length]

  const teamA = buildTeam(rand, nameA, rosterSize)
  const teamB = buildTeam(rand, nameB, rosterSize)

  const { pA, pB, oddsA, oddsB } = recomputeOdds(teamA.creditScore, teamB.creditScore)

  return {
    matchNumber: index + 1,
    teamA: { ...teamA, winProb: pA, odds: oddsA, favorite: pA >= pB },
    teamB: { ...teamB, winProb: pB, odds: oddsB, favorite: pB > pA },
  }
}

export const MATCH_COUNT = MATCHUPS.length
