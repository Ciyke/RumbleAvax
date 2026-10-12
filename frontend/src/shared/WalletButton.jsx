import { useState } from 'react'
import { shortAddress } from './format.js'

export default function WalletButton({ wallet }) {
  const [picking, setPicking] = useState(false)

  const { address, status, wallets, connect, disconnect, switchNetwork, isWrongNetwork, targetChain } =
    wallet

  if (isWrongNetwork) {
    return (
      <button className="wallet-btn wallet-btn--warn" onClick={switchNetwork}>
        Switch to {targetChain.chainName}
      </button>
    )
  }

  if (address) {
    return (
      <button className="wallet-btn wallet-btn--connected" onClick={disconnect} title="Disconnect">
        <span className="wallet-btn__dot" />
        {shortAddress(address)}
      </button>
    )
  }

  // More than one wallet installed — let the user say which, rather than
  // silently picking whichever injected itself last.
  if (picking && wallets.length > 1) {
    return (
      <div className="wallet-picker">
        {wallets.map((w) => (
          <button
            key={w.info.uuid}
            className="wallet-picker__option"
            onClick={() => {
              setPicking(false)
              connect(w)
            }}
          >
            {w.info.icon && <img src={w.info.icon} alt="" width={18} height={18} />}
            {w.info.name}
          </button>
        ))}
        <button className="wallet-picker__cancel" onClick={() => setPicking(false)}>
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      className="wallet-btn"
      disabled={status === 'connecting'}
      onClick={() => (wallets.length > 1 ? setPicking(true) : connect(wallets[0]))}
    >
      {status === 'connecting' ? 'Connecting…' : 'Connect Wallet'}
    </button>
  )
}
