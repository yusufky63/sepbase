// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

/// @notice Shared settlement and solvency view implemented by the v3 registrar controller.
interface IChainNameControllerV3 {
    enum SettlementKind {
        NATIVE,
        ERC20
    }

    function settlementKind() external view returns (SettlementKind);
    function settlementToken() external view returns (address);
    function registry() external view returns (address);
    function protectedBalance() external view returns (uint256);
    function settlementBalance() external view returns (uint256);
    function isSolvent() external view returns (bool);
}
