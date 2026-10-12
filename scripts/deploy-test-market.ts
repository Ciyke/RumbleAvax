/**
 * Deploys the standalone TestMarket harness (deposit -> predict -> withdraw
 * anytime, no real matchroom) to Fuji, and merges the address into
 * deployments.json alongside the real deploy.ts output.
 *
 * Usage:
 *   npx hardhat run scripts/deploy-test-market.ts --network fuji
 */

import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config();

const DEPLOY_GAS_LIMIT = 6_000_000n;
const DEPLOYMENTS_PATH = path.join(__dirname, "..", "deployments.json");

function log(msg: string) {
  console.log(`\n${msg}`);
}

async function main() {
  console.log("─".repeat(60));
  console.log("  TEST MARKET (FUJI) — CONTRACT DEPLOYMENT");
  console.log("─".repeat(60));

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  const chainId = (await ethers.provider.getNetwork()).chainId;

  log(`Network:  ${network.name} (Chain ID: ${chainId})`);
  log(`Deployer: ${deployer.address}`);
  log(`Balance:  ${ethers.formatEther(balance)} AVAX`);

  if (network.name === "avalanche" || Number(chainId) === 43114) {
    throw new Error("Refusing to deploy TestMarket to mainnet — this is a test-only contract.");
  }
  if (balance === 0n) {
    throw new Error("Deployer wallet has 0 AVAX on this network. Fund it from the Fuji faucet first.");
  }

  log("Deploying TestMarket...");
  const TestMarket = await ethers.getContractFactory("TestMarket");
  const testMarket = await TestMarket.deploy({ gasLimit: DEPLOY_GAS_LIMIT });
  await testMarket.waitForDeployment();
  const testMarketAddress = await testMarket.getAddress();
  log(`  ✓ TestMarket deployed: ${testMarketAddress}`);

  const deployments = fs.existsSync(DEPLOYMENTS_PATH)
    ? JSON.parse(fs.readFileSync(DEPLOYMENTS_PATH, "utf8"))
    : {};
  deployments.fuji = deployments.fuji ?? {};
  deployments.fuji.contracts = deployments.fuji.contracts ?? {};
  deployments.fuji.contracts.TestMarket = testMarketAddress;
  deployments.fuji.envVars = deployments.fuji.envVars ?? {};
  deployments.fuji.envVars.VITE_TEST_MARKET_ADDRESS = testMarketAddress;
  fs.writeFileSync(DEPLOYMENTS_PATH, JSON.stringify(deployments, null, 2) + "\n");

  console.log("\n  ADD THIS TO frontend/.env:");
  console.log(`  VITE_TEST_MARKET_ADDRESS=${testMarketAddress}`);
  console.log("\n  Saved under deployments.json → fuji.contracts.TestMarket");
  console.log("─".repeat(60));
}

main().catch((err) => {
  console.error("\n  DEPLOYMENT FAILED:");
  console.error(err.message ?? err);
  process.exit(1);
});
