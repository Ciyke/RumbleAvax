import { LEADERBOARD_ENTRIES } from './leaderboardData.js'

/**
 * Fills the empty space beside the featured chart — cosmetic, same as
 * FakeMatchrooms, no real volume behind it. The track is the entry list
 * rendered twice back to back with a CSS animation scrolling exactly one
 * copy's height, so the loop point is invisible.
 */
export default function VolumeLeaderboard() {
  return (
    <div className="leaderboard">
      <div className="leaderboard__head">
        <h3 className="leaderboard__title">
          Top Predictors <span className="badge badge--demo">Demo</span>
        </h3>
        <span className="leaderboard__sub">By volume predicted</span>
      </div>

      <div className="leaderboard__viewport">
        <div className="leaderboard__track">
          {LEADERBOARD_ENTRIES.map((p, i) => (
            <Row key={`a-${p.name}`} rank={i + 1} player={p} />
          ))}
          {LEADERBOARD_ENTRIES.map((p, i) => (
            <Row key={`b-${p.name}`} rank={i + 1} player={p} />
          ))}
        </div>
      </div>
    </div>
  )
}

function Row({ rank, player }) {
  return (
    <div className="leaderboard__row">
      <span className="leaderboard__rank">#{rank}</span>
      <span className="leaderboard__name">{player.name}</span>
      <span className="leaderboard__volume">
        {player.volume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} AVAX
      </span>
    </div>
  )
}
