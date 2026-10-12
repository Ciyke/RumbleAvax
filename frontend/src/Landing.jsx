import { useTheme } from './shared/useTheme.js'

/**
 * Shown when neither subdomain nor path matched — the bare Pages URL, or a
 * preview deployment. Exists so those never render a blank page.
 */
export default function Landing() {
  const { theme, toggle } = useTheme()

  return (
    <div className="page">
      <nav className="navbar">
        <span className="navbar__logo">
          Rumble <span>on Avalanche</span>
        </span>
        <button className="theme-toggle" onClick={toggle} aria-label="Toggle theme">
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </nav>

      <main className="main main--narrow">
        <h1 className="title">Two apps, one chain</h1>
        <p className="subtitle">
          Both run on Avalanche C-Chain. Everything is on-chain — no accounts, no server.
        </p>

        <div className="card-grid">
          <a className="card card--link" href="/hunt">
            <h2 className="card__title">Ingredient Hunt</h2>
            <p className="card__body">
              Open 25 boxes, collect the recipe, craft a potion. Run it as many times as you like.
            </p>
            <span className="card__cta">Play →</span>
          </a>

          <a className="card card--link" href="/bet">
            <h2 className="card__title">Predictions</h2>
            <p className="card__body">
              Back a side in a matchroom battle. Winners split the losing pool.
            </p>
            <span className="card__cta">Bet →</span>
          </a>
        </div>
      </main>
    </div>
  )
}
