// All code comments are in English as requested.
import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("FiscalGateway", function () {
  
  // --- Contracts and Accounts ---
  let gateway;
  let mockCredits;
  let mockRouter;
  let owner;
  let user;

  // --- Constants ---
  const CERTIFIER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("CERTIFIER_ROLE"));
  const subId = 1;
  const countryCodeBR = ethers.keccak256(ethers.toUtf8Bytes("BR"));
  const countryCodeMX = ethers.keccak256(ethers.toUtf8Bytes("MX"));
  const jsSource = "const result = 'hello'; return Functions.encodeString(result);";
  const donId = ethers.encodeBytes32String("test-don-id");

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    const MockRouterFactory = await ethers.getContractFactory("MockRouter");
    mockRouter = await MockRouterFactory.deploy();
    
    const MockCreditsFactory = await ethers.getContractFactory("MockRecyclingCredits");
    mockCredits = await MockCreditsFactory.deploy();
    
    const GatewayFactory = await ethers.getContractFactory("FiscalGateway");
    gateway = await GatewayFactory.deploy(
        await mockRouter.getAddress(),
        await mockCredits.getAddress(),
        subId,
        donId
    );

    await mockCredits.connect(owner).grantRole(CERTIFIER_ROLE, await gateway.getAddress());
  });

  // This describe block tests the constructor and initial state of the contract.
  describe("Deployment", function () {
    it("Should set the correct initial state", async function () {
        // Assert that the owner is the deployer of the contract.
        expect(await gateway.owner()).to.equal(await owner.getAddress());

        // Assert that the gateway is linked to the correct main credits contract.
        expect(await gateway.recyclingCreditsContract()).to.equal(await mockCredits.getAddress());
        
        // Assert that the initial subscription ID is set correctly.
        expect(await gateway.subscriptionId()).to.equal(subId);

        // Assert that the initial DON ID is set correctly.
        expect(await gateway.donId()).to.equal(donId);
    });
  });

  // Find this describe block and replace its entire content.
  describe("Admin Functions (Centralized Management)", function () {
    // This test covers the success path (already existed, but kept for completeness)
    it("Should allow the owner to set a country config", async function () {
        await expect(gateway.connect(owner).setCountryConfig(countryCodeBR, jsSource))
            .to.emit(gateway, "CountryConfigSet")
            .withArgs(countryCodeBR, jsSource);
    });

    // FATO: This new test covers the failure branch for setCountryConfig.
    it("Should prevent non-owners from setting a country config", async function () {
        await expect(
            gateway.connect(user).setCountryConfig(countryCodeBR, jsSource)
        ).to.be.revertedWithCustomError(gateway, "OwnableUnauthorizedAccount")
         .withArgs(await user.getAddress());
    });

    // FATO: This new describe block covers both branches for setSubscriptionId.
    describe("setSubscriptionId", function () {
        it("Should allow the owner to set a new subscription ID", async function () {
            const newSubId = 999;
            await gateway.connect(owner).setSubscriptionId(newSubId);
            expect(await gateway.subscriptionId()).to.equal(newSubId);
        });
        
        it("Should prevent non-owners from setting a new subscription ID", async function () {
            const newSubId = 999;
            await expect(
                gateway.connect(user).setSubscriptionId(newSubId)
            ).to.be.revertedWithCustomError(gateway, "OwnableUnauthorizedAccount")
             .withArgs(await user.getAddress());
        });
    });
  });

  describe("Request and Callback Flow", function () {
    
    beforeEach(async function() {
        await gateway.connect(owner).setCountryConfig(countryCodeBR, jsSource);
    });

    it("Should revert when requesting for an unsupported country", async function () {
        // We use countryCodeMX which has not been configured in the beforeEach hook.
        await expect(
            gateway.connect(user).requestMinting(countryCodeMX, "doc-id-123", await user.getAddress())
        ).to.be.revertedWith("Country not supported");
    });

    it("Should successfully mint automatically when data is consistent", async function () { /* Renamed for clarity */
        const tx = await gateway.connect(user).requestMinting(countryCodeBR, "NFe-key-456", await user.getAddress());
        const receipt = await tx.wait();
        const mockRouterAddress = await mockRouter.getAddress();
        const routerEvent = mockRouter.interface.parseLog(receipt.logs.find(log => log.address === mockRouterAddress));
        const requestId = routerEvent.args.requestId;

        const materialType = "Aluminum";
        const weightKg = 1500;
        const encodedResponse = ethers.AbiCoder.defaultAbiCoder().encode(
            ["string", "uint256", "string", "bytes32"],
            [materialType, weightKg, "Coop A", ethers.id("NFe-key-456")]
        );
        
        await expect(
            mockRouter.simulateCallback(await gateway.getAddress(), requestId, encodedResponse, "0x")
        ).to.emit(mockCredits, "CreditMinted")
         .withArgs(await user.getAddress(), materialType, weightKg);
    });
    
    // FATO: New test for the 'else' branch in fulfillRequest.
    it("Should create a manual verification request when data is inconsistent (weight is 0)", async function() {
        const tx = await gateway.connect(user).requestMinting(countryCodeBR, "NFe-key-INCONSISTENT", await user.getAddress());
        const receipt = await tx.wait();
        const mockRouterAddress = await mockRouter.getAddress();
        const routerEvent = mockRouter.interface.parseLog(receipt.logs.find(log => log.address === mockRouterAddress));
        const requestId = routerEvent.args.requestId;

        // Simulate a response where weight is 0
        const encodedResponse = ethers.AbiCoder.defaultAbiCoder().encode(
            ["string", "uint256", "string", "bytes32"],
            ["UNKNOWN", 0, "Location", ethers.id("NFe-key-INCONSISTENT")]
        );

        // Assert that the ManualVerificationRequired event is emitted
        await expect(
            mockRouter.simulateCallback(await gateway.getAddress(), requestId, encodedResponse, "0x")
        ).to.emit(gateway, "ManualVerificationRequired")
         .withArgs(requestId, await user.getAddress(), "INCONSISTENT_DATA");

        // Assert that the on-chain queue was updated correctly
        expect(await gateway.getPendingManualRequestCount()).to.equal(1);
        const manualRequest = await gateway.getManualRequestDetails(requestId);
        expect(manualRequest.owner).to.equal(await user.getAddress());
        expect(manualRequest.status).to.equal(1); // Enum Status.Pending
    });

    // FATO: This new test covers the 'if (err.length > 0)' branch in fulfillRequest.
    it("Should correctly handle a failed fulfillment (error from oracle)", async function () {
        const tx = await gateway.connect(user).requestMinting(countryCodeBR, "NFe-key-789", await user.getAddress());
        const receipt = await tx.wait();
        const mockRouterAddress = await mockRouter.getAddress();
        const routerEvent = mockRouter.interface.parseLog(receipt.logs.find(log => log.address === mockRouterAddress));
        const requestId = routerEvent.args.requestId;

        // Simulate an error response from the Oracle
        const errorBytes = ethers.toUtf8Bytes("API returned status 500");

        // Assert that the 'RequestFailed' event is emitted
        await expect(
            mockRouter.simulateCallback(await gateway.getAddress(), requestId, "0x", errorBytes)
        )
        .to.emit(gateway, "RequestFailed")
        .withArgs(requestId, errorBytes);

        // Assert that the error was stored and the pending request was cleaned up
        expect(await gateway.lastError()).to.equal(ethers.hexlify(errorBytes));
        const pendingRequest = await gateway.pendingRequests(requestId);
        expect(pendingRequest.owner).to.equal(ethers.ZeroAddress);
    });
  });

  // FATO: New describe block for testing the manual verification functionality.
  describe("Manual Verification Flow", function () {
    let pendingRequestId;

    // Helper setup: create a pending manual request before each test in this block
    beforeEach(async function() {
        await gateway.connect(owner).setCountryConfig(countryCodeBR, jsSource);
        const tx = await gateway.connect(user).requestMinting(countryCodeBR, "NFe-key-MANUAL", await user.getAddress());
        const receipt = await tx.wait();
        const mockRouterAddress = await mockRouter.getAddress();
        const routerEvent = mockRouter.interface.parseLog(receipt.logs.find(log => log.address === mockRouterAddress));
        pendingRequestId = routerEvent.args.requestId;
        
        const encodedResponse = ethers.AbiCoder.defaultAbiCoder().encode(
            ["string", "uint256", "string", "bytes32"],
            ["", 0, "", ethers.ZeroHash]
        );
        await mockRouter.simulateCallback(await gateway.getAddress(), pendingRequestId, encodedResponse, "0x");
    });

     it("Should allow the owner to process a pending manual request", async function() {
        const correctedMaterial = "Glass";
        const correctedWeight = 750;
        const location = "Coop C";
        const proofHash = ethers.id("NFe-key-MANUAL");

        // The transaction is executed only ONCE and its promise is stored.
        const tx = gateway.connect(owner).processManualVerification(
            pendingRequestId,
            correctedMaterial,
            correctedWeight,
            location,
            proofHash
        );

        // Multiple assertions are made against the single transaction promise.
        // Assertion 1: Check for the completion event from the Gateway.
        await expect(tx)
            .to.emit(gateway, "ManualVerificationCompleted")
            .withArgs(pendingRequestId, await owner.getAddress());
        
        // Assertion 2: Check for the minting event from the main contract.
        await expect(tx)
            .to.emit(mockCredits, "CreditMinted")
            .withArgs(await user.getAddress(), correctedMaterial, correctedWeight);

        // Assertion 3: Check the final state of the request.
        const manualRequest = await gateway.getManualRequestDetails(pendingRequestId);
        expect(manualRequest.status).to.equal(2); // Enum Status.Completed
    });

    it("Should prevent non-owners from processing a manual request", async function() {
        await expect(
            gateway.connect(user).processManualVerification(pendingRequestId, "Glass", 100, "loc", ethers.id("hash"))
        ).to.be.revertedWithCustomError(gateway, "OwnableUnauthorizedAccount")
         .withArgs(await user.getAddress());
    });
    
    it("Should prevent processing a request that is not pending", async function() {
        // First, process it successfully
        await gateway.connect(owner).processManualVerification(pendingRequestId, "Glass", 100, "loc", ethers.id("hash"));

        // Then, try to process it again
        await expect(
            gateway.connect(owner).processManualVerification(pendingRequestId, "Glass", 100, "loc", ethers.id("hash"))
        ).to.be.revertedWith("Request is not pending review");
    });
    
    it("Should prevent processing with a corrected weight of zero", async function() {
        await expect(
            gateway.connect(owner).processManualVerification(pendingRequestId, "Glass", 0, "loc", ethers.id("hash"))
        ).to.be.revertedWith("Corrected weight must be greater than zero");
    });
  });

  // This describe block tests the mock contract's own security rules to ensure
  // that it cannot be bypassed.
  describe("MockRecyclingCredits Security", function () {
    // This test covers the failure branch of the 'onlyRole' modifier on the mock.
    it("Should prevent a direct call to certifyAndMint from an unauthorized account", async function () {
        // Get the role hash directly from the contract to ensure accuracy.
        const CERTIFIER_ROLE = await mockCredits.CERTIFIER_ROLE();

        // Assert that a call from 'user' (who does not have the CERTIFIER_ROLE) is reverted
        // with the correct AccessControl error.
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