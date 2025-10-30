<!--
theme: uncover
style: |
  section {
    font-size: 28px;
    line-height: 1.4;
  }
  h2 {
    font-size: 48px;
  }
-->

# RWA for Recycling Credits
## Avalanche Jungle Hackathon Submission
**E-co.lab**

---

## The Problem: A Broken Circular Economy

*   **Informal Sector (High Impact, Low Trust):** Over 800,000 waste pickers in Brazil are the backbone of recycling, but their work is largely invisible and lacks formal validation.
*   **Formal Sector (High Trust, High Friction):** Companies generate verifiable data (fiscal notes), but the process to convert this into a valuable asset is manual, slow, and opaque.
*   **Result:** A lack of liquidity, transparency, and trust prevents the circular economy from scaling.

---

## Our Solution: A Hybrid RWA Platform on Avalanche

We built a **dual-gateway architecture** to tokenize verified recycling credits into ERC721 NFTs, creating a liquid and transparent asset.

<style scoped>
img[alt="Diagram"] {
  width: 200px;
}
</style>

![Diagram](https://raw.githubusercontent.com/ecolab-web3/hackathon-blockchain-jungle/refs/heads/main/images/diagram.png)

---

### The `VerifierGateway`: Trust for the Informal Sector

This gateway empowers the informal sector by converting **human trust into an on-chain, auditable asset.**

*   **How it Works:**
    1.  A trusted, real-world **Verifier** inspects a collection of recycled materials.
    2.  The Verifier uses their private key to **cryptographically sign** the data (material, weight, location).
    3.  This signature acts as an irrefutable "stamp of approval".
    4.  The `VerifierGateway` validates the signature on-chain and mints a valuable RWA NFT.
*   **Impact:** Brings legitimacy and financial inclusion to informal workers.

---

### The `FiscalGateway`: Automation for the Formal Sector

This gateway is designed to automate and scale the system using official documents.

*   **Integration:** Uses **Chainlink Functions** to call real-world APIs and validate fiscal notes (NFes).
*   **Innovation: On-Chain Fallback Queue:**
    *   If the Chainlink Function detects **inconsistent data** (e.g., wrong units), it doesn't fail.
    *   It automatically creates a **public, on-chain task** in a manual review queue.
    *   This ensures resilience and transparency, **without needing a centralized backend.**

---

### The Integrated Flow: Automation Meets Human Verification

Our architecture's key innovation is how the two gateways work together.

1.  **`FiscalGateway`** attempts automated verification.
2.  On failure, it creates a task in the **on-chain queue**.
3.  A human reviewer analyzes the task.
4.  The final approval is delegated to the **`VerifierGateway`**, using the same secure, signature-based mechanism as the informal flow.

This unifies all human intervention under a single, highly secure, and auditable process.

---

<!-- _class: lead -->

## Hackathon Execution: What We Built

We delivered a fully-tested, robust, and deployed system foundation.

---

### 100% On-Chain Test Coverage

*   We wrote **42 comprehensive tests** using Hardhat.
*   Achieved **100% line, branch, and function coverage** for all new smart contracts (`FiscalGateway`, `VerifierGateway`).
*   This proves the logic is sound and secure in a simulated environment.

<style scoped>
img[alt="Coverage Report"] {
  width: 300px;
}
</style>

![Coverage Report](https://raw.githubusercontent.com/ecolab-web3/hackathon-blockchain-jungle/refs/heads/main/images/coverageReport.png)

---

### Live Fork Integration Testing

*   We went beyond unit tests.
*   We wrote and successfully executed integration scripts on a **live fork of the Fuji Testnet**.
*   **This proved, inequivocally, that our new gateways can correctly interact with the pre-existing, live RWA contract.**

<style scoped>
img[alt="Fork Test Success"] {
  width: 500px;
}
</style>

![Fork Test Success](https://raw.githubusercontent.com/ecolab-web3/hackathon-blockchain-jungle/refs/heads/main/images/fullFlowIntegration.png)

---

### The Challenge: A Learning Opportunity

*   **The Issue:** We discovered a factual incompatibility in our deployed `FiscalGateway`'s function signature that prevented the final on-chain connection to Chainlink Functions secrets.
*   **The Impact:** The fully automated flow could not be completed on-chain.
*   **The Proof of Design:** Our architecture's **on-chain fallback queue worked perfectly**. The system correctly identified the issue and routed it for manual verification, proving the resilience of the design.

---

## Next Steps & Vision

Our foundation is strong, with a clear path to a production-ready system.

1.  **Redeploy `FiscalGateway`:** A simple fix to the function signature to enable full automation.
2.  **Build a Unified dApp:** Create a production-grade UI for all user roles.
3.  **Support EIP-1271:** Allow multi-sig wallets (Gnosis Safe) to act as verifiers, decentralizing governance.
4.  **Expand to Latin America:** Add new configurations to support fiscal documents from Mexico, Argentina, and beyond.

---

<!-- _class: lead -->

# Thank You

**E-co.lab**

*Making the Circular Economy Verifiable*