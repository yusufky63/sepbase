// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

/// @notice Read-only boundary for non-destructive claims from a legacy v2 deployment.
interface IChainNameLegacyV2 {
    function gracePeriod() external view returns (uint64);
    function ownerOf(uint256 tokenId) external view returns (address);
    function statusOf(uint256 tokenId) external view returns (uint8);
    function expiresAt(uint256 tokenId) external view returns (uint64);
    function resolvedAddress(uint256 tokenId) external view returns (address);
}
