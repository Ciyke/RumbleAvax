/**
 * Uploads the ingredient and potion metadata folders to Pinata and prints
 * the CIDs. Run AFTER upload-images-pinata.ts (metadata JSON already
 * references that image CID).
 *
 * Usage:
 *   npx ts-node scripts/upload-metadata-pinata.ts
 *
 * Env vars needed in .env:
 *   PINATA_JWT=<your Pinata JWT token>
 */

import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config();

const PinataSDK = require("@pinata/sdk");

const PINATA_JWT = process.env.PINATA_JWT;
if (!PINATA_JWT) {
  console.error("Missing PINATA_JWT in .env");
  process.exit(1);
}

const INGREDIENTS_DIR = path.join(__dirname, "..", "metadata", "ingredients");
const POTION_DIR = path.join(__dirname, "..", "metadata", "potion");

async function main() {
  const pinata = new PinataSDK({ pinataJWTKey: PINATA_JWT });

  console.log("Uploading ingredient metadata folder to Pinata...");
  const ingredientResult = await pinata.pinFromFS(INGREDIENTS_DIR, {
    pinataMetadata: { name: "RumbleAvax-IngredientNFT-Metadata" },
    pinataOptions: { wrapWithDirectory: false },
  });
  const ingredientCid = ingredientResult.IpfsHash;
  console.log("Ingredient metadata CID:", ingredientCid);

  console.log("\nUploading potion metadata folder to Pinata...");
  const potionResult = await pinata.pinFromFS(POTION_DIR, {
    pinataMetadata: { name: "RumbleAvax-PotionNFT-Metadata" },
    pinataOptions: { wrapWithDirectory: false },
  });
  const potionCid = potionResult.IpfsHash;
  console.log("Potion metadata CID:", potionCid);

  console.log("\n✅ Upload successful!");
  console.log("\nURIs to set:");
  console.log(`  INGREDIENT_NFT_URI=ipfs://${ingredientCid}/{id}.json`);
  console.log(`  POTION_NFT_BASE_URI=ipfs://${potionCid}/potion.json`);
  console.log("\nNext: add to .env and run set-metadata-uris.ts");
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
