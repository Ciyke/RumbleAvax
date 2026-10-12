import { useEffect, useState } from 'react'
import { buildMatchup, recomputeOdds, MATCH_COUNT } from './matchroomData.js'

const ROSTER_SIZE = 4
const HISTORY_LEN = 120
const DRIFT_MS = 2000
const MIN_MISMATCH = 0.18 // floor the split at least this far from 50/50

// Push a credit-score split further from even so favorites/underdogs read as
// a real mismatch instead of a near-coinflip, then enforce a floor so no
// match ever lands too close to a pick 'em.
function amplifyMismatch(creditA, creditB) {
  const total = creditA + creditB
  if (total <= 0) return [creditA, creditB]
  const ratio = creditA / creditB
  const amplified = Math.pow(ratio, 2.2)
  let pA = amplified / (1 + amplified)
  if (Math.abs(pA - 0.5) < MIN_MISMATCH) {
    pA = pA >= 0.5 ? 0.5 + MIN_MISMATCH : 0.5 - MIN_MISMATCH
  }
  return [total * pA, total * (1 - pA)]
}

// Match 1 (Delta Force v Claymen) follows a scripted narrative instead of a
// pure random walk: both start even, Claymen dips to 25%, recovers to 35%,
// then climbs slowly to 75% — crossing 50/50 again along the way — while
// Delta Force (teamA) is the exact mirror of Claymen's (teamB) path.
const CLAYMEN_SCRIPT = [
  { at: 0, prob: 0.5 },
  { at: 0.2, prob: 0.25 },
  { at: 0.4, prob: 0.35 },
  { at: 1, prob: 0.75 },
]

function interpolateScript(script, t) {
  for (let i = 0; i < script.length - 1; i++) {
    const a = script[i]
    const b = script[i + 1]
    if (t >= a.at && t <= b.at) {
      const localT = (t - a.at) / (b.at - a.at)
      return a.prob + (b.prob - a.prob) * localT
    }
  }
  return script[script.length - 1].prob
}

function scriptedHistory(now) {
  const points = []
  for (let i = 0; i < HISTORY_LEN; i++) {
    const t = i / (HISTORY_LEN - 1)
    const claymenProb = Math.min(1, Math.max(0, interpolateScript(CLAYMEN_SCRIPT, t) + (Math.random() - 0.5) * 0.02))
    points.push({ t: now - (HISTORY_LEN - 1 - i) * DRIFT_MS, probA: 1 - claymenProb })
  }
  return points
}

// A short random walk ending exactly at (creditA, creditB), so on first load
// the chart already reads like it's been drifting for a while instead of
// starting from a flat line.
function walkHistory(creditA, creditB, now) {
  let a = creditA
  let b = creditB
  const points = []
  for (let i = 0; i < HISTORY_LEN; i++) {
    points.push(recomputeOdds(a, b).pA)
    a = Math.max(1, a * (1 + (Math.random() - 0.5) * 0.16))
    b = Math.max(1, b * (1 + (Math.random() - 0.5) * 0.16))
  }
  points.reverse()
  return points.map((probA, j) => ({ t: now - (HISTORY_LEN - 1 - j) * DRIFT_MS, probA }))
}

function withOdds(match, creditA, creditB) {
  const { pA, pB, oddsA, oddsB } = recomputeOdds(creditA, creditB)
  return {
    ...match,
    creditA,
    creditB,
    teamA: { ...match.teamA, creditScore: creditA, winProb: pA, odds: oddsA, favorite: pA >= pB },
    teamB: { ...match.teamB, creditScore: creditB, winProb: pB, odds: oddsB, favorite: pB > pA },
    history: [...match.history, { t: Date.now(), probA: pA }].slice(-HISTORY_LEN),
  }
}

function initMatches() {
  const now = Date.now()
  return Array.from({ length: MATCH_COUNT }, (_, i) => {
    const matchup = buildMatchup(i + 101, i, ROSTER_SIZE)
    const scripted = i === 0
    const history = scripted ? scriptedHistory(now) : null
    const [creditA, creditB] = scripted
      ? [history[history.length - 1].probA, 1 - history[history.length - 1].probA]
      : amplifyMismatch(matchup.teamA.creditScore, matchup.teamB.creditScore)
    const { pA, pB, oddsA, oddsB } = recomputeOdds(creditA, creditB)

    return {
      ...matchup,
      teamA: { ...matchup.teamA, creditScore: creditA, winProb: pA, odds: oddsA, favorite: pA >= pB },
      teamB: { ...matchup.teamB, creditScore: creditB, winProb: pB, odds: oddsB, favorite: pB > pA },
      creditA,
      creditB,
      history: scripted ? history : walkHistory(creditA, creditB, now),
      teamSize: 2 + ((i * 7) % 4),
      poolA: Math.round((((i + 1) * 13) % 40) * 100 + 200) / 100,
      poolB: Math.round((((i + 3) * 17) % 40) * 100 + 200) / 100,
      closesInMin: 5 + ((i * 11) % 90),
    }
  })
}

/**
 * Shared live state for the matchroom odds feed. Every few seconds each
 * match's credit score takes a small random walk so the line chart feels live.
 */
export function useOddsSimulation() {
  const [matches, setMatches] = useState(initMatches)

  useEffect(() => {
    const timer = setInterval(() => {
      setMatches((prev) =>
        prev.map((m) => {
          const driftA = Math.max(1, m.creditA * (1 + (Math.random() - 0.5) * 0.1))
          const driftB = Math.max(1, m.creditB * (1 + (Math.random() - 0.5) * 0.1))
          return withOdds(m, driftA, driftB)
        }),
      )
    }, DRIFT_MS)
    return () => clearInterval(timer)
  }, [])

  return { matches }
}
