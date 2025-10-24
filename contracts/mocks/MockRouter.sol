// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Importing the interface for the client contract for type safety.
interface IFunctionsClient {
    function handleOracleFulfillment(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) external;
}

/**
 * @title MockRouter
 * @dev This mock simulates the Chainlink Functions Router for testing.
 * It has the required `sendRequest` function and a `simulateCallback` function
 * to mimic the Oracle's response.
 */
contract MockRouter {
    
    event MockRequestSent(bytes32 requestId);

    function sendRequest(
        uint64, // subscriptionId
        bytes calldata, // data
        uint16, // dataVersion
        uint32, // callbackGasLimit
        bytes32 // donId
    ) external returns (bytes32) {
        bytes32 requestId = keccak256(abi.encodePacked(msg.sender, block.timestamp));
        emit MockRequestSent(requestId);
        return requestId;
    }

    /**
     * @notice Simulates the Oracle calling the client contract's callback.
     * @dev This function allows the test script to trigger the fulfillment logic.
     * As this contract is the 'router' in the test, calls from it will pass
     * the 'OnlyRouterCanFulfill' check in the FunctionsClient.
     */
    function simulateCallback(
        address gatewayAddress,
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) external {
        IFunctionsClient(gatewayAddress).handleOracleFulfillment(
            requestId,
            response,
            err
        );
    }
}