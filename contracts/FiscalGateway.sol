// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Using the correct, verified import paths for Chainlink Contracts v0.8.0
import {FunctionsClient} from "@chainlink/contracts/src/v0.8/functions/dev/v1_0_0/FunctionsClient.sol";
import {FunctionsRequest} from "@chainlink/contracts/src/v0.8/functions/dev/v1_0_0/libraries/FunctionsRequest.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

// Interface for the main RecyclingCredits contract
interface IRecyclingCredits {
    function certifyAndMint(address owner, string memory materialType, uint256 weightKg, string memory location, bytes32 proofHash) external;
}

// Interface for the VerifierGateway to enable secure, integrated interaction.
interface IVerifierGateway {
    function mintWithSignature(address owner, string memory materialType, uint256 weightKg, string memory location, bytes32 proofHash, bytes32 nonce, bytes memory signature) external;
}

contract FiscalGateway is FunctionsClient, Ownable {
    using FunctionsRequest for FunctionsRequest.Request;

    IRecyclingCredits public immutable recyclingCreditsContract;
    IVerifierGateway public verifierGateway; // Address can be updated by owner
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
    
    enum Status { None, Pending, Completed, Rejected }

    struct ManualRequest {
        address owner;
        bytes32 documentHash;
        Status status;
        string reason;
    }
    mapping(bytes32 => ManualRequest) public manualRequests;
    
    bytes32[] public pendingManualRequestIds;

    event CountryConfigSet(bytes32 indexed countryCode, string source);
    event RequestSent(bytes32 indexed requestId, bytes32 indexed countryCode, address owner, string documentId);
    event RequestFulfilled(bytes32 indexed requestId, address owner, uint256 weightKg);
    event RequestFailed(bytes32 indexed requestId, bytes error);
    event ManualVerificationRequired(bytes32 indexed requestId, address owner, string reason);
    event ManualVerificationCompleted(bytes32 indexed requestId, address indexed verifier);

    constructor(
        address _router,
        address _recyclingCreditsAddress,
        address _verifierGatewayAddress,
        uint64 _subscriptionId,
        bytes32 _donId
    ) FunctionsClient(_router) Ownable(msg.sender) {
        recyclingCreditsContract = IRecyclingCredits(_recyclingCreditsAddress);
        verifierGateway = IVerifierGateway(_verifierGatewayAddress);
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

    function setVerifierGatewayAddress(address _newAddress) external onlyOwner {
        verifierGateway = IVerifierGateway(_newAddress);
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
            recyclingCreditsContract.certifyAndMint(
                storedRequest.owner,
                materialType,
                weightKg,
                location,
                proofHash
            );
            emit RequestFulfilled(requestId, storedRequest.owner, weightKg);
        } else {
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
    
    function processManualVerificationWithSignature(
        bytes32 _requestId,
        string calldata _correctedMaterial,
        uint256 _correctedWeightKg,
        string calldata _location,
        bytes32 _proofHash,
        bytes32 _nonce,
        bytes calldata _signature
    ) external onlyOwner {
        ManualRequest storage requestToProcess = manualRequests[_requestId];
        require(requestToProcess.status == Status.Pending, "Request is not pending review");
        require(_correctedWeightKg > 0, "Corrected weight must be greater than zero");

        verifierGateway.mintWithSignature(
            requestToProcess.owner,
            _correctedMaterial,
            _correctedWeightKg,
            _location,
            _proofHash,
            _nonce,
            _signature
        );

        requestToProcess.status = Status.Completed;
        emit ManualVerificationCompleted(_requestId, msg.sender);
    }
    
    function getPendingManualRequestCount() external view returns (uint256) {
        return pendingManualRequestIds.length;
    }

    function getManualRequestDetails(bytes32 _requestId) external view returns (ManualRequest memory) {
        return manualRequests[_requestId];
    }

    function addPendingRequest(bytes32 _requestId, address _owner, string memory _documentId) external onlyOwner {
        pendingRequests[_requestId] = Request({
            owner: _owner,
            documentHash: keccak256(abi.encodePacked(_documentId))
        });
    }
}