// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {
    IAddrResolver,
    IMulticoinAddressResolver,
    INameResolver,
    ITextResolver
} from "./interfaces/IENSResolverV3.sol";
import { IChainNameRegistryV3 } from "./interfaces/IChainNameRegistryV3.sol";
import {
    IChainNameResolverWriterV3,
    IExtendedResolver
} from "./interfaces/IChainNameResolverWriterV3.sol";

/// @title Chain Name Public Resolver v3
/// @notice Versioned addr, multicoin, text, forward-confirmed reverse, and ENSIP-10 resolution.
/// @dev Every record key includes the registry transfer nonce. Ownership transfer, expiry/release,
///      and re-registration therefore invalidate old identity records without unbounded cleanup.
contract ChainNameResolverV3 is
    IERC165,
    IAddrResolver,
    IMulticoinAddressResolver,
    ITextResolver,
    INameResolver,
    IExtendedResolver,
    IChainNameResolverWriterV3
{
    string public constant VERSION = "3.0.0";
    uint256 internal constant EVM_COIN_TYPE = 60;
    uint256 internal constant MAX_COIN_ADDRESS_BYTES = 128;
    uint256 internal constant MAX_TEXT_KEY_BYTES = 64;
    uint256 internal constant MAX_TEXT_VALUE_BYTES = 512;
    uint256 internal constant MAX_INITIAL_TEXT_RECORDS = 10;
    uint256 internal constant MAX_DNS_LABELS = 16;

    struct ReverseRecord {
        address account;
        uint256 tokenId;
        uint64 transferNonce;
    }

    error InvalidRegistry();
    error InvalidNode();
    error InvalidCoinAddress();
    error InvalidDNSName();
    error UnsupportedResolverCall(bytes4 selector);
    error NotAuthorized();
    error NameNotActive();
    error FieldTooLong();
    error InitializationTooLarge();
    error InvalidInitialization();
    error NotInitializer();
    error PrimaryNotForwardConfirmed();
    error NoPrimaryName();

    event AddressChanged(bytes32 indexed node, uint256 indexed coinType, bytes value);
    event TextChanged(bytes32 indexed node, string indexed indexedKey, string key, string value);
    event PrimaryNameChanged(
        address indexed account, bool indexed configured, uint256 indexed tokenId, string name
    );
    event RecordsInitialized(
        uint256 indexed tokenId,
        bytes32 indexed node,
        address indexed addressRecord,
        uint256 textRecordCount
    );

    IChainNameRegistryV3 public immutable registry;
    bytes32 public immutable reverseRootNode;

    mapping(bytes32 recordKey => address target) private _evmAddresses;
    mapping(bytes32 recordKey => bool configured) private _evmAddressConfigured;
    mapping(bytes32 recordKey => bytes value) private _coinAddresses;
    mapping(bytes32 recordKey => string value) private _textRecords;
    mapping(bytes32 reverseNode => ReverseRecord record) private _reverseRecords;

    constructor(address registry_) {
        if (registry_ == address(0) || registry_.code.length == 0) revert InvalidRegistry();
        registry = IChainNameRegistryV3(registry_);
        reverseRootNode = IChainNameRegistryV3(registry_).reverseRootNode();
    }

    function addr(bytes32 node) public view returns (address) {
        (bool live, uint256 tokenId) = _liveTokenForNode(node);
        if (!live) return address(0);
        bytes32 key = _recordKey(tokenId, registry.transferNonce(tokenId), EVM_COIN_TYPE);
        if (_evmAddressConfigured[key]) return _evmAddresses[key];
        address tokenOwner = registry.ownerOf(tokenId);
        return tokenOwner == registry.marketplace() ? address(0) : tokenOwner;
    }

    function addr(bytes32 node, uint256 coinType) external view returns (bytes memory) {
        (bool live, uint256 tokenId) = _liveTokenForNode(node);
        if (!live) return "";
        if (coinType == EVM_COIN_TYPE) {
            address target = addr(node);
            return target == address(0) ? bytes("") : abi.encodePacked(target);
        }
        return _coinAddresses[_recordKey(tokenId, registry.transferNonce(tokenId), coinType)];
    }

    function setAddr(bytes32 node, address target) external {
        uint256 tokenId = _requireNodeAuthorization(node);
        bytes32 key = _recordKey(tokenId, registry.transferNonce(tokenId), EVM_COIN_TYPE);
        _evmAddresses[key] = target;
        _evmAddressConfigured[key] = true;
        emit AddressChanged(node, EVM_COIN_TYPE, abi.encodePacked(target));
    }

    function setAddr(bytes32 node, uint256 coinType, bytes calldata value) external {
        uint256 tokenId = _requireNodeAuthorization(node);
        if (value.length > MAX_COIN_ADDRESS_BYTES) revert InvalidCoinAddress();
        bytes32 key = _recordKey(tokenId, registry.transferNonce(tokenId), coinType);
        if (coinType == EVM_COIN_TYPE) {
            if (value.length != 20) revert InvalidCoinAddress();
            address target;
            assembly ("memory-safe") {
                target := shr(96, calldataload(value.offset))
            }
            _evmAddresses[key] = target;
            _evmAddressConfigured[key] = true;
        } else {
            _coinAddresses[key] = value;
        }
        emit AddressChanged(node, coinType, value);
    }

    function text(bytes32 node, string calldata key) public view returns (string memory) {
        (bool live, uint256 tokenId) = _liveTokenForNode(node);
        if (!live) return "";
        return _textRecords[_textKey(tokenId, registry.transferNonce(tokenId), key)];
    }

    function setText(bytes32 node, string calldata key, string calldata value) external {
        uint256 tokenId = _requireNodeAuthorization(node);
        _validateText(key, value);
        _textRecords[_textKey(tokenId, registry.transferNonce(tokenId), key)] = value;
        emit TextChanged(node, key, key, value);
    }

    /// @notice Initializes committed records. Only the locked registrar or migration controller
    /// calls.
    function initializeRecords(
        uint256 tokenId,
        address addressRecord,
        string[] calldata textKeys,
        string[] calldata textValues
    ) external {
        if (msg.sender != registry.controller() && msg.sender != registry.migrationController()) {
            revert NotInitializer();
        }
        if (textKeys.length != textValues.length) revert InvalidInitialization();
        if (textKeys.length > MAX_INITIAL_TEXT_RECORDS) revert InitializationTooLarge();
        if (!_isLive(tokenId)) revert NameNotActive();
        uint64 nonce = registry.transferNonce(tokenId);
        bytes32 node = registry.nodeForLabelHash(bytes32(tokenId));
        bytes32 addressKey = _recordKey(tokenId, nonce, EVM_COIN_TYPE);
        _evmAddresses[addressKey] = addressRecord;
        _evmAddressConfigured[addressKey] = true;
        emit AddressChanged(node, EVM_COIN_TYPE, abi.encodePacked(addressRecord));
        for (uint256 index; index < textKeys.length;) {
            _validateText(textKeys[index], textValues[index]);
            _textRecords[_textKey(tokenId, nonce, textKeys[index])] = textValues[index];
            emit TextChanged(node, textKeys[index], textKeys[index], textValues[index]);
            unchecked {
                ++index;
            }
        }
        emit RecordsInitialized(tokenId, node, addressRecord, textKeys.length);
    }

    /// @notice Sets a primary only when forward resolution confirms the caller.
    function setPrimaryName(uint256 tokenId) external {
        if (registry.ownerOf(tokenId) != msg.sender || !_isLive(tokenId)) revert NotAuthorized();
        bytes32 node = registry.nodeForLabelHash(bytes32(tokenId));
        if (addr(node) != msg.sender) revert PrimaryNotForwardConfirmed();
        bytes32 reverseNode = reverseNodeFor(msg.sender);
        uint64 nonce = registry.transferNonce(tokenId);
        _reverseRecords[reverseNode] =
            ReverseRecord({ account: msg.sender, tokenId: tokenId, transferNonce: nonce });
        emit PrimaryNameChanged(msg.sender, true, tokenId, registry.fullName(tokenId));
    }

    function clearPrimaryName() external {
        bytes32 reverseNode = reverseNodeFor(msg.sender);
        if (_reverseRecords[reverseNode].account != msg.sender) revert NoPrimaryName();
        delete _reverseRecords[reverseNode];
        emit PrimaryNameChanged(msg.sender, false, 0, "");
    }

    function name(bytes32 node) public view returns (string memory) {
        ReverseRecord memory record = _reverseRecords[node];
        if (record.account == address(0)) return "";
        if (!_isLive(record.tokenId)) return "";
        if (registry.ownerOf(record.tokenId) != record.account) return "";
        if (registry.transferNonce(record.tokenId) != record.transferNonce) return "";
        bytes32 forwardNode = registry.nodeForLabelHash(bytes32(record.tokenId));
        if (addr(forwardNode) != record.account) return "";
        return registry.fullName(record.tokenId);
    }

    function primaryNameOf(address account) external view returns (string memory) {
        return name(reverseNodeFor(account));
    }

    function reverseNodeFor(address account) public view returns (bytes32) {
        return keccak256(abi.encodePacked(reverseRootNode, _addressLabelHash(account)));
    }

    /// @inheritdoc IExtendedResolver
    function resolve(bytes calldata dnsName, bytes calldata data)
        external
        view
        returns (bytes memory)
    {
        if (data.length < 4) revert UnsupportedResolverCall(bytes4(0));
        bytes32 expectedNode = _dnsNamehash(dnsName);
        bytes4 selector;
        assembly ("memory-safe") {
            selector := calldataload(data.offset)
        }
        if (selector == IAddrResolver.addr.selector) {
            bytes32 node = abi.decode(data[4:], (bytes32));
            if (node != expectedNode) revert InvalidNode();
            return abi.encode(addr(node));
        }
        if (selector == IMulticoinAddressResolver.addr.selector) {
            (bytes32 node, uint256 coinType) = abi.decode(data[4:], (bytes32, uint256));
            if (node != expectedNode) revert InvalidNode();
            (bool live, uint256 tokenId) = _liveTokenForNode(node);
            if (!live) return abi.encode(bytes(""));
            if (coinType == EVM_COIN_TYPE) {
                address target = addr(node);
                return abi.encode(target == address(0) ? bytes("") : abi.encodePacked(target));
            }
            return abi.encode(
                _coinAddresses[_recordKey(tokenId, registry.transferNonce(tokenId), coinType)]
            );
        }
        if (selector == ITextResolver.text.selector) {
            (bytes32 node, string memory key) = abi.decode(data[4:], (bytes32, string));
            if (node != expectedNode) revert InvalidNode();
            return abi.encode(_textMemory(node, key));
        }
        if (selector == INameResolver.name.selector) {
            bytes32 node = abi.decode(data[4:], (bytes32));
            if (node != expectedNode) revert InvalidNode();
            return abi.encode(name(node));
        }
        revert UnsupportedResolverCall(selector);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC165).interfaceId
            || interfaceId == type(IAddrResolver).interfaceId
            || interfaceId == type(IMulticoinAddressResolver).interfaceId
            || interfaceId == type(ITextResolver).interfaceId
            || interfaceId == type(INameResolver).interfaceId
            || interfaceId == type(IExtendedResolver).interfaceId;
    }

    function _requireNodeAuthorization(bytes32 node) internal view returns (uint256 tokenId) {
        (bool known, uint256 value) = registry.tokenIdForNode(node);
        if (!known || !_isLive(value)) revert NameNotActive();
        address tokenOwner = registry.ownerOf(value);
        if (
            msg.sender != tokenOwner && registry.getApproved(value) != msg.sender
                && !registry.isApprovedForAll(tokenOwner, msg.sender)
        ) revert NotAuthorized();
        return value;
    }

    function _liveTokenForNode(bytes32 node) internal view returns (bool live, uint256 tokenId) {
        (bool known, uint256 value) = registry.tokenIdForNode(node);
        if (!known) return (false, 0);
        return (_isLive(value), value);
    }

    function _isLive(uint256 tokenId) internal view returns (bool) {
        IChainNameRegistryV3.NameStatus status = registry.statusOf(tokenId);
        return status == IChainNameRegistryV3.NameStatus.ACTIVE
            || status == IChainNameRegistryV3.NameStatus.GRACE;
    }

    function _textMemory(bytes32 node, string memory key) internal view returns (string memory) {
        (bool live, uint256 tokenId) = _liveTokenForNode(node);
        if (!live) return "";
        return _textRecords[
            keccak256(abi.encode(tokenId, registry.transferNonce(tokenId), keccak256(bytes(key))))
        ];
    }

    function _recordKey(uint256 tokenId, uint64 nonce, uint256 coinType)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(tokenId, nonce, coinType));
    }

    function _textKey(uint256 tokenId, uint64 nonce, string calldata key)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(tokenId, nonce, keccak256(bytes(key))));
    }

    function _validateText(string calldata key, string calldata value) internal pure {
        if (bytes(key).length == 0 || bytes(key).length > MAX_TEXT_KEY_BYTES) {
            revert FieldTooLong();
        }
        if (bytes(value).length > MAX_TEXT_VALUE_BYTES) revert FieldTooLong();
    }

    function _dnsNamehash(bytes calldata dnsName) internal pure returns (bytes32 node) {
        bytes32[MAX_DNS_LABELS] memory labels;
        uint256 cursor;
        uint256 count;
        bool terminated;
        while (cursor < dnsName.length) {
            uint256 length = uint8(dnsName[cursor]);
            unchecked {
                ++cursor;
            }
            if (length == 0) {
                if (cursor != dnsName.length) revert InvalidDNSName();
                terminated = true;
                break;
            }
            if (count == MAX_DNS_LABELS || cursor + length > dnsName.length) {
                revert InvalidDNSName();
            }
            labels[count] = keccak256(dnsName[cursor:cursor + length]);
            unchecked {
                cursor += length;
                ++count;
            }
        }
        if (!terminated || count == 0) revert InvalidDNSName();
        while (count != 0) {
            unchecked {
                --count;
            }
            node = keccak256(abi.encodePacked(node, labels[count]));
        }
    }

    function _addressLabelHash(address account) internal pure returns (bytes32) {
        bytes20 raw = bytes20(account);
        bytes memory label = new bytes(40);
        bytes16 alphabet = "0123456789abcdef";
        for (uint256 index; index < 20;) {
            uint8 value = uint8(raw[index]);
            label[index * 2] = alphabet[value >> 4];
            label[index * 2 + 1] = alphabet[value & 0x0f];
            unchecked {
                ++index;
            }
        }
        return keccak256(label);
    }
}
