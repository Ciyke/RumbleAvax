import { useCallback, useEffect, useRef, useState } from 'react'
import { ethers } from 'ethers'

/**
 * Wallet connection for a single target chain. Hunt and the predictions
 * market are pinned to different chains (see shared/chains.js), so the
 * caller must say which one explicitly rather than relying on a shared
 * default — that ambiguity is exactly what let them get wired to the same
 * chain by accident before the predictions market moved to mainnet.
 *
 * Uses EIP-6963 discovery so the right provider is chosen when several wallet
 * extensions are installed — window.ethereum is ambiguous in that case and
 * whichever extension loaded last wins, which is not necessarily the one the
 * user meant.
 *
 * status: disconnected | connecting | connected | wrong-network
 */
export function useWallet(targetChain) {
  const [address, setAddress] = useState(null)
  const [chainId, setChainId] = useState(null)
  const [status, setStatus] = useState('disconnected')
  const [error, setError] = useState(null)
  const [wallets, setWallets] = useState([])

  const providerRef = useRef(null) // ethers BrowserProvider
  const rawRef = useRef(null) // the EIP-1193 provider itself

  // ── EIP-6963 discovery ──────────────────────────────────────────────────
  useEffect(() => {
    const found = new Map()
    const onAnnounce = (event) => {
      const { info, provider } = event.detail
      if (!found.has(info.uuid)) {
        found.set(info.uuid, { info, provider })
        setWallets(Array.from(found.values()))
      }
    }

    window.addEventListener('eip6963:announceProvider', onAnnounce)
    window.dispatchEvent(new Event('eip6963:requestProvider'))

    // Fall back to the legacy injected provider if nothing announces itself.
    const timer = setTimeout(() => {
      if (found.size === 0 && window.ethereum) {
        setWallets([
          { info: { uuid: 'injected', name: 'Browser Wallet', icon: '' }, provider: window.ethereum },
        ])
      }
    }, 300)

    return () => {
      window.removeEventListener('eip6963:announceProvider', onAnnounce)
      clearTimeout(timer)
    }
  }, [])

  const syncChain = useCallback(
    async (provider) => {
      const net = await provider.getNetwork()
      const id = Number(net.chainId)
      setChainId(id)
      setStatus(id === targetChain.chainId ? 'connected' : 'wrong-network')
      return id
    },
    [targetChain.chainId],
  )

  // ── Connect ─────────────────────────────────────────────────────────────
  const connect = useCallback(
    async (chosen) => {
      const raw = chosen?.provider ?? wallets[0]?.provider ?? window.ethereum
      if (!raw) {
        setError('No wallet found. Install MetaMask, Core, or Rabby to continue.')
        return
      }

      setStatus('connecting')
      setError(null)

      try {
        const accounts = await raw.request({ method: 'eth_requestAccounts' })
        if (!accounts?.length) throw new Error('No account returned')

        const provider = new ethers.BrowserProvider(raw)
        providerRef.current = provider
        rawRef.current = raw

        setAddress(ethers.getAddress(accounts[0]))
        await syncChain(provider)
      } catch (err) {
        setStatus('disconnected')
        // 4001 is the standard "user rejected" code — not worth surfacing as an error.
        setError(err?.code === 4001 ? null : err?.message || 'Failed to connect')
      }
    },
    [wallets, syncChain],
  )

  const disconnect = useCallback(() => {
    providerRef.current = null
    rawRef.current = null
    setAddress(null)
    setChainId(null)
    setStatus('disconnected')
    setError(null)
  }, [])

  // ── Network switching ───────────────────────────────────────────────────
  const switchNetwork = useCallback(async () => {
    const raw = rawRef.current
    if (!raw) return

    try {
      await raw.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: targetChain.chainIdHex }],
      })
    } catch (err) {
      // 4902 means the wallet has never heard of this chain — add it, then switch.
      if (err?.code === 4902) {
        await raw.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: targetChain.chainIdHex,
              chainName: targetChain.chainName,
              rpcUrls: targetChain.rpcUrls,
              nativeCurrency: targetChain.nativeCurrency,
              blockExplorerUrls: targetChain.blockExplorerUrls,
            },
          ],
        })
      } else if (err?.code !== 4001) {
        setError(err?.message || 'Could not switch network')
      }
    }
  }, [targetChain])

  // ── React to wallet events ──────────────────────────────────────────────
  useEffect(() => {
    const raw = rawRef.current
    if (!raw?.on) return

    const onAccountsChanged = (accounts) => {
      if (!accounts?.length) {
        disconnect()
      } else {
        setAddress(ethers.getAddress(accounts[0]))
      }
    }

    // Rebuild the provider on chain change; ethers caches network details.
    const onChainChanged = async () => {
      const provider = new ethers.BrowserProvider(raw)
      providerRef.current = provider
      await syncChain(provider)
    }

    raw.on('accountsChanged', onAccountsChanged)
    raw.on('chainChanged', onChainChanged)

    return () => {
      raw.removeListener?.('accountsChanged', onAccountsChanged)
      raw.removeListener?.('chainChanged', onChainChanged)
    }
  }, [address, disconnect, syncChain])

  const getSigner = useCallback(async () => {
    if (!providerRef.current) throw new Error('Wallet not connected')
    return providerRef.current.getSigner()
  }, [])

  return {
    address,
    chainId,
    status,
    error,
    wallets,
    isConnected: status === 'connected',
    isWrongNetwork: status === 'wrong-network',
    targetChain,
    provider: providerRef.current,
    connect,
    disconnect,
    switchNetwork,
    getSigner,
    clearError: () => setError(null),
  }
}
