// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import { Script } from "forge-std/Script.sol";
import { ChainNameService } from "../src/ChainNameService.sol";

contract Deploy is Script {
    function run() external returns (ChainNameService service) {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address owner = vm.envAddress("OWNER_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        string memory settlementName = vm.envString("SETTLEMENT_KIND");
        require(
            keccak256(bytes(settlementName)) == keccak256(bytes("native"))
                || keccak256(bytes(settlementName)) == keccak256(bytes("erc20")),
            "invalid settlement kind"
        );
        ChainNameService.SettlementKind kind = keccak256(bytes(settlementName))
            == keccak256(bytes("erc20"))
            ? ChainNameService.SettlementKind.ERC20
            : ChainNameService.SettlementKind.NATIVE;
        address token = vm.envAddress("SETTLEMENT_TOKEN_ADDRESS");

        vm.startBroadcast(privateKey);
        service = new ChainNameService(
            vm.envString("COLLECTION_NAME"),
            vm.envString("COLLECTION_SYMBOL"),
            vm.envString("NAME_SUFFIX"),
            owner,
            treasury,
            uint64(vm.envUint("GRACE_PERIOD_SECONDS")),
            kind,
            token,
            vm.envUint("ANNUAL_PRICE_BASE_UNITS"),
            uint24(vm.envUint("SHORT_NAME_PRICE_MULTIPLIERS")),
            uint16(vm.envUint("REFERRAL_REWARD_BPS")),
            uint16(vm.envUint("MARKETPLACE_FEE_BPS")),
            vm.envString("METADATA_BASE_URI")
        );
        vm.stopBroadcast();

        string memory objectKey = "deployment";
        vm.serializeAddress(objectKey, "contract", address(service));
        vm.serializeString(objectKey, "deploymentBlock", vm.toString(block.number));
        vm.serializeString(objectKey, "deployedAtTimestamp", vm.toString(block.timestamp));
        vm.serializeAddress(objectKey, "owner", owner);
        string memory json = vm.serializeAddress(objectKey, "treasury", treasury);
        string memory output = string.concat(
            vm.projectRoot(), "/../deployments/", vm.toString(block.chainid), ".json"
        );
        vm.writeJson(json, output);
    }
}
