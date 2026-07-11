// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import { ChainNameService } from "../src/ChainNameService.sol";
import { ChainNameServiceTestBase } from "./helpers/ChainNameServiceTestBase.sol";
import { MockERC20 } from "./mocks/MockERC20.sol";
import { MockFeeOnTransferERC20 } from "./mocks/MockFeeOnTransferERC20.sol";
import { MockAdminBurnERC20 } from "./mocks/MockAdminBurnERC20.sol";

contract ChainNameServiceUnitTest is ChainNameServiceTestBase {
    function test_InitialConfigurationAndInterfaces() public view {
        assertEq(service.name(), "Sepbase Names");
        assertEq(service.symbol(), "SEPBASE");
        assertEq(service.suffix(), "sepbase");
        assertEq(service.owner(), owner);
        assertEq(service.treasury(), treasury);
        assertEq(uint8(service.settlementKind()), uint8(ChainNameService.SettlementKind.NATIVE));
        assertEq(address(service.settlementToken()), address(0));
        assertEq(service.VERSION(), "2.0.0");
        assertTrue(service.supportsInterface(type(IERC165).interfaceId));
        assertTrue(service.supportsInterface(0x49064906));
    }

    function test_LabelValidationAndDeterministicTokenId() public view {
        assertTrue(service.isValidLabel("alice"));
        assertTrue(service.isValidLabel("alice-01"));
        assertTrue(service.isValidLabel("a"));
        assertTrue(service.isValidLabel("al"));
        assertTrue(service.isValidLabel("abc"));
        assertFalse(service.isValidLabel(""));
        assertFalse(service.isValidLabel("-"));
        assertFalse(service.isValidLabel("-alice"));
        assertFalse(service.isValidLabel("alice-"));
        assertFalse(service.isValidLabel("al--ice"));
        assertFalse(service.isValidLabel("Alice"));
        assertFalse(service.isValidLabel("alice.sepbase"));
        assertEq(service.tokenIdFor("alice"), uint256(keccak256(bytes("alice"))));
    }

    function test_ShortNamePricingAndRenewalUseTheSameTier() public {
        assertEq(service.quote("a", 1), ANNUAL_PRICE * 100);
        assertEq(service.quote("ab", 1), ANNUAL_PRICE * 25);
        assertEq(service.quote("abc", 1), ANNUAL_PRICE * 5);
        assertEq(service.quote("abcd", 1), ANNUAL_PRICE);
        assertEq(service.quote("alice", 5), ANNUAL_PRICE * 5);

        uint256 tokenId = _register("a", alice, alice, address(0), 1);
        uint256 renewal = ANNUAL_PRICE * 100 * 2;
        vm.prank(bob);
        service.renew{ value: renewal }(tokenId, 2, renewal);
        assertEq(service.ownerOf(tokenId), alice);
    }

    function test_InvalidShortNameMultiplierScheduleIsRejected() public {
        vm.expectRevert(ChainNameService.InvalidAnnualPrice.selector);
        _deployNativeWithMultipliers(uint24(5 | (25 << 8) | (100 << 16)));

        vm.expectRevert(ChainNameService.InvalidAnnualPrice.selector);
        _deployNativeWithMultipliers(uint24(100 | (25 << 8)));
    }

    function test_RegisterCreatesResolvableNameAndRecentEntry() public {
        uint256 tokenId = _register("alice", alice, alice, address(0), 2);

        assertEq(service.ownerOf(tokenId), alice);
        assertEq(service.resolve("alice"), alice);
        assertEq(service.fullName(tokenId), "alice.sepbase");
        assertEq(
            service.tokenURI(tokenId),
            string.concat("http://localhost:3000/api/metadata/", vm.toString(tokenId))
        );
        assertEq(uint8(service.statusOf(tokenId)), uint8(ChainNameService.NameStatus.ACTIVE));

        ChainNameService.RecentRegistration[] memory recent = service.getRecentRegistrations(10);
        assertEq(recent.length, 1);
        assertEq(recent[0].tokenId, tokenId);
        assertEq(recent[0].label, "alice");
        assertEq(recent[0].owner, alice);
    }

    function test_RegisterRejectsChangedPriceBeforeKeepingPayment() public {
        vm.prank(owner);
        service.setAnnualPrice(ANNUAL_PRICE * 2);

        vm.expectRevert(
            abi.encodeWithSelector(
                ChainNameService.PriceChanged.selector, ANNUAL_PRICE, ANNUAL_PRICE * 2
            )
        );
        vm.prank(alice);
        service.register{ value: ANNUAL_PRICE }("alice", 1, alice, address(0), ANNUAL_PRICE, 0);
        assertEq(address(service).balance, 0);
    }

    function test_ShortNameExpectedAmountGuardUsesPremiumQuote() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                ChainNameService.PriceChanged.selector, ANNUAL_PRICE, ANNUAL_PRICE * 100
            )
        );
        vm.prank(alice);
        service.register{ value: ANNUAL_PRICE }("a", 1, alice, address(0), ANNUAL_PRICE, 0);
        assertEq(address(service).balance, 0);
    }

    function test_ReferralUsesPullPaymentAndProtectsTreasuryFunds() public {
        _register("builder", bob, bob, alice, 1);
        uint256 reward = (ANNUAL_PRICE * REFERRAL_BPS) / 10_000;

        assertEq(service.referralBalance(alice), reward);
        assertEq(service.totalReferralLiability(), reward);
        assertEq(service.treasuryAvailableBalance(), ANNUAL_PRICE - reward);

        uint256 balanceBefore = alice.balance;
        vm.prank(alice);
        service.claimReferralRewards(alice);
        assertEq(alice.balance, balanceBefore + reward);
        assertEq(service.referralBalance(alice), 0);
        assertEq(service.totalReferralLiability(), 0);

        uint256 treasuryBefore = treasury.balance;
        vm.prank(owner);
        service.withdrawTreasury();
        assertEq(treasury.balance, treasuryBefore + ANNUAL_PRICE - reward);
    }

    function test_ReferralRateGuardRejectsChangedConfirmation() public {
        vm.prank(owner);
        service.setReferralRewardBps(500);

        vm.expectRevert(
            abi.encodeWithSelector(ChainNameService.ReferralRateChanged.selector, REFERRAL_BPS, 500)
        );
        vm.prank(bob);
        service.register{ value: ANNUAL_PRICE }(
            "builder", 1, bob, alice, ANNUAL_PRICE, REFERRAL_BPS
        );
    }

    function test_ProfilePrimaryAndTransferCleanupStayForwardConfirmed() public {
        uint256 tokenId = _register("alice", alice, alice, address(0), 1);
        ChainNameService.Profile memory profile = _emptyProfile("Alice");

        vm.prank(alice);
        service.updateNameData(tokenId, alice, profile);
        vm.prank(alice);
        service.setPrimaryName(tokenId);
        assertEq(service.primaryNameOf(alice), "alice.sepbase");

        vm.prank(alice);
        service.transferFrom(alice, bob, tokenId);
        assertEq(service.ownerOf(tokenId), bob);
        assertEq(service.resolvedAddress(tokenId), bob);
        assertEq(service.primaryNameOf(alice), "");
        assertFalse(service.hasPrimary(alice));
        ChainNameService.Profile memory cleared = service.profileOf(tokenId);
        assertEq(cleared.displayName, "");
    }

    function test_ResolutionMismatchClearsPrimary() public {
        uint256 tokenId = _register("alice", alice, alice, address(0), 1);
        vm.prank(alice);
        service.setPrimaryName(tokenId);

        vm.prank(alice);
        service.updateNameData(tokenId, bob, _emptyProfile("Alice"));
        assertFalse(service.hasPrimary(alice));
        assertEq(service.primaryNameOf(alice), "");
    }

    function test_ApprovedOperatorCanUpdateProfileButCannotSetPrimary() public {
        uint256 tokenId = _register("alice", alice, alice, address(0), 1);
        vm.prank(alice);
        service.approve(operator, tokenId);
        vm.prank(operator);
        service.updateNameData(tokenId, alice, _emptyProfile("Operator update"));

        vm.expectRevert(ChainNameService.NotAuthorized.selector);
        vm.prank(operator);
        service.setPrimaryName(tokenId);
    }

    function test_GraceRenewalUsesCurrentTimeAndInvalidatesStaleListing() public {
        uint256 tokenId = _register("alice", alice, alice, address(0), 1);
        vm.prank(alice);
        service.listForSale(tokenId, SALE_PRICE, 0);
        uint256 oldExpiration = service.expiresAt(tokenId);
        vm.warp(oldExpiration + 1);
        assertEq(uint8(service.statusOf(tokenId)), uint8(ChainNameService.NameStatus.GRACE));

        vm.prank(bob);
        service.renew{ value: ANNUAL_PRICE }(tokenId, 1, ANNUAL_PRICE);
        assertEq(service.expiresAt(tokenId), block.timestamp + 365 days);
        (, uint256 listingTotal) = service.getListings(0, 1);
        assertEq(listingTotal, 0);
    }

    function test_ReleasedNameCanBeReregisteredAndOldTokenCannotTransfer() public {
        uint256 tokenId = _register("alice", alice, alice, address(0), 1);
        vm.prank(alice);
        service.setPrimaryName(tokenId);
        vm.warp(service.expiresAt(tokenId) + service.gracePeriod() + 1);

        assertTrue(service.isAvailable("alice"));
        vm.expectRevert(ChainNameService.ReleasedTokenLocked.selector);
        vm.prank(alice);
        service.transferFrom(alice, bob, tokenId);

        _register("alice", bob, bob, address(0), 1);
        assertEq(service.ownerOf(tokenId), bob);
        assertFalse(service.hasPrimary(alice));
        assertEq(service.resolvedAddress(tokenId), bob);
    }

    function test_ReservedReleasedNameIsNotAvailable() public {
        uint256 tokenId = _register("alice", alice, alice, address(0), 1);
        string[] memory labels = new string[](1);
        labels[0] = "alice";
        vm.prank(owner);
        service.setReservedLabels(labels, true);
        vm.warp(service.expiresAt(tokenId) + service.gracePeriod() + 1);
        assertTrue(service.reservedLabels(keccak256(bytes("alice"))));
        assertFalse(service.isAvailable("alice"));
    }

    function test_MarketplaceBuyResetsIdentityAndCreditsSeller() public {
        uint256 tokenId = _register("alice", alice, alice, address(0), 1);
        vm.prank(alice);
        service.updateNameData(tokenId, alice, _emptyProfile("Alice"));
        vm.prank(alice);
        service.setPrimaryName(tokenId);
        vm.prank(alice);
        service.listForSale(tokenId, SALE_PRICE, 0);

        vm.prank(bob);
        service.buyListedName{ value: SALE_PRICE }(tokenId, SALE_PRICE);
        assertEq(service.ownerOf(tokenId), bob);
        assertEq(service.resolvedAddress(tokenId), bob);
        assertEq(service.sellerBalance(alice), SALE_PRICE);
        assertEq(service.totalMarketplaceLiability(), SALE_PRICE);
        (, uint256 listingTotal) = service.getListings(0, 1);
        assertEq(listingTotal, 0);
        assertFalse(service.hasPrimary(alice));
        assertEq(service.profileOf(tokenId).displayName, "");

        uint256 sellerBefore = alice.balance;
        vm.prank(alice);
        service.claimSaleProceeds(alice);
        assertEq(alice.balance, sellerBefore + SALE_PRICE);
        assertEq(service.totalMarketplaceLiability(), 0);
    }

    function test_MarketGuardsChangedFeeAndPrice() public {
        uint256 tokenId = _register("alice", alice, alice, address(0), 1);
        vm.prank(owner);
        service.setMarketplaceFeeBps(100);

        vm.expectRevert(
            abi.encodeWithSelector(ChainNameService.MarketplaceFeeChanged.selector, 0, 100)
        );
        vm.prank(alice);
        service.listForSale(tokenId, SALE_PRICE, 0);

        vm.prank(alice);
        service.listForSale(tokenId, SALE_PRICE, 100);
        vm.expectRevert(
            abi.encodeWithSelector(
                ChainNameService.PriceChanged.selector, SALE_PRICE - 1, SALE_PRICE
            )
        );
        vm.prank(bob);
        service.buyListedName{ value: SALE_PRICE - 1 }(tokenId, SALE_PRICE - 1);
    }

    function test_PausesAreScoped() public {
        uint256 tokenId = _register("alice", alice, alice, address(0), 1);
        vm.prank(owner);
        service.setRegistrationsPaused(true);
        vm.expectRevert(ChainNameService.RegistrationPaused.selector);
        vm.prank(bob);
        service.register{ value: ANNUAL_PRICE }("builder", 1, bob, address(0), ANNUAL_PRICE, 0);

        vm.prank(bob);
        service.renew{ value: ANNUAL_PRICE }(tokenId, 1, ANNUAL_PRICE);
        vm.prank(owner);
        service.setMarketplacePaused(true);
        vm.expectRevert(ChainNameService.MarketplacePaused.selector);
        vm.prank(alice);
        service.listForSale(tokenId, SALE_PRICE, 0);
    }

    function test_DirectNativeTransferIsRejected() public {
        vm.prank(alice);
        (bool success,) = address(service).call{ value: 1 }("");
        assertFalse(success);
        assertEq(address(service).balance, 0);
    }
}

contract ChainNameServiceERC20Test is ChainNameServiceTestBase {
    uint256 private constant TOKEN_PRICE = 1_000_000;

    function test_SixDecimalERC20RegistrationUsesExactBaseUnits() public {
        MockERC20 token = new MockERC20("USD Test", "USDT", 6);
        ChainNameService tokenService = _deployERC20(address(token));
        token.mint(alice, TOKEN_PRICE);
        vm.prank(alice);
        token.approve(address(tokenService), TOKEN_PRICE);

        vm.prank(alice);
        uint256 tokenId = tokenService.register("alice", 1, alice, address(0), TOKEN_PRICE, 0);
        assertEq(token.balanceOf(address(tokenService)), TOKEN_PRICE);
        assertEq(tokenService.ownerOf(tokenId), alice);
    }

    function test_FeeOnTransferSettlementTokenIsRejected() public {
        MockFeeOnTransferERC20 token = new MockFeeOnTransferERC20(6);
        ChainNameService tokenService = _deployERC20(address(token));
        token.mint(alice, TOKEN_PRICE);
        vm.prank(alice);
        token.approve(address(tokenService), TOKEN_PRICE);

        vm.expectRevert(
            abi.encodeWithSelector(
                ChainNameService.SettlementTransferMismatch.selector,
                TOKEN_PRICE,
                TOKEN_PRICE,
                990_000
            )
        );
        vm.prank(alice);
        tokenService.register("alice", 1, alice, address(0), TOKEN_PRICE, 0);
        assertEq(token.balanceOf(alice), TOKEN_PRICE);
        assertEq(token.balanceOf(address(tokenService)), 0);
    }

    function test_ExternalBalanceLossMakesProtocolFailClosed() public {
        MockAdminBurnERC20 token = new MockAdminBurnERC20(6);
        ChainNameService tokenService = _deployERC20(address(token));
        token.mint(bob, TOKEN_PRICE * 2);
        vm.prank(bob);
        token.approve(address(tokenService), TOKEN_PRICE * 2);
        vm.prank(bob);
        tokenService.register("builder", 1, bob, alice, TOKEN_PRICE, REFERRAL_BPS);

        uint256 liability = TOKEN_PRICE / 10;
        token.adminBurn(address(tokenService), TOKEN_PRICE - liability + 1);
        assertFalse(tokenService.isSolvent());
        assertEq(tokenService.treasuryAvailableBalance(), 0);

        vm.expectRevert(
            abi.encodeWithSelector(
                ChainNameService.ProtocolInsolvent.selector, liability - 1, liability
            )
        );
        vm.prank(bob);
        tokenService.register("second", 1, bob, address(0), TOKEN_PRICE, 0);
    }

    function _deployERC20(address token) internal returns (ChainNameService) {
        return new ChainNameService(
            "Sepbase Names",
            "SEPBASE",
            "sepbase",
            owner,
            treasury,
            GRACE_PERIOD,
            ChainNameService.SettlementKind.ERC20,
            token,
            TOKEN_PRICE,
            SHORT_NAME_PRICE_MULTIPLIERS,
            REFERRAL_BPS,
            0,
            "http://localhost:3000/api/metadata/"
        );
    }
}
