import { ethers } from "hardhat";

/**
 * Measures the real gas cost of one complete hunt run (52 transactions) and of
 * the prediction market's lifecycle, then prices both at a range of C-Chain gas
 * prices.
 *
 * Run: npx hardhat run scripts/measure-gas.ts
 *
 * Gas UNITS measured here are exact — they come from actual executed
 * transactions. The AVAX and USD columns are projections: they depend on the
 * base fee at the time and on the AVAX price, neither of which this script can
 * know. Treat the units as fact and the currency columns as illustration.
 */

// C-Chain base fee floor is 1 nAVAX; it rises with congestion.
const GAS_PRICES_NAVAX = [1, 5, 25, 50];
const AVAX_USD = Number(process.env.AVAX_USD || 30);

function fmt(n: bigint | number, width = 10) {
  return Number(n).toLocaleString().padStart(width);
}

async function main() {
  const [deployer, player] = await ethers.getSigners();

  const Ingredient = await ethers.getContractFactory("IngredientNFT");
  const ingredients = await Ingredient.deploy("ipfs://i/");
  await ingredients.waitForDeployment();

  const Potion = await ethers.getContractFactory("PotionNFT");
  const potions = await Potion.deploy("ipfs://p/");
  await potions.waitForDeployment();

  const Engine = await ethers.getContractFactory("GameEngineV2");
  const engine = await Engine.deploy(
    await ingredients.getAddress(),
    await potions.getAddress(),
    0
  );
  await engine.waitForDeployment();

  await ingredients.setGameEngine(await engine.getAddress());
  await potions.setGameEngine(await engine.getAddress());

  console.log("=".repeat(72));
  console.log("  HUNT RUN — measured gas (25 boxes, 52 transactions)");
  console.log("=".repeat(72));

  // ── Deployment cost ───────────────────────────────────────────────────────
  let deployTotal = 0n;
  for (const [label, c] of [
    ["IngredientNFT", ingredients],
    ["PotionNFT", potions],
    ["GameEngineV2", engine],
  ] as const) {
    const tx = c.deploymentTransaction();
    const rc = await ethers.provider.getTransactionReceipt(tx!.hash);
    deployTotal += rc!.gasUsed;
    console.log(`  deploy ${label.padEnd(16)} ${fmt(rc!.gasUsed)}`);
  }

  // ── One full run ──────────────────────────────────────────────────────────
  const e = engine.connect(player);

  const beginRc = await (await e.beginHunt()).wait();
  const beginGas = beginRc!.gasUsed;

  let openTotal = 0n;
  let closeTotal = 0n;
  let openMin = 0n;
  let openMax = 0n;

  for (let i = 0; i < 25; i++) {
    const openRc = await (await e.openBox(i)).wait();
    const closeRc = await (await e.closeBox(i)).wait();
    openTotal += openRc!.gasUsed;
    closeTotal += closeRc!.gasUsed;
    if (i === 0 || openRc!.gasUsed < openMin) openMin = openRc!.gasUsed;
    if (openRc!.gasUsed > openMax) openMax = openRc!.gasUsed;
  }

  const potionRc = await (await e.createPotion()).wait();
  const potionGas = potionRc!.gasUsed;

  const runTotal = beginGas + openTotal + closeTotal + potionGas;

  console.log("");
  console.log(`  beginHunt              ${fmt(beginGas)}`);
  console.log(`  openBox  x25           ${fmt(openTotal)}   (avg ${fmt(openTotal / 25n, 1)}, range ${openMin}-${openMax})`);
  console.log(`  closeBox x25           ${fmt(closeTotal)}   (avg ${fmt(closeTotal / 25n, 1)})`);
  console.log(`  createPotion           ${fmt(potionGas)}`);
  console.log(`  ${"-".repeat(40)}`);
  console.log(`  TOTAL PER RUN          ${fmt(runTotal)}`);

  // ── A second run, to show the warm-storage difference ─────────────────────
  const begin2 = await (await e.beginHunt()).wait();
  console.log(`\n  beginHunt (2nd run)    ${fmt(begin2!.gasUsed)}   — leftover burn makes this vary`);

  // ── Pricing ───────────────────────────────────────────────────────────────
  console.log("");
  console.log("=".repeat(72));
  console.log("  COST PER RUN, BY GAS PRICE");
  console.log("=".repeat(72));
  console.log(`  ${"gas price".padEnd(14)}${"AVAX".padStart(14)}${`USD @ $${AVAX_USD}`.padStart(14)}`);
  for (const gwei of GAS_PRICES_NAVAX) {
    const wei = runTotal * BigInt(gwei) * 10n ** 9n;
    const avax = Number(ethers.formatEther(wei));
    console.log(
      `  ${`${gwei} nAVAX`.padEnd(14)}${avax.toFixed(6).padStart(14)}${("$" + (avax * AVAX_USD).toFixed(4)).padStart(14)}`
    );
  }

  console.log("");
  console.log("  Players pay this themselves — there is no session key and the");
  console.log("  contract never forwards gas, so unlimited runs cost the operator");
  console.log("  nothing.");

  // ── Prediction market ─────────────────────────────────────────────────────
  console.log("");
  console.log("=".repeat(72));
  console.log("  PREDICTION MARKET — measured gas");
  console.log("=".repeat(72));

  const Market = await ethers.getContractFactory("PredictionMarket");
  const market = await Market.deploy(deployer.address, deployer.address, 300);
  await market.waitForDeployment();

  const mDeployRc = await ethers.provider.getTransactionReceipt(
    market.deploymentTransaction()!.hash
  );
  console.log(`  deploy PredictionMarket ${fmt(mDeployRc!.gasUsed)}`);

  const now = (await ethers.provider.getBlock("latest"))!.timestamp;
  const createRc = await (await market.createMarket(ethers.ZeroAddress, now + 3600, now + 90000)).wait();
  const id = await market.marketCount();

  const bet1 = await (await market.connect(player).bet(id, 0, 0, { value: ethers.parseEther("1") })).wait();
  const bet2 = await (await market.connect(deployer).bet(id, 1, 0, { value: ethers.parseEther("1") })).wait();

  await ethers.provider.send("evm_increaseTime", [3700]);
  await ethers.provider.send("evm_mine", []);

  const resolveRc = await (await market.resolve(id, 0)).wait();
  const claimRc = await (await market.connect(player).claim(id)).wait();
  const rakeRc = await (await market.withdrawRake(id)).wait();

  console.log(`  createMarket            ${fmt(createRc!.gasUsed)}`);
  console.log(`  bet (first on a side)   ${fmt(bet1!.gasUsed)}`);
  console.log(`  bet (second side)       ${fmt(bet2!.gasUsed)}`);
  console.log(`  resolve                 ${fmt(resolveRc!.gasUsed)}`);
  console.log(`  claim                   ${fmt(claimRc!.gasUsed)}`);
  console.log(`  withdrawRake            ${fmt(rakeRc!.gasUsed)}`);

  const betWei = bet1!.gasUsed * 25n * 10n ** 9n;
  console.log(
    `\n  A bet at 25 nAVAX costs the bettor ~${Number(ethers.formatEther(betWei)).toFixed(6)} AVAX in gas.`
  );

  console.log("");
  console.log("=".repeat(72));
  console.log(`  Total deployment gas (all 5 contracts): ${fmt(deployTotal + mDeployRc!.gasUsed)}`);
  for (const gwei of GAS_PRICES_NAVAX) {
    const wei = (deployTotal + mDeployRc!.gasUsed) * BigInt(gwei) * 10n ** 9n;
    const avax = Number(ethers.formatEther(wei));
    console.log(
      `    at ${String(gwei).padStart(2)} nAVAX: ${avax.toFixed(6)} AVAX  (~$${(avax * AVAX_USD).toFixed(2)})`
    );
  }
  console.log("=".repeat(72));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
