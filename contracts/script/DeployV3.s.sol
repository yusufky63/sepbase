// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import { Script } from "forge-std/Script.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import { ChainNameControllerV3 } from "../src/v3/ChainNameControllerV3.sol";
import { ChainNameMarketplaceV3 } from "../src/v3/ChainNameMarketplaceV3.sol";
import { ChainNameMarketLensV3 } from "../src/v3/ChainNameMarketLensV3.sol";
import { ChainNameMigrationV3 } from "../src/v3/ChainNameMigrationV3.sol";
import { ChainNameRegistryV3 } from "../src/v3/ChainNameRegistryV3.sol";
import { ChainNameResolverV3 } from "../src/v3/ChainNameResolverV3.sol";
import { ChainNameUniversalResolverV3 } from "../src/v3/ChainNameUniversalResolverV3.sol";

/// @notice Deploys the no-proxy v3 suite in order and locks wiring in the final transaction.
/// @dev CREATE/configure calls are separate broadcast transactions. Do not publish a manifest until
///      every receipt, runtime version/code hash, and final registry wiring has been verified. A
///      partial run leaves an inactive/unpublished registry for the recovery runbook to reconcile.
contract DeployV3 is Script {
    using SafeCast for uint256;

    struct Suite {
        ChainNameRegistryV3 registry;
        ChainNameControllerV3 controller;
        ChainNameResolverV3 resolver;
        ChainNameMarketplaceV3 marketplace;
        ChainNameMarketLensV3 marketLens;
        ChainNameMigrationV3 migration;
        ChainNameUniversalResolverV3 universalResolver;
    }

    function run() external returns (Suite memory suite) {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address configurator = vm.addr(privateKey);
        address owner = vm.envAddress("OWNER_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        ChainNameControllerV3.SettlementKind kind = _settlementKind();
        address token = vm.envAddress("SETTLEMENT_TOKEN_ADDRESS");

        vm.startBroadcast(privateKey);
        suite.registry = new ChainNameRegistryV3(
            vm.envString("COLLECTION_NAME"),
            vm.envString("COLLECTION_SYMBOL"),
            vm.envString("NAME_SUFFIX"),
            vm.envBytes32("SUFFIX_NODE"),
            vm.envBytes32("REVERSE_ROOT_NODE"),
            vm.envBytes32("NORMALIZATION_PROFILE_HASH"),
            owner,
            configurator,
            vm.envUint("GRACE_PERIOD_SECONDS").toUint64(),
            vm.envString("METADATA_BASE_URI")
        );
        suite.resolver = new ChainNameResolverV3(address(suite.registry));
        suite.controller = new ChainNameControllerV3(
            address(suite.registry),
            address(suite.resolver),
            owner,
            treasury,
            vm.envUint("MIN_COMMITMENT_AGE_SECONDS").toUint64(),
            vm.envUint("MAX_COMMITMENT_AGE_SECONDS").toUint64(),
            vm.envAddress("NORMALIZATION_ATTESTOR_ADDRESS"),
            vm.envUint("MAX_NORMALIZATION_ATTESTATION_VALIDITY_SECONDS").toUint64(),
            kind,
            token,
            vm.envUint("ANNUAL_PRICE_BASE_UNITS"),
            vm.envUint("SHORT_NAME_PRICE_MULTIPLIERS").toUint24(),
            vm.envUint("REFERRAL_REWARD_BPS").toUint16()
        );
        suite.migration = new ChainNameMigrationV3(
            address(suite.registry),
            address(suite.resolver),
            vm.envAddress("LEGACY_V2_CONTRACT_ADDRESS"),
            block.chainid,
            vm.envUint("MIGRATION_START_TIMESTAMP").toUint64(),
            vm.envUint("MIGRATION_END_TIMESTAMP").toUint64(),
            owner
        );
        suite.marketplace = new ChainNameMarketplaceV3(
            address(suite.registry),
            address(suite.controller),
            owner,
            treasury,
            vm.envUint("MARKETPLACE_FEE_BPS").toUint16(),
            vm.envUint("MIN_BID_INCREMENT_BPS").toUint16(),
            vm.envUint("AUCTION_EXTENSION_WINDOW_SECONDS").toUint64(),
            vm.envUint("AUCTION_EXTENSION_DURATION_SECONDS").toUint64(),
            vm.envUint("AUCTION_MAX_EXTENSIONS").toUint8()
        );
        suite.universalResolver = new ChainNameUniversalResolverV3(address(suite.registry));
        suite.marketLens = new ChainNameMarketLensV3(address(suite.marketplace));
        suite.registry
            .configureSuite(
                address(suite.controller),
                address(suite.resolver),
                address(suite.migration),
                address(suite.marketplace)
            );
        vm.stopBroadcast();

        _writeManifest(suite, owner, treasury, kind, token);
    }

    function _settlementKind() internal view returns (ChainNameControllerV3.SettlementKind) {
        string memory configured = vm.envString("SETTLEMENT_KIND");
        bytes32 value = keccak256(bytes(configured));
        if (value == keccak256(bytes("native"))) {
            return ChainNameControllerV3.SettlementKind.NATIVE;
        }
        require(value == keccak256(bytes("erc20")), "invalid settlement kind");
        return ChainNameControllerV3.SettlementKind.ERC20;
    }

    function _writeManifest(
        Suite memory suite,
        address owner,
        address treasury,
        ChainNameControllerV3.SettlementKind kind,
        address token
    ) internal {
        string memory key = "v3";
        vm.serializeString(key, "schemaVersion", "3");
        vm.serializeString(key, "status", "draft-configured-unverified");
        vm.serializeString(key, "suiteVersion", "3.0.0");
        vm.serializeString(key, "chainId", vm.toString(block.chainid));
        vm.serializeAddress(key, "registry", address(suite.registry));
        vm.serializeAddress(key, "controller", address(suite.controller));
        vm.serializeAddress(key, "resolver", address(suite.resolver));
        vm.serializeAddress(key, "marketplace", address(suite.marketplace));
        vm.serializeAddress(key, "marketLens", address(suite.marketLens));
        vm.serializeAddress(key, "migration", address(suite.migration));
        vm.serializeAddress(key, "universalResolver", address(suite.universalResolver));
        vm.serializeAddress(key, "normalizationAttestor", suite.controller.normalizationAttestor());
        vm.serializeBytes32(
            key, "normalizationProfileHash", suite.registry.normalizationProfileHash()
        );
        vm.serializeString(key, "suffix", suite.registry.suffix());
        vm.serializeBytes32(key, "suffixNode", suite.registry.suffixNode());
        vm.serializeBytes32(key, "reverseRootNode", suite.registry.reverseRootNode());
        vm.serializeString(
            key,
            "settlementKind",
            kind == ChainNameControllerV3.SettlementKind.NATIVE ? "native" : "erc20"
        );
        vm.serializeAddress(key, "settlementToken", token);
        vm.serializeAddress(key, "owner", owner);
        vm.serializeAddress(key, "treasury", treasury);
        vm.serializeString(key, "configuredAtBlock", vm.toString(block.number));
        string memory json =
            vm.serializeString(key, "deployedAtTimestamp", vm.toString(block.timestamp));
        string memory output = string.concat(
            vm.projectRoot(), "/../deployments/", vm.toString(block.chainid), "-v3.json"
        );
        vm.writeJson(json, output);
    }
}
