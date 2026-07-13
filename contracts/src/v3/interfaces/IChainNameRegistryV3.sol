// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @notice Marketplace-facing view and transfer boundary for ChainNameService v3.
interface IChainNameRegistryV3 is IERC721 {
    enum NameStatus {
        UNREGISTERED,
        ACTIVE,
        GRACE,
        RELEASED
    }

    function statusOf(uint256 tokenId) external view returns (NameStatus);
    function gracePeriod() external view returns (uint64);
    function expiresAt(uint256 tokenId) external view returns (uint64);
    function transferNonce(uint256 tokenId) external view returns (uint64);
    function suffix() external view returns (string memory);
    function suffixNode() external view returns (bytes32);
    function reverseRootNode() external view returns (bytes32);
    function normalizationProfileHash() external view returns (bytes32);
    function controller() external view returns (address);
    function resolverContract() external view returns (address);
    function migrationController() external view returns (address);
    function marketplace() external view returns (address);
    function tokenIdFor(string calldata normalizedLabel) external pure returns (uint256);
    function nodeForLabelHash(bytes32 labelHash) external view returns (bytes32);
    function labelOf(uint256 tokenId) external view returns (string memory);
    function fullName(uint256 tokenId) external view returns (string memory);
    function tokenIdForNode(bytes32 node) external view returns (bool known, uint256 tokenId);
    function registerFromController(string calldata label, address recipient, uint64 expiration)
        external
        returns (uint256 tokenId, bytes32 node);
    function renewFromController(uint256 tokenId, uint64 newExpiration) external;
    function migrateFromController(string calldata label, address recipient, uint64 expiration)
        external
        returns (uint256 tokenId, bytes32 node);
}
