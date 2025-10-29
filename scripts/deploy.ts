// All code comments are in English as requested.
import hre from "hardhat";
const { ethers } = hre;
import "dotenv/config";

async function main() {
  console.log("--- Starting Deployment Script ---");

  // --- Constants and User-Provided Values ---
  // These addresses are for the Avalanche Fuji testnet.
  const fujiRecyclingCreditsAddress = "0xe18e887380bD90BCEa276747DaD314DfB06c1f4f"; // Already deployed
  const fujiFunctionsRouterAddress = "0xA9d587a00A31A52Ed70D6026794a8FC5E2F5dCb0";   // Official Chainlink Router
  const donId = ethers.encodeBytes32String("fun-avalanche-fuji-1");                   // Official DON ID for Fuji

  // This value MUST be updated with the Subscription ID you created in the Chainlink UI.
  const subscriptionId = process.env.CHAINLINK_SUBSCRIPTION_ID;
  if (!subscriptionId) {
    throw new Error("CHAINLINK_SUBSCRIPTION_ID not found in .env file. Please add it.");
  }
  console.log(`Using Chainlink Subscription ID: ${subscriptionId}`);

  // --- 1. Deploy VerifierGateway ---
  console.log("\nDeploying VerifierGateway...");
  const VerifierGatewayFactory = await ethers.getContractFactory("VerifierGateway");
  const verifierGateway = await VerifierGatewayFactory.deploy(fujiRecyclingCreditsAddress);
  await verifierGateway.waitForDeployment();
  const verifierGatewayAddress = await verifierGateway.getAddress();
  console.log(`✅ VerifierGateway deployed to: ${verifierGatewayAddress}`);

  // --- 2. Deploy FiscalGateway ---
  console.log("\nDeploying FiscalGateway...");
  const FiscalGatewayFactory = await ethers.getContractFactory("FiscalGateway");
  const fiscalGateway = await FiscalGatewayFactory.deploy(
    fujiFunctionsRouterAddress,
    fujiRecyclingCreditsAddress,
    verifierGatewayAddress, // Use the address of the newly deployed VerifierGateway
    subscriptionId,
    donId
  );
  await fiscalGateway.waitForDeployment();
  const fiscalGatewayAddress = await fiscalGateway.getAddress();
  console.log(`✅ FiscalGateway deployed to: ${fiscalGatewayAddress}`);

  console.log("\n--- Deployment Finished ---");
  console.log("Next steps:");
  console.log("1. Add the FiscalGateway address as a consumer in your Chainlink Subscription.");
  console.log("2. Fund your subscription with LINK tokens.");
  console.log("3. Grant CERTIFIER_ROLE to both gateway addresses on the RecyclingCredits contract.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});