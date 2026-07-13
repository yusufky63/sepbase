// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

/// @notice Restricted initialization boundary used by the v3 controller and migration controller.
interface IChainNameResolverWriterV3 {
    function initializeRecords(
        uint256 tokenId,
        address addressRecord,
        string[] calldata textKeys,
        string[] calldata textValues
    ) external;
}

/// @notice ENSIP-10 extended resolver interface used by Universal Resolver.
interface IExtendedResolver {
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory);
}
