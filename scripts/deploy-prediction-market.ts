import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

// Deploys PredictionMarket only — the hunt contracts (IngredientNFT, PotionNFT,
// GameEngineV2) stay on Fuji. bets.playrumble.xyz is the only site moving to
// mainnet right now; hunt.playrumble.xyz is untouched. Same guards as deploy.ts,
// scoped to the one contract.

const RAKE_BPS = process.env.RAKE_BPS ? Number(process.env.RAKE_BPS) : 300;
const TREASURY = process.env.TREASURY_ADDRESS || "";
const RESOLVER = process.env.RESOLVER_ADDRESS || "";

const MAINNET_CHAIN_ID = 43114n;
const DEPLOY_GAS_LIMIT = 6_000_000n;

function log(msg: string) {
  console.log(`\n${msg}`);
}

function separator() {
  console.log("─".repeat(64));
}

function readExisting(outputPath: string): Record<string, any> {
  if (!fs.existsSync(outputPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(outputPath, "utf-8"));
  } catch {
    return {};
  }
}

function requireAddress(value: string, label: string): string {
  if (!ethers.isAddress(value)) {
    throw new Error(`${label} is not a valid address (got "${value}"). Set it in .env.`);
  }
  return ethers.getAddress(value);
}

async function main() {
  separator();
  console.log("  PREDICTION MARKET — DEPLOYMENT (bets.playrumble.xyz only)");
  separator();

  const [deployer] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const balance = await ethers.provider.getBalance(deployer.address);

  log(`Network:   ${network.name} (chain ${chainId})`);
  log(`Deployer:  ${deployer.address}`);
  log(`Balance:   ${ethers.formatEther(balance)} AVAX`);

  if (chainId === MAINNET_CHAIN_ID && process.env.CONFIRM_MAINNET !== "yes") {
    throw new Error(
      "Refusing to deploy to Avalanche mainnet without confirmation.\n" +
        "  This spends real AVAX and publishes a contract that will hold real money.\n" +
        "  Re-run with CONFIRM_MAINNET=yes once you have checked every value above."
    );
  }

  if (balance === 0n) {
    throw new Error(
      chainId === MAINNET_CHAIN_ID
        ? "Deployer holds 0 AVAX. Fund it before deploying."
        : "Deployer holds 0 AVAX. Use https://faucet.avax.network for Fuji."
    );
  }

  const treasury = requireAddress(TREASURY, "TREASURY_ADDRESS");
  const resolver = requireAddress(RESOLVER, "RESOLVER_ADDRESS");

  if (RAKE_BPS > 1000) throw new Error(`RAKE_BPS ${RAKE_BPS} exceeds the 1000 (10%) contract cap.`);

  if (treasury.toLowerCase() === deployer.address.toLowerCase()) {
    console.warn("\n  WARNING: treasury is the deployer key. Prefer a separate address.");
  }
  if (resolver.toLowerCase() === deployer.address.toLowerCase()) {
    console.warn("\n  WARNING: resolver is the deployer key. It decides who wins every");
    console.warn("           market — a multisig is strongly preferred.");
  }

  log(`Rake:      ${RAKE_BPS} bps (${(RAKE_BPS / 100).toFixed(2)}%) → ${treasury}`);
  log(`Resolver:  ${resolver}`);

  separator();

  log("Deploying PredictionMarket");
  const Market = await ethers.getContractFactory("PredictionMarket");
  const market = await Market.deploy(resolver, treasury, RAKE_BPS, { gasLimit: DEPLOY_GAS_LIMIT });
  await market.waitForDeployment();
  const marketAddress = await market.getAddress();
  console.log(`  deployed: ${marketAddress}`);

  separator();
  log("Verifying configuration...");

  const checks = [
    { label: "PredictionMarket.resolver", got: await market.resolver(), want: resolver },
    { label: "PredictionMarket.treasury", got: await market.treasury(), want: treasury },
  ];

  let allPassed = true;
  for (const c of checks) {
    const ok = c.got.toLowerCase() === c.want.toLowerCase();
    console.log(`  ${ok ? "OK  " : "FAIL"} ${c.label}: ${c.got}`);
    if (!ok) {
      allPassed = false;
      console.error(`       expected ${c.want}`);
    }
  }

  const rake = await market.rakeBps();
  const rakeOk = Number(rake) === RAKE_BPS;
  console.log(`  ${rakeOk ? "OK  " : "FAIL"} PredictionMarket.rakeBps: ${rake}`);
  if (!rakeOk) allPassed = false;

  if (!allPassed) throw new Error("Configuration verification failed — see above.");

  separator();

  const outputPath = path.join(__dirname, "..", "deployments.json");
  const existing = readExisting(outputPath);
  const existingNetwork = existing[network.name] || {};

  const record = {
    ...existing,
    [network.name]: {
      ...existingNetwork,
      network: network.name,
      chainId: Number(chainId),
      deployedAt: new Date().toISOString(),
      deployer: deployer.address,
      contracts: {
        ...(existingNetwork.contracts || {}),
        PredictionMarket: marketAddress,
      },
      predictions: {
        resolver,
        treasury,
        rakeBps: RAKE_BPS,
      },
      envVars: {
        ...(existingNetwork.envVars || {}),
        VITE_CHAIN_ID: Number(chainId),
        VITE_PREDICTION_MARKET_ADDRESS: marketAddress,
      },
    },
  };

  fs.writeFileSync(outputPath, JSON.stringify(record, null, 2));

  log("Deployment complete.");
  separator();

  console.log("\n  ADDRESS");
  console.log(`  PredictionMarket : ${marketAddress}`);

  console.log("\n  FRONTEND .env (bets.playrumble.xyz)");
  console.log(`  VITE_CHAIN_ID=${Number(chainId)}`);
  console.log(`  VITE_PREDICTION_MARKET_ADDRESS=${marketAddress}`);

  console.log("\n  NEXT STEPS");
  console.log("  1. Verify on Snowtrace:");
  console.log(`     npx hardhat verify --network ${network.name} ${marketAddress} ${resolver} ${treasury} ${RAKE_BPS}`);
  console.log("  2. Create the first market: market.createMarket(token, closesAt, resolveDeadline)");

  console.log(`\n  Saved to deployments.json under "${network.name}".`);
  separator();
}

main().catch((error) => {
  console.error("\n  DEPLOYMENT FAILED");
  console.error(`  ${error.message}`);
  process.exit(1);
});
