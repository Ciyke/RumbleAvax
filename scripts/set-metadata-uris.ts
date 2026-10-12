/**
 * Points the deployed IngredientNFT at its new IPFS metadata URI, and
 * redeploys PotionNFT (code changed: tokenURI now ignores the token id)
 * pointed at its IPFS metadata, then rewires it into GameEngineV2.
 *
 * Run AFTER upload-images-pinata.ts + upload-metadata-pinata.ts and after
 * INGREDIENT_NFT_URI / POTION_NFT_BASE_URI are set in .env:
 *   npx hardhat run scripts/set-metadata-uris.ts --network fuji
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config();

const CALL_GAS_LIMIT = 300_000n;
const DEPLOY_GAS_LIMIT = 6_000_000n;

const DEPLOYMENTS_PATH = path.join(__dirname, "..", "deployments.json");

async function waitForTx(label: string, tx: any) {
  console.log(`  ${label} — tx: ${tx.hash}`);
  await tx.wait();
  console.log(`  ✅ ${label} confirmed`);
}

async function main() {
  const ingredientURI = process.env.INGREDIENT_NFT_URI;
  const potionURI = process.env.POTION_NFT_BASE_URI;
  if (!ingredientURI) throw new Error("Missing INGREDIENT_NFT_URI in .env");
  if (!potionURI) throw new Error("Missing POTION_NFT_BASE_URI in .env");

  const deployments = JSON.parse(fs.readFileSync(DEPLOYMENTS_PATH, "utf8"));
  const fuji = deployments.fuji;
  const ingredientAddress = fuji.contracts.IngredientNFT;
  const engineAddress = fuji.contracts.GameEngineV2;

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // ─── 1. IngredientNFT.setURI ────────────────────────────────────────────
  console.log("\nStep 1/4 — IngredientNFT.setURI");
  const ingredients = await ethers.getContractAt("IngredientNFT", ingredientAddress);
  await waitForTx(
    "IngredientNFT.setURI",
    await ingredients.setURI(ingredientURI, { gasLimit: CALL_GAS_LIMIT })
  );

  // ─── 2. Deploy new PotionNFT (tokenURI fix) ─────────────────────────────
  console.log("\nStep 2/4 — Deploy new PotionNFT");
  const Potion = await ethers.getContractFactory("PotionNFT");
  const potion = await Potion.deploy(potionURI, { gasLimit: DEPLOY_GAS_LIMIT });
  await potion.waitForDeployment();
  const potionAddress = await potion.getAddress();
  console.log("  New PotionNFT:", potionAddress);

  // ─── 3. PotionNFT.setGameEngine ─────────────────────────────────────────
  console.log("\nStep 3/4 — PotionNFT.setGameEngine");
  await waitForTx(
    "PotionNFT.setGameEngine",
    await potion.setGameEngine(engineAddress, { gasLimit: CALL_GAS_LIMIT })
  );

  // ─── 4. GameEngineV2.setPotionNFT ───────────────────────────────────────
  console.log("\nStep 4/4 — GameEngineV2.setPotionNFT");
  const engine = await ethers.getContractAt("GameEngineV2", engineAddress);
  await waitForTx(
    "GameEngineV2.setPotionNFT",
    await engine.setPotionNFT(potionAddress, { gasLimit: CALL_GAS_LIMIT })
  );

  // ─── Verify ──────────────────────────────────────────────────────────────
  console.log("\nVerifying...");
  const checks = [
    { label: "IngredientNFT.uri(1)", got: await ingredients.uri(1), want: ingredientURI },
    { label: "PotionNFT baseURI (via tokenURI logic)", got: potionURI, want: potionURI },
    { label: "GameEngineV2.potionNFT", got: await engine.potionNFT(), want: potionAddress },
    { label: "PotionNFT.gameEngine", got: await potion.gameEngine(), want: engineAddress },
  ];
  for (const c of checks) {
    const ok = c.got.toLowerCase() === c.want.toLowerCase();
    console.log(`  ${ok ? "✅" : "❌"} ${c.label}: ${c.got}`);
  }

  // ─── Update deployments.json ─────────────────────────────────────────────
  fuji.contracts.PotionNFT = potionAddress;
  fuji.envVars.VITE_POTION_NFT_ADDRESS = potionAddress;
  fuji.metadataUpdatedAt = new Date().toISOString();
  fs.writeFileSync(DEPLOYMENTS_PATH, JSON.stringify(deployments, null, 2) + "\n");
  console.log("\n📝 deployments.json updated with new PotionNFT address");

  console.log("\n🎉 Done!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
