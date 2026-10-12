// Avalanche C-Chain mainnet.
export const AVALANCHE_CHAIN = {
  chainId: 43114,
  chainIdHex: '0xA86A',
  chainName: 'Avalanche C-Chain',
  rpcUrls: ['https://api.avax.network/ext/bc/C/rpc'],
  blockExplorerUrls: ['https://snowtrace.io'],
  nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
}

// Fuji, for rehearsing against a testnet deploy without spending real AVAX.
export const FUJI_CHAIN = {
  chainId: 43113,
  chainIdHex: '0xA869',
  chainName: 'Avalanche Fuji Testnet',
  rpcUrls: ['https://api.avax-test.network/ext/bc/C/rpc'],
  blockExplorerUrls: ['https://testnet.snowtrace.io'],
  nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
}

// The hunt (GameEngineV2/IngredientNFT/PotionNFT) has never been deployed to
// mainnet — it stays on Fuji regardless of what the predictions market does.
export const HUNT_CHAIN = FUJI_CHAIN

// PredictionMarket went live on Avalanche mainnet on 2026-08-07 — real AVAX,
// real markets. Fixed here rather than read from an env var so the two apps
// can never accidentally end up pointed at the same chain again.
export const PREDICTIONS_CHAIN = AVALANCHE_CHAIN

export const CONTRACTS = {
  gameEngine: import.meta.env.VITE_GAME_ENGINE_ADDRESS || '',
  ingredientNFT: import.meta.env.VITE_INGREDIENT_NFT_ADDRESS || '',
  potionNFT: import.meta.env.VITE_POTION_NFT_ADDRESS || '',
  predictionMarket: import.meta.env.VITE_PREDICTION_MARKET_ADDRESS || '',
}

/** True when the address for a given contract has been configured. */
export function isConfigured(key) {
  const addr = CONTRACTS[key]
  return typeof addr === 'string' && /^0x[a-fA-F0-9]{40}$/.test(addr)
}

export function explorerTx(chain, hash) {
  return `${chain.blockExplorerUrls[0]}/tx/${hash}`
}

export function explorerAddress(chain, address) {
  return `${chain.blockExplorerUrls[0]}/address/${address}`
}
