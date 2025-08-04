// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Import standard OpenZeppelin contracts.
import "https'://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.1/contracts/token/ERC721/ERC721.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.1/contracts/access/AccessControl.sol";

/**
 * @title RecyclingCredit
 * @author E-co.lab Dev Team
 * @notice A contract to create, manage, and retire Recycling Credits tokenized as NFTs (RWA).
 * Each NFT represents a proven amount of recycled material.
 */
contract RecyclingCredit is ERC721, AccessControl {

    // Defines the role that can certify and mint new credits.
    bytes32 public constant CERTIFIER_ROLE = keccak256("CERTIFIER_ROLE");

    // Struct to store the metadata for each credit on-chain.
    struct CreditData {
        string materialType;      // E.g., "PET Plastic", "Corrugated Cardboard"
        uint256 weightKg;         // Weight in kilograms that the credit represents.
        uint256 timestamp;        // Timestamp when the recycling was certified.
        string location;          // Location of the cooperative/operator that generated the proof.
        bytes32 proofHash;        // Cryptographic hash of the invoice or proving document.
        bool isRetired;           // Whether the credit has already been "retired" (used).
    }

    // Mapping from the token ID to its metadata.
    mapping(uint256 => CreditData) public creditDetails;

    // Counter to generate new token IDs.
    uint256 private _nextTokenId;

    // Events to notify the frontend about important actions.
    event CreditMinted(uint256 indexed tokenId, address indexed owner, string materialType, uint256 weightKg, bytes32 proofHash);
    event CreditRetired(uint256 indexed tokenId, address indexed retiredBy);

    /**
     * @dev The constructor sets the NFT's name and symbol.
     * @param initialAdmin The address that will initially have both Admin and Certifier roles.
     */
    constructor(address initialAdmin) ERC721("E-co.lab Recycling Credit", "E-REC") {
        // The contract deployer becomes the default Admin.
        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
        // The Admin also receives permission to certify credits.
        _grantRole(CERTIFIER_ROLE, initialAdmin);
    }

    /**
     * @notice (Certifier) Creates (mints) a new recycling credit token.
     * @param owner The address that will receive the credit (e.g., the cooperative).
     * @param materialType The type of material recycled.
     * @param weightKg The weight in Kg that the credit represents.
     * @param location The location of the recycling's origin.
     * @param proofHash The hash of the proving document (e.g., an invoice).
     */
    function certifyAndMint(
        address owner,
        string memory materialType,
        uint256 weightKg,
        string memory location,
        bytes32 proofHash
    ) external onlyRole(CERTIFIER_ROLE) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(owner, tokenId);

        creditDetails[tokenId] = CreditData({
            materialType: materialType,
            weightKg: weightKg,
            timestamp: block.timestamp,
            location: location,
            proofHash: proofHash,
            isRetired: false
        });

        emit CreditMinted(tokenId, owner, materialType, weightKg, proofHash);
    }

    /**
     * @notice (NFT Owner) Retires a credit to prove its use.
     * A retired credit can no longer be transferred.
     * @param tokenId The ID of the token to be retired.
     */
    function retire(uint256 tokenId) external {
        // Only the token owner can retire it.
        require(_isApprovedOrOwner(msg.sender, tokenId), "Caller is not the owner or approved");
        require(!creditDetails[tokenId].isRetired, "Credit is already retired");

        creditDetails[tokenId].isRetired = true;
        emit CreditRetired(tokenId, msg.sender);
    }

    /**
     * @dev Overrides the ERC721 transfer function to prevent
     * the transfer of credits that have already been retired.
     */
    function _update(address to, uint256 tokenId, address auth) internal virtual override returns (address) {
        require(!creditDetails[tokenId].isRetired, "Retired credits cannot be transferred");
        return super._update(to, tokenId, auth);
    }

    /**
     * @dev Required override for contracts inheriting from multiple standards.
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
