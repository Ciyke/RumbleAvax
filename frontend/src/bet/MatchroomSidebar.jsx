import { formatOdds } from './matchroomData.js'
import MiniOddsChart from './MiniOddsChart.jsx'

/**
 * Vertical list of matchrooms — odds + a mini trend line per match. Team
 * names truncate with an ellipsis instead of overflowing the row; tap a row
 * to open the full detail panel.
 */
export default function MatchroomSidebar({ matches, selected, onSelect }) {
  return (
    <div className="matchroom-panel">
      {matches.map((room) => {
        const { teamA, teamB } = room
        const isSelected = selected === room.matchNumber
        return (
          <button
            key={room.matchNumber}
            className={`matchroom-row ${isSelected ? 'matchroom-row--selected' : ''}`}
            onClick={() => onSelect(room.matchNumber)}
          >
            <div className="matchroom-row__main">
              <span className="matchroom-row__match">Match {room.matchNumber}</span>
              <div className="matchroom-row__team">
                <span className="matchroom-row__name" title={teamA.name}>
                  {teamA.name}
                </span>
                <span className="odds-badge odds-badge--sm">{formatOdds(teamA.odds)}</span>
              </div>
              <div className="matchroom-row__team">
                <span className="matchroom-row__name" title={teamB.name}>
                  {teamB.name}
                </span>
                <span className="odds-badge odds-badge--sm">{formatOdds(teamB.odds)}</span>
              </div>
            </div>
            <MiniOddsChart history={room.history} />
          </button>
        )
      })}
    </div>
  )
}
