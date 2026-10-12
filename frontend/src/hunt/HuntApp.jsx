import { useWallet } from '../shared/useWallet.js'
import { useTheme } from '../shared/useTheme.js'
import WalletButton from '../shared/WalletButton.jsx'
import { HUNT_CHAIN, explorerTx } from '../shared/chains.js'
import { formatTimestamp } from '../shared/format.js'
import { useHunt } from './useHunt.js'
import BoxGrid from './BoxGrid.jsx'
import IngredientBar from './IngredientBar.jsx'
import { BOXES_PER_RUN, POTION_IMAGE } from './ingredients.js'

export default function HuntApp() {
  const wallet = useWallet(HUNT_CHAIN)
  const { theme, toggle } = useTheme()
  const hunt = useHunt(wallet)

  const {
    progress,
    balances,
    board,
    stats,
    season,
    potionCount,
    busy,
    error,
    lastTx,
    configured,
    nextAction,
    beginHunt,
    openBox,
    closeBox,
    createPotion,
    clearError,
  } = hunt

  const steps = progress ? progress.boxesOpened + progress.boxesClosed : 0
  const totalSteps = BOXES_PER_RUN * 2
  const pct = progress?.begun ? Math.round((steps / totalSteps) * 100) : 0

  return (
    <div className="page">
      <nav className="navbar">
        <span className="navbar__logo">
          Play<span>Rumble</span>
        </span>
        <div className="navbar__actions">
          <a className="navbar__link" href="//bet.playrumble.xyz">
            Predictions
          </a>
          <button className="theme-toggle" onClick={toggle} aria-label="Toggle theme">
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          <WalletButton wallet={wallet} />
        </div>
      </nav>

      <main className="main">
        {!configured && (
          <div className="banner banner--warn">
            Contract addresses are not set. Add them to <code>.env</code> and rebuild.
          </div>
        )}

        {/* ── Season header ─────────────────────────────────────────────── */}
        <header className="hero">
          <h1 className="title">Treasure Hunt</h1>
          <p className="subtitle">
            Open 25 boxes, collect the four-part recipe, craft a potion.
          </p>

          <div className="statrow">
            <Stat label="Season day" value={season.active ? `${season.day + 1} / 64` : '—'} />
            <Stat label="Your potions" value={String(potionCount ?? 0n)} />
            <Stat label="Your points" value={String(stats.points ?? 0n)} />
          </div>

          {!season.active && season.endsAt > 0 && (
            <p className="note">Season closed to new runs. Ended {formatTimestamp(season.endsAt)}.</p>
          )}
        </header>

        {error && (
          <div className="banner banner--error" onClick={clearError} role="button" tabIndex={0}>
            {error} <span className="banner__dismiss">dismiss</span>
          </div>
        )}

        {lastTx && (
          <div className="banner banner--ok">
            Confirmed ·{' '}
            <a href={explorerTx(HUNT_CHAIN, lastTx)} target="_blank" rel="noreferrer">
              view on Snowtrace
            </a>
          </div>
        )}

        {/* ── Main panel ────────────────────────────────────────────────── */}
        {!wallet.isConnected ? (
          <section className="panel panel--center">
            <p>Connect a wallet on {HUNT_CHAIN.chainName} to play.</p>
            <WalletButton wallet={wallet} />
          </section>
        ) : (
          <section className="panel">
            {progress?.begun && !progress.potionCrafted ? (
              <>
                <div className="progress">
                  <div className="progress__bar">
                    <div className="progress__fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="progress__label">
                    Run #{progress.runId} · {steps} / {totalSteps} steps
                  </span>
                </div>

                <IngredientBar balances={balances} />

                <BoxGrid
                  progress={progress}
                  board={board}
                  nextAction={nextAction}
                  busy={busy}
                  onOpen={openBox}
                  onClose={closeBox}
                />

                {progress.readyToCraft ? (
                  <button className="btn btn--primary btn--lg" disabled={!!busy} onClick={createPotion}>
                    {busy === 'craft' ? 'Crafting…' : 'Craft potion — 1 signature'}
                  </button>
                ) : (
                  <p className="note">
                    {nextAction
                      ? `Next: ${nextAction.type} box ${nextAction.index + 1}`
                      : 'Clearing the board…'}
                  </p>
                )}

                <button className="btn btn--ghost" disabled={!!busy} onClick={beginHunt}>
                  Abandon and start a new run
                </button>
                <p className="note note--small">
                  Starting over burns any ingredients you are holding.
                </p>
              </>
            ) : (
              <div className="panel--center">
                {progress?.potionCrafted && (
                  <div className="potion-reveal">
                    <img className="potion-reveal__art" src={POTION_IMAGE} alt="Rumble Potion" />
                    <p className="note note--good">
                      Run #{progress.runId} complete. Potion minted.
                    </p>
                  </div>
                )}
                <button
                  className="btn btn--primary btn--lg"
                  disabled={!!busy || !season.active}
                  onClick={beginHunt}
                >
                  {busy === 'begin'
                    ? 'Starting…'
                    : progress?.runId > 0
                      ? 'Start another run'
                      : 'Begin hunt'}
                </button>
                {!season.active && <p className="note">The season is not accepting new runs.</p>}
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="footer">
        <span>Avalanche C-Chain · fully on-chain · no accounts, no server</span>
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
