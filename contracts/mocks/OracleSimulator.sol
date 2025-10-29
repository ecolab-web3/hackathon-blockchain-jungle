// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// This contract must simulate both sending a request and fulfilling it.
// To pass the 'OnlyRouterCanFulfill' check, this contract's address must be the router.
interface IFunctionsClient {
    function handleOracleFulfillment(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) external;
}

contract OracleSimulator {
    event MockRequestSent(bytes32 requestId);

    function sendRequest(
        uint64, bytes calldata, uint16, uint32, bytes32
    ) external returns (bytes32) {
        bytes32 requestId = keccak256(abi.encodePacked(msg.sender, block.timestamp));
        emit MockRequestSent(requestId);
        return requestId;
    }

    function simulateCallback(
        address clientAddress,
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) external {
        IFunctionsClient(clientAddress).handleOracleFulfillment(
            requestId, response, err
        );
    }
}