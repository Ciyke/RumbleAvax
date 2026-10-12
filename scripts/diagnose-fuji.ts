import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const Ingredient = await ethers.getContractFactory("IngredientNFT");
  const tx = await Ingredient.getDeployTransaction("");
  console.log("Deploy tx built, data length:", tx.data?.length);

  try {
    const gas = await deployer.estimateGas(tx);
    console.log("estimateGas via signer OK:", gas.toString());
  } catch (e: any) {
    console.log("estimateGas via signer FAILED:", e.shortMessage || e.message);
  }
}

main().catch((e) => {
  console.error("TOP LEVEL:", e.shortMessage || e.message);
  process.exit(1);
});
