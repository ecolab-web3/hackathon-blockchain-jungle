import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;
import { BaseContract } from "ethers";

describe("RecyclingCredits", function () {
  
  // TypeScript will infer the types for these variables.
  let creditContract: BaseContract;
  let admin: any;
  let certifier: any;
  let cooperative: any;
  let company: any;

  const CERTIFIER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("CERTIFIER_ROLE"));
  const proofHash = "0x123456789012345678901234567890123456789012345678901234567890abcd";

  // This hook runs before each `it` block
  beforeEach(async function () {
    // Get test accounts from Hardhat
    [admin, certifier, cooperative, company] = await ethers.getSigners();

    const RecyclingCreditsFactory = await ethers.getContractFactory("RecyclingCredits");
    
    // Use `admin.address` here
    creditContract = await RecyclingCreditsFactory.deploy(admin.address); 
    await creditContract.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right name and symbol", async function () {
      expect(await creditContract.name()).to.equal("E-co.lab Recycling Credit");
      expect(await creditContract.symbol()).to.equal("E-REC");
    });

    it("Should grant DEFAULT_ADMIN_ROLE to the initial admin", async function () {
      const DEFAULT_ADMIN_ROLE = await creditContract.DEFAULT_ADMIN_ROLE();
      expect(await creditContract.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
    });

    it("Should grant CERTIFIER_ROLE to the initial admin", async function () {
      expect(await creditContract.hasRole(CERTIFIER_ROLE, admin.address)).to.be.true;
    });
  });

  describe("Role Management (AccessControl)", function () {
    it("Should allow admin to grant CERTIFIER_ROLE", async function () {
      await creditContract.connect(admin).grantRole(CERTIFIER_ROLE, certifier.address);
      expect(await creditContract.hasRole(CERTIFIER_ROLE, certifier.address)).to.be.true;
    });

    it("Should allow admin to revoke CERTIFIER_ROLE", async function () {
      await creditContract.connect(admin).grantRole(CERTIFIER_ROLE, certifier.address);
      await creditContract.connect(admin).revokeRole(CERTIFIER_ROLE, certifier.address);
      expect(await creditContract.hasRole(CERTIFIER_ROLE, certifier.address)).to.be.false;
    });

    it("Should prevent non-admins from granting roles", async function () {
      await expect(
        creditContract.connect(certifier).grantRole(CERTIFIER_ROLE, company.address)
      ).to.be.reverted; 
    });
  });

  describe("certifyAndMint", function () {
    beforeEach(async function () {
      await creditContract.connect(admin).grantRole(CERTIFIER_ROLE, certifier.address);
    });

    it("Should allow a certifier to mint a new credit", async function () {
      await expect(
        creditContract.connect(certifier).certifyAndMint(cooperative.address, "PET Plastic", 1000, "Coop-SP", proofHash)
      ).to.emit(creditContract, "CreditMinted")
       .withArgs(0, cooperative.address, "PET Plastic", 1000, proofHash);
      
      expect(await creditContract.ownerOf(0)).to.equal(cooperative.address);
      const details = await creditContract.creditDetails(0);
      expect(details.materialType).to.equal("PET Plastic");
      expect(details.isRetired).to.be.false;
    });

    it("Should prevent a non-certifier from minting", async function () {
      await expect(
        creditContract.connect(company).certifyAndMint(cooperative.address, "PET Plastic", 1000, "Coop-SP", proofHash)
      ).to.be.reverted; 
    });
  });

  describe("retire", function () {
    beforeEach(async function () {
      await creditContract.connect(admin).certifyAndMint(company.address, "Cardboard", 500, "Coop-RJ", proofHash);
    });

    it("Should allow the owner of a credit to retire it", async function () {
      await expect(creditContract.connect(company).retire(0))
        .to.emit(creditContract, "CreditRetired")
        .withArgs(0, company.address);
      
      const details = await creditContract.creditDetails(0);
      expect(details.isRetired).to.be.true;
    });

    it("Should prevent a non-owner from retiring a credit", async function () {
      await expect(
        creditContract.connect(cooperative).retire(0)
      ).to.be.revertedWith("Caller is not the token owner");
    });

    it("Should prevent retiring a credit that is already retired", async function () {
      await creditContract.connect(company).retire(0);
      await expect(
        creditContract.connect(company).retire(0)
      ).to.be.revertedWith("Credit is already retired");
    });
  });

  describe("Transferability of Retired Credits", function () {
    it("Should prevent the transfer of a retired credit", async function () {
      await creditContract.connect(admin).certifyAndMint(company.address, "Glass", 200, "Coop-MG", proofHash);
      await creditContract.connect(company).retire(0);

      await expect(
        creditContract.connect(company).transferFrom(company.address, cooperative.address, 0)
      ).to.be.revertedWith("Retired credits cannot be transferred");
    });
  });

  describe("supportsInterface", function () {
    it("should support the ERC721 interface", async function () {
      // The interface ID for ERC721 is 0x80ac58cd
      expect(await creditContract.supportsInterface("0x80ac58cd")).to.be.true;
    });

    it("should support the AccessControl interface", async function () {
      // The interface ID for IAccessControl is 0x7965db0b
      expect(await creditContract.supportsInterface("0x7965db0b")).to.be.true;
    });
    
    it("should support the ERC165 interface", async function () {
      // The interface ID for ERC165 is 0x01ffc9a7
      expect(await creditContract.supportsInterface("0x01ffc9a7")).to.be.true;
    });

    it("should not support a random interface", async function () {
      // A random interface ID
      expect(await creditContract.supportsInterface("0xffffffff")).to.be.false;
    });
  });
});