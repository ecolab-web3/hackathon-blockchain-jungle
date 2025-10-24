// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract MockRecyclingCredits is AccessControl {
    bytes32 public constant CERTIFIER_ROLE = keccak256("CERTIFIER_ROLE");

    event CreditMinted(address indexed owner, string materialType, uint256 weightKg);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function certifyAndMint(
        address owner,
        string memory materialType,
        uint256 weightKg,
        string memory, // location
        bytes32     // proofHash
    ) external onlyRole(CERTIFIER_ROLE) {
        emit CreditMinted(owner, materialType, weightKg);
    }
}