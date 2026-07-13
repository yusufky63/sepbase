// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {
    IAddrResolver,
    IENSRegistryView,
    IMulticoinAddressResolver,
    INameResolver
} from "./interfaces/IENSResolverV3.sol";
import { IExtendedResolver } from "./interfaces/IChainNameResolverWriterV3.sol";

/// @notice ENSIP-23-compatible entrypoint for this standalone registry and its extended resolver.
interface IUniversalResolverV3 {
    function resolve(bytes calldata name, bytes calldata data)
        external
        view
        returns (bytes memory result, address resolver);

    function reverse(bytes calldata lookupAddress, uint256 coinType)
        external
        view
        returns (string memory primary, address resolver, address reverseResolver);
}

/// @title Chain Name Universal Resolver v3
/// @notice Registry discovery plus ENSIP-10 dispatch and forward-confirmed EVM reverse resolution.
/// @dev This intentionally excludes CCIP-Read and smart multicall. It implements the standard
/// simple resolve/reverse ABI for the on-chain records supported by this standalone suite.
contract ChainNameUniversalResolverV3 is IERC165, IUniversalResolverV3 {
    string public constant VERSION = "3.0.0";
    uint256 internal constant EVM_COIN_TYPE = 60;
    uint256 internal constant MAX_DNS_LABELS = 16;

    error ResolverNotFound(bytes name);
    error ResolverNotContract(bytes name, address resolver);
    error UnsupportedResolverProfile(bytes4 selector);
    error ResolverError(bytes errorData);
    error ReverseAddressMismatch(string primary, bytes primaryAddress);
    error InvalidDNSName();
    error UnsupportedCoinType(uint256 coinType);
    error InvalidLookupAddress();

    IENSRegistryView public immutable registry;

    constructor(address registry_) {
        if (registry_ == address(0) || registry_.code.length == 0) {
            revert ResolverNotContract("", registry_);
        }
        registry = IENSRegistryView(registry_);
    }

    /// @inheritdoc IUniversalResolverV3
    function resolve(bytes calldata name, bytes calldata data)
        external
        view
        returns (bytes memory result, address resolverAddress)
    {
        return _resolve(name, data);
    }

    /// @inheritdoc IUniversalResolverV3
    function reverse(bytes calldata lookupAddress, uint256 coinType)
        external
        view
        returns (string memory primary, address resolverAddress, address reverseResolver)
    {
        if (coinType != EVM_COIN_TYPE) revert UnsupportedCoinType(coinType);
        if (lookupAddress.length != 20) revert InvalidLookupAddress();
        address account;
        assembly ("memory-safe") {
            account := shr(96, calldataload(lookupAddress.offset))
        }

        bytes memory reverseName = _reverseDNSName(account);
        bytes32 reverseNode = _dnsNamehash(reverseName);
        bytes memory reverseCall = abi.encodeWithSelector(INameResolver.name.selector, reverseNode);
        bytes memory reverseResult;
        (reverseResult, reverseResolver) = _resolveMemory(reverseName, reverseCall);
        primary = abi.decode(reverseResult, (string));
        if (bytes(primary).length == 0) return ("", address(0), reverseResolver);

        bytes memory forwardName = _dnsEncodeName(primary);
        bytes32 forwardNode = _dnsNamehash(forwardName);
        bytes memory forwardCall = abi.encodeWithSelector(
            IMulticoinAddressResolver.addr.selector, forwardNode, EVM_COIN_TYPE
        );
        bytes memory forwardResult;
        (forwardResult, resolverAddress) = _resolveMemory(forwardName, forwardCall);
        bytes memory resolvedAddress = abi.decode(forwardResult, (bytes));
        if (keccak256(resolvedAddress) != keccak256(lookupAddress)) {
            revert ReverseAddressMismatch(primary, resolvedAddress);
        }
    }

    /// @notice Returns the first resolver found from the exact node toward the DNS root.
    function findResolver(bytes calldata name)
        external
        view
        returns (address resolverAddress, bytes32 node, uint256 resolverOffset)
    {
        return _findResolver(name);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC165).interfaceId
            || interfaceId == type(IUniversalResolverV3).interfaceId;
    }

    function _resolve(bytes calldata name, bytes calldata data)
        internal
        view
        returns (bytes memory result, address resolverAddress)
    {
        bytes memory nameCopy = name;
        bytes memory dataCopy = data;
        return _resolveMemory(nameCopy, dataCopy);
    }

    function _resolveMemory(bytes memory name, bytes memory data)
        internal
        view
        returns (bytes memory result, address resolverAddress)
    {
        (resolverAddress,,) = _findResolverMemory(name);
        if (resolverAddress == address(0)) revert ResolverNotFound(name);
        if (resolverAddress.code.length == 0) revert ResolverNotContract(name, resolverAddress);
        bytes4 selector = data.length >= 4 ? bytes4(data) : bytes4(0);
        (bool supportCallSucceeded, bytes memory supportResult) = resolverAddress.staticcall(
            abi.encodeWithSelector(
                IERC165.supportsInterface.selector, type(IExtendedResolver).interfaceId
            )
        );
        if (
            !supportCallSucceeded || supportResult.length < 32 || !abi.decode(supportResult, (bool))
        ) {
            revert UnsupportedResolverProfile(selector);
        }
        (bool success, bytes memory returnData) = resolverAddress.staticcall(
            abi.encodeWithSelector(IExtendedResolver.resolve.selector, name, data)
        );
        if (!success) revert ResolverError(returnData);
        result = abi.decode(returnData, (bytes));
    }

    function _findResolver(bytes calldata name)
        internal
        view
        returns (address resolverAddress, bytes32 node, uint256 resolverOffset)
    {
        bytes memory nameCopy = name;
        return _findResolverMemory(nameCopy);
    }

    function _findResolverMemory(bytes memory name)
        internal
        view
        returns (address resolverAddress, bytes32 node, uint256 resolverOffset)
    {
        (
            bytes32[MAX_DNS_LABELS] memory labels,
            uint16[MAX_DNS_LABELS] memory offsets,
            uint256 count
        ) = _parseDNSName(name);
        bytes32 originalNode;
        for (uint256 cursor = count; cursor != 0;) {
            unchecked {
                --cursor;
            }
            originalNode = keccak256(abi.encodePacked(originalNode, labels[cursor]));
        }
        for (uint256 start; start < count;) {
            bytes32 resolverNode;
            for (uint256 cursor = count; cursor > start;) {
                unchecked {
                    --cursor;
                }
                resolverNode = keccak256(abi.encodePacked(resolverNode, labels[cursor]));
            }
            resolverAddress = registry.resolver(resolverNode);
            if (resolverAddress != address(0)) {
                return (resolverAddress, originalNode, offsets[start]);
            }
            unchecked {
                ++start;
            }
        }
        return (address(0), originalNode, 0);
    }

    function _parseDNSName(bytes memory name)
        internal
        pure
        returns (
            bytes32[MAX_DNS_LABELS] memory labels,
            uint16[MAX_DNS_LABELS] memory offsets,
            uint256 count
        )
    {
        uint256 cursor;
        bool terminated;
        while (cursor < name.length) {
            if (cursor > type(uint16).max) revert InvalidDNSName();
            offsets[count] = uint16(cursor);
            uint256 length = uint8(name[cursor]);
            unchecked {
                ++cursor;
            }
            if (length == 0) {
                if (cursor != name.length) revert InvalidDNSName();
                terminated = true;
                break;
            }
            if (count == MAX_DNS_LABELS || cursor + length > name.length) {
                revert InvalidDNSName();
            }
            bytes32 labelHash;
            assembly ("memory-safe") {
                labelHash := keccak256(add(add(name, 0x20), cursor), length)
            }
            labels[count] = labelHash;
            unchecked {
                cursor += length;
                ++count;
            }
        }
        if (!terminated || count == 0) revert InvalidDNSName();
    }

    function _dnsNamehash(bytes memory name) internal pure returns (bytes32 node) {
        (bytes32[MAX_DNS_LABELS] memory labels,, uint256 count) = _parseDNSName(name);
        while (count != 0) {
            unchecked {
                --count;
            }
            node = keccak256(abi.encodePacked(node, labels[count]));
        }
    }

    function _reverseDNSName(address account) internal pure returns (bytes memory result) {
        bytes memory label = _addressLabel(account);
        result = new bytes(54);
        result[0] = bytes1(uint8(40));
        for (uint256 index; index < 40;) {
            result[index + 1] = label[index];
            unchecked {
                ++index;
            }
        }
        result[41] = bytes1(uint8(4));
        result[42] = "a";
        result[43] = "d";
        result[44] = "d";
        result[45] = "r";
        result[46] = bytes1(uint8(7));
        result[47] = "r";
        result[48] = "e";
        result[49] = "v";
        result[50] = "e";
        result[51] = "r";
        result[52] = "s";
        result[53] = "e";
        // The zero terminator is supplied by the next allocated byte in `_appendTerminator`.
        result = _appendTerminator(result);
    }

    function _dnsEncodeName(string memory value) internal pure returns (bytes memory result) {
        bytes memory raw = bytes(value);
        uint256 separator = type(uint256).max;
        for (uint256 index; index < raw.length;) {
            if (raw[index] == ".") {
                if (separator != type(uint256).max) revert InvalidDNSName();
                separator = index;
            }
            unchecked {
                ++index;
            }
        }
        if (separator == 0 || separator == type(uint256).max || separator + 1 == raw.length) {
            revert InvalidDNSName();
        }
        uint256 suffixLength = raw.length - separator - 1;
        if (separator > type(uint8).max || suffixLength > type(uint8).max) {
            revert InvalidDNSName();
        }
        result = new bytes(raw.length + 2);
        result[0] = bytes1(uint8(separator));
        for (uint256 index; index < separator;) {
            result[index + 1] = raw[index];
            unchecked {
                ++index;
            }
        }
        result[separator + 1] = bytes1(uint8(suffixLength));
        for (uint256 index; index < suffixLength;) {
            result[separator + 2 + index] = raw[separator + 1 + index];
            unchecked {
                ++index;
            }
        }
    }

    function _appendTerminator(bytes memory value) internal pure returns (bytes memory result) {
        result = new bytes(value.length + 1);
        for (uint256 index; index < value.length;) {
            result[index] = value[index];
            unchecked {
                ++index;
            }
        }
    }

    function _addressLabel(address account) internal pure returns (bytes memory label) {
        bytes20 raw = bytes20(account);
        label = new bytes(40);
        bytes16 alphabet = "0123456789abcdef";
        for (uint256 index; index < 20;) {
            uint8 value = uint8(raw[index]);
            label[index * 2] = alphabet[value >> 4];
            label[index * 2 + 1] = alphabet[value & 0x0f];
            unchecked {
                ++index;
            }
        }
    }
}
