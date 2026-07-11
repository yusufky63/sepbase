// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import { MockERC20 } from "./MockERC20.sol";

contract MockAdminBurnERC20 is MockERC20 {
    constructor(uint8 decimals_) MockERC20("Admin Burn Token", "BURN", decimals_) { }

    function adminBurn(address account, uint256 amount) external {
        _burn(account, amount);
    }
}
