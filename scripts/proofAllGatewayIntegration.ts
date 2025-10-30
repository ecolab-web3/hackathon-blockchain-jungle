import hre from "hardhat";
const { ethers } = hre;
import { setBalance, impersonateAccount } from "@nomicfoundation/hardhat-network-helpers";

async function createSignature(signer, owner, materialType, weightKg, location, proofHash, nonce) {
    const messageHash = ethers.solidityPackedKeccak256(
        ["address", "string", "uint256", "string", "bytes32", "bytes32"],
        [owner, materialType, weightKg, location, proofHash, nonce]
    );
    return await signer.signMessage(ethers.getBytes(messageHash));
}

async function main() {
  console.log("--- Starting Full End-to-End Fork Integration Script ---");
  
  // --- Constants ---
  const fujiRecyclingCreditsAddress = ethers.getAddress("0xe18e887380bD90BCEa276747DaD314DfB06c1f4f");
  const fujiFunctionsRouterAddress = ethers.getAddress("0xA9d587a00A31A52Ed70D6026794a8FC5E2F5dCb0");
  const deployedContractAdmin = "0x55789aE9B3C952D1f3b748F8c506e60028d11Dd2";
  const CERTIFIER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("CERTIFIER_ROLE"));
  const VERIFIER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("VERIFIER_ROLE"));
  const subId = 1, countryCodeBR = ethers.keccak256(ethers.toUtf8Bytes("BR")), jsSource = "s";
  const donId = ethers.encodeBytes32String("fun-avalanche-fuji-1");

  // --- 1. Setup Phase ---
  console.log("\nStep 1: Setting up accounts and contracts...");
  const [owner, verifier, recipient] = await ethers.getSigners();
  const recyclingCredits = await ethers.getContractAt("RecyclingCredits", fujiRecyclingCreditsAddress);
  
  const VerifierGatewayFactory = await ethers.getContractFactory("VerifierGateway");
  const verifierGateway = await VerifierGatewayFactory.deploy(fujiRecyclingCreditsAddress);
  await verifierGateway.waitForDeployment();
  
  const FiscalGatewayFactory = await ethers.getContractFactory("FiscalGateway");
  const fiscalGateway = await FiscalGatewayFactory.deploy(
      fujiFunctionsRouterAddress, fujiRecyclingCreditsAddress, await verifierGateway.getAddress(), subId, donId
  );
  await fiscalGateway.waitForDeployment();
  console.log("All gateways deployed.");

  // --- 2. Permissions Phase ---
  console.log("\nStep 2: Setting up permissions...");
  await impersonateAccount(deployedContractAdmin);
  await setBalance(deployedContractAdmin, ethers.parseEther("10.0"));
  const adminSigner = await ethers.getSigner(deployedContractAdmin);
  await recyclingCredits.connect(adminSigner).grantRole(CERTIFIER_ROLE, await fiscalGateway.getAddress());
  await recyclingCredits.connect(adminSigner).grantRole(CERTIFIER_ROLE, await verifierGateway.getAddress());
  await verifierGateway.connect(owner).grantRole(VERIFIER_ROLE, await verifier.getAddress());
  await fiscalGateway.connect(owner).setCountryConfig(countryCodeBR, jsSource);
  console.log("All permissions granted.");

  // --- TEST CASE 1: AUTOMATED SUCCESS FLOW ---
  console.log("\n--- Starting Test Case 1: Automated Success Flow ---");
  const docIdSuccess = "52240118404513000123550010000000201442920211";
  const requestIdSuccess = ethers.id("test-request-success");
  await fiscalGateway.connect(owner).addPendingRequest(requestIdSuccess, await recipient.getAddress(), docIdSuccess);
  
  const routerSigner = await ethers.getSigner(fujiFunctionsRouterAddress);
  await impersonateAccount(fujiFunctionsRouterAddress);
  await setBalance(fujiFunctionsRouterAddress, ethers.parseEther("10.0"));
  
  const materialSuccess = "VIDRO", weightSuccess = 34950, locationSuccess = "Alto Paraiso de Goias";
  const proofHashSuccess = ethers.id(docIdSuccess);
  const encodedResponseSuccess = ethers.AbiCoder.defaultAbiCoder().encode(
      ["string", "uint256", "string", "bytes32"],
      [materialSuccess, weightSuccess, locationSuccess, proofHashSuccess]
  );
  
  const txSuccess = await fiscalGateway.connect(routerSigner).handleOracleFulfillment(requestIdSuccess, encodedResponseSuccess, "0x");
  const receiptSuccess = await txSuccess.wait();
  
  console.log("1c: Verifying result...");
  // Find the event directly within the transaction receipt's logs.
  const creditsInterface = recyclingCredits.interface;
  const successEvent = receiptSuccess.logs
    .map(log => { try { return creditsInterface.parseLog(log); } catch { return null; } })
    .find(parsedLog => parsedLog?.name === "CreditMinted");
  if (!successEvent) throw new Error("Test Case 1 FAILED: CreditMinted event not found.");
  
  const mintedTokenIdSuccess = successEvent.args.tokenId;
  const ownerSuccess = await recyclingCredits.ownerOf(mintedTokenIdSuccess);
  if (ownerSuccess !== await recipient.getAddress()) throw new Error("Test Case 1 FAILED: Incorrect owner.");
  console.log(`- OK: NFT ${mintedTokenIdSuccess} minted to correct owner.`);
  console.log("--- Test Case 1: PASSED ---");

  // --- TEST CASE 2: MANUAL FALLBACK FLOW ---
  console.log("\n--- Starting Test Case 2: Manual Fallback and Recovery Flow ---");
  const docIdManual = "52231118404513000123550010000000181181665712";
  const requestIdManual = ethers.id("test-request-manual");
  await fiscalGateway.connect(owner).addPendingRequest(requestIdManual, await recipient.getAddress(), docIdManual);
  
  const encodedResponseManual = ethers.AbiCoder.defaultAbiCoder().encode(["string", "uint256", "string", "bytes32"], ["", 0, "", ethers.ZeroHash]);
  await fiscalGateway.connect(routerSigner).handleOracleFulfillment(requestIdManual, encodedResponseManual, "0x");
  console.log("2a: Inconsistent NFe successfully added to the on-chain manual queue.");

  const correctedMaterial = "VIDRO", correctedWeight = 53180, locationManual = "Alto Paraiso de Goias";
  const proofHashManual = ethers.id(docIdManual), nonce = ethers.randomBytes(32);
  const signature = await createSignature(verifier, await recipient.getAddress(), correctedMaterial, correctedWeight, locationManual, proofHashManual, nonce);
  
  const txManual = await fiscalGateway.connect(owner).processManualVerificationWithSignature(
    requestIdManual, correctedMaterial, correctedWeight, locationManual, proofHashManual, nonce, signature
  );
  const receiptManual = await txManual.wait();
  console.log("2c: Manual approval transaction successful.");
  
  console.log("2d: Verifying result...");
  // Find the event directly within this transaction's receipt logs.
  const manualEvent = receiptManual.logs
    .map(log => { try { return creditsInterface.parseLog(log); } catch { return null; } })
    .find(parsedLog => parsedLog?.name === "CreditMinted");
  if (!manualEvent) throw new Error("Test Case 2 FAILED: CreditMinted event not found.");
  
  const mintedTokenIdManual = manualEvent.args.tokenId;
  const ownerManual = await recyclingCredits.ownerOf(mintedTokenIdManual);
  if (ownerManual !== await recipient.getAddress()) throw new Error("Test Case 2 FAILED: Incorrect owner.");
  console.log(`- OK: NFT ${mintedTokenIdManual} minted to correct owner.`);

  console.log("\n--- ✅ FiscalGateway Fork Integration Script finished successfully! ---");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});