import { useRef, useState } from 'react'
import { formatOdds } from './matchroomData.js'

/**
 * Live win-probability line chart for one matchup, styled after Polymarket's
 * charts: a calibrated right-side percentage axis (5/25/50/75/95), thin
 * gridlines, and the current price direct-labeled at the line end. Team
 * color is fixed by side (A/B), never by who's currently favored —
 * favorite/underdog is text, not color.
 */

const W = 360
const H = 150
const MARGIN = { top: 16, right: 116, bottom: 14, left: 6 }
const PLOT_W = W - MARGIN.left - MARGIN.right
const PLOT_H = H - MARGIN.top - MARGIN.bottom
const GRID_STEPS = [0.05, 0.25, 0.5, 0.75, 0.95]
const AXIS_X = MARGIN.left + PLOT_W + 6
const LABEL_X = MARGIN.left + PLOT_W + 30
const MIN_LABEL_GAP = 18

function xAt(i, n) {
  return MARGIN.left + (n <= 1 ? 0 : (i / (n - 1)) * PLOT_W)
}

function yAt(prob) {
  return MARGIN.top + (1 - prob) * PLOT_H
}

// Step-after path (flat, then a vertical jump to the next value) rather than
// a diagonal line between points — this is what gives Polymarket-style
// charts their jagged staircase look instead of a smoothed trend line.
function pathFor(points, pick) {
  return points
    .map((p, i) => {
      const x = xAt(i, points.length).toFixed(1)
      const y = yAt(pick(p)).toFixed(1)
      if (i === 0) return `M ${x} ${y}`
      const prevY = yAt(pick(points[i - 1])).toFixed(1)
      return `L ${x} ${prevY} L ${x} ${y}`
    })
    .join(' ')
}

function spreadLabels(yA, yB) {
  if (Math.abs(yA - yB) >= MIN_LABEL_GAP) return [yA, yB]
  const mid = (yA + yB) / 2
  return yA <= yB
    ? [mid - MIN_LABEL_GAP / 2, mid + MIN_LABEL_GAP / 2]
    : [mid + MIN_LABEL_GAP / 2, mid - MIN_LABEL_GAP / 2]
}

export default function OddsChart({ history, teamA, teamB }) {
  const svgRef = useRef(null)
  const [hoverIndex, setHoverIndex] = useState(null)

  const n = history.length
  const lastA = history[n - 1].probA
  const lastB = 1 - lastA
  const endYA = yAt(lastA)
  const endYB = yAt(lastB)
  const [labelYA, labelYB] = spreadLabels(endYA, endYB)
  const endX = xAt(n - 1, n)

  function handleMove(e) {
    const rect = svgRef.current.getBoundingClientRect()
    const scale = W / rect.width
    const vbX = (e.clientX - rect.left) * scale
    const ratio = (vbX - MARGIN.left) / PLOT_W
    const idx = Math.round(ratio * (n - 1))
    setHoverIndex(Math.min(n - 1, Math.max(0, idx)))
  }

  const hovered = hoverIndex != null ? history[hoverIndex] : null
  const hoverX = hoverIndex != null ? xAt(hoverIndex, n) : null

  return (
    <div className="odds-chart">
      <div className="odds-chart__headline">
        <HeadlineStat colorVar="--chart-a" name={teamA.name} prob={teamA.winProb} odds={teamA.odds} />
        <HeadlineStat colorVar="--chart-b" name={teamB.name} prob={teamB.winProb} odds={teamB.odds} />
      </div>

      <div className="odds-chart__wrap">
        <svg
          ref={svgRef}
          className="odds-chart__svg"
          viewBox={`0 0 ${W} ${H}`}
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIndex(null)}
        >
          {GRID_STEPS.map((g) => (
            <g key={g}>
              <line
                className="odds-chart__grid"
                x1={MARGIN.left}
                x2={MARGIN.left + PLOT_W}
                y1={yAt(g)}
                y2={yAt(g)}
                vectorEffect="non-scaling-stroke"
              />
              <text className="odds-chart__tick" x={AXIS_X} y={yAt(g) + 3}>
                {Math.round(g * 100)}
              </text>
            </g>
          ))}

          {hoverX != null && (
            <line
              className="odds-chart__crosshair"
              x1={hoverX}
              x2={hoverX}
              y1={MARGIN.top}
              y2={MARGIN.top + PLOT_H}
              vectorEffect="non-scaling-stroke"
            />
          )}

          <path className="odds-chart__line" style={{ stroke: 'var(--chart-a)' }} d={pathFor(history, (p) => p.probA)} vectorEffect="non-scaling-stroke" />
          <path className="odds-chart__line" style={{ stroke: 'var(--chart-b)' }} d={pathFor(history, (p) => 1 - p.probA)} vectorEffect="non-scaling-stroke" />

          {hoverX != null && (
            <>
              <circle className="odds-chart__hover-dot" cx={hoverX} cy={yAt(hovered.probA)} r={4} style={{ fill: 'var(--chart-a)' }} vectorEffect="non-scaling-stroke" />
              <circle className="odds-chart__hover-dot" cx={hoverX} cy={yAt(1 - hovered.probA)} r={4} style={{ fill: 'var(--chart-b)' }} vectorEffect="non-scaling-stroke" />
            </>
          )}

          <circle className="odds-chart__end-ping" cx={endX} cy={endYA} r={4} style={{ fill: 'var(--chart-a)' }} />
          <circle className="odds-chart__end-ping" cx={endX} cy={endYB} r={4} style={{ fill: 'var(--chart-b)' }} />
          <circle className="odds-chart__end-dot" cx={endX} cy={endYA} r={4} style={{ fill: 'var(--chart-a)' }} vectorEffect="non-scaling-stroke" />
          <circle className="odds-chart__end-dot" cx={endX} cy={endYB} r={4} style={{ fill: 'var(--chart-b)' }} vectorEffect="non-scaling-stroke" />

          {labelYA !== endYA && (
            <line className="odds-chart__leader" x1={endX + 5} y1={endYA} x2={LABEL_X - 4} y2={labelYA} vectorEffect="non-scaling-stroke" />
          )}
          {labelYB !== endYB && (
            <line className="odds-chart__leader" x1={endX + 5} y1={endYB} x2={LABEL_X - 4} y2={labelYB} vectorEffect="non-scaling-stroke" />
          )}

          <EndLabel x={LABEL_X} y={labelYA} name={teamA.name} odds={teamA.odds} />
          <EndLabel x={LABEL_X} y={labelYB} name={teamB.name} odds={teamB.odds} />
        </svg>

        {hovered && (
          <div
            className="odds-chart__tooltip"
            style={{ left: `${(hoverX / W) * 100}%`, top: `${(MARGIN.top / H) * 100}%` }}
          >
            <TooltipRow colorVar="--chart-a" name={teamA.name} prob={hovered.probA} odds={teamA.odds} />
            <TooltipRow colorVar="--chart-b" name={teamB.name} prob={1 - hovered.probA} odds={teamB.odds} />
          </div>
        )}
      </div>
    </div>
  )
}

function HeadlineStat({ colorVar, name, prob, odds }) {
  return (
    <div className="odds-chart__headline-stat">
      <span className="odds-chart__legend-dot" style={{ background: `var(${colorVar})` }} />
      <span className="odds-chart__headline-name">{name}</span>
      <span className="odds-chart__headline-value">{Math.round(prob * 100)}%</span>
      <span className="odds-chart__headline-odds">{formatOdds(odds)}</span>
    </div>
  )
}

function EndLabel({ x, y, name, odds }) {
  return (
    <text className="odds-chart__end-label" x={x} y={y + 3}>
      <tspan className="odds-chart__end-name">{name} </tspan>
      <tspan className="odds-chart__end-value">{formatOdds(odds)}</tspan>
    </text>
  )
}

function TooltipRow({ colorVar, name, prob, odds }) {
  return (
    <div className="odds-chart__tooltip-row">
      <span className="odds-chart__tooltip-key" style={{ background: `var(${colorVar})` }} />
      <span className="odds-chart__tooltip-name">{name}</span>
      <span className="odds-chart__tooltip-value">
        {Math.round(prob * 100)}% · {formatOdds(odds)}
      </span>
    </div>
  )
}
