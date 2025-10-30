# RWA for Recycling Credits: Avalanche Jungle Hackathon Submission

If you find our work valuable, please consider giving us a star on GitHub!

![Hackathon](https://img.shields.io/badge/Hackathon-Avalanche_Jungle-brightgreen)
![Test_Coverage](https://img.shields.io/badge/Coverage-100%25-green)
![Language](https://img.shields.io/badge/Language-Solidity-orange)
![Blockchain](https://img.shields.io/badge/Blockchain-Avalanche_Fuji-red)
![Framework](https://img.shields.io/badge/Framework-Hardhat-purple.svg)
![Solidity Version](https://img.shields.io/badge/Solidity-0.8.20-yellow.svg)
![Verified Contracts](https://img.shields.io/badge/Contracts-Verified-green)
![License](https://img.shields.io/badge/License-MIT-blue)

___

## Official E-co.lab Links

*   **Official Website:** [ecolab-web3.github.io](https://ecolab-web3.github.io/)
*   **Whitepaper:** [e-co-lab.gitbook.io/whitepaper](https://e-co-lab.gitbook.io/whitepaper)
*   **Discord Community:** [discord.gg/Q6BNyUDNtm](https://discord.gg/Q6BNyUDNtm)
*   **Twitter:** [x.com/ecolab_web3](https://x.com/ecolab_web3)

___

## About The Project

This project, developed for the **Avalanche Jungle Hackathon**, introduces a robust, dual-gateway architecture to tokenize **Recycling Credits** as **Real-World Assets (RWAs)** on the Avalanche blockchain. The system is designed to bring transparency, liquidity, and verifiable trust to the circular economy by serving both the formal (document-based) and informal recycling sectors.

The entire system developed during the hackathon was built using Hardhat, achieved **100% test coverage**, and was successfully deployed and verified on the **Avalanche Fuji Testnet**.

___

## Live Demo & Deployed Assets

This section provides links to interact with and verify the project's components.

### Live Technical Demo (GitHub Codespaces)

This is the most effective way to validate our technical execution. The link below launches a pre-configured cloud development environment directly from GitHub, cloning the repository and installing all dependencies automatically.

**[➡️ Launch Live Technical Demo on GitHub Codespaces](https://codespaces.new/ecolab-web3/hackathon-blockchain-jungle)**

**Instructions for Judges:**
Once the environment loads (it might take a minute), a terminal will open and automatically run `npm install`. After it finishes, you can run the following commands to verify our work:
1.  `npx hardhat coverage` - This will run all **42 unit and integration tests** and generate a report showing **100% test coverage** for all contracts.
2.  `npx hardhat run scripts/proofAllGatewayIntegration.ts` - This will execute our final integration test on a fork of the Fuji testnet, proving the end-to-end functionality of the system architecture.

### Deployed Contracts on Fuji Testnet

*   **RecyclingCredits (RWA NFT):** [`0xe18e...f4f`](https://testnet.snowtrace.io/address/0xe18e887380bD90BCEa276747DaD314DfB06c1f4f) (Pre-existing contract)
*   **VerifierGateway:** [`0x6750...90DD`](https://testnet.snowtrace.io/address/0x6750f3daD85Ae66Bb8d0AF5ea0D11CDc8E4a90DD) (Built during hackathon)
*   **FiscalGateway:** [`0xeaF0...1Fa7`](https://testnet.snowtrace.io/address/0xeaF0F7CFcE04C953258247669Cb455b750321Fa7) (Built during hackathon)

### UI Prototypes (Pre-Hackathon)

These dApps were part of the pre-existing project. **Note:** They are not integrated with the new gateway architecture built during the hackathon.
*   [Recyclers Portal (Proof of Concept)](https://ecolab-web3.github.io/recyclingcredits-rwa-solidity/recyclers-en.html)
*   [Admin Panel (Proof of Concept)](https://ecolab-web3.github.io/recyclingcredits-rwa-solidity/admin-en.html)

---

## Hackathon Contribution & Project Continuity

This project is based on a pre-existing RWA contract (`RecyclingCredits.sol`). The work performed during the **Avalanche Jungle Hackathon** focused on building the entire verification, automation, and integration layer required to make the system functional and scalable.

### What Was Built During the Hackathon

1.  **VerifierGateway Contract:** A secure gateway for the informal recycling sector, enabling the minting of credits based on cryptographic signatures from trusted human verifiers.
2.  **FiscalGateway Contract:** An advanced gateway designed to automate the verification of fiscal documents (Brazilian NFe) using **Chainlink Functions**. Its most innovative feature is an **on-chain fallback queue**, which automatically flags inconsistent documents for manual review, ensuring system resilience without a centralized backend.
3.  **End-to-End Test Suite:** A comprehensive suite of **42 tests** was developed, achieving **100% test coverage** across all new contracts and their complex interactions.
4.  **Chainlink Functions Script:** The complete off-chain Javascript source code (`functions-source.js`) was developed to query a real-world API, validate data, and handle inconsistencies.
5.  **Fork Integration Scripts:** We created and successfully executed scripts on a fork of the Fuji testnet, proving that our new gateways could correctly interact with the live `RecyclingCredits` contract and execute the full integrated workflow, including the manual fallback mechanism.

### Challenge and Learning

Our primary technical challenge arose during the final on-chain configuration of the `FiscalGateway`. We discovered that our deployed contract was missing a necessary parameter in its request function to pass a reference to the off-chain secrets (API key). Due to the immutable nature of the contract and the hackathon's time limit, we could not redeploy this component.

This experience was a crucial lesson in the complexities of integrating on-chain and off-chain systems. Importantly, our architecture's design proved its value: the **on-chain fallback queue is fully functional**, allowing any NFe to be processed securely through the `VerifierGateway`'s manual verification flow, ensuring no data is lost and the system remains operational.

---

## Technical Architecture

The system's innovation lies in its **dual-gateway architecture**, which separates concerns and creates a robust, auditable pipeline for RWA tokenization.

*   **VerifierGateway (For the Informal Sector):**
    *   **Purpose:** To provide a trust-minimized entry point for recycled materials that lack formal documentation.
    *   **Security Model:** Relies on `ECDSA` signatures. A pre-approved set of real-world "Verifiers" (`VERIFIER_ROLE`) can attest to a collection's legitimacy by signing its data. This signature is the sole authorization required to mint a credit, creating a strong, auditable link to a trusted individual.

*   **FiscalGateway (For the Formal Sector):**
    *   **Purpose:** To automate the verification of official documents (like NFes) to scale the system.
    *   **Integration:** Designed to use Chainlink Functions to call an external API, parse the document data, and validate it against on-chain rules.
    *   **On-Chain Fallback Queue:** If the Chainlink Functions script detects inconsistent data (e.g., wrong unit of measurement), it signals the `FiscalGateway`. The gateway then creates a task in a public, on-chain queue. This task can then be resolved by an administrator via the `VerifierGateway`, unifying the human verification process.

---

## Next Steps

This project has a clear and viable roadmap for production.

1.  **Redeploy FiscalGateway:** The immediate next step is to redeploy the `FiscalGateway` with the corrected function signature to fully enable the Chainlink Functions automation with secrets.
2.  **Develop a Unified dApp:** Build a production-grade dApp that provides interfaces for all user roles: recyclers, verifiers (for the manual queue), and administrators.
3.  **Support for EIP-1271:** Refactor the `VerifierGateway` to support the EIP-1271 standard, allowing multi-signature wallets (like Gnosis Safe) to act as verifiers, further decentralizing the governance and approval process.
4.  **Expand Country Support:** Add new Javascript sources and configurations to the `FiscalGateway` to support electronic fiscal documents from other Latin American countries (e.g., Mexico's CFDI, Argentina's Factura Electrónica).

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.