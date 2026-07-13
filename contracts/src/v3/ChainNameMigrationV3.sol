// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import { IChainNameLegacyV2 } from "./interfaces/IChainNameLegacyV2.sol";
import { IChainNameRegistryV3 } from "./interfaces/IChainNameRegistryV3.sol";
import { IChainNameResolverWriterV3 } from "./interfaces/IChainNameResolverWriterV3.sol";

/// @title Chain Name v2 to v3 Migration Controller
/// @notice Time-bounded, non-destructive claims based on live v2 owner and lifecycle reads.
/// @dev It never burns, locks, withdraws from, or otherwise mutates v2. Referral, marketplace,
///      primary, profile, and proceeds state are deliberately not imported. Live v2 labels are
///      reserved from suite activation through the inclusive migration end, while claims remain
///      unavailable before `migrationStartsAt`.
contract ChainNameMigrationV3 is Ownable2Step, ReentrancyGuard {
    string public constant VERSION = "3.0.0";

    error InvalidRegistry();
    error InvalidResolver();
    error InvalidLegacyRegistry();
    error InvalidMigrationWindow();
    error IncompatibleGracePeriods(uint64 legacyGracePeriod, uint64 v3GracePeriod);
    error InvalidLegacyLabel();
    error InvalidRecipient();
    error MigrationPaused();
    error MigrationWindowClosed();
    error LegacyClaimUnavailable();
    error LegacyExpiryInconsistent(uint8 status, uint64 expiration);
    error LegacyOwnerChanged(address expected, address actual);
    error LegacyResolutionChanged(address expected, address actual);
    error NotLegacyOwner();

    event LegacyNameMigrated(
        uint256 indexed sourceChainId,
        address indexed legacyRegistry,
        uint256 indexed tokenId,
        address legacyOwner,
        address v3Owner,
        uint256 sourceBlock,
        uint64 legacyExpiry,
        bool resolutionImported,
        address initializedAddress
    );
    event MigrationPauseChanged(bool paused);

    IChainNameRegistryV3 public immutable registry;
    IChainNameResolverWriterV3 public immutable resolver;
    IChainNameLegacyV2 public immutable legacyRegistry;
    uint256 public immutable sourceChainId;
    uint64 public immutable migrationStartsAt;
    uint64 public immutable migrationEndsAt;
    uint64 public immutable legacyGracePeriod;
    bool public migrationPaused;

    constructor(
        address registry_,
        address resolver_,
        address legacyRegistry_,
        uint256 sourceChainId_,
        uint64 migrationStartsAt_,
        uint64 migrationEndsAt_,
        address initialOwner
    ) Ownable(initialOwner) {
        if (registry_ == address(0) || registry_.code.length == 0) {
            revert InvalidRegistry();
        }
        if (resolver_ == address(0) || resolver_.code.length == 0) revert InvalidResolver();
        if (legacyRegistry_ == address(0) || legacyRegistry_.code.length == 0) {
            revert InvalidLegacyRegistry();
        }
        if (
            sourceChainId_ != block.chainid || migrationEndsAt_ <= migrationStartsAt_
                || migrationEndsAt_ <= block.timestamp
        ) revert InvalidMigrationWindow();
        if (initialOwner == address(0) || initialOwner == address(this)) {
            revert InvalidRecipient();
        }
        IChainNameRegistryV3 targetRegistry = IChainNameRegistryV3(registry_);
        IChainNameLegacyV2 sourceRegistry = IChainNameLegacyV2(legacyRegistry_);
        uint64 sourceGracePeriod = sourceRegistry.gracePeriod();
        uint64 targetGracePeriod = targetRegistry.gracePeriod();
        if (targetGracePeriod != sourceGracePeriod) {
            revert IncompatibleGracePeriods(sourceGracePeriod, targetGracePeriod);
        }
        registry = targetRegistry;
        resolver = IChainNameResolverWriterV3(resolver_);
        legacyRegistry = sourceRegistry;
        sourceChainId = sourceChainId_;
        migrationStartsAt = migrationStartsAt_;
        migrationEndsAt = migrationEndsAt_;
        legacyGracePeriod = sourceGracePeriod;
    }

    /// @notice Reserves every live v2 identity from deployment through the inclusive window end.
    /// @dev Reservation deliberately begins before claims when `migrationStartsAt` is in the
    ///      future. A pause never releases the reservation. After `migrationEndsAt`, the announced
    ///      post-window public-registration policy takes effect.
    function isReserved(uint256 tokenId) external view returns (bool) {
        if (block.timestamp > migrationEndsAt) return false;
        uint8 status = legacyRegistry.statusOf(tokenId);
        return status == 1 || status == 2;
    }

    /// @notice Claims the same ASCII v2 label and preserves its expiry without creating
    /// liabilities. @param importLegacyResolution Explicit user choice; false initializes forward
    /// resolution to v3 owner.
    /// @param expectedLegacyResolution Guard used only when importing the reviewed v2 resolution.
    function claim(
        string calldata legacyLabel,
        address recipient,
        address expectedLegacyOwner,
        bool importLegacyResolution,
        address expectedLegacyResolution
    ) external nonReentrant returns (uint256 tokenId, bytes32 node) {
        if (migrationPaused) revert MigrationPaused();
        if (block.timestamp < migrationStartsAt || block.timestamp > migrationEndsAt) {
            revert MigrationWindowClosed();
        }
        if (!_isLegacyAsciiLabel(legacyLabel)) revert InvalidLegacyLabel();
        if (recipient == address(0) || recipient == address(this)) revert InvalidRecipient();
        tokenId = uint256(keccak256(bytes(legacyLabel)));
        address legacyOwner = legacyRegistry.ownerOf(tokenId);
        if (legacyOwner != expectedLegacyOwner) {
            revert LegacyOwnerChanged(expectedLegacyOwner, legacyOwner);
        }
        if (legacyOwner != msg.sender) revert NotLegacyOwner();
        uint8 status = legacyRegistry.statusOf(tokenId);
        if (status != 1 && status != 2) revert LegacyClaimUnavailable();
        uint64 legacyExpiry = legacyRegistry.expiresAt(tokenId);
        if (
            (status == 1 && block.timestamp > legacyExpiry)
                || (status == 2
                    && (block.timestamp <= legacyExpiry
                        || block.timestamp > uint256(legacyExpiry) + legacyGracePeriod))
        ) revert LegacyExpiryInconsistent(status, legacyExpiry);

        address initializedAddress = recipient;
        if (importLegacyResolution) {
            address currentResolution = legacyRegistry.resolvedAddress(tokenId);
            if (currentResolution != expectedLegacyResolution) {
                revert LegacyResolutionChanged(expectedLegacyResolution, currentResolution);
            }
            initializedAddress = currentResolution;
        }
        (tokenId, node) = registry.migrateFromController(legacyLabel, recipient, legacyExpiry);
        string[] memory noKeys = new string[](0);
        string[] memory noValues = new string[](0);
        resolver.initializeRecords(tokenId, initializedAddress, noKeys, noValues);
        emit LegacyNameMigrated(
            sourceChainId,
            address(legacyRegistry),
            tokenId,
            legacyOwner,
            recipient,
            block.number,
            legacyExpiry,
            importLegacyResolution,
            initializedAddress
        );
    }

    function setMigrationPaused(bool paused) external onlyOwner {
        migrationPaused = paused;
        emit MigrationPauseChanged(paused);
    }

    function _isLegacyAsciiLabel(string calldata label) internal pure returns (bool) {
        bytes calldata value = bytes(label);
        if (value.length == 0 || value.length > 32) return false;
        bool previousHyphen;
        for (uint256 index; index < value.length;) {
            bytes1 character = value[index];
            bool hyphen = character == "-";
            bool valid = (character >= "a" && character <= "z")
                || (character >= "0" && character <= "9") || hyphen;
            if (!valid || (hyphen && (index == 0 || index + 1 == value.length || previousHyphen))) {
                return false;
            }
            previousHyphen = hyphen;
            unchecked {
                ++index;
            }
        }
        return true;
    }
}
