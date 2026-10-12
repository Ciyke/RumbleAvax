import { useState } from 'react'
import { useWallet } from '../shared/useWallet.js'
import { useTheme } from '../shared/useTheme.js'
import WalletButton from '../shared/WalletButton.jsx'
import { PREDICTIONS_CHAIN, explorerTx } from '../shared/chains.js'
import { formatAvax } from '../shared/format.js'
import { useMarkets, STATUS } from './useMarkets.js'
import MarketCard from './MarketCard.jsx'
import FakeMatchrooms from './FakeMatchrooms.jsx'
import MatchroomRail from './MatchroomRail.jsx'
import { useOddsSimulation } from './useOddsSimulation.js'

export default function BetApp() {
  const wallet = useWallet(PREDICTIONS_CHAIN)
  const { theme, toggle } = useTheme()
  const { matches: matchrooms } = useOddsSimulation()
  const {
    markets,
    loading,
    busy,
    error,
    lastTx,
    configured,
    placeBet,
    claim,
    enableRefunds,
    clearError,
  } = useMarkets(wallet)

  const [selectedId, setSelectedId] = useState(null)

  const open = markets.filter((m) => m.status === STATUS.OPEN)
  const settled = markets.filter((m) => m.status !== STATUS.OPEN)
  const totalStaked = markets.reduce((sum, m) => sum + m.total, 0n)
  const yourClaimable = markets.reduce((sum, m) => sum + (m.mine?.claimable ?? 0n), 0n)

  return (
    <div className="page page--bet">
      {/* Nav must precede the matchroom rail in DOM order: the rail is
        * position:fixed on desktop (so order is invisible there), but drops
        * to position:static below 1200px — if it came first in the DOM it
        * would render above the navbar instead of the navbar staying on top. */}
      <nav className="navbar">
        <span className="navbar__logo">
          Rumble <span>Predictions</span>
        </span>
        <div className="navbar__actions">
          <a className="navbar__link" href="//hunt.playrumble.xyz">
            Hunt
          </a>
          <button className="theme-toggle" onClick={toggle} aria-label="Toggle theme">
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          <WalletButton wallet={wallet} />
        </div>
      </nav>

      <MatchroomRail matches={matchrooms} />

      <main className="main">
        {!configured && (
          <div className="banner banner--warn">
            The market address is not set. Add <code>VITE_PREDICTION_MARKET_ADDRESS</code> to{' '}
            <code>.env</code> and rebuild.
          </div>
        )}

        <header className="hero">
          <h1 className="title">Predictions</h1>
          <p className="subtitle">
            Back a side in a matchroom battle. Winners split the losing pool pro rata — a winner
            always gets at least their stake back.
          </p>

          <div className="statrow">
            <Stat label="Open markets" value={String(open.length)} />
            <Stat label="Total staked" value={`${formatAvax(totalStaked)} AVAX`} />
            <Stat label="Your claimable" value={`${formatAvax(yourClaimable)} AVAX`} />
          </div>
        </header>

        {error && (
          <div className="banner banner--error" onClick={clearError} role="button" tabIndex={0}>
            {error} <span className="banner__dismiss">dismiss</span>
          </div>
        )}

        {lastTx && (
          <div className="banner banner--ok">
            Confirmed ·{' '}
            <a href={explorerTx(PREDICTIONS_CHAIN, lastTx)} target="_blank" rel="noreferrer">
              view on Snowtrace
            </a>
          </div>
        )}

        {!wallet.isConnected && (
          <div className="banner">
            Viewing as a guest. Connect a wallet on {PREDICTIONS_CHAIN.chainName} to bet or claim.
          </div>
        )}

        <FakeMatchrooms matches={matchrooms} />

        {loading && markets.length === 0 && <p className="note">Loading markets…</p>}

        {open.length > 0 && (
          <section className="section">
            <h2 className="section__title">Open</h2>
            <div className="market-list">
              {open.map((m) => (
                <MarketCard
                  key={m.id}
                  market={m}
                  busy={busy}
                  isConnected={wallet.isConnected}
                  onBet={placeBet}
                  onClaim={claim}
                  onEnableRefunds={enableRefunds}
                  selected={selectedId === m.id}
                  dimmed={selectedId != null && selectedId !== m.id}
                  onSelect={setSelectedId}
                />
              ))}
            </div>
          </section>
        )}

        {settled.length > 0 && (
          <section className="section">
            <h2 className="section__title">Settled</h2>
            <div className="market-list">
              {settled.map((m) => (
                <MarketCard
                  key={m.id}
                  market={m}
                  busy={busy}
                  isConnected={wallet.isConnected}
                  onBet={placeBet}
                  onClaim={claim}
                  onEnableRefunds={enableRefunds}
                  selected={selectedId === m.id}
                  dimmed={selectedId != null && selectedId !== m.id}
                  onSelect={setSelectedId}
                />
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="footer">
        <span>
          Avalanche C-Chain · parimutuel · funds are escrowed on-chain and refundable if a market
          goes unresolved
        </span>
      </footer>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <span className="stat__value">{value}</span>
      <span className="stat__label">{label}</span>
    </div>
  )
}
