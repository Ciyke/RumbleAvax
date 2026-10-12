import { useEffect } from 'react'
import { formatOdds } from './matchroomData.js'
import OddsChart from './OddsChart.jsx'

/**
 * Detail overlay for one matchroom — opened from MatchroomSidebar. Sized to
 * 2/3 of the viewport (not fullscreen) so the rest of the page stays visible
 * behind the dimmed backdrop.
 */
export default function MatchroomDetail({ room, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!room) return null
  const { teamA, teamB } = room
  const total = room.poolA + room.poolB
  const shareA = total > 0 ? (room.poolA / total) * 100 : 50

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <header className="modal-panel__head">
          <div>
            <h3 className="market__title">Match {room.matchNumber}</h3>
            <span className="market__sub">
              {teamA.name} vs {teamB.name} · {room.teamSize}v{room.teamSize} · closes in{' '}
              {room.closesInMin}m
            </span>
          </div>
          <button className="modal-panel__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="modal-panel__body">
          <OddsChart history={room.history} teamA={teamA} teamB={teamB} />

          <div className="market__pools">
            <TeamPool team={teamA} side="a" amount={room.poolA} share={shareA} />
            <TeamPool team={teamB} side="b" amount={room.poolB} share={100 - shareA} />
          </div>

          <div className="roster-grid">
            <RosterPanel team={teamA} />
            <RosterPanel team={teamB} />
          </div>

          <p className="note note--small">
            Cosmetic feed — no real bets here. Pick a side in the Try It panel further down the page.
          </p>
        </div>
      </div>
    </div>
  )
}

function TeamPool({ team, side, amount, share }) {
  return (
    <div className={`pool pool--${side}`}>
      <div className="pool__head">
        <span className={`pool__label pool__label--${side}`}>{team.name}</span>
        <span className="odds-badge">{formatOdds(team.odds)}</span>
      </div>
      <span className="pool__amount">{amount.toFixed(2)} AVAX</span>
      <div className="pool__bar">
        <div className={`pool__fill pool__fill--${side}`} style={{ width: `${share}%` }} />
      </div>
      <span className="pool__foot">
        <span>{team.favorite ? 'Favorite' : 'Underdog'}</span>
        <span>{Math.round(team.winProb * 100)}% credit score win share</span>
      </span>
    </div>
  )
}

function RosterPanel({ team }) {
  return (
    <div className="roster">
      <div className="roster__head">
        <span className="roster__team">{team.name}</span>
        <span className="roster__score">Credit score: {Math.round(team.creditScore)}</span>
      </div>
      <table className="roster__table">
        <thead>
          <tr>
            <th>Player</th>
            <th>Kills</th>
            <th>Skin</th>
            <th>Wins</th>
            <th>Gun</th>
          </tr>
        </thead>
        <tbody>
          {team.roster.map((p) => (
            <tr key={p.tag}>
              <td>{p.tag}</td>
              <td>{p.kills}</td>
              <td>{p.rarity}</td>
              <td>{p.matchesWon}</td>
              <td>{p.gun}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
