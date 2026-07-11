// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import { Test } from "forge-std/Test.sol";
import { ChainNameService } from "../../src/ChainNameService.sol";

abstract contract ChainNameServiceTestBase is Test {
    uint256 internal constant ANNUAL_PRICE = 500_000_000_000_000;
    uint256 internal constant SALE_PRICE = 2_500_000_000_000_000;
    uint16 internal constant REFERRAL_BPS = 1000;
    uint64 internal constant GRACE_PERIOD = 30 days;
    uint24 internal constant SHORT_NAME_PRICE_MULTIPLIERS = uint24(100 | (25 << 8) | (5 << 16));

    address internal owner = makeAddr("owner");
    address internal treasury = makeAddr("treasury");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal operator = makeAddr("operator");

    ChainNameService internal service;

    function setUp() public virtual {
        service = _deployNative();
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);
    }

    function _deployNative() internal returns (ChainNameService) {
        return _deployNativeWithMultipliers(SHORT_NAME_PRICE_MULTIPLIERS);
    }

    function _deployNativeWithMultipliers(uint24 multipliers) internal returns (ChainNameService) {
        return new ChainNameService(
            "Sepbase Names",
            "SEPBASE",
            "sepbase",
            owner,
            treasury,
            GRACE_PERIOD,
            ChainNameService.SettlementKind.NATIVE,
            address(0),
            ANNUAL_PRICE,
            multipliers,
            REFERRAL_BPS,
            0,
            "http://localhost:3000/api/metadata/"
        );
    }

    function _register(
        string memory label,
        address payer,
        address recipient,
        address referrer,
        uint8 years_
    ) internal returns (uint256 tokenId) {
        uint256 amount = service.quote(label, years_);
        vm.prank(payer);
        tokenId = service.register{ value: amount }(
            label, years_, recipient, referrer, amount, referrer == address(0) ? 0 : REFERRAL_BPS
        );
    }

    function _emptyProfile(string memory displayName)
        internal
        pure
        returns (ChainNameService.Profile memory)
    {
        return ChainNameService.Profile({
            displayName: displayName, bio: "", avatar: "", website: "", twitter: "", github: ""
        });
    }
}
