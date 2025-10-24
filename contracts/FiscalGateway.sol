// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {FunctionsClient} from "@chainlink/contracts/src/v0.8/functions/dev/v1_0_0/FunctionsClient.sol";
import {FunctionsRequest} from "@chainlink/contracts/src/v0.8/functions/dev/v1_0_0/libraries/FunctionsRequest.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IRecyclingCredits {
    function certifyAndMint(
        address owner,
        string memory materialType,
        uint256 weightKg,
        string memory location,
        bytes32 proofHash
    ) external;
}

contract FiscalGateway is FunctionsClient, Ownable {
    using FunctionsRequest for FunctionsRequest.Request;

    IRecyclingCredits public immutable recyclingCreditsContract;
    uint64 public subscriptionId;
    bytes32 public donId;
    uint32 public callbackGasLimit = 300000;
    bytes public lastResponse;
    bytes public lastError;

    struct CountryConfig {
        string source;
        bool isSupported;
    }
    mapping(bytes32 => CountryConfig) public countryConfigs;

    struct Request {
        address owner;
        bytes32 documentHash;
    }
    mapping(bytes32 => Request) public pendingRequests;

    // --- Manual Verification Queue Section ---
    
    // An enum to clearly define the status of a manual request.
    enum Status { None, Pending, Completed, Rejected }

    // A struct to hold all necessary data for a manual review task.
    struct ManualRequest {
        address owner;
        bytes32 documentHash;
        Status status;
        string reason; // e.g., "INVALID_UNIT", "UNKNOWN_MATERIAL"
    }

    // A mapping to access manual request details by the original Chainlink requestId.
    mapping(bytes32 => ManualRequest) public manualRequests;
    
    // An array to allow dApps to iterate through pending requests.
    // Note: This implementation does not remove items to save gas on processing.
    // The dApp should filter for items with Status.Pending.
    bytes32[] public pendingManualRequestIds;

    // --- Events ---
    event CountryConfigSet(bytes32 indexed countryCode, string source);
    event RequestSent(bytes32 indexed requestId, bytes32 indexed countryCode, address owner, string documentId);
    event RequestFulfilled(bytes32 indexed requestId, address owner, uint256 weightKg);
    event RequestFailed(bytes32 indexed requestId, bytes error);
    event ManualVerificationRequired(bytes32 indexed requestId, address owner, string reason);
    event ManualVerificationCompleted(bytes32 indexed requestId, address indexed verifier);

    constructor(
        address _router,
        address _recyclingCreditsAddress,
        uint64 _subscriptionId,
        bytes32 _donId
    ) FunctionsClient(_router) Ownable(msg.sender) {
        recyclingCreditsContract = IRecyclingCredits(_recyclingCreditsAddress);
        subscriptionId = _subscriptionId;
        donId = _donId;
    }

    function setCountryConfig(bytes32 _countryCode, string calldata _source) external onlyOwner {
        countryConfigs[_countryCode] = CountryConfig({ source: _source, isSupported: true });
        emit CountryConfigSet(_countryCode, _source);
    }
    
    function setSubscriptionId(uint64 _subscriptionId) external onlyOwner {
        subscriptionId = _subscriptionId;
    }

    function requestMinting(
        bytes32 _countryCode,
        string memory _documentId,
        address _owner
    ) external returns (bytes32 requestId) {
        require(countryConfigs[_countryCode].isSupported, "Country not supported");
        
        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineJavaScript(countryConfigs[_countryCode].source);
        
        string[] memory args = new string[](1);
        args[0] = _documentId;
        req.setArgs(args);

        requestId = _sendRequest(req.encodeCBOR(), subscriptionId, callbackGasLimit, donId);

        pendingRequests[requestId] = Request({
            owner: _owner,
            documentHash: keccak256(abi.encodePacked(_documentId))
        });

        emit RequestSent(requestId, _countryCode, _owner, _documentId);
        return requestId;
    }
    
    function fulfillRequest(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) internal override {
        if (err.length > 0) {
            lastError = err;
            emit RequestFailed(requestId, err);
            delete pendingRequests[requestId];
            return;
        }

        lastResponse = response;
        Request memory storedRequest = pendingRequests[requestId];

        (
            string memory materialType,
            uint256 weightKg,
            string memory location,
            bytes32 proofHash
        ) = abi.decode(response, (string, uint256, string, bytes32));
        
        if (weightKg > 0) {
            // Success path: mint automatically.
            recyclingCreditsContract.certifyAndMint(
                storedRequest.owner,
                materialType,
                weightKg,
                location,
                proofHash
            );
            emit RequestFulfilled(requestId, storedRequest.owner, weightKg);
        } else {
            // Fallback path: create an on-chain task for manual review.
            string memory reason = "INCONSISTENT_DATA";
            manualRequests[requestId] = ManualRequest({
                owner: storedRequest.owner,
                documentHash: storedRequest.documentHash,
                status: Status.Pending,
                reason: reason
            });
            pendingManualRequestIds.push(requestId);
            emit ManualVerificationRequired(requestId, storedRequest.owner, reason);
        }
        
        delete pendingRequests[requestId];
    }
    
    // --- Manual Verification Queue Functions ---

    /**
     * @notice (Owner) Processes a pending manual request after off-chain review.
     * @param _requestId The ID of the request to process.
     * @param _correctedMaterial The correct material type determined by the reviewer.
     * @param _correctedWeightKg The correct weight in Kg determined by the reviewer.
     * @param _location The location data from the original document.
     * @param _proofHash The proof hash from the original document.
     */
    function processManualVerification(
        bytes32 _requestId,
        string calldata _correctedMaterial,
        uint256 _correctedWeightKg,
        string calldata _location,
        bytes32 _proofHash
    ) external onlyOwner {
        ManualRequest storage requestToProcess = manualRequests[_requestId];
        require(requestToProcess.status == Status.Pending, "Request is not pending review");
        require(_correctedWeightKg > 0, "Corrected weight must be greater than zero");

        recyclingCreditsContract.certifyAndMint(
            requestToProcess.owner,
            _correctedMaterial,
            _correctedWeightKg,
            _location,
            _proofHash
        );

        requestToProcess.status = Status.Completed;
        emit ManualVerificationCompleted(_requestId, msg.sender);
    }
    
    // --- View Functions for dApp ---

    function getPendingManualRequestCount() external view returns (uint256) {
        return pendingManualRequestIds.length;
    }

    function getManualRequestDetails(bytes32 _requestId) external view returns (ManualRequest memory) {
        return manualRequests[_requestId];
    }
}