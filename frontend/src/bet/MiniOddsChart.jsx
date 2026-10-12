// Tiny sparkline version of OddsChart for the sidebar row — no axes, legend,
// or tooltip, just the two win-probability lines at a glance.

const W = 68
const H = 30
const PAD = 3

function x(i, n) {
  return PAD + (n <= 1 ? 0 : (i / (n - 1)) * (W - PAD * 2))
}

function y(prob) {
  return PAD + (1 - prob) * (H - PAD * 2)
}

function pathFor(history, pick) {
  return history.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i, history.length).toFixed(1)} ${y(pick(p)).toFixed(1)}`).join(' ')
}

export default function MiniOddsChart({ history }) {
  const n = history.length
  const lastA = history[n - 1].probA
  return (
    <svg className="mini-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <path className="mini-chart__line" style={{ stroke: 'var(--chart-a)' }} d={pathFor(history, (p) => p.probA)} vectorEffect="non-scaling-stroke" />
      <path className="mini-chart__line" style={{ stroke: 'var(--chart-b)' }} d={pathFor(history, (p) => 1 - p.probA)} vectorEffect="non-scaling-stroke" />
      <circle className="mini-chart__end-ping" cx={x(n - 1, n)} cy={y(lastA)} r={2} style={{ fill: 'var(--chart-a)' }} />
      <circle className="mini-chart__end-ping" cx={x(n - 1, n)} cy={y(1 - lastA)} r={2} style={{ fill: 'var(--chart-b)' }} />
      <circle cx={x(n - 1, n)} cy={y(lastA)} r={2} style={{ fill: 'var(--chart-a)' }} />
      <circle cx={x(n - 1, n)} cy={y(1 - lastA)} r={2} style={{ fill: 'var(--chart-b)' }} />
    </svg>
  )
}
