// All code comments are in English as requested.
import hre from "hardhat";
const { ethers } = hre;
import { setBalance, impersonateAccount } from "@nomicfoundation/hardhat-network-helpers";

/**
 * @dev Helper function to create a valid signature.
 * This must match the logic used in the VerifierGateway unit tests.
 */
async function createSignature(signer, owner, materialType, weightKg, location, proofHash, nonce) {
    const messageHash = ethers.solidityPackedKeccak256(
        ["address", "string", "uint256", "string", "bytes32", "bytes32"],
        [owner, materialType, weightKg, location, proofHash, nonce]
    );
    return await signer.signMessage(ethers.getBytes(messageHash));
}

async function main() {
  console.log("--- Starting VerifierGateway Fork Integration Script ---");

  // --- Constants ---
  const fujiRecyclingCreditsAddress = ethers.getAddress("0xe18e887380bD90BCEa276747DaD314DfB06c1f4f");
  const deployedContractAdmin = "0x55789aE9B3C952D1f3b748F8c506e60028d11Dd2";
  const CERTIFIER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("CERTIFIER_ROLE"));
  const VERIFIER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("VERIFIER_ROLE"));

  // --- 1. Setup Phase ---
  console.log("Step 1: Setting up accounts and contracts...");
  const [owner, verifier, recipient] = await ethers.getSigners();
  const recyclingCredits = await ethers.getContractAt("RecyclingCredits", fujiRecyclingCreditsAddress);
  
  const GatewayFactory = await ethers.getContractFactory("VerifierGateway");
  const verifierGateway = await GatewayFactory.deploy(fujiRecyclingCreditsAddress);
  await verifierGateway.waitForDeployment();
  console.log(`VerifierGateway deployed to (local fork): ${await verifierGateway.getAddress()}`);

  // --- 2. Permissions Phase ---
  console.log("Step 2: Setting up permissions...");
  // 2a. Grant CERTIFIER_ROLE to the VerifierGateway on the main contract
  await impersonateAccount(deployedContractAdmin);
  await setBalance(deployedContractAdmin, ethers.parseEther("10.0"));
  const adminSigner = await ethers.getSigner(deployedContractAdmin);
  await recyclingCredits.connect(adminSigner).grantRole(CERTIFIER_ROLE, await verifierGateway.getAddress());
  console.log("CERTIFIER_ROLE granted to VerifierGateway.");
  
  // 2b. Grant VERIFIER_ROLE to our test 'verifier' account on the VerifierGateway
  await verifierGateway.connect(owner).grantRole(VERIFIER_ROLE, await verifier.getAddress());
  console.log(`VERIFIER_ROLE granted to account: ${await verifier.getAddress()}`);

  // --- 3. Execution Phase ---
  console.log("Step 3: Simulating off-chain signing and calling mintWithSignature...");
  const materialType = "SUCATA METALICA";
  const weightKg = 27980;
  const location = "Alto Paraiso de Goias";
  const proofHash = ethers.id("NFe-key-000013"); // Using NFe #13 as an example
  const nonce = ethers.randomBytes(32);
  const recipientAddress = await recipient.getAddress();

  // The 'verifier' account signs the data off-chain
  const signature = await createSignature(verifier, recipientAddress, materialType, weightKg, location, proofHash, nonce);
  console.log("Signature created by the verifier.");

  // Any account can submit the transaction with the valid signature
  const tx = await verifierGateway.connect(recipient).mintWithSignature(
    recipientAddress,
    materialType,
    weightKg,
    location,
    proofHash,
    nonce,
    signature
  );
  const receipt = await tx.wait();
  console.log("mintWithSignature transaction successful.");

  // --- 4. Verification Phase ---
  console.log("Step 4: Verifying the result on the Fuji contract...");
  const creditsInterface = recyclingCredits.interface;
  const creditMintedEvent = receipt.logs
    .map(log => { try { return creditsInterface.parseLog(log); } catch { return null; } })
    .find(parsedLog => parsedLog?.name === "CreditMinted");
  
  if (!creditMintedEvent) {
    throw new Error("CreditMinted event not found!");
  }
  
  const mintedTokenId = creditMintedEvent.args.tokenId;
  console.log(`NFT with tokenId ${mintedTokenId} was minted.`);

  const newOwner = await recyclingCredits.ownerOf(mintedTokenId);
  if (newOwner !== recipientAddress) {
    throw new Error(`Incorrect owner! Expected ${recipientAddress}, but got ${newOwner}`);
  }
  console.log(`Verified owner: ${newOwner}`);
  
  const details = await recyclingCredits.creditDetails(mintedTokenId);
  if (details.weightKg !== BigInt(weightKg)) {
      throw new Error(`Incorrect weight! Expected ${weightKg}, but got ${details.weightKg}`);
  }
  console.log(`Verified weight: ${details.weightKg} kg`);

  console.log("\n--- ✅ VerifierGateway Fork Integration Script finished successfully! ---");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});