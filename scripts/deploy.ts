import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

// ─── Config from env ──────────────────────────────────────────────────────────

const SEASON_START   = process.env.SEASON_START ? Number(process.env.SEASON_START) : 0;
const INGREDIENT_URI = process.env.INGREDIENT_NFT_URI  || "";
const POTION_URI     = process.env.POTION_NFT_BASE_URI || "";

const RAKE_BPS = process.env.RAKE_BPS ? Number(process.env.RAKE_BPS) : 300;
const TREASURY = process.env.TREASURY_ADDRESS || "";
const RESOLVER = process.env.RESOLVER_ADDRESS || "";

const MAINNET_CHAIN_ID = 43114n;

// Fuji's public RPC node can't execute eth_call/eth_estimateGas against the
// "pending" block ("state not available for pending block"), which is what
// ethers uses by default to auto-estimate gas before sending. Supplying an
// explicit gasLimit skips that call entirely. Generous flat values — testnet
// gas is free and the chain's block gas limit is ~32M, so overshooting costs
// nothing (only actual gas used is charged).
const DEPLOY_GAS_LIMIT = 6_000_000n;
const CALL_GAS_LIMIT = 300_000n;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`\n${msg}`);
}

function separator() {
  console.log("─".repeat(64));
}

async function waitForTx(label: string, tx: any) {
  process.stdout.write(`  ${label}...`);
  const receipt = await tx.wait(1);
  console.log(` done (gas ${receipt.gasUsed.toLocaleString()})`);
  return receipt;
}

/** Read-merge-write, so a deploy to one network never erases another's record. */
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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  separator();
  console.log("  RUMBLE ON AVALANCHE — DEPLOYMENT");
  separator();

  const [deployer] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const balance = await ethers.provider.getBalance(deployer.address);

  log(`Network:   ${network.name} (chain ${chainId})`);
  log(`Deployer:  ${deployer.address}`);
  log(`Balance:   ${ethers.formatEther(balance)} AVAX`);

  // ── Guards ────────────────────────────────────────────────────────────────
  if (chainId === MAINNET_CHAIN_ID && process.env.CONFIRM_MAINNET !== "yes") {
    throw new Error(
      "Refusing to deploy to Avalanche mainnet without confirmation.\n" +
        "  This spends real AVAX and publishes contracts that will hold real money.\n" +
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
  for (const [label, uri] of [
    ["INGREDIENT_NFT_URI", INGREDIENT_URI],
    ["POTION_NFT_BASE_URI", POTION_URI],
  ]) {
    if (!uri) console.warn(`  WARNING: ${label} is empty — NFTs will have no metadata.`);
  }

  const seasonStartLabel =
    SEASON_START === 0
      ? "now (deployment time)"
      : `${SEASON_START} (${new Date(SEASON_START * 1000).toISOString()})`;
  log(`Season:    starts ${seasonStartLabel}, runs 64 days`);
  log(`Rake:      ${RAKE_BPS} bps (${(RAKE_BPS / 100).toFixed(2)}%) → ${treasury}`);
  log(`Resolver:  ${resolver}`);

  separator();

  // ── 1. IngredientNFT ──────────────────────────────────────────────────────
  log("Step 1/5 — IngredientNFT");
  const Ingredient = await ethers.getContractFactory("IngredientNFT");
  const ingredients = await Ingredient.deploy(INGREDIENT_URI, { gasLimit: DEPLOY_GAS_LIMIT });
  await ingredients.waitForDeployment();
  const ingredientAddress = await ingredients.getAddress();
  console.log(`  deployed: ${ingredientAddress}`);

  // ── 2. PotionNFT ──────────────────────────────────────────────────────────
  log("Step 2/5 — PotionNFT");
  const Potion = await ethers.getContractFactory("PotionNFT");
  const potions = await Potion.deploy(POTION_URI, { gasLimit: DEPLOY_GAS_LIMIT });
  await potions.waitForDeployment();
  const potionAddress = await potions.getAddress();
  console.log(`  deployed: ${potionAddress}`);

  // ── 3. GameEngineV2 ───────────────────────────────────────────────────────
  log("Step 3/5 — GameEngineV2");
  const Engine = await ethers.getContractFactory("GameEngineV2");
  const engine = await Engine.deploy(ingredientAddress, potionAddress, SEASON_START, { gasLimit: DEPLOY_GAS_LIMIT });
  await engine.waitForDeployment();
  const engineAddress = await engine.getAddress();
  console.log(`  deployed: ${engineAddress}`);

  // ── 4. Authorise the engine on both token contracts ───────────────────────
  log("Step 4/5 — Authorising GameEngineV2 to mint and burn");
  await waitForTx("IngredientNFT.setGameEngine", await ingredients.setGameEngine(engineAddress, { gasLimit: CALL_GAS_LIMIT }));
  await waitForTx("PotionNFT.setGameEngine", await potions.setGameEngine(engineAddress, { gasLimit: CALL_GAS_LIMIT }));

  // ── 5. PredictionMarket ───────────────────────────────────────────────────
  log("Step 5/5 — PredictionMarket");
  const Market = await ethers.getContractFactory("PredictionMarket");
  const market = await Market.deploy(resolver, treasury, RAKE_BPS, { gasLimit: DEPLOY_GAS_LIMIT });
  await market.waitForDeployment();
  const marketAddress = await market.getAddress();
  console.log(`  deployed: ${marketAddress}`);

  // ── Verify wiring ─────────────────────────────────────────────────────────
  separator();
  log("Verifying configuration...");

  const checks: Array<{ label: string; got: string; want: string }> = [
    { label: "GameEngineV2.ingredientNFT", got: await engine.ingredientNFT(), want: ingredientAddress },
    { label: "GameEngineV2.potionNFT",     got: await engine.potionNFT(),     want: potionAddress },
    { label: "IngredientNFT.gameEngine",   got: await ingredients.gameEngine(), want: engineAddress },
    { label: "PotionNFT.gameEngine",       got: await potions.gameEngine(),   want: engineAddress },
    { label: "PredictionMarket.resolver",  got: await market.resolver(),      want: resolver },
    { label: "PredictionMarket.treasury",  got: await market.treasury(),      want: treasury },
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

  // ── Persist ───────────────────────────────────────────────────────────────
  separator();

  const outputPath = path.join(__dirname, "..", "deployments.json");
  const existing = readExisting(outputPath);

  const record = {
    ...existing,
    [network.name]: {
      network: network.name,
      chainId: Number(chainId),
      deployedAt: new Date().toISOString(),
      deployer: deployer.address,
      seasonStart: Number(await engine.SEASON_START()),
      seasonEnd: Number(await engine.seasonEnd()),
      contracts: {
        IngredientNFT: ingredientAddress,
        PotionNFT: potionAddress,
        GameEngineV2: engineAddress,
        PredictionMarket: marketAddress,
      },
      predictions: {
        resolver,
        treasury,
        rakeBps: RAKE_BPS,
      },
      envVars: {
        VITE_CHAIN_ID: Number(chainId),
        VITE_INGREDIENT_NFT_ADDRESS: ingredientAddress,
        VITE_POTION_NFT_ADDRESS: potionAddress,
        VITE_GAME_ENGINE_ADDRESS: engineAddress,
        VITE_PREDICTION_MARKET_ADDRESS: marketAddress,
      },
    },
  };

  fs.writeFileSync(outputPath, JSON.stringify(record, null, 2));

  log("Deployment complete.");
  separator();

  console.log("\n  ADDRESSES");
  console.log(`  IngredientNFT    : ${ingredientAddress}`);
  console.log(`  PotionNFT        : ${potionAddress}`);
  console.log(`  GameEngineV2     : ${engineAddress}`);
  console.log(`  PredictionMarket : ${marketAddress}`);

  console.log("\n  FRONTEND .env");
  for (const [k, v] of Object.entries(record[network.name].envVars)) {
    console.log(`  ${k}=${v}`);
  }

  console.log("\n  NEXT STEPS");
  console.log("  1. Verify on Snowtrace:");
  console.log(`     npx hardhat verify --network ${network.name} ${marketAddress} ${resolver} ${treasury} ${RAKE_BPS}`);
  console.log(`     npx hardhat verify --network ${network.name} ${engineAddress} ${ingredientAddress} ${potionAddress} ${await engine.SEASON_START()}`);
  console.log("  2. Create the first market: market.createMarket(token, closesAt, resolveDeadline)");

  console.log(`\n  Saved to deployments.json under "${network.name}".`);
  separator();
}

main().catch((error) => {
  console.error("\n  DEPLOYMENT FAILED");
  console.error(`  ${error.message}`);
  process.exit(1);
});
