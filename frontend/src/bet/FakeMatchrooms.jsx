import { useState } from 'react'
import OddsChart from './OddsChart.jsx'
import VolumeLeaderboard from './VolumeLeaderboard.jsx'

/**
 * Purely cosmetic — no chain calls, no real funds. There is no matchroom
 * game built yet to resolve real markets against, so this exists to make the
 * page feel alive alongside the real (mainnet) PredictionMarket flow below.
 *
 * Every matchroom is browsable from the fixed panel on the right
 * (MatchroomRail); this section permanently features Match 1's chart in the
 * space that panel used to occupy inline.
 *
 * The "credit score" / win-probability / American odds shown per team come
 * from mocked player-profile stats (kills, skin rarity, matches won, gun
 * type) via useOddsSimulation — there is no real roster data source yet, so
 * this is a stand-in model, not a live prediction feed.
 */
export default function FakeMatchrooms({ matches }) {
  const [infoOpen, setInfoOpen] = useState(false)
  const featured = matches[0]
  if (!featured) return null
  const { teamA, teamB } = featured

  return (
    <section className="section">
      <h2 className="section__title">
        Live Matchrooms <span className="badge badge--demo">Demo · Simulated</span>
        <button
          className="info-toggle"
          onClick={() => setInfoOpen((o) => !o)}
          aria-expanded={infoOpen}
          aria-label="About this demo"
        >
          !
        </button>
      </h2>

      {infoOpen && (
        <p className="note note--small">
          Cosmetic feed — no matchroom game exists yet to settle against. Odds are modeled from
          mocked player stats and drift on their own. Every match is browsable in the panel on the
          right — this spot always features Match 1.
        </p>
      )}

      <div className="featured-match">
        <header className="featured-match__head">
          <h3 className="market__title">Match {featured.matchNumber}</h3>
          <span className="market__sub">
            {teamA.name} vs {teamB.name} · {featured.teamSize}v{featured.teamSize} · closes in{' '}
            {featured.closesInMin}m
          </span>
        </header>
        <div className="featured-match__body">
          <OddsChart history={featured.history} teamA={teamA} teamB={teamB} />
          <VolumeLeaderboard />
        </div>
      </div>
    </section>
  )
}
