// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import { ChainNameService } from "../src/ChainNameService.sol";
import { ChainNameServiceTestBase } from "./helpers/ChainNameServiceTestBase.sol";

contract ChainNameServiceFuzzTest is ChainNameServiceTestBase {
    function testFuzz_ValidLengthLabels(uint8 rawLength) public view {
        uint256 length = bound(rawLength, 1, 32);
        bytes memory label = new bytes(length);
        for (uint256 index; index < length; ++index) {
            label[index] = bytes1(uint8(97 + (index % 26)));
        }
        assertTrue(service.isValidLabel(string(label)));
    }

    function testFuzz_StandardQuoteScalesByDuration(uint256 rawPrice, uint8 rawDuration) public {
        uint256 price = bound(rawPrice, 1, type(uint256).max / (uint256(type(uint8).max) * 5));
        uint8 duration = uint8(bound(rawDuration, 1, 5));
        vm.prank(owner);
        service.setAnnualPrice(price);
        assertEq(service.quote("alice", duration), price * duration);
    }

    function testFuzz_ReferralAccountingUsesFloorRounding(uint96 rawPrice) public {
        uint256 price = bound(uint256(rawPrice), 1, type(uint96).max);
        vm.prank(owner);
        service.setAnnualPrice(price);
        vm.deal(bob, price);
        vm.prank(bob);
        service.register{ value: price }("builder", 1, bob, alice, price, REFERRAL_BPS);
        assertEq(service.referralBalance(alice), (price * REFERRAL_BPS) / 10_000);
        assertLe(service.totalProtectedLiability(), service.settlementBalance());
    }

    function testFuzz_ExpirationNeverDecreases(uint8 rawFirst, uint8 rawSecond) public {
        uint8 first = uint8(bound(rawFirst, 1, 5));
        uint8 second = uint8(bound(rawSecond, 1, 5));
        uint256 tokenId = _register("alice", alice, alice, address(0), first);
        uint256 beforeExpiration = service.expiresAt(tokenId);
        uint256 amount = ANNUAL_PRICE * second;
        vm.prank(bob);
        service.renew{ value: amount }(tokenId, second, amount);
        assertGt(service.expiresAt(tokenId), beforeExpiration);
    }
}
