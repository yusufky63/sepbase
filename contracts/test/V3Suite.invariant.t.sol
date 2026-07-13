// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import { Test } from "forge-std/Test.sol";

import { V3SuiteTestBase } from "./V3Suite.unit.t.sol";
import { ChainNameControllerV3 } from "../src/v3/ChainNameControllerV3.sol";
import { ChainNameMarketplaceV3 } from "../src/v3/ChainNameMarketplaceV3.sol";
import { ChainNameRegistryV3 } from "../src/v3/ChainNameRegistryV3.sol";

contract V3EconomicHandler is Test {
    struct TrackedOffer {
        bytes32 offerId;
        address buyer;
        uint256 amount;
        uint64 deadline;
        bool open;
    }

    ChainNameRegistryV3 internal immutable registry;
    ChainNameControllerV3 internal immutable controller;
    ChainNameMarketplaceV3 internal immutable marketplace;
    uint256 internal immutable tokenId;
    address internal immutable referrer;
    address[3] internal actors;
    TrackedOffer[] internal trackedOffers;

    constructor(
        ChainNameRegistryV3 registry_,
        ChainNameControllerV3 controller_,
        ChainNameMarketplaceV3 marketplace_,
        uint256 tokenId_,
        address referrer_,
        address[3] memory actors_
    ) {
        registry = registry_;
        controller = controller_;
        marketplace = marketplace_;
        tokenId = tokenId_;
        referrer = referrer_;
        actors = actors_;
    }

    function makeOffer(uint256 actorSeed, uint96 amountSeed, uint32 durationSeed) external {
        if (registry.statusOf(tokenId) != ChainNameRegistryV3.NameStatus.ACTIVE) return;
        address tokenOwner = registry.ownerOf(tokenId);
        address buyer = actors[actorSeed % actors.length];
        if (buyer == tokenOwner) buyer = actors[(actorSeed + 1) % actors.length];
        if (buyer == tokenOwner) return;
        uint256 amount = bound(uint256(amountSeed), 1, 5 ether);
        uint64 deadline =
            uint64(vm.getBlockTimestamp() + bound(uint256(durationSeed), 1 hours, 7 days));
        uint64 nonce = registry.transferNonce(tokenId);
        uint16 feeBps = marketplace.marketplaceFeeBps();
        vm.deal(buyer, buyer.balance + amount);
        vm.prank(buyer);
        try marketplace.makeOffer{ value: amount }(
            ChainNameMarketplaceV3.OfferRequest({
                tokenId: tokenId,
                recipient: buyer,
                expectedOwner: tokenOwner,
                amount: amount,
                deadline: deadline,
                expectedTransferNonce: nonce,
                expectedFeeBps: feeBps
            })
        ) returns (
            bytes32 offerId
        ) {
            trackedOffers.push(
                TrackedOffer({
                    offerId: offerId, buyer: buyer, amount: amount, deadline: deadline, open: true
                })
            );
        } catch { }
    }

    function cancelOffer(uint256 seed) external {
        if (trackedOffers.length == 0) return;
        TrackedOffer storage tracked = trackedOffers[seed % trackedOffers.length];
        if (!tracked.open) return;
        uint16 feeBps = marketplace.marketplaceFeeBps();
        vm.prank(tracked.buyer);
        try marketplace.cancelOffer(tracked.offerId, tracked.amount, tracked.deadline, feeBps) {
            tracked.open = false;
        } catch { }
    }

    function expireOffer(uint256 seed) external {
        if (trackedOffers.length == 0) return;
        TrackedOffer storage tracked = trackedOffers[seed % trackedOffers.length];
        if (!tracked.open) return;
        if (vm.getBlockTimestamp() <= tracked.deadline) vm.warp(uint256(tracked.deadline) + 1);
        try marketplace.invalidateOffer(tracked.offerId) {
            tracked.open = false;
        } catch { }
    }

    function listName(uint96 rawPrice, uint32 rawDuration) external {
        if (registry.statusOf(tokenId) != ChainNameRegistryV3.NameStatus.ACTIVE) return;
        address tokenOwner = registry.ownerOf(tokenId);
        uint256 price = bound(uint256(rawPrice), 1, 5 ether);
        uint64 deadline =
            uint64(vm.getBlockTimestamp() + bound(uint256(rawDuration), 1 hours, 7 days));
        uint64 nonce = registry.transferNonce(tokenId);
        uint16 feeBps = marketplace.marketplaceFeeBps();
        vm.prank(tokenOwner);
        registry.approve(address(marketplace), tokenId);
        vm.prank(tokenOwner);
        try marketplace.listName(
            ChainNameMarketplaceV3.ListRequest({
                tokenId: tokenId,
                price: price,
                deadline: deadline,
                expectedTransferNonce: nonce,
                expectedFeeBps: feeBps
            })
        ) { }
            catch { }
    }

    function buyListing(uint256 actorSeed) external {
        (address seller, uint256 price, uint64 deadline,, uint64 listingNonce, uint16 feeBps) =
            marketplace.listings(tokenId);
        if (seller == address(0)) return;
        address buyer = actors[actorSeed % actors.length];
        if (buyer == seller) buyer = actors[(actorSeed + 1) % actors.length];
        if (buyer == seller) return;
        vm.deal(buyer, buyer.balance + price);
        vm.prank(buyer);
        try marketplace.buyName{ value: price }(
            ChainNameMarketplaceV3.BuyRequest({
                tokenId: tokenId,
                expectedSeller: seller,
                recipient: buyer,
                expectedPrice: price,
                expectedDeadline: deadline,
                expectedListingNonce: listingNonce,
                expectedFeeBps: feeBps
            })
        ) { }
            catch { }
    }

    function invalidateListing() external {
        try marketplace.invalidateListing(tokenId) { } catch { }
    }

    function startAuction(uint96 reserveSeed, uint32 durationSeed) external {
        if (registry.statusOf(tokenId) != ChainNameRegistryV3.NameStatus.ACTIVE) return;
        address tokenOwner = registry.ownerOf(tokenId);
        if (tokenOwner == address(marketplace)) return;
        uint256 reservePrice = bound(uint256(reserveSeed), 1, 1 ether);
        uint64 startAt = uint64(vm.getBlockTimestamp());
        uint64 endAt =
            uint64(vm.getBlockTimestamp() + bound(uint256(durationSeed), 1 hours, 3 days));
        if (uint256(endAt) + 30 minutes > registry.expiresAt(tokenId)) return;
        uint64 nonce = registry.transferNonce(tokenId);
        uint16 feeBps = marketplace.marketplaceFeeBps();
        vm.prank(tokenOwner);
        registry.approve(address(marketplace), tokenId);
        vm.prank(tokenOwner);
        try marketplace.startAuction(
            ChainNameMarketplaceV3.StartAuctionRequest({
                tokenId: tokenId,
                reservePrice: reservePrice,
                startAt: startAt,
                endAt: endAt,
                expectedTransferNonce: nonce,
                expectedFeeBps: feeBps
            })
        ) { }
            catch { }
    }

    function placeBid(uint256 actorSeed, uint96 premiumSeed) external {
        if (marketplace.auctionEntryCount() == 0) return;
        (uint256 auctionTokenId, ChainNameMarketplaceV3.Auction memory auction) =
            marketplace.auctionEntryAt(0);
        if (auctionTokenId != tokenId) return;
        if (vm.getBlockTimestamp() < auction.startAt || vm.getBlockTimestamp() >= auction.endAt) {
            return;
        }
        address bidder = actors[actorSeed % actors.length];
        if (bidder == auction.seller) bidder = actors[(actorSeed + 1) % actors.length];
        if (bidder == auction.seller) return;
        uint256 minimum = auction.highestBid == 0
            ? auction.reservePrice
            : auction.highestBid
                + _mulBpsAtLeastOne(auction.highestBid, marketplace.minBidIncrementBps());
        uint256 amount = minimum + uint256(premiumSeed) % 1 ether;
        vm.deal(bidder, bidder.balance + amount);
        vm.prank(bidder);
        try marketplace.placeBid{ value: amount }(
            ChainNameMarketplaceV3.BidRequest({
                tokenId: tokenId,
                amount: amount,
                recipient: bidder,
                expectedHighestBidder: auction.highestBidder,
                expectedHighestBidRecipient: auction.highestBidRecipient,
                expectedHighestBid: auction.highestBid,
                expectedEndAt: auction.endAt,
                expectedAuctionNonce: auction.auctionNonce,
                expectedFeeBps: auction.feeBps
            })
        ) { }
            catch { }
    }

    function cancelAuction() external {
        if (marketplace.auctionEntryCount() == 0) return;
        (uint256 auctionTokenId, ChainNameMarketplaceV3.Auction memory auction) =
            marketplace.auctionEntryAt(0);
        if (auctionTokenId != tokenId || auction.highestBid != 0) return;
        vm.prank(auction.seller);
        try marketplace.cancelAuction(
            tokenId, auction.reservePrice, auction.endAt, auction.auctionNonce, auction.feeBps
        ) { }
            catch { }
    }

    function finalizeAuction() external {
        if (marketplace.auctionEntryCount() == 0) return;
        (uint256 auctionTokenId, ChainNameMarketplaceV3.Auction memory auction) =
            marketplace.auctionEntryAt(0);
        if (auctionTokenId != tokenId) return;
        if (vm.getBlockTimestamp() < auction.endAt) vm.warp(auction.endAt);
        try marketplace.finalizeAuction(
            ChainNameMarketplaceV3.FinalizeAuctionRequest({
                tokenId: tokenId,
                expectedHighestBidder: auction.highestBidder,
                expectedHighestBidRecipient: auction.highestBidRecipient,
                expectedHighestBid: auction.highestBid,
                expectedEndAt: auction.endAt,
                expectedAuctionNonce: auction.auctionNonce,
                expectedFeeBps: auction.feeBps
            })
        ) { }
            catch { }
    }

    function claim(uint256 actorSeed) external {
        address actor = actors[actorSeed % actors.length];
        vm.prank(actor);
        try marketplace.claimBalance(actor) { } catch { }
    }

    function claimReferral() external {
        vm.prank(referrer);
        try controller.claimReferralRewards(referrer) { } catch { }
    }

    function _mulBpsAtLeastOne(uint256 amount, uint16 bps) internal pure returns (uint256) {
        uint256 increment = (amount / 10_000) * bps + ((amount % 10_000) * bps) / 10_000;
        return increment == 0 ? 1 : increment;
    }
}

contract V3SuiteInvariantTest is V3SuiteTestBase {
    V3EconomicHandler internal handler;
    uint256 internal registeredTokenId;

    function setUp() public override {
        super.setUp();
        registeredTokenId = _register("alice", alice, alice, referrer, bytes32("invariant"), false);
        address[3] memory actors = [alice, bob, carol];
        handler = new V3EconomicHandler(
            registry, controller, marketplace, registeredTokenId, referrer, actors
        );
        bytes4[] memory selectors = new bytes4[](12);
        selectors[0] = handler.makeOffer.selector;
        selectors[1] = handler.cancelOffer.selector;
        selectors[2] = handler.expireOffer.selector;
        selectors[3] = handler.listName.selector;
        selectors[4] = handler.buyListing.selector;
        selectors[5] = handler.invalidateListing.selector;
        selectors[6] = handler.claim.selector;
        selectors[7] = handler.claimReferral.selector;
        selectors[8] = handler.startAuction.selector;
        selectors[9] = handler.placeBid.selector;
        selectors[10] = handler.cancelAuction.selector;
        selectors[11] = handler.finalizeAuction.selector;
        targetSelector(FuzzSelector({ addr: address(handler), selectors: selectors }));
        targetContract(address(handler));
    }

    function invariant_ControllerAndMarketplaceRemainIndividuallySolvent() public view {
        assertGe(controller.settlementBalance(), controller.protectedBalance());
        assertGe(marketplace.settlementBalance(), marketplace.protectedBalance());
        assertTrue(controller.isSolvent());
        assertTrue(marketplace.isSolvent());
        assertTrue(marketplace.isSuiteSolvent());
    }

    function invariant_ProtectedAccountingEqualsPublishedComponents() public view {
        assertEq(controller.protectedBalance(), controller.totalReferralLiability());
        assertEq(
            marketplace.protectedBalance(),
            marketplace.totalOfferEscrow() + marketplace.totalAuctionEscrow()
                + marketplace.totalClaimableLiability()
        );
        assertEq(
            marketplace.suiteProtectedBalance(),
            controller.protectedBalance() + marketplace.protectedBalance()
        );
        assertGe(marketplace.suiteSettlementBalance(), marketplace.suiteProtectedBalance());
    }

    function invariant_EnumerableSupplyAndSingleTokenOwnershipStayConsistent() public view {
        assertEq(registry.totalSupply(), 1);
        address tokenOwner = registry.ownerOf(registeredTokenId);
        assertEq(
            registry.balanceOf(alice) + registry.balanceOf(bob) + registry.balanceOf(carol)
                + registry.balanceOf(address(marketplace)),
            1
        );
        assertTrue(
            tokenOwner == alice || tokenOwner == bob || tokenOwner == carol
                || tokenOwner == address(marketplace)
        );
        assertEq(registry.tokenOfOwnerByIndex(tokenOwner, 0), registeredTokenId);
    }
}
