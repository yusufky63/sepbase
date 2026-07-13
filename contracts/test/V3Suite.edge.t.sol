// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import { V3SuiteTestBase } from "./V3Suite.unit.t.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { ChainNameControllerV3 } from "../src/v3/ChainNameControllerV3.sol";
import { ChainNameMarketplaceV3 } from "../src/v3/ChainNameMarketplaceV3.sol";
import { ChainNameMarketLensV3 } from "../src/v3/ChainNameMarketLensV3.sol";
import { ChainNameMigrationV3 } from "../src/v3/ChainNameMigrationV3.sol";
import { ChainNameRegistryV3 } from "../src/v3/ChainNameRegistryV3.sol";
import { ChainNameResolverV3 } from "../src/v3/ChainNameResolverV3.sol";
import { IUniversalResolverV3 } from "../src/v3/ChainNameUniversalResolverV3.sol";
import { IAddrResolver } from "../src/v3/interfaces/IENSResolverV3.sol";
import { IExtendedResolver } from "../src/v3/interfaces/IChainNameResolverWriterV3.sol";
import { MockFeeOnTransferERC20 } from "./mocks/MockFeeOnTransferERC20.sol";
import { MockFailingPayoutERC20 } from "./mocks/MockFailingPayoutERC20.sol";
import { MockRebasingERC20 } from "./mocks/MockRebasingERC20.sol";
import { MockReentrantERC20 } from "./mocks/MockReentrantERC20.sol";

contract MockERC1271Attestor {
    bytes4 internal constant MAGIC_VALUE = 0x1626ba7e;
    mapping(bytes32 digest => bytes32 signatureHash) public approved;

    function approve(bytes32 digest, bytes calldata signature) external {
        approved[digest] = keccak256(signature);
    }

    function isValidSignature(bytes32 digest, bytes calldata signature)
        external
        view
        returns (bytes4)
    {
        return approved[digest] == keccak256(signature) ? MAGIC_VALUE : bytes4(0xffffffff);
    }
}

contract RejectNativeRecipient {
    receive() external payable {
        revert("reject");
    }
}

contract NoERC721Receiver { }

contract ReentrantMarketplaceReceiver is IERC721Receiver {
    address public immutable registry;
    ChainNameMarketplaceV3 public immutable marketplace;
    uint256 public callbackCount;
    bool public reentrySucceeded;
    bytes4 public reentryError;

    constructor(address registry_, ChainNameMarketplaceV3 marketplace_) {
        registry = registry_;
        marketplace = marketplace_;
    }

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        require(msg.sender == registry, "unexpected registry");
        ++callbackCount;
        bytes memory result;
        (reentrySucceeded, result) = address(marketplace)
            .call(abi.encodeWithSelector(marketplace.claimBalance.selector, address(this)));
        if (result.length >= 4) {
            bytes4 selector;
            assembly ("memory-safe") {
                selector := mload(add(result, 0x20))
            }
            reentryError = selector;
        }
        return IERC721Receiver.onERC721Received.selector;
    }
}

contract V3SuiteEdgeTest is V3SuiteTestBase {
    function test_SuiteConfigurationRejectsWrongAuthorityWiringAndRepeat() public {
        bytes32 suffixNode = keccak256(abi.encodePacked(bytes32(0), keccak256(bytes("sepbase"))));
        ChainNameRegistryV3 candidate = new ChainNameRegistryV3(
            "Candidate Names",
            "CAND",
            "sepbase",
            suffixNode,
            registry.ADDR_REVERSE_NODE(),
            NORMALIZATION_PROFILE_HASH,
            owner,
            address(this),
            30 days,
            "https://example.test/candidate/"
        );

        vm.expectRevert(ChainNameRegistryV3.NotSuiteConfigurator.selector);
        vm.prank(owner);
        candidate.configureSuite(
            address(controller), address(resolver), address(migration), address(marketplace)
        );
        vm.expectRevert(ChainNameRegistryV3.ZeroAddress.selector);
        candidate.configureSuite(
            address(0), address(resolver), address(migration), address(marketplace)
        );
        vm.expectRevert(ChainNameRegistryV3.InvalidSuiteWiring.selector);
        candidate.configureSuite(
            address(controller), address(resolver), address(migration), address(marketplace)
        );
        assertFalse(candidate.suiteConfigured());

        vm.expectRevert(ChainNameRegistryV3.SuiteAlreadyConfigured.selector);
        registry.configureSuite(
            address(controller), address(resolver), address(migration), address(marketplace)
        );
        assertTrue(registry.suiteConfigured());
    }

    function test_FixedSaleReceiverCallbackCannotReenterProtectedAccounting() public {
        uint256 tokenId =
            _register("alice", alice, alice, address(0), bytes32("fixed-reentry"), false);
        ReentrantMarketplaceReceiver receiver =
            new ReentrantMarketplaceReceiver(address(registry), marketplace);
        uint64 deadline = uint64(vm.getBlockTimestamp() + 1 days);
        uint64 transferNonce = registry.transferNonce(tokenId);
        vm.prank(alice);
        registry.approve(address(marketplace), tokenId);
        vm.prank(alice);
        marketplace.listName(
            ChainNameMarketplaceV3.ListRequest({
                tokenId: tokenId,
                price: 10_000,
                deadline: deadline,
                expectedTransferNonce: transferNonce,
                expectedFeeBps: 100
            })
        );
        vm.prank(bob);
        marketplace.buyName{ value: 10_000 }(
            ChainNameMarketplaceV3.BuyRequest({
                tokenId: tokenId,
                expectedSeller: alice,
                recipient: address(receiver),
                expectedPrice: 10_000,
                expectedDeadline: deadline,
                expectedListingNonce: 1,
                expectedFeeBps: 100
            })
        );

        assertEq(registry.ownerOf(tokenId), address(receiver));
        assertEq(receiver.callbackCount(), 1);
        assertFalse(receiver.reentrySucceeded());
        assertEq(receiver.reentryError(), bytes4(keccak256("ReentrancyGuardReentrantCall()")));
        assertEq(marketplace.claimableBalance(alice), 9900);
        assertEq(marketplace.protectedBalance(), 9900);
        assertEq(marketplace.treasuryAvailableBalance(), 100);
        assertTrue(marketplace.isSolvent());
    }

    function test_OfferReceiverCallbackCannotReenterProtectedAccounting() public {
        uint256 tokenId =
            _register("alice", alice, alice, address(0), bytes32("offer-reentry"), false);
        ReentrantMarketplaceReceiver receiver =
            new ReentrantMarketplaceReceiver(address(registry), marketplace);
        uint64 deadline = uint64(vm.getBlockTimestamp() + 1 days);
        uint64 transferNonce = registry.transferNonce(tokenId);
        vm.prank(bob);
        bytes32 offerId = marketplace.makeOffer{ value: 20_000 }(
            ChainNameMarketplaceV3.OfferRequest({
                tokenId: tokenId,
                recipient: address(receiver),
                expectedOwner: alice,
                amount: 20_000,
                deadline: deadline,
                expectedTransferNonce: transferNonce,
                expectedFeeBps: 100
            })
        );
        vm.prank(alice);
        registry.approve(address(marketplace), tokenId);
        vm.prank(alice);
        marketplace.acceptOffer(
            ChainNameMarketplaceV3.AcceptOfferRequest({
                offerId: offerId,
                expectedBuyer: bob,
                expectedRecipient: address(receiver),
                expectedAmount: 20_000,
                expectedDeadline: deadline,
                expectedFeeBps: 100
            })
        );

        assertEq(registry.ownerOf(tokenId), address(receiver));
        assertEq(receiver.callbackCount(), 1);
        assertFalse(receiver.reentrySucceeded());
        assertEq(receiver.reentryError(), bytes4(keccak256("ReentrancyGuardReentrantCall()")));
        assertEq(
            uint256(marketplace.offerStates(offerId)),
            uint256(ChainNameMarketplaceV3.OfferState.ACCEPTED)
        );
        assertEq(marketplace.totalOfferEscrow(), 0);
        assertEq(marketplace.claimableBalance(alice), 19_800);
        assertEq(marketplace.protectedBalance(), 19_800);
        assertEq(marketplace.treasuryAvailableBalance(), 200);
        assertTrue(marketplace.isSolvent());
    }

    function test_UnsolicitedMarketplaceTransferIsRejected() public {
        uint256 tokenId =
            _register("alice", alice, alice, address(0), bytes32("unsolicited"), false);
        vm.expectRevert(ChainNameRegistryV3.MarketplaceCustodyRequiresOperator.selector);
        vm.prank(alice);
        registry.transferFrom(alice, address(marketplace), tokenId);
        assertEq(registry.ownerOf(tokenId), alice);
    }

    function test_AuctionFinalizesToBoundContractRecipientWithoutCallbackAndWhilePaused() public {
        uint256 tokenId =
            _register("alice", alice, alice, address(0), bytes32("contract-recipient"), false);
        NoERC721Receiver recipient = new NoERC721Receiver();
        vm.prank(alice);
        registry.approve(address(marketplace), tokenId);
        uint64 startAt = uint64(vm.getBlockTimestamp());
        uint64 endAt = startAt + 1 hours;
        uint64 transferNonce = registry.transferNonce(tokenId);
        vm.prank(alice);
        marketplace.startAuction(
            ChainNameMarketplaceV3.StartAuctionRequest({
                tokenId: tokenId,
                reservePrice: 1000,
                startAt: startAt,
                endAt: endAt,
                expectedTransferNonce: transferNonce,
                expectedFeeBps: 100
            })
        );
        vm.prank(bob);
        marketplace.placeBid{ value: 1000 }(
            ChainNameMarketplaceV3.BidRequest({
                tokenId: tokenId,
                amount: 1000,
                recipient: address(recipient),
                expectedHighestBidder: address(0),
                expectedHighestBidRecipient: address(0),
                expectedHighestBid: 0,
                expectedEndAt: endAt,
                expectedAuctionNonce: 1,
                expectedFeeBps: 100
            })
        );
        vm.prank(owner);
        marketplace.setMarketPaused(true);
        vm.warp(endAt + 1);
        marketplace.finalizeAuction(
            ChainNameMarketplaceV3.FinalizeAuctionRequest({
                tokenId: tokenId,
                expectedHighestBidder: bob,
                expectedHighestBidRecipient: address(recipient),
                expectedHighestBid: 1000,
                expectedEndAt: endAt,
                expectedAuctionNonce: 1,
                expectedFeeBps: 100
            })
        );
        assertEq(registry.ownerOf(tokenId), address(recipient));
        assertEq(marketplace.claimableBalance(alice), 990);
        assertEq(marketplace.totalAuctionEscrow(), 0);
    }

    function test_AuctionFinalizedInGraceRefundsBidderAndDoesNotPaySeller() public {
        uint256 tokenId =
            _register("alice", alice, alice, address(0), bytes32("auction-expiry"), false);
        vm.prank(alice);
        registry.approve(address(marketplace), tokenId);
        uint64 startAt = uint64(vm.getBlockTimestamp());
        uint64 endAt = startAt + 1 hours;
        uint64 transferNonce = registry.transferNonce(tokenId);
        vm.prank(alice);
        marketplace.startAuction(
            ChainNameMarketplaceV3.StartAuctionRequest({
                tokenId: tokenId,
                reservePrice: 1000,
                startAt: startAt,
                endAt: endAt,
                expectedTransferNonce: transferNonce,
                expectedFeeBps: 100
            })
        );
        vm.prank(bob);
        marketplace.placeBid{ value: 1000 }(
            ChainNameMarketplaceV3.BidRequest({
                tokenId: tokenId,
                amount: 1000,
                recipient: bob,
                expectedHighestBidder: address(0),
                expectedHighestBidRecipient: address(0),
                expectedHighestBid: 0,
                expectedEndAt: endAt,
                expectedAuctionNonce: 1,
                expectedFeeBps: 100
            })
        );
        vm.warp(uint256(registry.expiresAt(tokenId)) + 1);
        marketplace.finalizeAuction(
            ChainNameMarketplaceV3.FinalizeAuctionRequest({
                tokenId: tokenId,
                expectedHighestBidder: bob,
                expectedHighestBidRecipient: bob,
                expectedHighestBid: 1000,
                expectedEndAt: endAt,
                expectedAuctionNonce: 1,
                expectedFeeBps: 100
            })
        );
        assertEq(marketplace.claimableBalance(bob), 1000);
        assertEq(marketplace.claimableBalance(alice), 0);
        assertEq(registry.ownerOf(tokenId), address(marketplace));
    }

    function test_RegistryRejectsMismatchedSuffixAndReverseNodes() public {
        bytes32 correctSuffix = keccak256(abi.encodePacked(bytes32(0), keccak256(bytes("sepbase"))));
        bytes32 correctReverse = registry.ADDR_REVERSE_NODE();
        vm.expectRevert(ChainNameRegistryV3.InvalidNode.selector);
        new ChainNameRegistryV3(
            "Names",
            "NAME",
            "sepbase",
            bytes32(uint256(correctSuffix) + 1),
            correctReverse,
            NORMALIZATION_PROFILE_HASH,
            owner,
            address(this),
            30 days,
            "https://example.test/"
        );
        vm.expectRevert(ChainNameRegistryV3.InvalidNode.selector);
        new ChainNameRegistryV3(
            "Names",
            "NAME",
            "sepbase",
            correctSuffix,
            bytes32(uint256(1)),
            NORMALIZATION_PROFILE_HASH,
            owner,
            address(this),
            30 days,
            "https://example.test/"
        );
    }

    function test_ERC1271NormalizationAttestorAcceptsApprovedAndRejectsInvalidSignature() public {
        MockERC1271Attestor contractAttestor = new MockERC1271Attestor();
        attestor = address(contractAttestor);
        _deploySuite(ChainNameControllerV3.SettlementKind.NATIVE, address(0));
        vm.deal(alice, 100 ether);
        (
            ChainNameControllerV3.RegistrationRequest memory request,
            ChainNameControllerV3.ResolverInitialization memory initialization,
            ChainNameControllerV3.NormalizationAttestation memory attestation,
            bytes32 commitment
        ) = _prepare("alice", alice, alice, address(0), bytes32("erc1271"), false);
        bytes32 digest = controller.normalizationAttestationDigest(
            keccak256(bytes("alice")), alice, attestation.validUntil
        );
        contractAttestor.approve(digest, attestation.signature);
        vm.prank(alice);
        controller.commit(commitment);
        vm.warp(vm.getBlockTimestamp() + 60);
        vm.prank(alice);
        controller.register{ value: request.expectedAmount }(request, initialization, attestation);
        assertEq(registry.ownerOf(registry.tokenIdFor("alice")), alice);

        (request, initialization, attestation, commitment) =
            _prepare("bob", alice, alice, address(0), bytes32("invalid-1271"), false);
        vm.prank(alice);
        controller.commit(commitment);
        vm.warp(vm.getBlockTimestamp() + 60);
        vm.expectRevert(ChainNameControllerV3.InvalidNormalizationAttestation.selector);
        vm.prank(alice);
        controller.register{ value: request.expectedAmount }(request, initialization, attestation);
    }

    function test_AttestationExpiredAndWrongRecipientAreTypedFailures() public {
        (
            ChainNameControllerV3.RegistrationRequest memory expiredRequest,
            ChainNameControllerV3.ResolverInitialization memory expiredInitialization,
            ChainNameControllerV3.NormalizationAttestation memory expiredAttestation,
            bytes32 expiredCommitment
        ) = _prepare("alice", alice, alice, address(0), bytes32("expired-att"), false);
        vm.prank(alice);
        controller.commit(expiredCommitment);
        vm.warp(expiredAttestation.validUntil + 1);
        vm.expectPartialRevert(ChainNameControllerV3.NormalizationAttestationExpired.selector);
        vm.prank(alice);
        controller.register{ value: expiredRequest.expectedAmount }(
            expiredRequest, expiredInitialization, expiredAttestation
        );

        (
            ChainNameControllerV3.RegistrationRequest memory wrongRecipientRequest,
            ChainNameControllerV3.ResolverInitialization memory wrongRecipientInitialization,
            ChainNameControllerV3.NormalizationAttestation memory wrongRecipientAttestation,
            bytes32 ignoredCommitment
        ) = _prepare("bob", alice, alice, address(0), bytes32("wrong-recipient"), false);
        assertTrue(ignoredCommitment != bytes32(0));
        wrongRecipientRequest.recipient = bob;
        bytes32 node = registry.nodeForLabelHash(keccak256(bytes("bob")));
        bytes32 commitment = controller.makeCommitment(
            node,
            alice,
            bob,
            1,
            wrongRecipientRequest.resolverInitializationHash,
            wrongRecipientRequest.normalizationAttestationHash,
            address(0),
            wrongRecipientRequest.secret,
            wrongRecipientRequest.expectedAmount,
            wrongRecipientRequest.expectedReferralRewardBps
        );
        vm.prank(alice);
        controller.commit(commitment);
        vm.warp(vm.getBlockTimestamp() + 60);
        vm.expectRevert(ChainNameControllerV3.InvalidNormalizationAttestation.selector);
        vm.prank(alice);
        controller.register{ value: wrongRecipientRequest.expectedAmount }(
            wrongRecipientRequest, wrongRecipientInitialization, wrongRecipientAttestation
        );
    }

    function test_CommitmentExpirySecretChainPriceAndReferralGuards() public {
        (
            ChainNameControllerV3.RegistrationRequest memory request,
            ChainNameControllerV3.ResolverInitialization memory initialization,
            ChainNameControllerV3.NormalizationAttestation memory attestation,
            bytes32 commitment
        ) = _prepare("alice", alice, alice, address(0), bytes32("guard"), false);
        vm.prank(alice);
        controller.commit(commitment);
        vm.warp(vm.getBlockTimestamp() + 1 days + 1);
        vm.expectPartialRevert(ChainNameControllerV3.CommitmentExpired.selector);
        vm.prank(alice);
        controller.register{ value: request.expectedAmount }(request, initialization, attestation);

        (request, initialization, attestation, commitment) =
            _prepare("bob", bob, bob, address(0), bytes32("secret-a"), false);
        vm.prank(bob);
        controller.commit(commitment);
        vm.warp(vm.getBlockTimestamp() + 60);
        request.secret = bytes32("secret-b");
        vm.expectRevert(ChainNameControllerV3.CommitmentMissing.selector);
        vm.prank(bob);
        controller.register{ value: request.expectedAmount }(request, initialization, attestation);

        (request, initialization, attestation, commitment) =
            _prepare("carol", carol, carol, address(0), bytes32("price"), false);
        vm.prank(carol);
        controller.commit(commitment);
        vm.prank(owner);
        controller.setAnnualPrice(ANNUAL_PRICE * 2);
        vm.warp(vm.getBlockTimestamp() + 60);
        vm.expectPartialRevert(ChainNameControllerV3.PriceChanged.selector);
        vm.prank(carol);
        controller.register{ value: request.expectedAmount }(request, initialization, attestation);

        vm.prank(owner);
        controller.setAnnualPrice(ANNUAL_PRICE);
        (request, initialization, attestation, commitment) =
            _prepare("dave", alice, alice, referrer, bytes32("bps"), false);
        vm.prank(alice);
        controller.commit(commitment);
        vm.prank(owner);
        controller.setReferralRewardBps(500);
        vm.warp(vm.getBlockTimestamp() + 60);
        vm.expectPartialRevert(ChainNameControllerV3.ReferralRateChanged.selector);
        vm.prank(alice);
        controller.register{ value: request.expectedAmount }(request, initialization, attestation);

        vm.prank(owner);
        controller.setReferralRewardBps(1000);
        vm.chainId(block.chainid + 1);
        vm.expectRevert(ChainNameControllerV3.CommitmentMissing.selector);
        vm.prank(alice);
        controller.register{ value: request.expectedAmount }(request, initialization, attestation);
    }

    function test_RenewalPriceLifecycleAndNoReferralReward() public {
        uint256 tokenId = _register("alice", alice, alice, referrer, bytes32("renew"), false);
        uint64 previousExpiry = registry.expiresAt(tokenId);
        uint256 previousReferral = controller.referralBalance(referrer);
        vm.expectPartialRevert(ChainNameControllerV3.PriceChanged.selector);
        vm.prank(bob);
        controller.renew{ value: 1 }(tokenId, 1, 1);

        uint256 amount = controller.quote("alice", 1);
        vm.prank(bob);
        controller.renew{ value: amount }(tokenId, 1, amount);
        assertEq(registry.expiresAt(tokenId), previousExpiry + 365 days);
        assertEq(controller.referralBalance(referrer), previousReferral);

        vm.warp(uint256(registry.expiresAt(tokenId)) + registry.gracePeriod() + 1);
        vm.expectRevert(ChainNameControllerV3.RenewalWindowClosed.selector);
        vm.prank(bob);
        controller.renew{ value: amount }(tokenId, 1, amount);
    }

    function test_ResolverRejectsMalformedDNSUnsupportedSelectorAndOversizedText() public {
        uint256 tokenId = _register("alice", alice, alice, address(0), bytes32("dns"), false);
        bytes32 node = registry.nodeForLabelHash(bytes32(tokenId));
        string memory longKey = new string(65);
        vm.expectRevert(ChainNameResolverV3.FieldTooLong.selector);
        vm.prank(alice);
        resolver.setText(node, longKey, "value");

        vm.expectRevert(ChainNameResolverV3.InvalidDNSName.selector);
        resolver.resolve(hex"05616c", abi.encodeWithSelector(IAddrResolver.addr.selector, node));
        vm.expectPartialRevert(ChainNameResolverV3.UnsupportedResolverCall.selector);
        resolver.resolve(_dnsName("alice", "sepbase"), hex"deadbeef");
        assertEq(type(IExtendedResolver).interfaceId, bytes4(0x9061b923));
        assertEq(type(IUniversalResolverV3).interfaceId, bytes4(0xcd191b34));
    }

    function test_AdminReservationBlocksOnlyFuturePublicRegistration() public {
        bytes32 reservedHash = keccak256(bytes("reserved"));
        bytes32[] memory hashes = new bytes32[](1);
        hashes[0] = reservedHash;
        vm.prank(owner);
        registry.setReservedLabels(hashes, true);
        assertFalse(registry.isAvailable("reserved"));
        (
            ChainNameControllerV3.RegistrationRequest memory request,
            ChainNameControllerV3.ResolverInitialization memory initialization,
            ChainNameControllerV3.NormalizationAttestation memory attestation,
            bytes32 commitment
        ) = _prepare("reserved", alice, alice, address(0), bytes32("reserved"), false);
        vm.prank(alice);
        controller.commit(commitment);
        vm.warp(vm.getBlockTimestamp() + 60);
        vm.expectRevert(ChainNameRegistryV3.NameReserved.selector);
        vm.prank(alice);
        controller.register{ value: request.expectedAmount }(request, initialization, attestation);

        uint256 existing =
            _register("existing", alice, alice, address(0), bytes32("existing"), false);
        hashes[0] = keccak256(bytes("existing"));
        vm.prank(owner);
        registry.setReservedLabels(hashes, true);
        assertEq(registry.ownerOf(existing), alice);
    }

    function test_ListingNonceIncrementsOnUpdateAndOldBuyCannotReplay() public {
        uint256 tokenId = _register("alice", alice, alice, address(0), bytes32("list-nonce"), false);
        vm.prank(alice);
        registry.approve(address(marketplace), tokenId);
        uint64 transferNonce = registry.transferNonce(tokenId);
        uint64 firstDeadline = uint64(vm.getBlockTimestamp() + 1 days);
        vm.prank(alice);
        marketplace.listName(
            ChainNameMarketplaceV3.ListRequest({
                tokenId: tokenId,
                price: 1000,
                deadline: firstDeadline,
                expectedTransferNonce: transferNonce,
                expectedFeeBps: 100
            })
        );
        uint64 secondDeadline = uint64(vm.getBlockTimestamp() + 2 days);
        vm.prank(alice);
        marketplace.updateListing(
            tokenId, 1000, firstDeadline, transferNonce, 1, 100, 2000, secondDeadline, 100
        );
        assertEq(marketplace.latestListingNonce(tokenId), 2);
        vm.expectRevert(ChainNameMarketplaceV3.ListingGuardFailed.selector);
        vm.prank(bob);
        marketplace.buyName{ value: 2000 }(
            ChainNameMarketplaceV3.BuyRequest({
                tokenId: tokenId,
                expectedSeller: alice,
                recipient: bob,
                expectedPrice: 2000,
                expectedDeadline: secondDeadline,
                expectedListingNonce: 1,
                expectedFeeBps: 100
            })
        );
        vm.prank(alice);
        marketplace.cancelListing(tokenId, 2000, secondDeadline, transferNonce, 2, 100);
    }

    function test_ListingStaleSelfPurchaseAndPayoutFailureRemainSafe() public {
        uint256 tokenId = _register("alice", alice, alice, address(0), bytes32("stale"), false);
        vm.prank(alice);
        registry.approve(address(marketplace), tokenId);
        uint64 transferNonce = registry.transferNonce(tokenId);
        uint64 deadline = uint64(vm.getBlockTimestamp() + 1 days);
        vm.prank(alice);
        marketplace.listName(
            ChainNameMarketplaceV3.ListRequest({
                tokenId: tokenId,
                price: 10_000,
                deadline: deadline,
                expectedTransferNonce: transferNonce,
                expectedFeeBps: 100
            })
        );
        vm.expectRevert(ChainNameMarketplaceV3.SelfPurchaseForbidden.selector);
        vm.prank(alice);
        marketplace.buyName{ value: 10_000 }(
            ChainNameMarketplaceV3.BuyRequest({
                tokenId: tokenId,
                expectedSeller: alice,
                recipient: bob,
                expectedPrice: 10_000,
                expectedDeadline: deadline,
                expectedListingNonce: 1,
                expectedFeeBps: 100
            })
        );

        vm.prank(bob);
        marketplace.buyName{ value: 10_000 }(
            ChainNameMarketplaceV3.BuyRequest({
                tokenId: tokenId,
                expectedSeller: alice,
                recipient: bob,
                expectedPrice: 10_000,
                expectedDeadline: deadline,
                expectedListingNonce: 1,
                expectedFeeBps: 100
            })
        );
        RejectNativeRecipient rejector = new RejectNativeRecipient();
        uint256 claimable = marketplace.claimableBalance(alice);
        vm.expectRevert(ChainNameMarketplaceV3.TransferFailed.selector);
        vm.prank(alice);
        marketplace.claimBalance(address(rejector));
        assertEq(marketplace.claimableBalance(alice), claimable);
        assertTrue(marketplace.isSolvent());
    }

    function test_OfferExpiryStaleCleanupAndDoubleSpendPrevention() public {
        uint256 tokenId = _register("alice", alice, alice, address(0), bytes32("offer-edge"), false);
        uint64 deadline = uint64(vm.getBlockTimestamp() + 1 hours);
        uint64 nonce = registry.transferNonce(tokenId);
        vm.prank(bob);
        bytes32 offerId = marketplace.makeOffer{ value: 5000 }(
            ChainNameMarketplaceV3.OfferRequest({
                tokenId: tokenId,
                recipient: bob,
                expectedOwner: alice,
                amount: 5000,
                deadline: deadline,
                expectedTransferNonce: nonce,
                expectedFeeBps: 100
            })
        );
        vm.warp(deadline + 1);
        (ChainNameMarketLensV3.OfferPageItem[] memory page, uint256 nextCursor) =
            marketLens.getOffers(tokenId, 0, 24);
        assertEq(page.length, 0);
        assertEq(nextCursor, 1);
        assertEq(marketplace.offerEntryCount(tokenId), 1);
        (ChainNameMarketLensV3.OfferPageItem[] memory staleGlobal, uint256 globalCursor) =
            marketLens.getGlobalOffers(0, 24, false);
        assertEq(staleGlobal.length, 1);
        assertEq(globalCursor, 1);
        assertEq(staleGlobal[0].offerId, offerId);
        assertTrue(staleGlobal[0].stale);
        assertEq(uint256(staleGlobal[0].state), uint256(ChainNameMarketplaceV3.OfferState.ACTIVE));
        (ChainNameMarketLensV3.OfferPageItem[] memory staleBuyer,) =
            marketLens.getBuyerOffers(bob, 0, 24, false);
        assertEq(staleBuyer.length, 1);
        (ChainNameMarketLensV3.OfferPageItem[] memory staleOwner,) =
            marketLens.getOwnerOffers(alice, 0, 24, false);
        assertEq(staleOwner.length, 1);
        vm.prank(carol);
        marketplace.invalidateOffer(offerId);
        assertEq(marketplace.claimableBalance(bob), 5000);
        (ChainNameMarketLensV3.OfferPageItem[] memory terminalGlobal,) =
            marketLens.getGlobalOffers(0, 24, true);
        assertEq(terminalGlobal.length, 1);
        assertFalse(terminalGlobal[0].stale);
        assertEq(
            uint256(terminalGlobal[0].state), uint256(ChainNameMarketplaceV3.OfferState.REFUNDED)
        );
        (ChainNameMarketLensV3.OfferPageItem[] memory noTerminal,) =
            marketLens.getGlobalOffers(0, 24, false);
        assertEq(noTerminal.length, 0);
        vm.expectRevert(ChainNameMarketplaceV3.OfferNotFound.selector);
        vm.prank(bob);
        marketplace.cancelOffer(offerId, 5000, deadline, 100);
    }

    function test_AuctionTimingIncrementCancelAndFinalizeReplayGuards() public {
        uint256 tokenId =
            _register("alice", alice, alice, address(0), bytes32("auction-edge"), false);
        vm.prank(alice);
        registry.approve(address(marketplace), tokenId);
        uint64 startAt = uint64(vm.getBlockTimestamp() + 10 minutes);
        uint64 endAt = startAt + 1 hours;
        uint64 nonce = registry.transferNonce(tokenId);
        vm.prank(alice);
        marketplace.startAuction(
            ChainNameMarketplaceV3.StartAuctionRequest({
                tokenId: tokenId,
                reservePrice: 1000,
                startAt: startAt,
                endAt: endAt,
                expectedTransferNonce: nonce,
                expectedFeeBps: 100
            })
        );
        vm.expectRevert(ChainNameMarketplaceV3.AuctionNotStarted.selector);
        vm.prank(bob);
        marketplace.placeBid{ value: 1000 }(
            ChainNameMarketplaceV3.BidRequest({
                tokenId: tokenId,
                amount: 1000,
                recipient: bob,
                expectedHighestBidder: address(0),
                expectedHighestBidRecipient: address(0),
                expectedHighestBid: 0,
                expectedEndAt: endAt,
                expectedAuctionNonce: 1,
                expectedFeeBps: 100
            })
        );
        vm.warp(startAt);
        vm.expectPartialRevert(ChainNameMarketplaceV3.BidTooLow.selector);
        vm.prank(bob);
        marketplace.placeBid{ value: 999 }(
            ChainNameMarketplaceV3.BidRequest({
                tokenId: tokenId,
                amount: 999,
                recipient: bob,
                expectedHighestBidder: address(0),
                expectedHighestBidRecipient: address(0),
                expectedHighestBid: 0,
                expectedEndAt: endAt,
                expectedAuctionNonce: 1,
                expectedFeeBps: 100
            })
        );
        vm.prank(bob);
        marketplace.placeBid{ value: 1000 }(
            ChainNameMarketplaceV3.BidRequest({
                tokenId: tokenId,
                amount: 1000,
                recipient: bob,
                expectedHighestBidder: address(0),
                expectedHighestBidRecipient: address(0),
                expectedHighestBid: 0,
                expectedEndAt: endAt,
                expectedAuctionNonce: 1,
                expectedFeeBps: 100
            })
        );
        vm.expectRevert(ChainNameMarketplaceV3.AuctionHasBid.selector);
        vm.prank(alice);
        marketplace.cancelAuction(tokenId, 1000, endAt, 1, 100);
        vm.expectRevert(ChainNameMarketplaceV3.AuctionNotEnded.selector);
        marketplace.finalizeAuction(
            ChainNameMarketplaceV3.FinalizeAuctionRequest({
                tokenId: tokenId,
                expectedHighestBidder: bob,
                expectedHighestBidRecipient: bob,
                expectedHighestBid: 1000,
                expectedEndAt: endAt,
                expectedAuctionNonce: 1,
                expectedFeeBps: 100
            })
        );
        vm.warp(endAt + 1);
        marketplace.finalizeAuction(
            ChainNameMarketplaceV3.FinalizeAuctionRequest({
                tokenId: tokenId,
                expectedHighestBidder: bob,
                expectedHighestBidRecipient: bob,
                expectedHighestBid: 1000,
                expectedEndAt: endAt,
                expectedAuctionNonce: 1,
                expectedFeeBps: 100
            })
        );
        vm.expectRevert(ChainNameMarketplaceV3.AuctionNotFound.selector);
        marketplace.finalizeAuction(
            ChainNameMarketplaceV3.FinalizeAuctionRequest({
                tokenId: tokenId,
                expectedHighestBidder: bob,
                expectedHighestBidRecipient: bob,
                expectedHighestBid: 1000,
                expectedEndAt: endAt,
                expectedAuctionNonce: 1,
                expectedFeeBps: 100
            })
        );
    }

    function test_MigrationOwnerResolutionAndWindowGuards() public {
        legacy.seed("legacy", alice, 1, uint64(vm.getBlockTimestamp() + 100 days), carol);
        vm.expectRevert(ChainNameMigrationV3.NotLegacyOwner.selector);
        vm.prank(bob);
        migration.claim("legacy", bob, alice, true, carol);
        vm.expectPartialRevert(ChainNameMigrationV3.LegacyResolutionChanged.selector);
        vm.prank(alice);
        migration.claim("legacy", bob, alice, true, bob);
        vm.warp(migration.migrationEndsAt() + 1);
        vm.expectRevert(ChainNameMigrationV3.MigrationWindowClosed.selector);
        vm.prank(alice);
        migration.claim("legacy", bob, alice, true, carol);
    }

    function test_MarketLensSwapPopPaginationRequiresPinnedBlockOrCursorRestart() public {
        uint256 first = _register("first", alice, alice, address(0), bytes32("page-1"), false);
        uint256 second = _register("second", alice, alice, address(0), bytes32("page-2"), false);
        uint256 third = _register("third", alice, alice, address(0), bytes32("page-3"), false);
        uint64 deadline = uint64(vm.getBlockTimestamp() + 1 days);
        _listAsAlice(first, 1000, deadline);
        _listAsAlice(second, 2000, deadline);
        _listAsAlice(third, 3000, deadline);

        (ChainNameMarketLensV3.ListingPageItem[] memory firstPage, uint256 oldCursor) =
            marketLens.getListings(0, 2);
        assertEq(firstPage.length, 2);
        assertEq(oldCursor, 2);
        ChainNameMarketLensV3.ListingPageItem memory removed = firstPage[0];
        vm.prank(alice);
        marketplace.cancelListing(
            removed.tokenId,
            removed.listing.price,
            removed.listing.deadline,
            removed.listing.transferNonce,
            removed.listing.listingNonce,
            removed.listing.feeBps
        );
        assertEq(marketplace.listingEntryCount(), 2);

        (ChainNameMarketLensV3.ListingPageItem[] memory racedPage,) =
            marketLens.getListings(oldCursor, 24);
        assertEq(racedPage.length, 0);
        (ChainNameMarketLensV3.ListingPageItem[] memory restarted, uint256 finalCursor) =
            marketLens.getListings(0, 24);
        assertEq(restarted.length, 2);
        assertEq(finalCursor, 2);
        assertTrue(restarted[0].tokenId != restarted[1].tokenId);
    }

    function _listAsAlice(uint256 tokenId, uint256 price, uint64 deadline) internal {
        vm.prank(alice);
        registry.approve(address(marketplace), tokenId);
        uint64 nonce = registry.transferNonce(tokenId);
        vm.prank(alice);
        marketplace.listName(
            ChainNameMarketplaceV3.ListRequest({
                tokenId: tokenId,
                price: price,
                deadline: deadline,
                expectedTransferNonce: nonce,
                expectedFeeBps: 100
            })
        );
    }
}

contract V3MarketplaceFeeTokenEdgeTest is V3SuiteTestBase {
    function test_FeeOnTransferMarketplaceBuyIsRejectedAndListingRemains() public {
        vm.warp(1_800_000_000);
        attestor = vm.addr(ATTESTOR_PRIVATE_KEY);
        MockFeeOnTransferERC20 feeToken = new MockFeeOnTransferERC20(6);
        _deploySuite(ChainNameControllerV3.SettlementKind.ERC20, address(feeToken));
        legacy.seed("legacy", alice, 1, uint64(vm.getBlockTimestamp() + 100 days), alice);
        vm.prank(alice);
        (uint256 tokenId,) = migration.claim("legacy", alice, alice, false, address(0));
        vm.prank(alice);
        registry.approve(address(marketplace), tokenId);
        uint64 deadline = uint64(vm.getBlockTimestamp() + 1 days);
        uint64 nonce = registry.transferNonce(tokenId);
        vm.prank(alice);
        marketplace.listName(
            ChainNameMarketplaceV3.ListRequest({
                tokenId: tokenId,
                price: 500_000,
                deadline: deadline,
                expectedTransferNonce: nonce,
                expectedFeeBps: 100
            })
        );
        feeToken.mint(bob, 1_000_000);
        vm.prank(bob);
        feeToken.approve(address(marketplace), type(uint256).max);
        vm.expectPartialRevert(ChainNameMarketplaceV3.SettlementTransferMismatch.selector);
        vm.prank(bob);
        marketplace.buyName(
            ChainNameMarketplaceV3.BuyRequest({
                tokenId: tokenId,
                expectedSeller: alice,
                recipient: bob,
                expectedPrice: 500_000,
                expectedDeadline: deadline,
                expectedListingNonce: 1,
                expectedFeeBps: 100
            })
        );
        assertEq(registry.ownerOf(tokenId), alice);
        (address listedSeller,,,,,) = marketplace.listings(tokenId);
        assertEq(listedSeller, alice);
    }
}

contract V3RebasingTokenEdgeTest is V3SuiteTestBase {
    MockRebasingERC20 internal rebaseToken;

    function setUp() public override {
        vm.warp(1_800_000_000);
        attestor = vm.addr(ATTESTOR_PRIVATE_KEY);
        rebaseToken = new MockRebasingERC20(6);
        _deploySuite(ChainNameControllerV3.SettlementKind.ERC20, address(rebaseToken));
        rebaseToken.mint(alice, 10_000_000);
        rebaseToken.mint(bob, 10_000_000);
        vm.prank(alice);
        rebaseToken.approve(address(controller), type(uint256).max);
        vm.prank(bob);
        rebaseToken.approve(address(marketplace), type(uint256).max);
    }

    function test_RebasingSettlementRejectedBeforeRegistrationState() public {
        (
            ChainNameControllerV3.RegistrationRequest memory request,
            ChainNameControllerV3.ResolverInitialization memory initialization,
            ChainNameControllerV3.NormalizationAttestation memory attestation,
            bytes32 commitment
        ) = _prepare("alice", alice, alice, address(0), bytes32("rebase-register"), false);
        vm.prank(alice);
        controller.commit(commitment);
        vm.warp(vm.getBlockTimestamp() + 60);
        vm.expectPartialRevert(ChainNameControllerV3.SettlementTransferMismatch.selector);
        vm.prank(alice);
        controller.register(request, initialization, attestation);

        assertEq(registry.balanceOf(alice), 0);
        assertEq(rebaseToken.balanceOf(address(controller)), 0);
        assertEq(rebaseToken.balanceOf(alice), 10_000_000);
        assertEq(controller.totalReferralLiability(), 0);
    }

    function test_RebasingSettlementRejectedBeforeMarketplaceState() public {
        legacy.seed("legacy", alice, 1, uint64(vm.getBlockTimestamp() + 100 days), alice);
        vm.prank(alice);
        (uint256 tokenId,) = migration.claim("legacy", alice, alice, false, address(0));
        vm.prank(alice);
        registry.approve(address(marketplace), tokenId);
        uint64 deadline = uint64(vm.getBlockTimestamp() + 1 days);
        uint64 transferNonce = registry.transferNonce(tokenId);
        vm.prank(alice);
        marketplace.listName(
            ChainNameMarketplaceV3.ListRequest({
                tokenId: tokenId,
                price: 500_000,
                deadline: deadline,
                expectedTransferNonce: transferNonce,
                expectedFeeBps: 100
            })
        );
        vm.expectPartialRevert(ChainNameMarketplaceV3.SettlementTransferMismatch.selector);
        vm.prank(bob);
        marketplace.buyName(
            ChainNameMarketplaceV3.BuyRequest({
                tokenId: tokenId,
                expectedSeller: alice,
                recipient: bob,
                expectedPrice: 500_000,
                expectedDeadline: deadline,
                expectedListingNonce: 1,
                expectedFeeBps: 100
            })
        );

        assertEq(registry.ownerOf(tokenId), alice);
        (address listedSeller,,,,,) = marketplace.listings(tokenId);
        assertEq(listedSeller, alice);
        assertEq(rebaseToken.balanceOf(address(marketplace)), 0);
        assertEq(rebaseToken.balanceOf(bob), 10_000_000);
        assertEq(marketplace.protectedBalance(), 0);
    }
}

contract V3FailedERC20PayoutEdgeTest is V3SuiteTestBase {
    MockFailingPayoutERC20 internal payoutToken;

    function setUp() public override {
        vm.warp(1_800_000_000);
        attestor = vm.addr(ATTESTOR_PRIVATE_KEY);
        payoutToken = new MockFailingPayoutERC20(6);
        _deploySuite(ChainNameControllerV3.SettlementKind.ERC20, address(payoutToken));
        payoutToken.mint(alice, 10_000_000);
        payoutToken.mint(bob, 10_000_000);
        vm.prank(alice);
        payoutToken.approve(address(controller), type(uint256).max);
        vm.prank(bob);
        payoutToken.approve(address(marketplace), type(uint256).max);
    }

    function test_FailedERC20ClaimsRevertWithoutReducingControllerOrMarketplaceLiability() public {
        _register("referral", alice, alice, carol, bytes32("failed-referral-payout"), false);
        uint256 referralLiability = controller.referralBalance(carol);
        assertGt(referralLiability, 0);

        legacy.seed("legacy", alice, 1, uint64(vm.getBlockTimestamp() + 100 days), alice);
        vm.prank(alice);
        (uint256 tokenId,) = migration.claim("legacy", alice, alice, false, address(0));
        vm.prank(alice);
        registry.approve(address(marketplace), tokenId);
        uint64 deadline = uint64(vm.getBlockTimestamp() + 1 days);
        uint64 transferNonce = registry.transferNonce(tokenId);
        vm.prank(alice);
        marketplace.listName(
            ChainNameMarketplaceV3.ListRequest({
                tokenId: tokenId,
                price: 500_000,
                deadline: deadline,
                expectedTransferNonce: transferNonce,
                expectedFeeBps: 100
            })
        );
        vm.prank(bob);
        marketplace.buyName(
            ChainNameMarketplaceV3.BuyRequest({
                tokenId: tokenId,
                expectedSeller: alice,
                recipient: bob,
                expectedPrice: 500_000,
                expectedDeadline: deadline,
                expectedListingNonce: 1,
                expectedFeeBps: 100
            })
        );
        uint256 marketplaceLiability = marketplace.claimableBalance(alice);
        assertGt(marketplaceLiability, 0);

        payoutToken.setRejectTransfers(true);

        vm.expectRevert();
        vm.prank(carol);
        controller.claimReferralRewards(carol);
        assertEq(controller.referralBalance(carol), referralLiability);
        assertEq(controller.totalReferralLiability(), referralLiability);
        assertTrue(controller.isSolvent());

        vm.expectRevert();
        vm.prank(alice);
        marketplace.claimBalance(alice);
        assertEq(marketplace.claimableBalance(alice), marketplaceLiability);
        assertEq(marketplace.totalClaimableLiability(), marketplaceLiability);
        assertTrue(marketplace.isSolvent());
    }
}

contract V3ReentrantBidTokenEdgeTest is V3SuiteTestBase {
    MockReentrantERC20 internal reentrantToken;

    function setUp() public override {
        vm.warp(1_800_000_000);
        attestor = vm.addr(ATTESTOR_PRIVATE_KEY);
        reentrantToken = new MockReentrantERC20(6);
        _deploySuite(ChainNameControllerV3.SettlementKind.ERC20, address(reentrantToken));
        reentrantToken.mint(bob, 10_000_000);
        vm.prank(bob);
        reentrantToken.approve(address(marketplace), type(uint256).max);
    }

    function test_ReentrantBidSettlementCallbackCannotDuplicateEscrowOrRefunds() public {
        legacy.seed("auction", alice, 1, uint64(vm.getBlockTimestamp() + 100 days), alice);
        vm.prank(alice);
        (uint256 tokenId,) = migration.claim("auction", alice, alice, false, address(0));
        vm.prank(alice);
        registry.approve(address(marketplace), tokenId);
        uint64 startAt = uint64(vm.getBlockTimestamp());
        uint64 endAt = startAt + 1 hours;
        uint64 transferNonce = registry.transferNonce(tokenId);
        vm.prank(alice);
        marketplace.startAuction(
            ChainNameMarketplaceV3.StartAuctionRequest({
                tokenId: tokenId,
                reservePrice: 500_000,
                startAt: startAt,
                endAt: endAt,
                expectedTransferNonce: transferNonce,
                expectedFeeBps: 100
            })
        );

        ChainNameMarketplaceV3.BidRequest memory bid = ChainNameMarketplaceV3.BidRequest({
            tokenId: tokenId,
            amount: 500_000,
            recipient: bob,
            expectedHighestBidder: address(0),
            expectedHighestBidRecipient: address(0),
            expectedHighestBid: 0,
            expectedEndAt: endAt,
            expectedAuctionNonce: 1,
            expectedFeeBps: 100
        });
        reentrantToken.configureReentry(
            address(marketplace), abi.encodeWithSelector(marketplace.placeBid.selector, bid)
        );

        vm.prank(bob);
        marketplace.placeBid(bid);

        (, address highestBidder, address highestBidRecipient,, uint256 highestBid,,,,,,,) =
            marketplace.auctions(tokenId);
        assertEq(highestBidder, bob);
        assertEq(highestBidRecipient, bob);
        assertEq(highestBid, 500_000);
        assertEq(reentrantToken.reentryAttempts(), 1);
        assertFalse(reentrantToken.reentrySucceeded());
        assertEq(
            reentrantToken.reentryRevertDataHash(),
            keccak256(abi.encodeWithSignature("ReentrancyGuardReentrantCall()"))
        );
        assertEq(marketplace.totalAuctionEscrow(), 500_000);
        assertEq(marketplace.totalClaimableLiability(), 0);
        assertTrue(marketplace.isSolvent());
    }
}
