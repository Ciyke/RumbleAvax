// Cosmetic feed — no real volume data exists yet (no matchroom game to
// generate it from), so this is a deterministic fake list styled the same
// way matchroomData.js fakes rosters: same seeded PRNG, sorted once and
// frozen rather than reshuffling on every render.

const HANDLES = [
  'NightRaider', 'ByteCrusher', 'VenomTusk', 'GhostPixel', 'IronWolf77',
  'CrimsonFang', 'ZeroGravity', 'PulseBreaker', 'ShadowVein', 'ApexDrifter',
  'NovaStrike', 'FrostbiteXO', 'RogueSignal', 'ThunderClap', 'SilentEcho',
  'BlazeRunner', 'VoidWalker', 'SteelPhantom', 'RapidFireX', 'GritIron',
]

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

function buildLeaderboard() {
  const rand = mulberry32(7331)
  const entries = HANDLES.map((name) => ({
    name,
    volume: Math.round((80 + rand() * 4200) * 100) / 100,
  }))
  entries.sort((a, b) => b.volume - a.volume)
  return entries
}

export const LEADERBOARD_ENTRIES = buildLeaderboard()
