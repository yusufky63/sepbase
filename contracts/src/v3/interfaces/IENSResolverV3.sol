// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

/// @notice ENS-compatible EVM address resolver interface.
interface IAddrResolver {
    function addr(bytes32 node) external view returns (address);
}

/// @notice ENSIP-9 multicoin address resolver interface.
interface IMulticoinAddressResolver {
    function addr(bytes32 node, uint256 coinType) external view returns (bytes memory);
}

/// @notice ENS-compatible text-record resolver interface.
interface ITextResolver {
    function text(bytes32 node, string calldata key) external view returns (string memory);
}

/// @notice ENS-compatible reverse-name resolver interface.
interface INameResolver {
    function name(bytes32 node) external view returns (string memory);
}

/// @notice Minimal ENS registry view used by clients that discover a resolver through a node.
interface IENSRegistryView {
    function owner(bytes32 node) external view returns (address);
    function resolver(bytes32 node) external view returns (address);
    function ttl(bytes32 node) external pure returns (uint64);
}
