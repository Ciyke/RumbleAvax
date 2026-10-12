/**
 * Uploads the ingredient + potion images to Pinata and prints the CID.
 * Run this BEFORE writing metadata JSON, since the JSON "image" fields
 * point at ipfs://<this CID>/<file>.jpg.
 *
 * Usage:
 *   npx ts-node scripts/upload-images-pinata.ts
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

const IMAGES_DIR = path.join(__dirname, "..", "metadata", "images");

async function main() {
  const pinata = new PinataSDK({ pinataJWTKey: PINATA_JWT });

  console.log("Uploading images folder to Pinata...");

  const result = await pinata.pinFromFS(IMAGES_DIR, {
    pinataMetadata: { name: "RumbleAvax-Ingredient-Potion-Images" },
    pinataOptions: { wrapWithDirectory: false },
  });

  const cid = result.IpfsHash;
  console.log("\n✅ Upload successful!");
  console.log("IPFS CID:", cid);
  console.log("\nAdd to .env before writing metadata JSON:");
  console.log(`  IMAGE_CID=${cid}`);
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
