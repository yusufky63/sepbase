// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import { Script } from "forge-std/Script.sol";
import { ChainNameService } from "../src/ChainNameService.sol";

contract Admin is Script {
    error UnsupportedAdminAction();

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        ChainNameService service = ChainNameService(payable(vm.envAddress("CONTRACT_ADDRESS")));
        bytes32 action = keccak256(bytes(vm.envString("ADMIN_ACTION")));

        vm.startBroadcast(privateKey);
        if (action == keccak256("setAnnualPrice")) {
            service.setAnnualPrice(vm.envUint("ADMIN_VALUE"));
        } else if (action == keccak256("setReferralRewardBps")) {
            service.setReferralRewardBps(uint16(vm.envUint("ADMIN_VALUE")));
        } else if (action == keccak256("setMarketplaceFeeBps")) {
            service.setMarketplaceFeeBps(uint16(vm.envUint("ADMIN_VALUE")));
        } else if (action == keccak256("setRegistrationsPaused")) {
            service.setRegistrationsPaused(vm.envBool("ADMIN_BOOL"));
        } else if (action == keccak256("setMarketplacePaused")) {
            service.setMarketplacePaused(vm.envBool("ADMIN_BOOL"));
        } else if (action == keccak256("setTreasury")) {
            service.setTreasury(vm.envAddress("ADMIN_ADDRESS"));
        } else if (action == keccak256("setMetadataBaseURI")) {
            service.setMetadataBaseURI(vm.envString("ADMIN_STRING"));
        } else if (action == keccak256("withdrawTreasury")) {
            service.withdrawTreasury();
        } else {
            revert UnsupportedAdminAction();
        }
        vm.stopBroadcast();
    }
}
