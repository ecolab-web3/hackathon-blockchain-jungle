import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("VerifierGateway <-> RecyclingCredits Integration", function () {
  
  let gatewayContract;
  let creditsContract;
  let admin;
  let verifier;
  let recipient;
  let unauthorizedUser;

  const VERIFIER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("VERIFIER_ROLE"));
  const CERTIFIER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("CERTIFIER_ROLE"));

  beforeEach(async function () {
    [admin, verifier, recipient, unauthorizedUser] = await ethers.getSigners();

    const CreditsFactory = await ethers.getContractFactory("RecyclingCredits");
    creditsContract = await CreditsFactory.deploy(await admin.getAddress());
    await creditsContract.waitForDeployment();

    const VerifierGatewayFactory = await ethers.getContractFactory("VerifierGateway");
    gatewayContract = await VerifierGatewayFactory.deploy(await creditsContract.getAddress());
    await gatewayContract.waitForDeployment();
  });

  async function createSignature(
    signer,
    owner,
    materialType,
    weightKg,
    location,
    proofHash,
    nonce
  ) {
    const messageHash = ethers.solidityPackedKeccak256(
        ["address", "string", "uint256", "string", "bytes32", "bytes32"],
        [owner, materialType, weightKg, location, proofHash, nonce]
    );
    return await signer.signMessage(ethers.getBytes(messageHash));
  }
  
  describe("Constructor", function () {
    it("Should revert if deployed with a zero address for the credits contract", async function () {
        const VerifierGatewayFactory = await ethers.getContractFactory("VerifierGateway");
        
        await expect(
            VerifierGatewayFactory.deploy(ethers.ZeroAddress)
        ).to.be.revertedWith("Gateway: Invalid RWA contract address");
    });
  });

  describe("mintWithSignature Full Flow", function () {
    const materialType = "Cardboard";
    const weightKg = 500;
    const location = "Warehouse C";
    const proofHash = ethers.id("some-invoice-data-123");
    
    beforeEach(async function() {
        await gatewayContract.connect(admin).grantRole(VERIFIER_ROLE, await verifier.getAddress());
        await creditsContract.connect(admin).grantRole(CERTIFIER_ROLE, await gatewayContract.getAddress());
    });

    it("Should successfully mint a credit on the main contract via the gateway", async function () {
      const nonce = ethers.randomBytes(32);
      const recipientAddress = await recipient.getAddress();
      const signature = await createSignature(verifier, recipientAddress, materialType, weightKg, location, proofHash, nonce);
      
      const expectedTokenId = 0;

      const tx = gatewayContract.connect(unauthorizedUser)
        .mintWithSignature(recipientAddress, materialType, weightKg, location, proofHash, nonce, signature);

      await expect(tx)
        .to.emit(creditsContract, "CreditMinted")
        .withArgs(expectedTokenId, recipientAddress, materialType, weightKg, proofHash);

      expect(await creditsContract.ownerOf(expectedTokenId)).to.equal(recipientAddress);
    });

    it("Should revert if the gateway contract does not have CERTIFIER_ROLE", async function() {
        const gatewayAddress = await gatewayContract.getAddress();
        await creditsContract.connect(admin).revokeRole(CERTIFIER_ROLE, gatewayAddress);
        
        const nonce = ethers.randomBytes(32);
        const recipientAddress = await recipient.getAddress();
        const signature = await createSignature(verifier, recipientAddress, materialType, weightKg, location, proofHash, nonce);

        await expect(
            gatewayContract.mintWithSignature(recipientAddress, materialType, weightKg, location, proofHash, nonce, signature)
        )
        .to.be.revertedWithCustomError(creditsContract, 'AccessControlUnauthorizedAccount')
        .withArgs(gatewayAddress, CERTIFIER_ROLE);
    });

    it("Should revert if the signer does not have the VERIFIER_ROLE", async function () {
        const nonce = ethers.randomBytes(32);
        const recipientAddress = await recipient.getAddress();
        
        const signature = await createSignature(unauthorizedUser, recipientAddress, materialType, weightKg, location, proofHash, nonce);
        
        await expect(
            gatewayContract.mintWithSignature(recipientAddress, materialType, weightKg, location, proofHash, nonce, signature)
        ).to.be.revertedWith("Gateway: Signer is not an authorized verifier");
    });

    it("Should revert if the nonce has already been used (replay attack)", async function () {
        const nonce = ethers.randomBytes(32);
        const recipientAddress = await recipient.getAddress();
        const signature = await createSignature(verifier, recipientAddress, materialType, weightKg, location, proofHash, nonce);
        
        await gatewayContract.mintWithSignature(recipientAddress, materialType, weightKg, location, proofHash, nonce, signature);
                
        await expect(
            gatewayContract.mintWithSignature(recipientAddress, materialType, weightKg, location, proofHash, nonce, signature)
        ).to.be.revertedWith("Gateway: Signature nonce has already been used");
    });

    it("Should revert if the signature is cryptographically invalid", async function () {
        const nonce = ethers.randomBytes(32);
        const recipientAddress = await recipient.getAddress();
        
        const invalidSignature = ethers.randomBytes(64);
        
        await expect(
            gatewayContract.mintWithSignature(recipientAddress, materialType, weightKg, location, proofHash, nonce, invalidSignature)
        ).to.be.revertedWithCustomError(gatewayContract, "ECDSAInvalidSignatureLength");
    });
  });
});