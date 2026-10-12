import { useEffect, useState } from 'react'
import { ethers } from 'ethers'
import { formatAvax, formatCountdown, formatRatio, formatTimestamp } from '../shared/format.js'
import { STATUS, TEAM_A, TEAM_B } from './useMarkets.js'

const SIDE_NAME = { [TEAM_A]: 'Team A', [TEAM_B]: 'Team B' }

export default function MarketCard({
  market,
  busy,
  isConnected,
  onBet,
  onClaim,
  onEnableRefunds,
  selected = true,
  dimmed = false,
  onSelect,
}) {
  const [side, setSide] = useState(TEAM_A)
  const [amount, setAmount] = useState('')
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(t)
  }, [])

  const bettingOpen = market.status === STATUS.OPEN && now < market.closesAt
  const awaitingResolution = market.status === STATUS.OPEN && now >= market.closesAt
  const pastDeadline = now > market.resolveDeadline
  const unit = market.isNative ? 'AVAX' : 'tokens'

  const canClaim = market.mine?.claimable > 0n && !market.mine?.hasClaimed

  function submitBet(e) {
    e.preventDefault()
    if (!amount || Number(amount) <= 0) return
    onBet(market.id, side, ethers.parseEther(amount), market.isNative)
  }

  return (
    <article
      className={`market market--${statusClass(market, now)} ${selected ? 'market--selected' : ''} ${dimmed ? 'market--dimmed' : ''}`}
    >
      <header
        className={`market__head ${onSelect ? 'market__head--clickable' : ''}`}
        onClick={onSelect ? () => onSelect(selected ? null : market.id) : undefined}
      >
        <div>
          <h3 className="market__title">Market #{market.id}</h3>
          <span className="market__sub">
            {market.isNative ? 'Settles in AVAX' : 'Settles in ERC-20'} · {market.rakeBps / 100}% rake
          </span>
        </div>
        <StatusBadge market={market} now={now} />
      </header>

      {/* ── Pools ──────────────────────────────────────────────────────── */}
      <div className="market__pools">
        <PoolSide
          side="a"
          label={SIDE_NAME[TEAM_A]}
          pool={market.poolA}
          ratio={market.ratioA}
          total={market.total}
          isWinner={market.status === STATUS.RESOLVED && market.winner === TEAM_A}
          mine={market.mine?.onA}
        />
        <PoolSide
          side="b"
          label={SIDE_NAME[TEAM_B]}
          pool={market.poolB}
          ratio={market.ratioB}
          total={market.total}
          isWinner={market.status === STATUS.RESOLVED && market.winner === TEAM_B}
          mine={market.mine?.onB}
        />
      </div>

      {selected ? (
        <>
          <div className="market__meta">
            <span>Pool {formatAvax(market.total)} {unit}</span>
            <span>
              {bettingOpen
                ? `Closes in ${formatCountdown(market.closesAt - now)}`
                : `Closed ${formatTimestamp(market.closesAt)}`}
            </span>
          </div>

          {/* ── Betting ────────────────────────────────────────────────── */}
          {bettingOpen && isConnected && (
            <form className="betform" onSubmit={submitBet}>
              <div className="betform__sides">
                {[TEAM_A, TEAM_B].map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`betform__side betform__side--${s === TEAM_A ? 'a' : 'b'} ${side === s ? 'betform__side--active' : ''}`}
                    onClick={() => setSide(s)}
                  >
                    {SIDE_NAME[s]}
                  </button>
                ))}
              </div>
              <div className="betform__row">
                <input
                  className="betform__input"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={`Amount in ${unit}`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <button
                  className="btn btn--primary"
                  type="submit"
                  disabled={!!busy || !amount || Number(amount) <= 0}
                >
                  {busy === `bet:${market.id}:${side}` ? 'Placing…' : 'Place bet'}
                </button>
              </div>
              <p className="note note--small">
                Your stake is escrowed until the market resolves. Winners split the losing pool after
                rake; a winner always gets at least their stake back.
              </p>
            </form>
          )}

          {bettingOpen && !isConnected && (
            <p className="note">Connect a wallet to place a bet.</p>
          )}

          {/* ── Your position ──────────────────────────────────────────── */}
          {market.mine?.staked > 0n && (
            <div className="market__position">
              <span>
                Your stake: {formatAvax(market.mine.staked)} {unit}
              </span>
              {market.status !== STATUS.OPEN && (
                <span className={canClaim ? 'pill pill--good' : 'pill pill--muted'}>
                  {market.mine.hasClaimed
                    ? 'Claimed'
                    : market.mine.claimable > 0n
                      ? `${formatAvax(market.mine.claimable)} ${unit} to claim`
                      : 'Nothing to claim'}
                </span>
              )}
            </div>
          )}

          {/* ── Actions ──────────────────────────────────────────────────── */}
          <div className="market__actions">
            {canClaim && (
              <button className="btn btn--primary" disabled={!!busy} onClick={() => onClaim(market.id)}>
                {busy === `claim:${market.id}`
                  ? 'Claiming…'
                  : market.status === STATUS.REFUNDING
                    ? 'Reclaim stake'
                    : 'Claim winnings'}
              </button>
            )}

            {awaitingResolution && pastDeadline && (
              <button
                className="btn btn--ghost"
                disabled={!!busy}
                onClick={() => onEnableRefunds(market.id)}
                title="The resolver missed its deadline — anyone can open refunds"
              >
                {busy === `refund:${market.id}` ? 'Opening…' : 'Force refunds'}
              </button>
            )}
          </div>

          {awaitingResolution && !pastDeadline && (
            <p className="note note--small">
              Awaiting resolution. If none arrives by {formatTimestamp(market.resolveDeadline)}, anyone
              can open refunds and every stake is returned in full.
            </p>
          )}
        </>
      ) : (
        <p className="note note--small market__hint">Tap to view &amp; bet</p>
      )}
    </article>
  )
}

function PoolSide({ side, label, pool, ratio, total, isWinner, mine }) {
  const share = total > 0n ? Number((pool * 1000n) / total) / 10 : 0

  return (
    <div className={`pool pool--${side} ${isWinner ? 'pool--winner' : ''}`}>
      <div className="pool__head">
        <span className={`pool__label pool__label--${side}`}>{label}</span>
        {isWinner && <span className="pool__crown">won</span>}
      </div>
      <span className="pool__amount">{formatAvax(pool)}</span>
      <div className="pool__bar">
        <div className={`pool__fill pool__fill--${side}`} style={{ width: `${share}%` }} />
      </div>
      <div className="pool__foot">
        <span title="Payout multiplier if this side wins, at current pool sizes">
          {formatRatio(ratio)}
        </span>
        {mine > 0n && <span className="pool__mine">you: {formatAvax(mine)}</span>}
      </div>
    </div>
  )
}

function StatusBadge({ market, now }) {
  if (market.status === STATUS.RESOLVED) {
    return <span className="badge badge--resolved">Resolved</span>
  }
  if (market.status === STATUS.REFUNDING) {
    return <span className="badge badge--refund">Refunding</span>
  }
  if (now >= market.closesAt) {
    return <span className="badge badge--pending">Awaiting result</span>
  }
  return <span className="badge badge--open">Open</span>
}

function statusClass(market, now) {
  if (market.status === STATUS.RESOLVED) return 'resolved'
  if (market.status === STATUS.REFUNDING) return 'refund'
  if (now >= market.closesAt) return 'pending'
  return 'open'
}
