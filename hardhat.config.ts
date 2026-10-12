import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const RAW_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";
// Only use the key if it looks like a full 32-byte hex (66 chars with 0x prefix).
const DEPLOYER_PRIVATE_KEY = RAW_KEY.length === 66 ? RAW_KEY : undefined;
const accounts = DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },

  networks: {
    // Local, for tests and dry runs. No key needed.
    hardhat: {
      chainId: 31337,
    },

    // Avalanche C-Chain mainnet — the production target. Real AVAX.
    avalanche: {
      url: "https://api.avax.network/ext/bc/C/rpc",
      chainId: 43114,
      accounts,
    },

    // Avalanche Fuji testnet — same EVM, free AVAX from the faucet.
    // Used to rehearse the mainnet deploy before it costs anything.
    fuji: {
      url: "https://api.avax-test.network/ext/bc/C/rpc",
      chainId: 43113,
      accounts,
    },
  },

  // Snowtrace verification via Routescan. Verified source matters for a grant
  // submission — reviewers should be able to read what is actually deployed.
  // Routescan does not require a real key; the placeholder string is expected.
  etherscan: {
    apiKey: {
      avalanche: "routescan",
      avalancheFujiTestnet: "routescan",
    },
    customChains: [
      {
        network: "avalanche",
        chainId: 43114,
        urls: {
          apiURL: "https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan",
          browserURL: "https://snowtrace.io",
        },
      },
      {
        network: "avalancheFujiTestnet",
        chainId: 43113,
        urls: {
          apiURL: "https://api.routescan.io/v2/network/testnet/evm/43113/etherscan",
          browserURL: "https://testnet.snowtrace.io",
        },
      },
    ],
  },

  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    token: "AVAX",
  },

  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
