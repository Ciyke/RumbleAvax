import { ethers, network } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

// One-off: create the first market on the live PredictionMarket contract so
// the real bet/claim UI has something to render. token=0x0 means native AVAX.
const MARKET_ADDRESS = process.env.VITE_PREDICTION_MARKET_ADDRESS_OVERRIDE
  || "0x3634b9D9BF785C24aAc53A41A33Ac69C5E766eB6";

const CLOSES_IN_SECONDS = 2 * 60 * 60;      // 2 hours
const RESOLVE_WINDOW_SECONDS = 24 * 60 * 60; // +24 hours after close

async function main() {
  const [signer] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;

  const now = Math.floor(Date.now() / 1000);
  const closesAt = now + CLOSES_IN_SECONDS;
  const resolveDeadline = closesAt + RESOLVE_WINDOW_SECONDS;

  console.log(`Network:        ${network.name} (chain ${chainId})`);
  console.log(`Market contract: ${MARKET_ADDRESS}`);
  console.log(`Caller:         ${signer.address}`);
  console.log(`Token:          native AVAX (0x0)`);
  console.log(`Closes at:      ${new Date(closesAt * 1000).toISOString()}`);
  console.log(`Resolve by:     ${new Date(resolveDeadline * 1000).toISOString()}`);

  const market = await ethers.getContractAt("PredictionMarket", MARKET_ADDRESS, signer);

  const tx = await market.createMarket(ethers.ZeroAddress, closesAt, resolveDeadline);
  console.log(`\nSubmitted: ${tx.hash}`);
  const receipt = await tx.wait(1);
  console.log(`Confirmed in block ${receipt?.blockNumber}`);

  const marketId = await market.marketCount();
  console.log(`\nCreated marketId ${marketId}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
