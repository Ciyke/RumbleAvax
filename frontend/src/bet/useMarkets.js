import { useCallback, useEffect, useState } from 'react'
import { ethers } from 'ethers'
import { PREDICTION_MARKET_ABI } from '../abis/index.js'
import { PREDICTIONS_CHAIN, CONTRACTS, isConfigured } from '../shared/chains.js'
import { humanError } from '../shared/format.js'

export const STATUS = { OPEN: 0, RESOLVED: 1, REFUNDING: 2 }
export const TEAM_A = 0
export const TEAM_B = 1

/**
 * Every market, read from the chain.
 *
 * Markets are numbered 1..marketCount, so the whole list can be enumerated with
 * view calls — no indexer, no backend. That numbering is the reason this works
 * as a static page.
 */
export function useMarkets(wallet) {
  const { address, getSigner } = wallet

  const [markets, setMarkets] = useState([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const [lastTx, setLastTx] = useState(null)

  const configured = isConfigured('predictionMarket')

  const readContract = useCallback(() => {
    const provider = new ethers.JsonRpcProvider(PREDICTIONS_CHAIN.rpcUrls[0], PREDICTIONS_CHAIN.chainId)
    return new ethers.Contract(CONTRACTS.predictionMarket, PREDICTION_MARKET_ABI, provider)
  }, [])

  const refresh = useCallback(async () => {
    if (!configured) return
    setLoading(true)
    try {
      const pm = readContract()
      const count = Number(await pm.marketCount())

      const ids = Array.from({ length: count }, (_, i) => count - i) // newest first

      const rows = await Promise.all(
        ids.map(async (id) => {
          const m = await pm.markets(id)

          const base = {
            id,
            token: m.token,
            isNative: m.token === ethers.ZeroAddress,
            closesAt: Number(m.closesAt),
            resolveDeadline: Number(m.resolveDeadline),
            rakeBps: Number(m.rakeBps),
            status: Number(m.status),
            winner: Number(m.winner),
            poolA: m.poolA,
            poolB: m.poolB,
            rakeAmount: m.rakeAmount,
            rakeWithdrawn: m.rakeWithdrawn,
            total: m.poolA + m.poolB,
          }

          const [ratioA, ratioB] = await Promise.all([
            pm.impliedPayoutRatio(id, TEAM_A).catch(() => 0n),
            pm.impliedPayoutRatio(id, TEAM_B).catch(() => 0n),
          ])

          let mine = null
          if (address) {
            const [stakes, claimable, hasClaimed] = await Promise.all([
              pm.stakesOf(id, address),
              pm.previewClaim(id, address).catch(() => 0n),
              pm.claimed(id, address).catch(() => false),
            ])
            mine = {
              onA: stakes.onA,
              onB: stakes.onB,
              staked: stakes.onA + stakes.onB,
              claimable,
              hasClaimed,
            }
          }

          return { ...base, ratioA, ratioB, mine }
        }),
      )

      setMarkets(rows)
    } catch (err) {
      setError(humanError(err))
    } finally {
      setLoading(false)
    }
  }, [address, configured, readContract])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Keep countdowns and pools fresh without a socket.
  useEffect(() => {
    const timer = setInterval(refresh, 30_000)
    return () => clearInterval(timer)
  }, [refresh])

  const send = useCallback(
    async (label, fn) => {
      setBusy(label)
      setError(null)
      setLastTx(null)
      try {
        const signer = await getSigner()
        const pm = new ethers.Contract(CONTRACTS.predictionMarket, PREDICTION_MARKET_ABI, signer)
        const tx = await fn(pm)
        setLastTx(tx.hash)
        await tx.wait(1)
        await refresh()
        return true
      } catch (err) {
        setError(humanError(err))
        return false
      } finally {
        setBusy(null)
      }
    },
    [getSigner, refresh],
  )

  /** Native markets carry the stake in msg.value; ERC-20 needs an approve first. */
  const placeBet = useCallback(
    (marketId, side, amountWei, isNative) =>
      send(`bet:${marketId}:${side}`, (pm) =>
        isNative
          ? pm.bet(marketId, side, 0, { value: amountWei })
          : pm.bet(marketId, side, amountWei),
      ),
    [send],
  )

  const claim = useCallback(
    (marketId) => send(`claim:${marketId}`, (pm) => pm.claim(marketId)),
    [send],
  )

  const enableRefunds = useCallback(
    (marketId) => send(`refund:${marketId}`, (pm) => pm.enableRefunds(marketId)),
    [send],
  )

  return {
    markets,
    loading,
    busy,
    error,
    lastTx,
    configured,
    refresh,
    placeBet,
    claim,
    enableRefunds,
    clearError: () => setError(null),
  }
}
