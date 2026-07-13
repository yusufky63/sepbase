// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import { MockERC20 } from "./MockERC20.sol";

contract MockFailingPayoutERC20 is MockERC20 {
    bool public rejectTransfers;

    constructor(uint8 decimals_) MockERC20("Failing payout token", "FAIL", decimals_) { }

    function setRejectTransfers(bool reject) external {
        rejectTransfers = reject;
    }

    function transfer(address recipient, uint256 amount) public override returns (bool) {
        if (rejectTransfers) return false;
        return super.transfer(recipient, amount);
    }
}
