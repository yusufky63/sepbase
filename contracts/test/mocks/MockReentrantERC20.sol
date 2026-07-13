// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import { MockERC20 } from "./MockERC20.sol";

contract MockReentrantERC20 is MockERC20 {
    address public reentryTarget;
    bytes public reentryCallData;
    uint256 public reentryAttempts;
    bool public reentrySucceeded;
    bytes32 public reentryRevertDataHash;

    constructor(uint8 decimals_) MockERC20("Reentrant settlement token", "REENTER", decimals_) { }

    function configureReentry(address target, bytes calldata callData) external {
        reentryTarget = target;
        reentryCallData = callData;
    }

    function transferFrom(address sender, address recipient, uint256 amount)
        public
        override
        returns (bool)
    {
        if (reentryTarget != address(0)) {
            reentryAttempts += 1;
            bytes memory returnData;
            (reentrySucceeded, returnData) = reentryTarget.call(reentryCallData);
            if (!reentrySucceeded) reentryRevertDataHash = keccak256(returnData);
        }
        return super.transferFrom(sender, recipient, amount);
    }
}
