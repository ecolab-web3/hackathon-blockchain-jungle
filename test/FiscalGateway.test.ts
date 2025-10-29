import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("FiscalGateway", function () {
  
  // --- Contracts and Accounts ---
  let gateway;
  let mockCredits;
  let oracleSimulator;
  let verifierGateway;
  let owner;
  let verifier;
  let user;

  // --- Constants ---
  const CERTIFIER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("CERTIFIER_ROLE"));
  const VERIFIER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("VERIFIER_ROLE"));
  const subId = 1;
  const countryCodeBR = ethers.keccak256(ethers.toUtf8Bytes("BR"));
  const countryCodeMX = ethers.keccak256(ethers.toUtf8Bytes("MX"));
  const jsSource = "source";
  const donId = ethers.encodeBytes32String("test-don-id");

  async function createSignature(signer, owner, materialType, weightKg, location, proofHash, nonce) {
    const messageHash = ethers.solidityPackedKeccak256(
        ["address", "string", "uint256", "string", "bytes32", "bytes32"],
        [owner, materialType, weightKg, location, proofHash, nonce]
    );
    return await signer.signMessage(ethers.getBytes(messageHash));
  }

  beforeEach(async function () {
    [owner, verifier, user] = await ethers.getSigners();

    // Deploy Mocks and Dependencies
    const OracleSimulatorFactory = await ethers.getContractFactory("OracleSimulator");
    oracleSimulator = await OracleSimulatorFactory.deploy();
    
    const MockCreditsFactory = await ethers.getContractFactory("MockRecyclingCredits");
    mockCredits = await MockCreditsFactory.deploy();

    const VerifierGatewayFactory = await ethers.getContractFactory("VerifierGateway");
    verifierGateway = await VerifierGatewayFactory.deploy(await mockCredits.getAddress());
    
    // Deploy the FiscalGateway, using the OracleSimulator's address as the router.
    const GatewayFactory = await ethers.getContractFactory("FiscalGateway");
    gateway = await GatewayFactory.deploy(
        await oracleSimulator.getAddress(), // Correct address
        await mockCredits.getAddress(),
        await verifierGateway.getAddress(),
        subId,
        donId
    );

    // Grant required roles.
    await mockCredits.connect(owner).grantRole(CERTIFIER_ROLE, await gateway.getAddress());
    await mockCredits.connect(owner).grantRole(CERTIFIER_ROLE, await verifierGateway.getAddress());
  });

  describe("Deployment", function () {
    it("Should set the correct initial state", async function () { /* ... */ });
  });

  // Find this describe block and replace its entire content.
  describe("Admin Functions (Centralized Management)", function () {
    it("Should allow the owner to set a country config", async function () {
        await expect(gateway.connect(owner).setCountryConfig(countryCodeBR, jsSource))
            .to.emit(gateway, "CountryConfigSet")
            .withArgs(countryCodeBR, jsSource);
    });

    // Covers the failure branch for setCountryConfig.
    it("Should prevent non-owners from setting a country config", async function () {
        await expect(
            gateway.connect(user).setCountryConfig(countryCodeBR, jsSource)
        ).to.be.revertedWithCustomError(gateway, "OwnableUnauthorizedAccount");
    });

    // Covers both branches for setSubscriptionId.
    describe("setSubscriptionId", function () {
        it("Should allow the owner to set a new subscription ID", async function () {
            const newSubId = 999;
            await gateway.connect(owner).setSubscriptionId(newSubId);
            expect(await gateway.subscriptionId()).to.equal(newSubId);
        });
        
        it("Should prevent non-owners from setting a new subscription ID", async function () {
            await expect(
                gateway.connect(user).setSubscriptionId(999)
            ).to.be.revertedWithCustomError(gateway, "OwnableUnauthorizedAccount");
        });
    });

    // Covers both branches for setVerifierGatewayAddress.
    describe("setVerifierGatewayAddress", function () {
        it("Should allow the owner to set a new verifier gateway address", async function () {
            const newAddress = ethers.Wallet.createRandom().address;
            await gateway.connect(owner).setVerifierGatewayAddress(newAddress);
            expect(await gateway.verifierGateway()).to.equal(newAddress);
        });
        
        it("Should prevent non-owners from setting a new verifier gateway address", async function () {
            const newAddress = ethers.Wallet.createRandom().address;
            await expect(
                gateway.connect(user).setVerifierGatewayAddress(newAddress)
            ).to.be.revertedWithCustomError(gateway, "OwnableUnauthorizedAccount");
        });
    });
  });

  describe("Request and Callback Flow", function () {
    beforeEach(async function() {
        // Configure Brazil as a supported country for these tests
        await gateway.connect(owner).setCountryConfig(countryCodeBR, jsSource);
    });

    // Covers the failure branch for requestMinting's isSupported check.
    it("Should revert when requesting for an unsupported country", async function () {
        await expect(
            gateway.connect(user).requestMinting(countryCodeMX, "doc-id-123", await user.getAddress())
        ).to.be.revertedWith("Country not supported");
    });

    it("Should successfully mint automatically when data is consistent", async function () {
        const tx = await gateway.connect(user).requestMinting(countryCodeBR, "NFe-key-456", await user.getAddress());
        const receipt = await tx.wait();
        // The event comes from the OracleSimulator, which is acting as the router.
        const simulatorAddress = await oracleSimulator.getAddress();
        const simulatorEvent = oracleSimulator.interface.parseLog(receipt.logs.find(log => log.address === simulatorAddress));
        const requestId = simulatorEvent.args.requestId;

        const materialType = "Aluminum", weightKg = 1500;
        const encodedResponse = ethers.AbiCoder.defaultAbiCoder().encode(
            ["string", "uint256", "string", "bytes32"],
            [materialType, weightKg, "Coop A", ethers.id("NFe-key-456")]
        );
        
        await expect(
            oracleSimulator.simulateCallback(await gateway.getAddress(), requestId, encodedResponse, "0x")
        ).to.emit(mockCredits, "CreditMinted").withArgs(await user.getAddress(), materialType, weightKg);
    });
    
    it("Should create a manual verification request when data is inconsistent (weight is 0)", async function() {
        const tx = await gateway.connect(user).requestMinting(countryCodeBR, "NFe-key-INCONSISTENT", await user.getAddress());
        const receipt = await tx.wait();
        const simulatorAddress = await oracleSimulator.getAddress();
        const simulatorEvent = oracleSimulator.interface.parseLog(receipt.logs.find(log => log.address === simulatorAddress));
        const requestId = simulatorEvent.args.requestId;

        const encodedResponse = ethers.AbiCoder.defaultAbiCoder().encode(
            ["string", "uint256", "string", "bytes32"],
            ["UNKNOWN", 0, "Location", ethers.id("NFe-key-INCONSISTENT")]
        );

        await expect(
            oracleSimulator.simulateCallback(await gateway.getAddress(), requestId, encodedResponse, "0x")
        ).to.emit(gateway, "ManualVerificationRequired");
    });

    // Covers the 'if (err.length > 0)' branch in fulfillRequest.
    it("Should correctly handle a failed fulfillment (error from oracle)", async function () {
        const tx = await gateway.connect(user).requestMinting(countryCodeBR, "NFe-key-789", await user.getAddress());
        const receipt = await tx.wait();
        const simulatorAddress = await oracleSimulator.getAddress();
        const simulatorEvent = oracleSimulator.interface.parseLog(receipt.logs.find(log => log.address === simulatorAddress));
        const requestId = simulatorEvent.args.requestId;

        const errorBytes = ethers.toUtf8Bytes("API returned status 500");

        await expect(
            oracleSimulator.simulateCallback(await gateway.getAddress(), requestId, "0x", errorBytes)
        ).to.emit(gateway, "RequestFailed").withArgs(requestId, errorBytes);

        expect(await gateway.lastError()).to.equal(ethers.hexlify(errorBytes));
    });
  });

  describe("Manual Verification Flow (with VerifierGateway Integration)", function () {
    let pendingRequestId, recipient;

    beforeEach(async function() {
        recipient = user;
        await verifierGateway.connect(owner).grantRole(VERIFIER_ROLE, await verifier.getAddress());
        await gateway.connect(owner).setCountryConfig(countryCodeBR, jsSource);
        const tx = await gateway.connect(recipient).requestMinting(countryCodeBR, "NFe-key-MANUAL", await recipient.getAddress());
        const receipt = await tx.wait();
        const simulatorAddress = await oracleSimulator.getAddress();
        const simulatorEvent = oracleSimulator.interface.parseLog(receipt.logs.find(log => log.address === simulatorAddress));
        pendingRequestId = simulatorEvent.args.requestId;
        
        const encodedResponse = ethers.AbiCoder.defaultAbiCoder().encode(["string", "uint256", "string", "bytes32"], ["", 0, "", ethers.ZeroHash]);
        await oracleSimulator.simulateCallback(await gateway.getAddress(), pendingRequestId, encodedResponse, "0x");
    });

    it("Should allow owner to process a request with a valid verifier signature", async function() {
        const correctedMaterial = "Glass";
        const correctedWeight = 750;
        const location = "Coop C";
        const proofHash = ethers.id("NFe-key-MANUAL");
        const nonce = ethers.randomBytes(32);

        // The verifier signs the corrected data
        const signature = await createSignature(verifier, await recipient.getAddress(), correctedMaterial, correctedWeight, location, proofHash, nonce);

        const tx = gateway.connect(owner).processManualVerificationWithSignature(
            pendingRequestId, correctedMaterial, correctedWeight, location, proofHash, nonce, signature
        );

        // Assert that the final 'CreditMinted' event was emitted from the main contract
        await expect(tx)
            .to.emit(mockCredits, "CreditMinted")
            .withArgs(await recipient.getAddress(), correctedMaterial, correctedWeight);
        
        // Assert that the FiscalGateway's 'ManualVerificationCompleted' event was emitted
        await expect(tx)
            .to.emit(gateway, "ManualVerificationCompleted")
            .withArgs(pendingRequestId, await owner.getAddress());

        const manualRequest = await gateway.getManualRequestDetails(pendingRequestId);
        expect(manualRequest.status).to.equal(2); // Enum Status.Completed
    });

    it("Should prevent non-owners from processing a manual request", async function() {
        await expect(
            gateway.connect(user).processManualVerificationWithSignature(pendingRequestId, "G", 1, "L", ethers.ZeroHash, ethers.ZeroHash, "0x")
        ).to.be.revertedWithCustomError(gateway, "OwnableUnauthorizedAccount");
    });
    
    it("Should prevent processing a request that is not pending", async function() {
        const nonce = ethers.randomBytes(32);
        const signature = await createSignature(verifier, await recipient.getAddress(), "G", 1, "L", ethers.ZeroHash, nonce);
        await gateway.connect(owner).processManualVerificationWithSignature(pendingRequestId, "G", 1, "L", ethers.ZeroHash, nonce, signature);

        const newNonce = ethers.randomBytes(32);
        const newSignature = await createSignature(verifier, await recipient.getAddress(), "G", 1, "L", ethers.ZeroHash, newNonce);
        await expect(
            gateway.connect(owner).processManualVerificationWithSignature(pendingRequestId, "G", 1, "L", ethers.ZeroHash, newNonce, newSignature)
        ).to.be.revertedWith("Request is not pending review");
    });
    
     it("Should prevent processing with a corrected weight of zero", async function() {
        const nonce = ethers.randomBytes(32);
        const signature = await createSignature(verifier, await recipient.getAddress(), "G", 0, "L", ethers.ZeroHash, nonce);
        await expect(
            gateway.connect(owner).processManualVerificationWithSignature(pendingRequestId, "G", 0, "L", ethers.ZeroHash, nonce, signature)
        ).to.be.revertedWith("Corrected weight must be greater than zero");
    });

    it("Should revert if the verifier's signature is invalid", async function() {
        const nonce = ethers.randomBytes(32);
        const invalidSignature = await createSignature(user, await recipient.getAddress(), "G", 1, "L", ethers.ZeroHash, nonce);
        await expect(
             gateway.connect(owner).processManualVerificationWithSignature(pendingRequestId, "G", 1, "L", ethers.ZeroHash, nonce, invalidSignature)
        ).to.be.revertedWith("Gateway: Signer is not an authorized verifier");
    });
  });

  // This new describe block covers the remaining view and test-only functions.
  describe("View and Helper Functions", function() {
    it("Should return the correct count from getPendingManualRequestCount", async function() {
        // Initially, the count should be 0.
        expect(await gateway.getPendingManualRequestCount()).to.equal(0);

        // Create a pending request
        await gateway.connect(owner).setCountryConfig(countryCodeBR, jsSource);
        const tx = await gateway.connect(user).requestMinting(countryCodeBR, "any-doc", await user.getAddress());
        const receipt = await tx.wait();
        const simulatorAddress = await oracleSimulator.getAddress();
        const simulatorEvent = oracleSimulator.interface.parseLog(receipt.logs.find(log => log.address === simulatorAddress));
        const requestId = simulatorEvent.args.requestId;
        const encodedResponse = ethers.AbiCoder.defaultAbiCoder().encode(["string", "uint256", "string", "bytes32"], ["", 0, "", ethers.ZeroHash]);
        await oracleSimulator.simulateCallback(await gateway.getAddress(), requestId, encodedResponse, "0x");
        
        // Now, the count should be 1.
        expect(await gateway.getPendingManualRequestCount()).to.equal(1);
    });

    it("Should correctly execute the test-only addPendingRequest function", async function() {
        const testRequestId = ethers.randomBytes(32);
        const testDocId = "test-doc-id";
        
        await gateway.connect(owner).addPendingRequest(testRequestId, await user.getAddress(), testDocId);

        const pendingRequest = await gateway.pendingRequests(testRequestId);
        expect(pendingRequest.owner).to.equal(await user.getAddress());
        expect(pendingRequest.documentHash).to.equal(ethers.keccak256(ethers.toUtf8Bytes(testDocId)));
    });

    it("Should prevent non-owners from calling addPendingRequest", async function() {
        await expect(
            gateway.connect(user).addPendingRequest(ethers.randomBytes(32), await user.getAddress(), "test-doc-id")
        ).to.be.revertedWithCustomError(gateway, "OwnableUnauthorizedAccount");
    });
  });
  
  // This describe block tests the mock contract's own security rules to ensure
  // that it cannot be bypassed.
  describe("MockRecyclingCredits Security", function () {
    // This test covers the failure branch of the 'onlyRole' modifier on the mock.
    it("Should prevent a direct call to certifyAndMint from an unauthorized account", async function () {
        // Get the role hash directly from the contract to ensure accuracy for the assertion.
        const CERTIFIER_ROLE = await mockCredits.CERTIFIER_ROLE();

        // Assert that a call from the 'user' account (which does not have the CERTIFIER_ROLE)
        // is reverted with the correct 'AccessControlUnauthorizedAccount' custom error.
        await expect(
            mockCredits.connect(user).certifyAndMint(
                await user.getAddress(),
                "PET",
                100,
                "Location",
                ethers.id("some-hash")
            )
        ).to.be.revertedWithCustomError(mockCredits, "AccessControlUnauthorizedAccount")
         .withArgs(await user.getAddress(), CERTIFIER_ROLE);
    });
  });
});