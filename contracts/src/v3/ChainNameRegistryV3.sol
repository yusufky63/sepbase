// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import { IERC4906 } from "@openzeppelin/contracts/interfaces/IERC4906.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {
    ERC721Enumerable
} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";

import { CanonicalLabel } from "./libraries/CanonicalLabel.sol";
import { IENSRegistryView } from "./interfaces/IENSResolverV3.sol";

interface IMigrationReservationV3 {
    function isReserved(uint256 tokenId) external view returns (bool);
}

interface IRegistryBoundV3 {
    function registry() external view returns (address);
}

interface IResolverBoundV3 is IRegistryBoundV3 {
    function resolver() external view returns (address);
}

interface IMarketplaceBoundV3 is IRegistryBoundV3 {
    function controller() external view returns (address);
}

/// @title Chain Name Registry v3
/// @notice Minimal no-proxy ERC-721/base-registrar and ENS registry ownership layer.
/// @dev Registrar, resolver, and migration authorities are independently deployed and then locked
/// by the one-time `configureSuite` call. Exact normalized UTF-8 bytes define labelhash/token ID.
contract ChainNameRegistryV3 is ERC721Enumerable, Ownable2Step, IERC4906, IENSRegistryView {
    string public constant VERSION = "3.0.0";
    bytes32 public constant ADDR_REVERSE_NODE =
        0x91d1777781884d03a6757a803996e38de2a42967fb37eeaca72729271025a9e2;
    uint8 internal constant MAX_LABEL_CODEPOINTS = 32;
    uint8 internal constant MAX_LABEL_BYTES = 96;
    uint8 internal constant MAX_SUFFIX_LENGTH = 32;
    uint8 internal constant MAX_COLLECTION_NAME_BYTES = 64;
    uint8 internal constant MAX_COLLECTION_SYMBOL_BYTES = 16;
    uint16 internal constant MAX_RESERVED_BATCH = 100;
    uint64 internal constant MIN_GRACE_PERIOD = 1 days;
    uint64 internal constant MAX_GRACE_PERIOD = 90 days;

    enum NameStatus {
        UNREGISTERED,
        ACTIVE,
        GRACE,
        RELEASED
    }

    error InvalidLabel();
    error InvalidSuffix();
    error InvalidCollectionMetadata();
    error InvalidGracePeriod();
    error InvalidMetadataURI();
    error InvalidNormalizationProfile();
    error InvalidNode();
    error ZeroAddress();
    error InvalidRecipient();
    error NameNotAvailable();
    error NameDoesNotExist(uint256 tokenId);
    error RenewalWindowClosed();
    error ExpiryCannotDecrease();
    error ReleasedTokenLocked();
    error SelfTransferToContractForbidden();
    error MarketplaceCustodyRequiresOperator();
    error NotController();
    error NotMigrationController();
    error NotSuiteConfigurator();
    error SuiteAlreadyConfigured();
    error InvalidSuiteWiring();
    error SuiteNotConfigured();
    error MigrationReservationActive();
    error MigrationReservationUnavailable();
    error NameReserved();
    error BatchTooLarge();

    event SuiteConfigured(
        address indexed controller,
        address indexed resolver,
        address indexed migrationController,
        address marketplace
    );
    event NameRegistered(
        uint256 indexed tokenId,
        bytes32 indexed labelHash,
        bytes32 indexed node,
        string label,
        address recipient,
        uint64 expiration
    );
    event NameRenewed(uint256 indexed tokenId, uint64 previousExpiry, uint64 newExpiry);
    event NameMigrated(
        uint256 indexed tokenId,
        bytes32 indexed labelHash,
        bytes32 indexed node,
        string label,
        address recipient,
        uint64 expiration
    );
    event MetadataBaseURIChanged(string previousURI, string newURI);
    event ReservedLabelChanged(bytes32 indexed labelHash, bool reserved);

    string public suffix;
    bytes32 public immutable suffixNode;
    bytes32 public immutable reverseRootNode;
    bytes32 public immutable normalizationProfileHash;
    uint64 public immutable gracePeriod;
    address public immutable suiteConfigurator;
    string public metadataBaseURI;

    address public controller;
    address public resolverContract;
    address public migrationController;
    address public marketplace;
    bool public suiteConfigured;

    mapping(uint256 tokenId => uint64 timestamp) public expiresAt;
    mapping(uint256 tokenId => uint64 nonce) public transferNonce;
    mapping(bytes32 labelHash => bool reserved) public reservedLabels;
    mapping(uint256 tokenId => string label) private _labels;
    mapping(bytes32 node => uint256 tokenId) private _nodeTokenId;
    mapping(bytes32 node => bool known) private _nodeKnown;

    constructor(
        string memory collectionName,
        string memory collectionSymbol,
        string memory suffix_,
        bytes32 suffixNode_,
        bytes32 reverseRootNode_,
        bytes32 normalizationProfileHash_,
        address initialOwner,
        address suiteConfigurator_,
        uint64 gracePeriod_,
        string memory metadataBaseURI_
    ) ERC721(collectionName, collectionSymbol) Ownable(initialOwner) {
        if (
            bytes(collectionName).length == 0
                || bytes(collectionName).length > MAX_COLLECTION_NAME_BYTES
                || bytes(collectionSymbol).length == 0
                || bytes(collectionSymbol).length > MAX_COLLECTION_SYMBOL_BYTES
        ) revert InvalidCollectionMetadata();
        if (!_isValidSuffix(suffix_)) revert InvalidSuffix();
        bytes32 expectedSuffixNode =
            keccak256(abi.encodePacked(bytes32(0), keccak256(bytes(suffix_))));
        if (suffixNode_ != expectedSuffixNode || reverseRootNode_ != ADDR_REVERSE_NODE) {
            revert InvalidNode();
        }
        if (normalizationProfileHash_ == bytes32(0)) revert InvalidNormalizationProfile();
        if (initialOwner == address(0) || initialOwner == address(this)) revert ZeroAddress();
        if (suiteConfigurator_ == address(0) || suiteConfigurator_ == address(this)) {
            revert ZeroAddress();
        }
        if (gracePeriod_ < MIN_GRACE_PERIOD || gracePeriod_ > MAX_GRACE_PERIOD) {
            revert InvalidGracePeriod();
        }
        _validateMetadataURI(metadataBaseURI_);
        suffix = suffix_;
        suffixNode = suffixNode_;
        reverseRootNode = reverseRootNode_;
        normalizationProfileHash = normalizationProfileHash_;
        gracePeriod = gracePeriod_;
        suiteConfigurator = suiteConfigurator_;
        metadataBaseURI = metadataBaseURI_;
    }

    /// @notice Locks the independently deployed controller, resolver, and migration boundaries.
    function configureSuite(
        address controller_,
        address resolver_,
        address migrationController_,
        address marketplace_
    ) external {
        if (msg.sender != suiteConfigurator) {
            revert NotSuiteConfigurator();
        }
        if (suiteConfigured) revert SuiteAlreadyConfigured();
        if (
            controller_ == address(0) || controller_.code.length == 0 || resolver_ == address(0)
                || resolver_.code.length == 0 || migrationController_ == address(0)
                || migrationController_.code.length == 0 || marketplace_ == address(0)
                || marketplace_.code.length == 0
        ) revert ZeroAddress();
        if (
            IResolverBoundV3(controller_).registry() != address(this)
                || IResolverBoundV3(controller_).resolver() != resolver_
                || IRegistryBoundV3(resolver_).registry() != address(this)
                || IResolverBoundV3(migrationController_).registry() != address(this)
                || IResolverBoundV3(migrationController_).resolver() != resolver_
                || IMarketplaceBoundV3(marketplace_).registry() != address(this)
                || IMarketplaceBoundV3(marketplace_).controller() != controller_
        ) revert InvalidSuiteWiring();
        controller = controller_;
        resolverContract = resolver_;
        migrationController = migrationController_;
        marketplace = marketplace_;
        suiteConfigured = true;
        emit SuiteConfigured(controller_, resolver_, migrationController_, marketplace_);
    }

    function isValidLabel(string calldata label) public pure returns (bool) {
        (bool valid,) = CanonicalLabel.validate(label, MAX_LABEL_BYTES, MAX_LABEL_CODEPOINTS);
        return valid;
    }

    function labelHashFor(string calldata label) public pure returns (bytes32) {
        return keccak256(bytes(label));
    }

    function tokenIdFor(string calldata label) public pure returns (uint256) {
        return uint256(keccak256(bytes(label)));
    }

    function nodeForLabelHash(bytes32 labelHash) public view returns (bytes32) {
        return keccak256(abi.encodePacked(suffixNode, labelHash));
    }

    function tokenIdForNode(bytes32 node) external view returns (bool known, uint256 tokenId) {
        return (_nodeKnown[node], _nodeTokenId[node]);
    }

    function statusOf(uint256 tokenId) public view returns (NameStatus) {
        if (_ownerOf(tokenId) == address(0)) return NameStatus.UNREGISTERED;
        uint256 expiration = expiresAt[tokenId];
        if (block.timestamp <= expiration) return NameStatus.ACTIVE;
        if (block.timestamp <= expiration + gracePeriod) return NameStatus.GRACE;
        return NameStatus.RELEASED;
    }

    function isAvailable(string calldata label) external view returns (bool) {
        if (!isValidLabel(label)) return false;
        uint256 tokenId = uint256(keccak256(bytes(label)));
        if (reservedLabels[bytes32(tokenId)]) return false;
        NameStatus status = statusOf(tokenId);
        if (status != NameStatus.UNREGISTERED && status != NameStatus.RELEASED) return false;
        return !_migrationReserved(tokenId, true);
    }

    function labelOf(uint256 tokenId) external view returns (string memory) {
        _requireOwned(tokenId);
        return _labels[tokenId];
    }

    function fullName(uint256 tokenId) public view returns (string memory) {
        _requireOwned(tokenId);
        return string.concat(_labels[tokenId], ".", suffix);
    }

    /// @notice Mints through the locked registrar controller only.
    function registerFromController(string calldata label, address recipient, uint64 expiration)
        external
        returns (uint256 tokenId, bytes32 node)
    {
        if (msg.sender != controller) revert NotController();
        if (!suiteConfigured) revert SuiteNotConfigured();
        _validateRecipient(recipient);
        if (expiration <= block.timestamp) revert RenewalWindowClosed();
        (bool valid,) = CanonicalLabel.validate(label, MAX_LABEL_BYTES, MAX_LABEL_CODEPOINTS);
        if (!valid) revert InvalidLabel();
        bytes32 labelHash = keccak256(bytes(label));
        if (reservedLabels[labelHash]) revert NameReserved();
        tokenId = uint256(labelHash);
        if (_migrationReserved(tokenId, false)) revert MigrationReservationActive();
        NameStatus previousStatus = statusOf(tokenId);
        if (previousStatus != NameStatus.UNREGISTERED && previousStatus != NameStatus.RELEASED) {
            revert NameNotAvailable();
        }
        if (previousStatus == NameStatus.RELEASED) _retireReleased(tokenId);
        node = _initializeName(tokenId, labelHash, label, recipient, expiration);
        emit NameRegistered(tokenId, labelHash, node, label, recipient, expiration);
    }

    function renewFromController(uint256 tokenId, uint64 newExpiration) external {
        if (msg.sender != controller) revert NotController();
        if (_ownerOf(tokenId) == address(0)) revert NameDoesNotExist(tokenId);
        if (statusOf(tokenId) == NameStatus.RELEASED) revert RenewalWindowClosed();
        uint64 previous = expiresAt[tokenId];
        if (newExpiration <= previous || newExpiration <= block.timestamp) {
            revert ExpiryCannotDecrease();
        }
        expiresAt[tokenId] = newExpiration;
        emit NameRenewed(tokenId, previous, newExpiration);
        emit MetadataUpdate(tokenId);
    }

    /// @notice Mints through the isolated migration policy only; it cannot alter v2 state.
    /// @dev `expiration` is the exact source expiry: it is never clamped or extended. Deployment
    ///      requires the migration controller to prove the v3 grace period exactly matches the
    ///      source grace period, and this final guard rejects any mapping already released on v3.
    function migrateFromController(string calldata label, address recipient, uint64 expiration)
        external
        returns (uint256 tokenId, bytes32 node)
    {
        if (msg.sender != migrationController) revert NotMigrationController();
        _validateRecipient(recipient);
        if (uint256(expiration) + gracePeriod < block.timestamp) revert RenewalWindowClosed();
        (bool valid,) = CanonicalLabel.validate(label, MAX_LABEL_BYTES, MAX_LABEL_CODEPOINTS);
        if (!valid) revert InvalidLabel();
        bytes32 labelHash = keccak256(bytes(label));
        tokenId = uint256(labelHash);
        if (statusOf(tokenId) != NameStatus.UNREGISTERED) revert NameNotAvailable();
        node = _initializeName(tokenId, labelHash, label, recipient, expiration);
        emit NameMigrated(tokenId, labelHash, node, label, recipient, expiration);
    }

    function setMetadataBaseURI(string calldata newURI) external onlyOwner {
        _validateMetadataURI(newURI);
        string memory previous = metadataBaseURI;
        metadataBaseURI = newURI;
        emit MetadataBaseURIChanged(previous, newURI);
        emit BatchMetadataUpdate(0, type(uint256).max);
    }

    /// @notice Reserves future public registrations without changing an existing token right.
    function setReservedLabels(bytes32[] calldata labelHashes, bool reserved) external onlyOwner {
        if (labelHashes.length == 0 || labelHashes.length > MAX_RESERVED_BATCH) {
            revert BatchTooLarge();
        }
        for (uint256 index; index < labelHashes.length;) {
            if (labelHashes[index] == bytes32(0)) revert InvalidLabel();
            reservedLabels[labelHashes[index]] = reserved;
            emit ReservedLabelChanged(labelHashes[index], reserved);
            unchecked {
                ++index;
            }
        }
    }

    /// @inheritdoc IENSRegistryView
    function owner(bytes32 node) external view returns (address) {
        if (node == suffixNode || node == reverseRootNode) return owner();
        if (!_nodeKnown[node]) return address(0);
        uint256 tokenId = _nodeTokenId[node];
        return _isLive(tokenId) ? _ownerOf(tokenId) : address(0);
    }

    /// @inheritdoc IENSRegistryView
    function resolver(bytes32 node) external view returns (address) {
        if (!suiteConfigured) return address(0);
        if (node == suffixNode || node == reverseRootNode) return resolverContract;
        if (!_nodeKnown[node]) return address(0);
        return _isLive(_nodeTokenId[node]) ? resolverContract : address(0);
    }

    /// @inheritdoc IENSRegistryView
    function ttl(bytes32) external pure returns (uint64) {
        return 0;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Enumerable, IERC165)
        returns (bool)
    {
        return interfaceId == type(IERC4906).interfaceId
            || interfaceId == type(IENSRegistryView).interfaceId
            || super.supportsInterface(interfaceId);
    }

    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721Enumerable)
        returns (address from)
    {
        address currentOwner = _ownerOf(tokenId);
        bool regularTransfer = currentOwner != address(0) && to != address(0);
        if (regularTransfer && statusOf(tokenId) == NameStatus.RELEASED) {
            revert ReleasedTokenLocked();
        }
        if (to == address(this)) revert SelfTransferToContractForbidden();
        if (to == marketplace && auth != marketplace) revert MarketplaceCustodyRequiresOperator();
        from = super._update(to, tokenId, auth);
        if (from != address(0)) {
            unchecked {
                ++transferNonce[tokenId];
            }
        }
        if (regularTransfer) emit MetadataUpdate(tokenId);
    }

    function _initializeName(
        uint256 tokenId,
        bytes32 labelHash,
        string calldata label,
        address recipient,
        uint64 expiration
    ) internal returns (bytes32 node) {
        _labels[tokenId] = label;
        expiresAt[tokenId] = expiration;
        if (transferNonce[tokenId] == 0) transferNonce[tokenId] = 1;
        node = nodeForLabelHash(labelHash);
        _nodeKnown[node] = true;
        _nodeTokenId[node] = tokenId;
        _safeMint(recipient, tokenId);
    }

    function _retireReleased(uint256 tokenId) internal {
        _burn(tokenId);
        delete _labels[tokenId];
        delete expiresAt[tokenId];
    }

    function _migrationReserved(uint256 tokenId, bool viewFallback) internal view returns (bool) {
        if (!suiteConfigured) return viewFallback;
        try IMigrationReservationV3(migrationController).isReserved(tokenId) returns (
            bool reserved
        ) {
            return reserved;
        } catch {
            if (viewFallback) return true;
            revert MigrationReservationUnavailable();
        }
    }

    function _isLive(uint256 tokenId) internal view returns (bool) {
        NameStatus status = statusOf(tokenId);
        return status == NameStatus.ACTIVE || status == NameStatus.GRACE;
    }

    function _validateRecipient(address recipient) internal view {
        if (recipient == address(0) || recipient == address(this)) revert InvalidRecipient();
    }

    function _validateMetadataURI(string memory uri) internal pure {
        bytes memory value = bytes(uri);
        if (value.length == 0 || value[value.length - 1] != "/") revert InvalidMetadataURI();
    }

    function _isValidSuffix(string memory suffix_) internal pure returns (bool) {
        bytes memory value = bytes(suffix_);
        if (value.length == 0 || value.length > MAX_SUFFIX_LENGTH) return false;
        for (uint256 index; index < value.length;) {
            bytes1 character = value[index];
            if (!((character >= "a" && character <= "z") || (character >= "0" && character <= "9")))
            {
                return false;
            }
            unchecked {
                ++index;
            }
        }
        return true;
    }

    function _baseURI() internal view override returns (string memory) {
        return metadataBaseURI;
    }
}
