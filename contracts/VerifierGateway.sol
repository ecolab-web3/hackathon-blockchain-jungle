// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title IRecyclingCredits
 * @dev Interface for the main RecyclingCredits contract.
 * Updated to match the function names and parameters of the target contract.
 */
interface IRecyclingCredits {
    function certifyAndMint(
        address owner,
        string memory materialType,
        uint256 weightKg,
        string memory location,
        bytes32 proofHash
    ) external;
}

/**
 * @title VerifierGateway
 * @dev This contract acts as a gateway for minting NFTs in the main RecyclingCredits contract.
 */
contract VerifierGateway is AccessControl {
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    IRecyclingCredits public immutable recyclingCreditsContract;

    mapping(bytes32 => bool) public usedNonces;

    event VerificationSuccessful(address indexed verifier, address indexed recipient, bytes32 nonce);

    constructor(address _recyclingCreditsAddress) {
        require(_recyclingCreditsAddress != address(0), "Gateway: Invalid RWA contract address");
        recyclingCreditsContract = IRecyclingCredits(_recyclingCreditsAddress);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(VERIFIER_ROLE, msg.sender);
    }

    /**
     * @notice Mints a credit by providing data and a valid signature from an authorized verifier.
     * @param owner The address that will receive the newly minted credit.
     * @param materialType The type of recycled material.
     * @param weightKg The weight of the material in kilograms.
     * @param location A description of the location of the recycling event.
     * @param proofHash A hash of a proving document, required by the main contract.
     * @param nonce A unique, single-use value to prevent replay attacks.
     * @param signature The cryptographic signature produced by a verifier.
     */
    function mintWithSignature(
        address owner,
        string memory materialType,
        uint256 weightKg,
        string memory location,
        bytes32 proofHash, // Added proofHash to match certifyAndMint
        bytes32 nonce,
        bytes memory signature
    ) public {
        _verify(owner, materialType, weightKg, location, proofHash, nonce, signature);

        // Call the correct function on the main contract
        recyclingCreditsContract.certifyAndMint(owner, materialType, weightKg, location, proofHash);
    }

    function _verify(
        address owner,
        string memory materialType,
        uint256 weightKg,
        string memory location,
        bytes32 proofHash,
        bytes32 nonce,
        bytes memory signature
    ) internal {
        bytes32 messageHash = keccak256(abi.encodePacked(owner, materialType, weightKg, location, proofHash, nonce));
        bytes32 ethSignedMessageHash = keccak256(
        abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
    );
        address signer = ECDSA.recover(ethSignedMessageHash, signature);
        
        require(hasRole(VERIFIER_ROLE, signer), "Gateway: Signer is not an authorized verifier");
        require(!usedNonces[nonce], "Gateway: Signature nonce has already been used");
        
        usedNonces[nonce] = true;
        emit VerificationSuccessful(signer, owner, nonce);
    }
}