import { ethers } from 'ethers'

export function shortAddress(address, size = 4) {
  if (!address) return ''
  return `${address.slice(0, 2 + size)}…${address.slice(-size)}`
}

/** Formats a wei value, trimming trailing zeros so 1.500000 reads as 1.5. */
export function formatAvax(wei, decimals = 4) {
  if (wei === null || wei === undefined) return '0'
  const asString = ethers.formatEther(wei)
  const n = Number(asString)
  if (n === 0) return '0'
  if (n < 0.0001) return '<0.0001'
  return n.toFixed(decimals).replace(/\.?0+$/, '')
}

export function formatUnits(value, unitDecimals, displayDecimals = 2) {
  if (value === null || value === undefined) return '0'
  const n = Number(ethers.formatUnits(value, unitDecimals))
  return n.toLocaleString(undefined, { maximumFractionDigits: displayDecimals })
}

/** A 1e18-scaled multiplier rendered as "3.91x". */
export function formatRatio(scaled) {
  if (!scaled) return '—'
  return `${Number(ethers.formatEther(scaled)).toFixed(2)}x`
}

export function formatCountdown(secondsLeft) {
  if (secondsLeft <= 0) return 'closed'
  const d = Math.floor(secondsLeft / 86400)
  const h = Math.floor((secondsLeft % 86400) / 3600)
  const m = Math.floor((secondsLeft % 3600) / 60)
  const s = Math.floor(secondsLeft % 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m ${s}s`
}

export function formatTimestamp(unixSeconds) {
  if (!unixSeconds) return '—'
  return new Date(Number(unixSeconds) * 1000).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

/**
 * Turns a wallet/RPC error into something worth showing a user.
 * Contract reverts carry the require() string, which is the useful part.
 */
export function humanError(err) {
  if (!err) return ''
  if (err.code === 4001 || err.code === 'ACTION_REJECTED') return 'Transaction rejected'

  const reason = err.reason || err.shortMessage || err.info?.error?.message || err.message || ''
  const match = reason.match(/(?:GameEngineV2|PM|IngredientNFT|PotionNFT):\s*(.+?)(?:"|$)/)
  if (match) return match[1].trim()

  if (reason.includes('insufficient funds')) return 'Not enough AVAX to cover gas'
  return reason.slice(0, 140) || 'Something went wrong'
}
