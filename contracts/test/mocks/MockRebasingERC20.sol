// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Simulates a positive balance rebase during every non-mint/non-burn transfer.
/// @dev The receiver gains one extra base unit, so exact sender/recipient delta checks must reject
///      the asset and roll the whole transfer back.
contract MockRebasingERC20 is ERC20 {
    uint8 private immutable _tokenDecimals;

    constructor(uint8 decimals_) ERC20("Rebasing Token", "RBS") {
        _tokenDecimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _tokenDecimals;
    }

    function mint(address recipient, uint256 amount) external {
        _mint(recipient, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (from != address(0) && to != address(0)) {
            _mint(to, 1);
        }
    }
}
