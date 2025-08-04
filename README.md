# RWA for Recycling Credits: A Solidity Smart Contract Prototype

![Language](https://img-shields.io/badge/Language-Solidity-orange)
![Blockchain](https://img.shields.io/badge/Blockchain-EVM%20Chains-blueviolet)
![Standard](https://img.shields.io/badge/Standard-ERC721-blue)
![License](https://img.shields.io/badge/License-MIT-green)

This repository, `recyclingcredits-rwa-solidity`, contains a prototype smart contract that tokenizes **Recycling Credits** as **Real World Assets (RWA)** on the blockchain, bringing transparency, auditability, and liquidity to the circular economy.

## The Vision

In Brazil and many other countries, the circular economy is powered by a system of recycling credits, often used to fulfill legal obligations like Reverse Logistics policies. However, this system often relies on centralized, opaque databases.

This project demonstrates how blockchain can solve this by transforming each certified recycling credit into a unique **Non-Fungible Token (NFT)**. This creates a transparent, fraud-resistant, and globally accessible market for environmental assets.

---

## Core Concepts & Architecture

The contract, `RECYCLINGCREDITS_RWA.sol`, is built on industry-standard patterns to ensure security and flexibility.

### 1. NFT as a Unique Credit (ERC721)
Each credit, representing a specific amount of recycled material, is a unique NFT. This ensures that a credit cannot be duplicated or double-spent.

### 2. On-Chain Metadata for Transparency
To guarantee auditability, all critical data for each credit is stored directly on the blockchain:
*   **Material Type:** e.g., "PET Plastic"
*   **Weight:** The amount of material recycled (in Kg).
*   **Timestamp:** When the credit was certified.
*   **Location:** The origin of the recycled material (e.g., a specific cooperative).
*   **Proof Hash:** A cryptographic hash of the proving document (like an invoice), ensuring its integrity.

### 3. Role-Based Access Control (`AccessControl`)
Instead of a single "owner," the contract uses a more flexible role-based system:
*   **`DEFAULT_ADMIN_ROLE`**: Has the power to grant and revoke roles.
*   **`CERTIFIER_ROLE`**: The only role that can validate real-world proofs and mint new credit NFTs. This allows the platform to have multiple trusted certifiers in the future.

### 4. Credit Lifecycle: Mint, Transfer, and Retire
*   **Minting (`certifyAndMint`)**: A `CERTIFIER` calls this function to create a new NFT after auditing a real-world proof.
*   **Transfer**: As a standard ERC721 token, the credit can be freely traded on any NFT marketplace.
*   **Retirement (`retire`)**: When a company uses a credit to offset its environmental obligations, it calls the `retire` function. This permanently marks the NFT as "used" and prevents it from ever being transferred again, providing an immutable public record of its use. This is a more auditable alternative to simply burning the token.

---

## How to Test (Using Remix IDE)

You can easily test the entire lifecycle of a recycling credit in the Remix IDE.

1.  **Compile and Deploy:**
    *   Open `contracts/RECYCLINGCREDITS_RWA.sol` in Remix.
    *   Compile with a `^0.8.20` Solidity compiler.
    *   On the Deploy tab, select the `RecyclingCredit` contract. For the `initialAdmin` parameter, provide your primary wallet address. Deploy the contract to a testnet like Avalanche Fuji.

2.  **Act as the Certifier (Admin Account):**
    *   Call the `certifyAndMint` function with the following example data:
        *   `owner`: The address of another test account (representing a cooperative).
        *   `materialType`: `"PET Plastic"`
        *   `weightKg`: `1000` (for 1 ton)
        *   `location`: `"Recycle-All Cooperative, Brazil"`
        *   `proofHash`: `0x123456789012345678901234567890123456789012345678901234567890abcd` (a sample hash)
    *   This will create Token ID `0` and send it to the cooperative's wallet.

3.  **Act as the Company (NFT Owner Account):**
    *   (Optional) Switch to the cooperative's account and transfer the NFT to a third account (the final buyer).
    *   Switch to the account that now owns Token ID `0`.
    *   Call the `retire` function with `tokenId`: `0`. The transaction will succeed.
    *   Call the `creditDetails` view function with `tokenId`: `0` to confirm that the `isRetired` flag is now `true`.

4.  **Test the Security:**
    *   Try to transfer the retired Token ID `0` to any other address. The transaction will fail with the error "Retired credits cannot be transferred," proving the lock mechanism works.

---

## Next Steps

This prototype is a solid foundation. Future development could include:

*   **Building a Full DApp**: Creating a user-friendly frontend for cooperatives to submit proofs and for companies to browse, buy, and retire credits.
*   **Oracle Integration**: Developing a secure "oracle" to automatically read and hash real-world data (like government-issued electronic invoices) to serve as the `proofHash`.
*   **Marketplace Creation**: Building a dedicated marketplace for these credit NFTs, with filtering and auction capabilities.
*   **Security Audit**: A full, professional security audit before any mainnet deployment.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
