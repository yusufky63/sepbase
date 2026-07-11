// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockFeeOnTransferERC20 is ERC20 {
    uint16 public constant FEE_BPS = 100;
    uint16 private constant BPS_DENOMINATOR = 10_000;
    uint8 private immutable _tokenDecimals;

    constructor(uint8 decimals_) ERC20("Fee Token", "FEE") {
        _tokenDecimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _tokenDecimals;
    }

    function mint(address recipient, uint256 amount) external {
        _mint(recipient, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0)) {
            super._update(from, to, value);
            return;
        }

        uint256 fee = (value * FEE_BPS) / BPS_DENOMINATOR;
        super._update(from, address(0), fee);
        super._update(from, to, value - fee);
    }
}
