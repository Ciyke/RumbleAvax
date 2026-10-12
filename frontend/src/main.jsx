import React from 'react'
import ReactDOM from 'react-dom/client'
import HuntApp from './hunt/HuntApp.jsx'
import BetApp from './bet/BetApp.jsx'
import Landing from './Landing.jsx'
import './styles.css'

/**
 * One build serves two custom domains from a single Cloudflare Pages project,
 * so which app to render is decided from the hostname at runtime:
 *
 *   hunt.playrumble.xyz → HuntApp
 *   bet.playrumble.xyz  → BetApp
 *
 * Paths (/hunt, /bet) do the same thing. That is what makes local dev and
 * Pages preview deployments usable, since both only ever have one hostname.
 * Anything else gets a landing page linking to both.
 */
function pickApp() {
  const host = window.location.hostname.toLowerCase()
  const path = window.location.pathname.toLowerCase()

  if (host.startsWith('hunt.') || path.startsWith('/hunt')) return 'hunt'
  if (host.startsWith('bet.') || path.startsWith('/bet')) return 'bet'
  return 'landing'
}

const App = { hunt: HuntApp, bet: BetApp, landing: Landing }[pickApp()]

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
