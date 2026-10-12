import { useState } from 'react'
import MatchroomSidebar from './MatchroomSidebar.jsx'
import MatchroomDetail from './MatchroomDetail.jsx'

/**
 * Fixed panel on the right edge of the predictions page — every matchroom,
 * odds + mini trend line. Tapping a row opens the full detail overlay.
 */
export default function MatchroomRail({ matches }) {
  const [selected, setSelected] = useState(null)
  const selectedRoom = matches.find((m) => m.matchNumber === selected) ?? null

  return (
    <aside className="side-panel side-panel--right">
      <h2 className="side-panel__toggle-title side-panel__title--static">
        Matchrooms <span className="badge badge--demo">Demo</span>
      </h2>
      <MatchroomSidebar matches={matches} selected={selected} onSelect={setSelected} />

      <MatchroomDetail room={selectedRoom} onClose={() => setSelected(null)} />
    </aside>
  )
}
