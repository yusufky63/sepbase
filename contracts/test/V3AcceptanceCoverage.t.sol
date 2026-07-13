// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import { ChainNameControllerV3 } from "../src/v3/ChainNameControllerV3.sol";
import { ChainNameMarketplaceV3 } from "../src/v3/ChainNameMarketplaceV3.sol";
import { ChainNameResolverV3 } from "../src/v3/ChainNameResolverV3.sol";
import {
    ChainNameUniversalResolverV3,
    IUniversalResolverV3
} from "../src/v3/ChainNameUniversalResolverV3.sol";
import { IExtendedResolver } from "../src/v3/interfaces/IChainNameResolverWriterV3.sol";
import { V3SuiteTestBase } from "./V3Suite.unit.t.sol";

/// @notice Focused coverage for high-risk V3 acceptance rows that were not previously evidenced.
/// @dev Test names carry their acceptance-matrix row IDs for deterministic evidence mapping.
contract V3AcceptanceCoverageTest is V3SuiteTestBase {
    bytes32 internal constant EIP712_DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 internal constant CONTROLLER_NAME_HASH = keccak256("ChainNameControllerV3");
    bytes32 internal constant CONTROLLER_VERSION_HASH = keccak256("3");
    bytes4 internal constant CONTENTHASH_INTERFACE_ID = 0xbc1c58d1;
    bytes4 internal constant UNSUPPORTED_SELECTOR = 0xdeadbeef;

    event TextChanged(bytes32 indexed node, string indexed indexedKey, string key, string value);

    function test_A11_AttestationScopeAndLifetimeBindingsRejectBeforeState() public {
        _assertInvalidScopedAttestation(
            "scope-chain",
            block.chainid + 1,
            address(controller),
            NORMALIZATION_PROFILE_HASH,
            keccak256(bytes("scope-chain")),
            alice,
            bytes32("scope-chain")
        );
        _assertInvalidScopedAttestation(
            "scope-controller",
            block.chainid,
            makeAddr("wrong-controller"),
            NORMALIZATION_PROFILE_HASH,
            keccak256(bytes("scope-controller")),
            alice,
            bytes32("scope-controller")
        );
        _assertInvalidScopedAttestation(
            "scope-profile",
            block.chainid,
            address(controller),
            keccak256("wrong-profile"),
            keccak256(bytes("scope-profile")),
            alice,
            bytes32("scope-profile")
        );
        _assertInvalidScopedAttestation(
            "scope-label",
            block.chainid,
            address(controller),
            NORMALIZATION_PROFILE_HASH,
            keccak256(bytes("other-label")),
            alice,
            bytes32("scope-label")
        );
        _assertInvalidScopedAttestation(
            "scope-recipient",
            block.chainid,
            address(controller),
            NORMALIZATION_PROFILE_HASH,
            keccak256(bytes("scope-recipient")),
            bob,
            bytes32("scope-recipient")
        );

        (
            ChainNameControllerV3.RegistrationRequest memory request,
            ChainNameControllerV3.ResolverInitialization memory initialization,
            ChainNameControllerV3.NormalizationAttestation memory attestation,
            bytes32 ignoredCommitment
        ) = _prepare("scope-lifetime", alice, alice, address(0), bytes32("scope-lifetime"), false);
        assertTrue(ignoredCommitment != bytes32(0));
        attestation.validUntil = uint64(vm.getBlockTimestamp() + 1 days + 1 hours);
        attestation.signature = _signCurrentAttestation(
            keccak256(bytes(request.label)), request.recipient, attestation.validUntil
        );
        request.normalizationAttestationHash = controller.hashNormalizationAttestation(attestation);
        bytes32 commitment = _currentCommitment(request, alice);
        vm.prank(alice);
        controller.commit(commitment);
        vm.warp(vm.getBlockTimestamp() + controller.minCommitmentAge());

        vm.expectPartialRevert(ChainNameControllerV3.NormalizationAttestationExpired.selector);
        vm.prank(alice);
        controller.register{ value: request.expectedAmount }(request, initialization, attestation);

        assertFalse(controller.commitmentConsumed(commitment));
        assertEq(registry.totalSupply(), 0);
        assertEq(controller.settlementBalance(), 0);
    }

    function test_B05_CommitmentBindsEveryRegistrationDimension() public {
        _assertScopedCommitmentMismatch(
            "wrong-chain-commit", block.chainid + 1, address(controller), bytes32("wrong-chain")
        );
        _assertScopedCommitmentMismatch(
            "wrong-controller-commit",
            block.chainid,
            makeAddr("other-controller"),
            bytes32("wrong-controller")
        );

        (
            ChainNameControllerV3.RegistrationRequest memory request,
            ChainNameControllerV3.ResolverInitialization memory initialization,
            ChainNameControllerV3.NormalizationAttestation memory attestation,
            bytes32 commitment
        ) = _prepare("bound", alice, alice, address(0), bytes32("bound-secret"), false);
        vm.prank(alice);
        controller.commit(commitment);
        vm.warp(vm.getBlockTimestamp() + controller.minCommitmentAge());

        _expectCommitmentMissing(request, initialization, attestation, bob);

        request.label = "bound-other";
        _expectCommitmentMissing(request, initialization, attestation, alice);
        request.label = "bound";

        request.recipient = bob;
        _expectCommitmentMissing(request, initialization, attestation, alice);
        request.recipient = alice;

        uint256 oneYearAmount = request.expectedAmount;
        request.durationYears = 2;
        request.expectedAmount = controller.quote(request.label, 2);
        _expectCommitmentMissing(request, initialization, attestation, alice);
        request.durationYears = 1;
        request.expectedAmount = oneYearAmount;

        request.referrer = referrer;
        _expectCommitmentMissing(request, initialization, attestation, alice);
        request.referrer = address(0);

        ChainNameControllerV3.NormalizationAttestation memory replacement;
        replacement.validUntil = attestation.validUntil + 1;
        replacement.signature = _signCurrentAttestation(
            keccak256(bytes(request.label)), request.recipient, replacement.validUntil
        );
        bytes32 originalAttestationHash = request.normalizationAttestationHash;
        request.normalizationAttestationHash = controller.hashNormalizationAttestation(replacement);
        _expectCommitmentMissing(request, initialization, replacement, alice);
        request.normalizationAttestationHash = originalAttestationHash;

        bytes32 originalSecret = request.secret;
        request.secret = bytes32("different-secret");
        _expectCommitmentMissing(request, initialization, attestation, alice);
        request.secret = originalSecret;

        vm.prank(alice);
        controller.register{ value: request.expectedAmount }(request, initialization, attestation);
        assertEq(registry.ownerOf(registry.tokenIdFor("bound")), alice);
        assertEq(registry.totalSupply(), 1);
    }

    function test_B03_B08_ExpiredAndConcurrentRevealCannotMintOrConsumeTwice() public {
        (
            ChainNameControllerV3.RegistrationRequest memory expiredRequest,
            ChainNameControllerV3.ResolverInitialization memory expiredInitialization,
            ChainNameControllerV3.NormalizationAttestation memory expiredAttestation,
            bytes32 expiredCommitment
        ) = _prepare("expired", alice, alice, address(0), bytes32("expired"), false);
        vm.prank(alice);
        controller.commit(expiredCommitment);
        vm.warp(vm.getBlockTimestamp() + controller.maxCommitmentAge() + 1);

        for (uint256 attempt; attempt < 2; ++attempt) {
            vm.expectPartialRevert(ChainNameControllerV3.CommitmentExpired.selector);
            vm.prank(alice);
            controller.register{ value: expiredRequest.expectedAmount }(
                expiredRequest, expiredInitialization, expiredAttestation
            );
            assertFalse(controller.commitmentConsumed(expiredCommitment));
        }
        vm.expectPartialRevert(ChainNameControllerV3.CommitmentExists.selector);
        vm.prank(alice);
        controller.commit(expiredCommitment);

        (
            ChainNameControllerV3.RegistrationRequest memory request,
            ChainNameControllerV3.ResolverInitialization memory initialization,
            ChainNameControllerV3.NormalizationAttestation memory attestation,
            bytes32 commitment
        ) = _prepare("once", alice, alice, address(0), bytes32("once"), false);
        vm.prank(alice);
        controller.commit(commitment);
        vm.warp(vm.getBlockTimestamp() + controller.minCommitmentAge());
        vm.prank(alice);
        controller.register{ value: request.expectedAmount }(request, initialization, attestation);

        vm.expectRevert(ChainNameControllerV3.CommitmentConsumed.selector);
        vm.prank(alice);
        controller.register{ value: request.expectedAmount }(request, initialization, attestation);
        vm.expectRevert(ChainNameControllerV3.CommitmentMissing.selector);
        vm.prank(bob);
        controller.register{ value: request.expectedAmount }(request, initialization, attestation);

        assertTrue(controller.commitmentConsumed(commitment));
        assertEq(registry.totalSupply(), 1);
        assertEq(registry.ownerOf(registry.tokenIdFor("once")), alice);
    }

    function test_B07_PauseAndInsolvencyAfterCommitFailClosedWithoutConsumption() public {
        (
            ChainNameControllerV3.RegistrationRequest memory pausedRequest,
            ChainNameControllerV3.ResolverInitialization memory pausedInitialization,
            ChainNameControllerV3.NormalizationAttestation memory pausedAttestation,
            bytes32 pausedCommitment
        ) = _prepare("paused", alice, alice, address(0), bytes32("paused"), false);
        vm.prank(alice);
        controller.commit(pausedCommitment);
        vm.prank(owner);
        controller.setRegistrationsPaused(true);
        vm.warp(vm.getBlockTimestamp() + controller.minCommitmentAge());

        vm.expectRevert(ChainNameControllerV3.RegistrationPaused.selector);
        vm.prank(alice);
        controller.register{ value: pausedRequest.expectedAmount }(
            pausedRequest, pausedInitialization, pausedAttestation
        );
        assertFalse(controller.commitmentConsumed(pausedCommitment));

        vm.prank(owner);
        controller.setRegistrationsPaused(false);
        vm.prank(alice);
        controller.register{ value: pausedRequest.expectedAmount }(
            pausedRequest, pausedInitialization, pausedAttestation
        );

        _register("x", alice, alice, referrer, bytes32("funded"), false);
        (
            ChainNameControllerV3.RegistrationRequest memory insolventRequest,
            ChainNameControllerV3.ResolverInitialization memory insolventInitialization,
            ChainNameControllerV3.NormalizationAttestation memory insolventAttestation,
            bytes32 insolventCommitment
        ) = _prepare("insolvent", alice, alice, address(0), bytes32("insolvent"), false);
        vm.prank(alice);
        controller.commit(insolventCommitment);
        vm.warp(vm.getBlockTimestamp() + controller.minCommitmentAge());

        uint256 fundedBalance = controller.settlementBalance();
        uint256 liability = controller.protectedBalance();
        assertGt(liability, insolventRequest.expectedAmount);
        vm.deal(address(controller), 0);
        vm.expectPartialRevert(ChainNameControllerV3.ProtocolInsolvent.selector);
        vm.prank(alice);
        controller.register{ value: insolventRequest.expectedAmount }(
            insolventRequest, insolventInitialization, insolventAttestation
        );
        assertFalse(controller.commitmentConsumed(insolventCommitment));

        vm.deal(address(controller), fundedBalance);
        vm.prank(alice);
        controller.register{ value: insolventRequest.expectedAmount }(
            insolventRequest, insolventInitialization, insolventAttestation
        );
        assertTrue(controller.commitmentConsumed(insolventCommitment));
        assertTrue(controller.isSolvent());
    }

    function test_B11_AttestationExpiryOrReplacementRequiresNewCommitment() public {
        (
            ChainNameControllerV3.RegistrationRequest memory request,
            ChainNameControllerV3.ResolverInitialization memory initialization,
            ChainNameControllerV3.NormalizationAttestation memory attestation,
            bytes32 oldCommitment
        ) = _prepare("replacement", alice, alice, address(0), bytes32("replacement"), false);
        vm.prank(alice);
        controller.commit(oldCommitment);
        vm.warp(uint256(attestation.validUntil) + 1);

        vm.expectPartialRevert(ChainNameControllerV3.NormalizationAttestationExpired.selector);
        vm.prank(alice);
        controller.register{ value: request.expectedAmount }(request, initialization, attestation);
        assertFalse(controller.commitmentConsumed(oldCommitment));

        ChainNameControllerV3.NormalizationAttestation memory replacement;
        replacement.validUntil = uint64(vm.getBlockTimestamp() + 2 hours);
        replacement.signature = _signCurrentAttestation(
            keccak256(bytes(request.label)), request.recipient, replacement.validUntil
        );
        request.normalizationAttestationHash = controller.hashNormalizationAttestation(replacement);

        _expectCommitmentMissing(request, initialization, replacement, alice);
        bytes32 newCommitment = _currentCommitment(request, alice);
        assertTrue(newCommitment != oldCommitment);
        vm.prank(alice);
        controller.commit(newCommitment);
        vm.warp(vm.getBlockTimestamp() + controller.minCommitmentAge());
        vm.prank(alice);
        controller.register{ value: request.expectedAmount }(request, initialization, replacement);

        assertTrue(controller.commitmentConsumed(newCommitment));
        assertFalse(controller.commitmentConsumed(oldCommitment));
        assertEq(registry.ownerOf(registry.tokenIdFor("replacement")), alice);
    }

    function test_C02_C03_C04_C06_FixedListingGuardsAndStaleOwnership() public {
        uint256 tokenId =
            _register("fixed-guards", alice, alice, address(0), bytes32("fixed-guards"), false);
        uint64 transferNonce = registry.transferNonce(tokenId);
        uint64 deadline = uint64(vm.getBlockTimestamp() + 1 days);
        vm.startPrank(alice);
        registry.setApprovalForAll(bob, true);
        registry.approve(address(marketplace), tokenId);
        vm.stopPrank();

        vm.expectRevert(ChainNameMarketplaceV3.NotAuthorized.selector);
        vm.prank(bob);
        marketplace.listName(
            ChainNameMarketplaceV3.ListRequest({
                tokenId: tokenId,
                price: 10_000,
                deadline: deadline,
                expectedTransferNonce: transferNonce,
                expectedFeeBps: 100
            })
        );
        _listAs(tokenId, alice, 10_000, deadline, transferNonce, 100);

        vm.prank(owner);
        marketplace.setMarketplaceFeeBps(200);
        uint64 newDeadline = deadline + 1 hours;
        vm.expectRevert(ChainNameMarketplaceV3.ListingGuardFailed.selector);
        vm.prank(alice);
        marketplace.updateListing(
            tokenId, 10_000, deadline, transferNonce, 1, 100, 20_000, newDeadline, 100
        );
        vm.prank(alice);
        marketplace.updateListing(
            tokenId, 10_000, deadline, transferNonce, 1, 100, 20_000, newDeadline, 200
        );

        uint256 buyerBalance = bob.balance;
        _expectListingGuard(tokenId, alice, bob, 19_999, newDeadline, 2, 200, 20_000);
        _expectListingGuard(tokenId, alice, bob, 20_000, newDeadline, 1, 200, 20_000);
        _expectListingGuard(tokenId, alice, bob, 20_000, newDeadline, 2, 100, 20_000);
        assertEq(bob.balance, buyerBalance);
        assertEq(marketplace.settlementBalance(), 0);

        vm.prank(alice);
        registry.transferFrom(alice, carol, tokenId);
        vm.expectRevert(ChainNameMarketplaceV3.ListingStale.selector);
        vm.prank(bob);
        marketplace.buyName{ value: 20_000 }(
            ChainNameMarketplaceV3.BuyRequest({
                tokenId: tokenId,
                expectedSeller: alice,
                recipient: bob,
                expectedPrice: 20_000,
                expectedDeadline: newDeadline,
                expectedListingNonce: 2,
                expectedFeeBps: 200
            })
        );
        assertEq(bob.balance, buyerBalance);
        assertEq(registry.ownerOf(tokenId), carol);

        vm.prank(carol);
        marketplace.invalidateListing(tokenId);
        vm.expectRevert(ChainNameMarketplaceV3.ListingNotFound.selector);
        marketplace.invalidateListing(tokenId);
        assertEq(marketplace.listingEntryCount(), 0);
    }

    function test_D04_D05_D06_OfferExpiryStalenessAndTerminalPathsAreSingleUse() public {
        uint256 tokenId =
            _register("offer-guards", alice, alice, address(0), bytes32("offer-guards"), false);
        uint64 deadline = uint64(vm.getBlockTimestamp() + 1 days);
        bytes32 staleOffer = _makeOffer(tokenId, bob, bob, alice, 5000, deadline);

        vm.prank(alice);
        registry.transferFrom(alice, carol, tokenId);
        vm.expectRevert(ChainNameMarketplaceV3.OfferStale.selector);
        vm.prank(alice);
        marketplace.acceptOffer(
            ChainNameMarketplaceV3.AcceptOfferRequest({
                offerId: staleOffer,
                expectedBuyer: bob,
                expectedRecipient: bob,
                expectedAmount: 5000,
                expectedDeadline: deadline,
                expectedFeeBps: 100
            })
        );
        vm.prank(makeAddr("offer-cleaner"));
        marketplace.invalidateOffer(staleOffer);
        assertEq(marketplace.claimableBalance(bob), 5000);
        _expectOfferTerminal(staleOffer, bob, bob, 5000, deadline, alice);

        uint256 beforeRefund = alice.balance;
        vm.prank(bob);
        marketplace.claimBalance(alice);
        assertEq(alice.balance - beforeRefund, 5000);
        vm.expectRevert(ChainNameMarketplaceV3.NoClaimableBalance.selector);
        vm.prank(bob);
        marketplace.claimBalance(alice);

        uint64 expiry = uint64(vm.getBlockTimestamp() + 1 hours);
        bytes32 expiredOffer = _makeOffer(tokenId, bob, bob, carol, 4000, expiry);
        vm.warp(uint256(expiry) + 1);
        vm.prank(alice);
        marketplace.invalidateOffer(expiredOffer);
        assertEq(marketplace.claimableBalance(bob), 4000);
        _expectOfferTerminal(expiredOffer, bob, bob, 4000, expiry, carol);
        vm.prank(bob);
        marketplace.claimBalance(bob);

        uint64 acceptedDeadline = uint64(vm.getBlockTimestamp() + 1 hours);
        bytes32 acceptedOffer = _makeOffer(tokenId, alice, bob, carol, 6000, acceptedDeadline);
        vm.prank(carol);
        registry.approve(address(marketplace), tokenId);
        vm.prank(carol);
        marketplace.acceptOffer(
            ChainNameMarketplaceV3.AcceptOfferRequest({
                offerId: acceptedOffer,
                expectedBuyer: alice,
                expectedRecipient: bob,
                expectedAmount: 6000,
                expectedDeadline: acceptedDeadline,
                expectedFeeBps: 100
            })
        );
        assertEq(registry.ownerOf(tokenId), bob);
        _expectOfferTerminal(acceptedOffer, alice, bob, 6000, acceptedDeadline, carol);
        assertEq(
            uint256(marketplace.offerStates(acceptedOffer)),
            uint256(ChainNameMarketplaceV3.OfferState.ACCEPTED)
        );
        assertTrue(marketplace.isSolvent());
    }

    function test_E02_E05_E08_ReserveFailureCancelAndNoBidFinalizeAreSafe() public {
        uint256 tokenId =
            _register("auction-empty", alice, alice, address(0), bytes32("auction-empty"), false);
        uint64 startAt = uint64(vm.getBlockTimestamp());
        uint64 endAt = startAt + 1 hours;
        _approveAndStartAuction(tokenId, alice, 1000, startAt, endAt, 1);

        uint256 bidderBalance = bob.balance;
        vm.expectPartialRevert(ChainNameMarketplaceV3.BidTooLow.selector);
        vm.prank(bob);
        marketplace.placeBid{ value: 999 }(
            _bidRequest(tokenId, 999, bob, address(0), address(0), 0, endAt, 1)
        );
        assertEq(bob.balance, bidderBalance);
        assertEq(marketplace.totalAuctionEscrow(), 0);

        vm.prank(alice);
        marketplace.cancelAuction(tokenId, 1000, endAt, 1, 100);
        assertEq(registry.ownerOf(tokenId), alice);
        vm.expectRevert(ChainNameMarketplaceV3.AuctionNotFound.selector);
        vm.prank(alice);
        marketplace.cancelAuction(tokenId, 1000, endAt, 1, 100);

        startAt = uint64(vm.getBlockTimestamp());
        endAt = startAt + 1 hours;
        _approveAndStartAuction(tokenId, alice, 1000, startAt, endAt, 2);
        vm.warp(endAt);
        vm.prank(carol);
        marketplace.finalizeAuction(_finalizeRequest(tokenId, address(0), address(0), 0, endAt, 2));
        assertEq(registry.ownerOf(tokenId), alice);
        assertEq(marketplace.totalAuctionEscrow(), 0);
        assertEq(marketplace.auctionEntryCount(), 0);
        vm.expectRevert(ChainNameMarketplaceV3.AuctionNotFound.selector);
        vm.prank(bob);
        marketplace.finalizeAuction(_finalizeRequest(tokenId, address(0), address(0), 0, endAt, 2));
    }

    function test_E04_E06_E07_AuctionExtensionIsBoundedAndFinalizeIsSingleUse() public {
        uint256 tokenId = _register(
            "auction-bounded", alice, alice, address(0), bytes32("auction-bounded"), false
        );
        uint64 startAt = uint64(vm.getBlockTimestamp());
        uint64 originalEnd = startAt + 1 hours;
        uint64 hardEnd = originalEnd + 30 minutes;
        _approveAndStartAuction(tokenId, alice, 1000, startAt, originalEnd, 1);

        vm.warp(originalEnd - 4 minutes);
        _placeBid(tokenId, bob, 1000, bob, address(0), address(0), 0, originalEnd, 1);
        uint64 firstExtension = originalEnd + 10 minutes;
        vm.expectRevert(ChainNameMarketplaceV3.AuctionHasBid.selector);
        vm.prank(alice);
        marketplace.cancelAuction(tokenId, 1000, firstExtension, 1, 100);

        vm.warp(firstExtension - 1);
        _placeBid(tokenId, carol, 1050, carol, bob, bob, 1000, firstExtension, 1);
        uint64 secondExtension = originalEnd + 20 minutes;
        vm.warp(secondExtension - 1);
        _placeBid(tokenId, bob, 1103, bob, carol, carol, 1050, secondExtension, 1);
        vm.warp(hardEnd - 1);
        _placeBid(tokenId, carol, 1158, carol, bob, bob, 1103, hardEnd, 1);

        (, ChainNameMarketplaceV3.Auction memory auction) = marketplace.auctionEntryAt(0);
        assertEq(auction.endAt, hardEnd);
        assertEq(auction.hardEndAt, hardEnd);
        assertEq(auction.extensionsUsed, marketplace.maxExtensions());
        assertLe(auction.endAt, registry.expiresAt(tokenId));

        vm.warp(hardEnd);
        vm.prank(makeAddr("permissionless-finalizer"));
        marketplace.finalizeAuction(_finalizeRequest(tokenId, carol, carol, 1158, hardEnd, 1));
        assertEq(registry.ownerOf(tokenId), carol);
        assertEq(marketplace.totalAuctionEscrow(), 0);
        vm.expectRevert(ChainNameMarketplaceV3.AuctionNotFound.selector);
        marketplace.finalizeAuction(_finalizeRequest(tokenId, carol, carol, 1158, hardEnd, 1));
    }

    function test_E09_ExpiryWindowRejectsUnsafeAuctionAndLateFinalizeRefundsBidder() public {
        uint256 auctionToken = _register(
            "auction-expiry", alice, alice, address(0), bytes32("auction-expiry"), false
        );
        uint256 windowToken = _register(
            "auction-window", alice, alice, address(0), bytes32("auction-window"), false
        );
        uint64 startAt = uint64(vm.getBlockTimestamp());
        uint64 endAt = startAt + 1 hours;
        _approveAndStartAuction(auctionToken, alice, 1000, startAt, endAt, 1);
        _placeBid(auctionToken, bob, 1000, bob, address(0), address(0), 0, endAt, 1);

        uint64 windowExpiry = registry.expiresAt(windowToken);
        vm.warp(uint256(windowExpiry) - 1 hours);
        vm.prank(alice);
        registry.approve(address(marketplace), windowToken);
        uint64 unsafeStartAt = uint64(vm.getBlockTimestamp());
        uint64 windowTransferNonce = registry.transferNonce(windowToken);
        vm.expectRevert(ChainNameMarketplaceV3.InvalidAuctionWindow.selector);
        vm.prank(alice);
        marketplace.startAuction(
            ChainNameMarketplaceV3.StartAuctionRequest({
                tokenId: windowToken,
                reservePrice: 1000,
                startAt: unsafeStartAt,
                endAt: windowExpiry,
                expectedTransferNonce: windowTransferNonce,
                expectedFeeBps: 100
            })
        );

        vm.warp(uint256(registry.expiresAt(auctionToken)) + 1);
        vm.prank(carol);
        marketplace.finalizeAuction(_finalizeRequest(auctionToken, bob, bob, 1000, endAt, 1));
        assertEq(marketplace.claimableBalance(bob), 1000);
        assertEq(marketplace.claimableBalance(alice), 0);
        assertEq(registry.ownerOf(auctionToken), address(marketplace));
        assertEq(marketplace.totalAuctionEscrow(), 0);
        assertTrue(marketplace.isSolvent());
        vm.expectRevert(ChainNameMarketplaceV3.AuctionNotFound.selector);
        marketplace.finalizeAuction(_finalizeRequest(auctionToken, bob, bob, 1000, endAt, 1));
    }

    function test_F02_F03_F05_PauseClaimsAndTreasurySolvencyRemainSafe() public {
        uint256 tokenId =
            _register("liabilities", alice, alice, referrer, bytes32("liabilities"), false);
        uint256 referralReward = controller.referralBalance(referrer);
        assertGt(referralReward, 0);
        assertEq(controller.protectedBalance(), referralReward);

        vm.prank(owner);
        controller.withdrawTreasury();
        assertEq(controller.settlementBalance(), referralReward);
        assertEq(controller.treasuryAvailableBalance(), 0);
        vm.prank(owner);
        controller.setRegistrationsPaused(true);
        uint256 recipientBefore = carol.balance;
        vm.prank(referrer);
        controller.claimReferralRewards(carol);
        assertEq(carol.balance - recipientBefore, referralReward);
        assertEq(controller.protectedBalance(), 0);
        assertTrue(controller.isSolvent());

        uint64 listingDeadline = uint64(vm.getBlockTimestamp() + 1 days);
        vm.prank(alice);
        registry.approve(address(marketplace), tokenId);
        _listAs(
            tokenId,
            alice,
            100_000,
            listingDeadline,
            registry.transferNonce(tokenId),
            marketplace.marketplaceFeeBps()
        );
        vm.prank(bob);
        marketplace.buyName{ value: 100_000 }(
            ChainNameMarketplaceV3.BuyRequest({
                tokenId: tokenId,
                expectedSeller: alice,
                recipient: bob,
                expectedPrice: 100_000,
                expectedDeadline: listingDeadline,
                expectedListingNonce: 1,
                expectedFeeBps: 100
            })
        );
        uint256 sellerProceeds = 99_000;
        assertEq(marketplace.protectedBalance(), sellerProceeds);
        assertEq(marketplace.treasuryAvailableBalance(), 1000);
        vm.prank(owner);
        marketplace.withdrawTreasury();
        assertEq(marketplace.settlementBalance(), sellerProceeds);
        assertEq(marketplace.treasuryAvailableBalance(), 0);

        vm.prank(owner);
        marketplace.setMarketPaused(true);
        recipientBefore = carol.balance;
        vm.prank(alice);
        marketplace.claimBalance(carol);
        assertEq(carol.balance - recipientBefore, sellerProceeds);
        assertEq(marketplace.protectedBalance(), 0);

        vm.prank(owner);
        marketplace.setMarketPaused(false);
        uint64 offerDeadline = uint64(vm.getBlockTimestamp() + 1 hours);
        bytes32 offerId = _makeOffer(tokenId, alice, alice, bob, 5000, offerDeadline);
        assertEq(marketplace.protectedBalance(), 5000);
        vm.deal(address(marketplace), 0);
        uint64 transferNonce = registry.transferNonce(tokenId);
        vm.expectPartialRevert(ChainNameMarketplaceV3.ProtocolInsolvent.selector);
        vm.prank(carol);
        marketplace.makeOffer{ value: 3000 }(
            ChainNameMarketplaceV3.OfferRequest({
                tokenId: tokenId,
                recipient: carol,
                expectedOwner: bob,
                amount: 3000,
                deadline: offerDeadline,
                expectedTransferNonce: transferNonce,
                expectedFeeBps: 100
            })
        );

        vm.prank(alice);
        marketplace.cancelOffer(offerId, 5000, offerDeadline, 100);
        assertEq(marketplace.totalOfferEscrow(), 0);
        assertEq(marketplace.claimableBalance(alice), 5000);
        vm.deal(address(marketplace), 5000);
        vm.prank(owner);
        marketplace.setMarketPaused(true);
        recipientBefore = carol.balance;
        vm.prank(alice);
        marketplace.claimBalance(carol);
        assertEq(carol.balance - recipientBefore, 5000);
        assertEq(marketplace.protectedBalance(), 0);
        assertTrue(marketplace.isSolvent());
        assertEq(marketplace.suiteProtectedBalance(), 0);
        assertEq(marketplace.suiteSettlementBalance(), 0);
    }

    function test_A07_A08_A09_A14_TextCleanupAndUnsupportedResolverProfiles() public {
        uint256 tokenId =
            _register("resolver-guards", alice, alice, address(0), bytes32("resolver"), true);
        bytes32 node = registry.nodeForLabelHash(bytes32(tokenId));

        vm.expectEmit(true, true, false, true, address(resolver));
        emit TextChanged(node, "avatar", "avatar", "ipfs://avatar");
        vm.prank(alice);
        resolver.setText(node, "avatar", "ipfs://avatar");
        vm.prank(alice);
        resolver.setText(node, "url", "https://example.test/alice");
        assertEq(resolver.text(node, "avatar"), "ipfs://avatar");
        assertEq(resolver.text(node, "url"), "https://example.test/alice");
        vm.prank(alice);
        resolver.setText(node, "url", "");
        assertEq(resolver.text(node, "url"), "");

        vm.expectRevert(ChainNameResolverV3.FieldTooLong.selector);
        vm.prank(alice);
        resolver.setText(node, "", "value");
        vm.expectRevert(ChainNameResolverV3.FieldTooLong.selector);
        vm.prank(alice);
        resolver.setText(node, "description", new string(513));

        assertTrue(resolver.supportsInterface(type(IERC165).interfaceId));
        assertTrue(resolver.supportsInterface(type(IExtendedResolver).interfaceId));
        assertFalse(resolver.supportsInterface(CONTENTHASH_INTERFACE_ID));
        assertFalse(resolver.supportsInterface(0xffffffff));
        assertTrue(universalResolver.supportsInterface(type(IERC165).interfaceId));
        assertTrue(universalResolver.supportsInterface(type(IUniversalResolverV3).interfaceId));
        assertFalse(universalResolver.supportsInterface(type(IExtendedResolver).interfaceId));
        assertFalse(universalResolver.supportsInterface(CONTENTHASH_INTERFACE_ID));

        bytes memory dnsName = _dnsName("resolver-guards", "sepbase");
        bytes memory unsupportedCall = abi.encodePacked(UNSUPPORTED_SELECTOR);
        vm.expectRevert(
            abi.encodeWithSelector(
                ChainNameResolverV3.UnsupportedResolverCall.selector, UNSUPPORTED_SELECTOR
            )
        );
        resolver.resolve(dnsName, unsupportedCall);
        vm.expectPartialRevert(ChainNameUniversalResolverV3.ResolverError.selector);
        universalResolver.resolve(dnsName, unsupportedCall);

        vm.prank(alice);
        resolver.setPrimaryName(tokenId);
        vm.prank(alice);
        registry.transferFrom(alice, bob, tokenId);
        assertEq(resolver.addr(node), bob);
        assertEq(resolver.text(node, "description"), "");
        assertEq(resolver.text(node, "avatar"), "");
        assertEq(resolver.text(node, "url"), "");
        assertEq(resolver.primaryNameOf(alice), "");
    }

    function _assertInvalidScopedAttestation(
        string memory label,
        uint256 chainScope,
        address controllerScope,
        bytes32 profileScope,
        bytes32 labelScope,
        address recipientScope,
        bytes32 secret
    ) internal {
        (
            ChainNameControllerV3.RegistrationRequest memory request,
            ChainNameControllerV3.ResolverInitialization memory initialization,
            ChainNameControllerV3.NormalizationAttestation memory attestation,
            bytes32 ignoredCommitment
        ) = _prepare(label, alice, alice, address(0), secret, false);
        assertTrue(ignoredCommitment != bytes32(0));
        attestation.signature = _signDigest(
            _normalizationDigest(
                chainScope,
                controllerScope,
                profileScope,
                labelScope,
                recipientScope,
                attestation.validUntil
            )
        );
        request.normalizationAttestationHash = controller.hashNormalizationAttestation(attestation);
        bytes32 commitment = _currentCommitment(request, alice);
        vm.prank(alice);
        controller.commit(commitment);
        vm.warp(vm.getBlockTimestamp() + controller.minCommitmentAge());

        vm.expectRevert(ChainNameControllerV3.InvalidNormalizationAttestation.selector);
        vm.prank(alice);
        controller.register{ value: request.expectedAmount }(request, initialization, attestation);
        assertFalse(controller.commitmentConsumed(commitment));
        assertEq(controller.settlementBalance(), 0);
        assertEq(registry.totalSupply(), 0);
    }

    function _assertScopedCommitmentMismatch(
        string memory label,
        uint256 chainScope,
        address controllerScope,
        bytes32 secret
    ) internal {
        (
            ChainNameControllerV3.RegistrationRequest memory request,
            ChainNameControllerV3.ResolverInitialization memory initialization,
            ChainNameControllerV3.NormalizationAttestation memory attestation,
            bytes32 ignoredCommitment
        ) = _prepare(label, alice, alice, address(0), secret, false);
        assertTrue(ignoredCommitment != bytes32(0));
        bytes32 scopedCommitment = _scopedCommitment(request, alice, chainScope, controllerScope);
        vm.prank(alice);
        controller.commit(scopedCommitment);
        vm.warp(vm.getBlockTimestamp() + controller.minCommitmentAge());
        _expectCommitmentMissing(request, initialization, attestation, alice);
        assertFalse(controller.commitmentConsumed(scopedCommitment));
    }

    function _normalizationDigest(
        uint256 chainScope,
        address controllerScope,
        bytes32 profileScope,
        bytes32 labelScope,
        address recipientScope,
        uint64 validUntil
    ) internal view returns (bytes32) {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                CONTROLLER_NAME_HASH,
                CONTROLLER_VERSION_HASH,
                chainScope,
                controllerScope
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                controller.NORMALIZATION_ATTESTATION_TYPEHASH(),
                chainScope,
                controllerScope,
                profileScope,
                labelScope,
                recipientScope,
                validUntil
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    function _signCurrentAttestation(bytes32 labelHash, address recipient, uint64 validUntil)
        internal
        returns (bytes memory)
    {
        return
            _signDigest(controller.normalizationAttestationDigest(labelHash, recipient, validUntil));
    }

    function _signDigest(bytes32 digest) internal returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ATTESTOR_PRIVATE_KEY, digest);
        return abi.encodePacked(r, s, v);
    }

    function _currentCommitment(
        ChainNameControllerV3.RegistrationRequest memory request,
        address payer
    ) internal view returns (bytes32) {
        return controller.makeCommitment(
            registry.nodeForLabelHash(keccak256(bytes(request.label))),
            payer,
            request.recipient,
            request.durationYears,
            request.resolverInitializationHash,
            request.normalizationAttestationHash,
            request.referrer,
            request.secret,
            request.expectedAmount,
            request.expectedReferralRewardBps
        );
    }

    function _scopedCommitment(
        ChainNameControllerV3.RegistrationRequest memory request,
        address payer,
        uint256 chainScope,
        address controllerScope
    ) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                chainScope,
                controllerScope,
                registry.nodeForLabelHash(keccak256(bytes(request.label))),
                payer,
                request.recipient,
                request.durationYears,
                request.resolverInitializationHash,
                request.normalizationAttestationHash,
                request.referrer,
                controller.settlementKind(),
                address(controller.settlementToken()),
                request.expectedAmount,
                request.expectedReferralRewardBps,
                request.secret
            )
        );
    }

    function _expectCommitmentMissing(
        ChainNameControllerV3.RegistrationRequest memory request,
        ChainNameControllerV3.ResolverInitialization memory initialization,
        ChainNameControllerV3.NormalizationAttestation memory attestation,
        address payer
    ) internal {
        vm.expectRevert(ChainNameControllerV3.CommitmentMissing.selector);
        vm.prank(payer);
        controller.register{ value: request.expectedAmount }(request, initialization, attestation);
    }

    function _listAs(
        uint256 tokenId,
        address seller,
        uint256 price,
        uint64 deadline,
        uint64 transferNonce,
        uint16 feeBps
    ) internal {
        vm.prank(seller);
        marketplace.listName(
            ChainNameMarketplaceV3.ListRequest({
                tokenId: tokenId,
                price: price,
                deadline: deadline,
                expectedTransferNonce: transferNonce,
                expectedFeeBps: feeBps
            })
        );
    }

    function _expectListingGuard(
        uint256 tokenId,
        address seller,
        address recipient,
        uint256 expectedPrice,
        uint64 expectedDeadline,
        uint64 expectedListingNonce,
        uint16 expectedFeeBps,
        uint256 payment
    ) internal {
        vm.expectRevert(ChainNameMarketplaceV3.ListingGuardFailed.selector);
        vm.prank(bob);
        marketplace.buyName{ value: payment }(
            ChainNameMarketplaceV3.BuyRequest({
                tokenId: tokenId,
                expectedSeller: seller,
                recipient: recipient,
                expectedPrice: expectedPrice,
                expectedDeadline: expectedDeadline,
                expectedListingNonce: expectedListingNonce,
                expectedFeeBps: expectedFeeBps
            })
        );
    }

    function _makeOffer(
        uint256 tokenId,
        address buyer,
        address recipient,
        address expectedOwner,
        uint256 amount,
        uint64 deadline
    ) internal returns (bytes32) {
        uint64 transferNonce = registry.transferNonce(tokenId);
        uint16 feeBps = marketplace.marketplaceFeeBps();
        vm.prank(buyer);
        return marketplace.makeOffer{ value: amount }(
            ChainNameMarketplaceV3.OfferRequest({
                tokenId: tokenId,
                recipient: recipient,
                expectedOwner: expectedOwner,
                amount: amount,
                deadline: deadline,
                expectedTransferNonce: transferNonce,
                expectedFeeBps: feeBps
            })
        );
    }

    function _expectOfferTerminal(
        bytes32 offerId,
        address buyer,
        address recipient,
        uint256 amount,
        uint64 deadline,
        address seller
    ) internal {
        vm.expectRevert(ChainNameMarketplaceV3.OfferNotFound.selector);
        vm.prank(buyer);
        marketplace.cancelOffer(offerId, amount, deadline, 100);
        vm.expectRevert(ChainNameMarketplaceV3.OfferNotFound.selector);
        marketplace.invalidateOffer(offerId);
        vm.expectRevert(ChainNameMarketplaceV3.OfferNotFound.selector);
        vm.prank(seller);
        marketplace.acceptOffer(
            ChainNameMarketplaceV3.AcceptOfferRequest({
                offerId: offerId,
                expectedBuyer: buyer,
                expectedRecipient: recipient,
                expectedAmount: amount,
                expectedDeadline: deadline,
                expectedFeeBps: 100
            })
        );
    }

    function _approveAndStartAuction(
        uint256 tokenId,
        address seller,
        uint256 reservePrice,
        uint64 startAt,
        uint64 endAt,
        uint64 expectedAuctionNonce
    ) internal {
        vm.prank(seller);
        registry.approve(address(marketplace), tokenId);
        uint64 transferNonce = registry.transferNonce(tokenId);
        vm.prank(seller);
        marketplace.startAuction(
            ChainNameMarketplaceV3.StartAuctionRequest({
                tokenId: tokenId,
                reservePrice: reservePrice,
                startAt: startAt,
                endAt: endAt,
                expectedTransferNonce: transferNonce,
                expectedFeeBps: 100
            })
        );
        assertEq(marketplace.latestAuctionNonce(tokenId), expectedAuctionNonce);
        assertEq(registry.ownerOf(tokenId), address(marketplace));
    }

    function _bidRequest(
        uint256 tokenId,
        uint256 amount,
        address recipient,
        address expectedHighestBidder,
        address expectedHighestBidRecipient,
        uint256 expectedHighestBid,
        uint64 expectedEndAt,
        uint64 expectedAuctionNonce
    ) internal pure returns (ChainNameMarketplaceV3.BidRequest memory) {
        return ChainNameMarketplaceV3.BidRequest({
            tokenId: tokenId,
            amount: amount,
            recipient: recipient,
            expectedHighestBidder: expectedHighestBidder,
            expectedHighestBidRecipient: expectedHighestBidRecipient,
            expectedHighestBid: expectedHighestBid,
            expectedEndAt: expectedEndAt,
            expectedAuctionNonce: expectedAuctionNonce,
            expectedFeeBps: 100
        });
    }

    function _placeBid(
        uint256 tokenId,
        address bidder,
        uint256 amount,
        address recipient,
        address expectedHighestBidder,
        address expectedHighestBidRecipient,
        uint256 expectedHighestBid,
        uint64 expectedEndAt,
        uint64 expectedAuctionNonce
    ) internal {
        vm.prank(bidder);
        marketplace.placeBid{ value: amount }(
            _bidRequest(
                tokenId,
                amount,
                recipient,
                expectedHighestBidder,
                expectedHighestBidRecipient,
                expectedHighestBid,
                expectedEndAt,
                expectedAuctionNonce
            )
        );
    }

    function _finalizeRequest(
        uint256 tokenId,
        address expectedHighestBidder,
        address expectedHighestBidRecipient,
        uint256 expectedHighestBid,
        uint64 expectedEndAt,
        uint64 expectedAuctionNonce
    ) internal pure returns (ChainNameMarketplaceV3.FinalizeAuctionRequest memory) {
        return ChainNameMarketplaceV3.FinalizeAuctionRequest({
            tokenId: tokenId,
            expectedHighestBidder: expectedHighestBidder,
            expectedHighestBidRecipient: expectedHighestBidRecipient,
            expectedHighestBid: expectedHighestBid,
            expectedEndAt: expectedEndAt,
            expectedAuctionNonce: expectedAuctionNonce,
            expectedFeeBps: 100
        });
    }
}
