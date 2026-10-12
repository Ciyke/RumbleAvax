import { useCallback, useEffect, useState } from 'react'
import { ethers } from 'ethers'
import { GAME_ENGINE_V2_ABI, INGREDIENT_NFT_ABI, POTION_NFT_ABI } from '../abis/index.js'
import { HUNT_CHAIN, CONTRACTS, isConfigured } from '../shared/chains.js'
import { humanError } from '../shared/format.js'
import { BOXES_PER_RUN } from './ingredients.js'

/**
 * All hunt state, read straight from the chain.
 *
 * There is no backend and no indexer: every number here comes from a contract
 * view call. That is why the whole thing can be a static page.
 *
 * Every action is one manual wallet signature — 52 per complete run. `busy`
 * carries which step is awaiting a signature so the UI can say so plainly
 * rather than looking frozen.
 */
export function useHunt(wallet) {
  const { address, isConnected, getSigner } = wallet

  const [progress, setProgress] = useState(null)
  const [balances, setBalances] = useState([0n, 0n, 0n, 0n, 0n, 0n])
  const [board, setBoard] = useState(null)
  const [stats, setStats] = useState({ points: 0n, potions: 0n })
  const [season, setSeason] = useState({ day: 0, active: false, endsAt: 0 })
  const [potionCount, setPotionCount] = useState(0n)

  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(null) // e.g. 'begin' | 'open:3' | 'close:3' | 'craft'
  const [error, setError] = useState(null)
  const [lastTx, setLastTx] = useState(null)

  const configured = isConfigured('gameEngine') && isConfigured('ingredientNFT')

  /** Read-only provider, so the page shows live data before any wallet connects. */
  const readProvider = useCallback(
    () => new ethers.JsonRpcProvider(HUNT_CHAIN.rpcUrls[0], HUNT_CHAIN.chainId),
    [],
  )

  const readContracts = useCallback(() => {
    const p = readProvider()
    return {
      engine: new ethers.Contract(CONTRACTS.gameEngine, GAME_ENGINE_V2_ABI, p),
      ingredients: new ethers.Contract(CONTRACTS.ingredientNFT, INGREDIENT_NFT_ABI, p),
      potions: new ethers.Contract(CONTRACTS.potionNFT, POTION_NFT_ABI, p),
    }
  }, [readProvider])

  // ── Refresh everything ──────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    if (!configured) return
    setLoading(true)
    try {
      const { engine, ingredients, potions } = readContracts()

      const [day, active, endsAt] = await Promise.all([
        engine.currentDay(),
        engine.isSeasonActive(),
        engine.seasonEnd(),
      ])
      setSeason({ day: Number(day), active, endsAt: Number(endsAt) })

      if (!address) {
        setProgress(null)
        setBoard(null)
        return
      }

      const [p, held, s, potionBal] = await Promise.all([
        engine.getRunProgress(address),
        ingredients.getAllBalances(address),
        engine.getSeasonStats(address),
        potions.balanceOf(address).catch(() => 0n),
      ])

      setProgress({
        runId: Number(p.runId),
        opened: Number(p.opened),
        closed: Number(p.closed),
        boxesOpened: Number(p.boxesOpened),
        boxesClosed: Number(p.boxesClosed),
        begun: p.begun,
        potionCrafted: p.potionCrafted,
        readyToCraft: p.readyToCraft,
      })
      setBalances(held)
      setStats({ points: s.points, potions: s.potions })
      setPotionCount(potionBal)

      // The board is only meaningful once a run exists.
      if (Number(p.runId) > 0 && p.begun) {
        const b = await engine.previewRun(address, p.runId)
        setBoard(b.map(Number))
      } else {
        setBoard(null)
      }
    } catch (err) {
      setError(humanError(err))
    } finally {
      setLoading(false)
    }
  }, [address, configured, readContracts])

  useEffect(() => {
    refresh()
  }, [refresh])

  // ── Write helper ────────────────────────────────────────────────────────
  const send = useCallback(
    async (label, fn) => {
      setBusy(label)
      setError(null)
      setLastTx(null)
      try {
        const signer = await getSigner()
        const engine = new ethers.Contract(CONTRACTS.gameEngine, GAME_ENGINE_V2_ABI, signer)
        const tx = await fn(engine)
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

  // ── Actions — one signature each ────────────────────────────────────────
  const beginHunt = useCallback(() => send('begin', (e) => e.beginHunt()), [send])

  const openBox = useCallback((i) => send(`open:${i}`, (e) => e.openBox(i)), [send])

  const closeBox = useCallback((i) => send(`close:${i}`, (e) => e.closeBox(i)), [send])

  const createPotion = useCallback(() => send('craft', (e) => e.createPotion()), [send])

  /**
   * The next box the contract will accept, given the sequential rule: a box must
   * be closed before the next one opens. Returns null when the board is done.
   */
  const nextAction = (() => {
    if (!progress?.begun || progress.potionCrafted) return null
    for (let i = 0; i < BOXES_PER_RUN; i++) {
      const opened = (progress.opened >> i) & 1
      const closed = (progress.closed >> i) & 1
      if (!opened) return { type: 'open', index: i }
      if (!closed) return { type: 'close', index: i }
    }
    return { type: 'craft' }
  })()

  return {
    // state
    progress,
    balances,
    board,
    stats,
    season,
    potionCount,
    loading,
    busy,
    error,
    lastTx,
    configured,
    isConnected,
    nextAction,
    // actions
    beginHunt,
    openBox,
    closeBox,
    createPotion,
    refresh,
    clearError: () => setError(null),
  }
}
