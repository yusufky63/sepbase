// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import { Test } from "forge-std/Test.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import { ChainNameControllerV3 } from "../src/v3/ChainNameControllerV3.sol";
import { ChainNameMarketplaceV3 } from "../src/v3/ChainNameMarketplaceV3.sol";
import { ChainNameMarketLensV3 } from "../src/v3/ChainNameMarketLensV3.sol";
import { ChainNameMigrationV3 } from "../src/v3/ChainNameMigrationV3.sol";
import { ChainNameRegistryV3 } from "../src/v3/ChainNameRegistryV3.sol";
import { ChainNameResolverV3 } from "../src/v3/ChainNameResolverV3.sol";
import {
    ChainNameUniversalResolverV3,
    IUniversalResolverV3
} from "../src/v3/ChainNameUniversalResolverV3.sol";
import {
    IAddrResolver,
    IENSRegistryView,
    IMulticoinAddressResolver,
    INameResolver,
    ITextResolver
} from "../src/v3/interfaces/IENSResolverV3.sol";
import { IExtendedResolver } from "../src/v3/interfaces/IChainNameResolverWriterV3.sol";
import { IChainNameRegistryV3 } from "../src/v3/interfaces/IChainNameRegistryV3.sol";
import { MockERC20 } from "./mocks/MockERC20.sol";
import { MockFeeOnTransferERC20 } from "./mocks/MockFeeOnTransferERC20.sol";

contract MockLegacyV2 {
    uint64 public gracePeriod = 30 days;
    mapping(uint256 tokenId => address tokenOwner) public ownerOf;
    mapping(uint256 tokenId => uint8 status) public statusOf;
    mapping(uint256 tokenId => uint64 expiration) public expiresAt;
    mapping(uint256 tokenId => address target) public resolvedAddress;

    function seed(
        string calldata label,
        address tokenOwner,
        uint8 status,
        uint64 expiration,
        address target
    ) external {
        uint256 tokenId = uint256(keccak256(bytes(label)));
        ownerOf[tokenId] = tokenOwner;
        statusOf[tokenId] = status;
        expiresAt[tokenId] = expiration;
        resolvedAddress[tokenId] = target;
    }

    function setGracePeriod(uint64 newGracePeriod) external {
        gracePeriod = newGracePeriod;
    }
}

abstract contract V3SuiteTestBase is Test {
    uint256 internal constant ATTESTOR_PRIVATE_KEY = 0xA11CE;
    uint256 internal constant ANNUAL_PRICE = 500_000;
    uint24 internal constant SHORT_MULTIPLIERS = uint24(100 | (25 << 8) | (5 << 16));
    bytes32 internal constant NORMALIZATION_PROFILE_HASH =
        0xdce87d511a5ad02a3ee50057259547c744098a0da6207c4dcea41f2a7cbea638;

    address internal owner = makeAddr("owner-multisig");
    address internal treasury = makeAddr("treasury");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal referrer = makeAddr("referrer");
    address internal attestor;

    ChainNameRegistryV3 internal registry;
    ChainNameControllerV3 internal controller;
    ChainNameResolverV3 internal resolver;
    ChainNameMarketplaceV3 internal marketplace;
    ChainNameMarketLensV3 internal marketLens;
    ChainNameMigrationV3 internal migration;
    ChainNameUniversalResolverV3 internal universalResolver;
    MockLegacyV2 internal legacy;

    function setUp() public virtual {
        vm.warp(1_800_000_000);
        attestor = vm.addr(ATTESTOR_PRIVATE_KEY);
        _deploySuite(ChainNameControllerV3.SettlementKind.NATIVE, address(0));
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);
    }

    function _deploySuite(ChainNameControllerV3.SettlementKind kind, address token) internal {
        _deploySuiteWithMigrationWindow(
            kind, token, uint64(vm.getBlockTimestamp()), uint64(vm.getBlockTimestamp() + 30 days)
        );
    }

    function _deploySuiteWithMigrationWindow(
        ChainNameControllerV3.SettlementKind kind,
        address token,
        uint64 migrationStart,
        uint64 migrationEnd
    ) internal {
        legacy = new MockLegacyV2();
        bytes32 suffixNode = keccak256(abi.encodePacked(bytes32(0), keccak256(bytes("sepbase"))));
        bytes32 reverseNode = keccak256(
            abi.encodePacked(
                keccak256(abi.encodePacked(bytes32(0), keccak256(bytes("reverse")))),
                keccak256(bytes("addr"))
            )
        );
        registry = new ChainNameRegistryV3(
            "Sepbase Names v3",
            "SEPV3",
            "sepbase",
            suffixNode,
            reverseNode,
            NORMALIZATION_PROFILE_HASH,
            owner,
            address(this),
            30 days,
            "https://example.test/api/metadata/"
        );
        resolver = new ChainNameResolverV3(address(registry));
        controller = new ChainNameControllerV3(
            address(registry),
            address(resolver),
            owner,
            treasury,
            60,
            1 days,
            attestor,
            1 days,
            kind,
            token,
            ANNUAL_PRICE,
            SHORT_MULTIPLIERS,
            1000
        );
        migration = new ChainNameMigrationV3(
            address(registry),
            address(resolver),
            address(legacy),
            block.chainid,
            migrationStart,
            migrationEnd,
            owner
        );
        marketplace = new ChainNameMarketplaceV3(
            address(registry),
            address(controller),
            owner,
            treasury,
            100,
            500,
            5 minutes,
            10 minutes,
            3
        );
        universalResolver = new ChainNameUniversalResolverV3(address(registry));
        marketLens = new ChainNameMarketLensV3(address(marketplace));
        registry.configureSuite(
            address(controller), address(resolver), address(migration), address(marketplace)
        );
    }

    function _prepare(
        string memory label,
        address recipient,
        address payer,
        address referral,
        bytes32 secret,
        bool withText
    )
        internal
        returns (
            ChainNameControllerV3.RegistrationRequest memory request,
            ChainNameControllerV3.ResolverInitialization memory initialization,
            ChainNameControllerV3.NormalizationAttestation memory attestation,
            bytes32 commitment
        )
    {
        initialization.addressRecord = recipient;
        if (withText) {
            initialization.textKeys = new string[](1);
            initialization.textValues = new string[](1);
            initialization.textKeys[0] = "description";
            initialization.textValues[0] = "alice profile";
        } else {
            initialization.textKeys = new string[](0);
            initialization.textValues = new string[](0);
        }
        bytes32 initializationHash = controller.hashResolverInitialization(initialization);
        attestation.validUntil = uint64(vm.getBlockTimestamp() + 2 hours);
        bytes32 labelHash = keccak256(bytes(label));
        bytes32 digest =
            controller.normalizationAttestationDigest(labelHash, recipient, attestation.validUntil);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ATTESTOR_PRIVATE_KEY, digest);
        attestation.signature = abi.encodePacked(r, s, v);
        bytes32 attestationHash = controller.hashNormalizationAttestation(attestation);
        uint256 amount = controller.quote(label, 1);
        request = ChainNameControllerV3.RegistrationRequest({
            label: label,
            recipient: recipient,
            durationYears: 1,
            referrer: referral,
            secret: secret,
            resolverInitializationHash: initializationHash,
            normalizationAttestationHash: attestationHash,
            expectedAmount: amount,
            expectedReferralRewardBps: controller.referralRewardBps()
        });
        bytes32 node = registry.nodeForLabelHash(labelHash);
        commitment = controller.makeCommitment(
            node,
            payer,
            recipient,
            1,
            initializationHash,
            attestationHash,
            referral,
            secret,
            amount,
            controller.referralRewardBps()
        );
    }

    function _register(
        string memory label,
        address recipient,
        address payer,
        address referral,
        bytes32 secret,
        bool withText
    ) internal returns (uint256 tokenId) {
        (
            ChainNameControllerV3.RegistrationRequest memory request,
            ChainNameControllerV3.ResolverInitialization memory initialization,
            ChainNameControllerV3.NormalizationAttestation memory attestation,
            bytes32 commitment
        ) = _prepare(label, recipient, payer, referral, secret, withText);
        vm.prank(payer);
        controller.commit(commitment);
        vm.warp(vm.getBlockTimestamp() + 60);
        vm.startPrank(payer);
        if (controller.settlementKind() == ChainNameControllerV3.SettlementKind.NATIVE) {
            (tokenId,) = controller.register{ value: request.expectedAmount }(
                request, initialization, attestation
            );
        } else {
            (tokenId,) = controller.register(request, initialization, attestation);
        }
        vm.stopPrank();
    }

    function _dnsName(string memory label, string memory suffix)
        internal
        pure
        returns (bytes memory)
    {
        bytes memory labelBytes = bytes(label);
        bytes memory suffixBytes = bytes(suffix);
        return bytes.concat(
            bytes1(uint8(labelBytes.length)),
            labelBytes,
            bytes1(uint8(suffixBytes.length)),
            suffixBytes,
            bytes1(0)
        );
    }
}

contract V3SuiteUnitTest is V3SuiteTestBase {
    function test_NormalizationAttestationHelperSemanticsAndHashVector() public view {
        bytes32 labelHash = keccak256(bytes("alice"));
        uint64 validUntil = 1_800_007_200;
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256(bytes("ChainNameControllerV3")),
                keccak256(bytes("3")),
                block.chainid,
                address(controller)
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                controller.NORMALIZATION_ATTESTATION_TYPEHASH(),
                block.chainid,
                address(controller),
                NORMALIZATION_PROFILE_HASH,
                labelHash,
                alice,
                validUntil
            )
        );
        assertEq(
            controller.normalizationAttestationDigest(labelHash, alice, validUntil),
            keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash))
        );

        ChainNameControllerV3.NormalizationAttestation memory attestation;
        attestation.validUntil = validUntil;
        attestation.signature =
            hex"3d008b668f0bc8d95a592a1ec3f919b55800e515a181de47966828abc178e6497babe2cbabf27761f946cec48303ed7ceb89bf0ee4a186ebfbb0db0cdc9ade171c";
        assertEq(
            controller.hashNormalizationAttestation(attestation),
            0xdd0e8abe69a0abd42f71f62a088325874e059357e934f2a2b5e4a09f1c809e69
        );
    }

    function test_NormalizationCorpusEmojiAndCanonicalDisplayFilter() public view {
        assertTrue(registry.isValidLabel("alice"));
        assertTrue(registry.isValidLabel(unicode"é"));
        assertTrue(registry.isValidLabel(unicode"ß"));
        assertTrue(registry.isValidLabel(unicode"💩"));
        assertTrue(registry.isValidLabel(unicode"👩‍💻"));
        assertTrue(registry.isValidLabel(unicode"☕"));

        assertFalse(registry.isValidLabel(""));
        assertFalse(registry.isValidLabel("Alice"));
        assertFalse(registry.isValidLabel("alice.sepbase"));
        assertFalse(registry.isValidLabel(unicode"☕️"));
        assertFalse(registry.isValidLabel(unicode"‍💻"));
    }

    function test_MixedScriptCannotBypassNormalizationAttestor() public {
        string memory mixed = unicode"раypal";
        (
            ChainNameControllerV3.RegistrationRequest memory request,
            ChainNameControllerV3.ResolverInitialization memory initialization,
            ChainNameControllerV3.NormalizationAttestation memory attestation,
            bytes32 ignoredCommitment
        ) = _prepare(mixed, alice, alice, address(0), bytes32("mixed"), false);
        assertTrue(ignoredCommitment != bytes32(0));

        uint64 validUntil = attestation.validUntil;
        bytes32 wrongDigest = controller.normalizationAttestationDigest(
            keccak256(bytes("paypal")), alice, validUntil
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ATTESTOR_PRIVATE_KEY, wrongDigest);
        attestation.signature = abi.encodePacked(r, s, v);
        request.normalizationAttestationHash = controller.hashNormalizationAttestation(attestation);
        bytes32 node = registry.nodeForLabelHash(keccak256(bytes(mixed)));
        bytes32 commitment = controller.makeCommitment(
            node,
            alice,
            alice,
            1,
            request.resolverInitializationHash,
            request.normalizationAttestationHash,
            address(0),
            request.secret,
            request.expectedAmount,
            request.expectedReferralRewardBps
        );
        vm.prank(alice);
        controller.commit(commitment);
        vm.warp(vm.getBlockTimestamp() + 60);
        vm.expectRevert(ChainNameControllerV3.InvalidNormalizationAttestation.selector);
        vm.prank(alice);
        controller.register{ value: request.expectedAmount }(request, initialization, attestation);
    }

    function test_CommitRevealRejectsEarlyAndCopiedRevealThenRegistersOnce() public {
        (
            ChainNameControllerV3.RegistrationRequest memory request,
            ChainNameControllerV3.ResolverInitialization memory initialization,
            ChainNameControllerV3.NormalizationAttestation memory attestation,
            bytes32 commitment
        ) = _prepare("alice", alice, alice, address(0), bytes32("secret"), false);
        vm.prank(alice);
        controller.commit(commitment);

        vm.expectPartialRevert(ChainNameControllerV3.CommitmentTooNew.selector);
        vm.prank(alice);
        controller.register{ value: request.expectedAmount }(request, initialization, attestation);

        vm.warp(vm.getBlockTimestamp() + 60);
        vm.expectRevert(ChainNameControllerV3.CommitmentMissing.selector);
        vm.prank(bob);
        controller.register{ value: request.expectedAmount }(request, initialization, attestation);

        vm.prank(alice);
        controller.register{ value: request.expectedAmount }(request, initialization, attestation);
        assertEq(registry.ownerOf(registry.tokenIdFor("alice")), alice);

        vm.expectRevert(ChainNameControllerV3.CommitmentConsumed.selector);
        vm.prank(alice);
        controller.register{ value: request.expectedAmount }(request, initialization, attestation);
    }

    function test_ResolverRegistryExtendedAndUniversalForwardReverseConformance() public {
        uint256 tokenId = _register("alice", alice, alice, referrer, bytes32("resolver"), true);
        bytes32 node = registry.nodeForLabelHash(bytes32(tokenId));
        assertEq(registry.owner(node), alice);
        assertEq(registry.resolver(node), address(resolver));
        assertEq(resolver.addr(node), alice);
        assertEq(resolver.text(node, "description"), "alice profile");
        assertTrue(resolver.supportsInterface(type(IERC165).interfaceId));
        assertTrue(resolver.supportsInterface(type(IAddrResolver).interfaceId));
        assertTrue(resolver.supportsInterface(type(IMulticoinAddressResolver).interfaceId));
        assertTrue(resolver.supportsInterface(type(ITextResolver).interfaceId));
        assertTrue(resolver.supportsInterface(type(INameResolver).interfaceId));
        assertTrue(resolver.supportsInterface(type(IExtendedResolver).interfaceId));
        assertTrue(registry.supportsInterface(type(IENSRegistryView).interfaceId));

        bytes memory dnsName = _dnsName("alice", "sepbase");
        bytes memory callData = abi.encodeWithSelector(IAddrResolver.addr.selector, node);
        assertEq(abi.decode(resolver.resolve(dnsName, callData), (address)), alice);
        (bytes memory result, address discoveredResolver) =
            universalResolver.resolve(dnsName, callData);
        assertEq(discoveredResolver, address(resolver));
        assertEq(abi.decode(result, (address)), alice);
        bytes memory subName = bytes.concat(bytes1(uint8(3)), bytes("sub"), dnsName);
        (address parentResolver, bytes32 fullSubNode, uint256 resolverOffset) =
            universalResolver.findResolver(subName);
        assertEq(parentResolver, address(resolver));
        assertEq(fullSubNode, keccak256(abi.encodePacked(node, keccak256(bytes("sub")))));
        assertEq(resolverOffset, 4);

        vm.prank(alice);
        resolver.setPrimaryName(tokenId);
        (string memory primary, address forwardResolver, address reverseResolver) =
            universalResolver.reverse(abi.encodePacked(alice), 60);
        assertEq(primary, "alice.sepbase");
        assertEq(forwardResolver, address(resolver));
        assertEq(reverseResolver, address(resolver));
        assertEq(controller.referralBalance(referrer), requestReward(controller.quote("alice", 1)));
    }

    function test_TransferInvalidatesTextAndReverseAndDefaultsForwardToNewOwner() public {
        uint256 tokenId = _register("alice", alice, alice, address(0), bytes32("transfer"), true);
        assertEq(registry.totalSupply(), 1);
        assertEq(registry.tokenOfOwnerByIndex(alice, 0), tokenId);
        bytes32 node = registry.nodeForLabelHash(bytes32(tokenId));
        vm.prank(alice);
        resolver.setPrimaryName(tokenId);
        uint64 previousNonce = registry.transferNonce(tokenId);
        vm.prank(alice);
        registry.transferFrom(alice, bob, tokenId);
        assertEq(registry.transferNonce(tokenId), previousNonce + 1);
        assertEq(registry.tokenOfOwnerByIndex(bob, 0), tokenId);
        assertEq(resolver.addr(node), bob);
        assertEq(resolver.text(node, "description"), "");
        assertEq(resolver.primaryNameOf(alice), "");
    }

    function test_FixedListingBuyUsesPullProceedsAndFeeSurplus() public {
        uint256 tokenId = _register("alice", alice, alice, address(0), bytes32("fixed"), false);
        vm.prank(alice);
        registry.approve(address(marketplace), tokenId);
        uint256 price = 200_000;
        uint64 deadline = uint64(vm.getBlockTimestamp() + 1 days);
        uint64 listingNonce = registry.transferNonce(tokenId);
        uint16 listingFee = marketplace.marketplaceFeeBps();
        vm.prank(alice);
        marketplace.listName(
            ChainNameMarketplaceV3.ListRequest({
                tokenId: tokenId,
                price: price,
                deadline: deadline,
                expectedTransferNonce: listingNonce,
                expectedFeeBps: listingFee
            })
        );
        (ChainNameMarketLensV3.ListingPageItem[] memory listingPage, uint256 listingCursor) =
            marketLens.getListings(0, 24);
        assertEq(listingPage.length, 1);
        assertEq(listingPage[0].tokenId, tokenId);
        assertEq(listingCursor, 1);
        vm.prank(bob);
        marketplace.buyName{ value: price }(
            ChainNameMarketplaceV3.BuyRequest({
                tokenId: tokenId,
                expectedSeller: alice,
                recipient: bob,
                expectedPrice: price,
                expectedDeadline: deadline,
                expectedListingNonce: 1,
                expectedFeeBps: 100
            })
        );
        uint256 fee = price / 100;
        assertEq(registry.ownerOf(tokenId), bob);
        assertEq(marketplace.listingEntryCount(), 0);
        assertEq(marketplace.claimableBalance(alice), price - fee);
        assertEq(marketplace.protectedBalance(), price - fee);
        assertEq(marketplace.treasuryAvailableBalance(), fee);

        uint256 before = carol.balance;
        vm.prank(alice);
        marketplace.claimBalance(carol);
        assertEq(carol.balance - before, price - fee);
        assertTrue(marketplace.isSolvent());
    }

    function test_OfferCancellationAndAcceptancePreserveUnifiedLiability() public {
        uint256 tokenId = _register("alice", alice, alice, address(0), bytes32("offer"), false);
        uint256 amount = 300_000;
        uint64 deadline = uint64(vm.getBlockTimestamp() + 1 days);
        uint64 offerNonce = registry.transferNonce(tokenId);
        vm.prank(bob);
        bytes32 offerId = marketplace.makeOffer{ value: amount }(
            ChainNameMarketplaceV3.OfferRequest({
                tokenId: tokenId,
                recipient: bob,
                expectedOwner: alice,
                amount: amount,
                deadline: deadline,
                expectedTransferNonce: offerNonce,
                expectedFeeBps: 100
            })
        );
        (ChainNameMarketLensV3.OfferPageItem[] memory offerPage, uint256 offerCursor) =
            marketLens.getOffers(tokenId, 0, 24);
        assertEq(offerPage.length, 1);
        assertEq(offerPage[0].offerId, offerId);
        assertEq(offerCursor, 1);
        assertEq(marketplace.totalOfferEscrow(), amount);
        vm.prank(bob);
        marketplace.cancelOffer(offerId, amount, deadline, 100);
        assertEq(marketplace.totalOfferEscrow(), 0);
        assertEq(marketplace.claimableBalance(bob), amount);
        assertEq(marketplace.protectedBalance(), amount);
        (ChainNameMarketLensV3.OfferPageItem[] memory buyerHistory,) =
            marketLens.getBuyerOffers(bob, 0, 24, true);
        assertEq(buyerHistory.length, 1);
        assertEq(buyerHistory[0].offerId, offerId);
        assertEq(
            uint256(buyerHistory[0].state), uint256(ChainNameMarketplaceV3.OfferState.REFUNDED)
        );
        assertFalse(buyerHistory[0].stale);
        (ChainNameMarketLensV3.OfferPageItem[] memory ownerHistory,) =
            marketLens.getOwnerOffers(alice, 0, 24, true);
        assertEq(ownerHistory.length, 1);
        (ChainNameMarketLensV3.OfferPageItem[] memory activeOnly,) =
            marketLens.getGlobalOffers(0, 24, false);
        assertEq(activeOnly.length, 0);

        vm.prank(bob);
        marketplace.claimBalance(bob);
        offerNonce = registry.transferNonce(tokenId);
        vm.prank(carol);
        bytes32 acceptedId = marketplace.makeOffer{ value: amount }(
            ChainNameMarketplaceV3.OfferRequest({
                tokenId: tokenId,
                recipient: carol,
                expectedOwner: alice,
                amount: amount,
                deadline: deadline,
                expectedTransferNonce: offerNonce,
                expectedFeeBps: 100
            })
        );
        vm.prank(alice);
        registry.approve(address(marketplace), tokenId);
        vm.prank(alice);
        marketplace.acceptOffer(
            ChainNameMarketplaceV3.AcceptOfferRequest({
                offerId: acceptedId,
                expectedBuyer: carol,
                expectedRecipient: carol,
                expectedAmount: amount,
                expectedDeadline: deadline,
                expectedFeeBps: 100
            })
        );
        assertEq(registry.ownerOf(tokenId), carol);
        assertEq(marketplace.claimableBalance(alice), amount - amount / 100);
        (ChainNameMarketLensV3.OfferPageItem[] memory globalHistory, uint256 historyCursor) =
            marketLens.getGlobalOffers(0, 24, true);
        assertEq(globalHistory.length, 2);
        assertEq(historyCursor, 2);
        assertEq(globalHistory[1].offerId, acceptedId);
        assertEq(
            uint256(globalHistory[1].state), uint256(ChainNameMarketplaceV3.OfferState.ACCEPTED)
        );
        (ChainNameMarketLensV3.OfferPageItem[] memory carolHistory,) =
            marketLens.getBuyerOffers(carol, 0, 24, true);
        assertEq(carolHistory.length, 1);
        assertEq(carolHistory[0].offerId, acceptedId);
        (ownerHistory,) = marketLens.getOwnerOffers(alice, 0, 24, true);
        assertEq(ownerHistory.length, 2);
        assertTrue(marketplace.isSolvent());
    }

    function test_AuctionOutbidExtensionFinalizeAndDeliveryBeforeSellerCredit() public {
        uint256 tokenId = _register("alice", alice, alice, address(0), bytes32("auction"), false);
        vm.prank(alice);
        registry.approve(address(marketplace), tokenId);
        uint64 startAt = uint64(vm.getBlockTimestamp());
        uint64 endAt = uint64(vm.getBlockTimestamp() + 1 hours);
        uint64 auctionNonce = registry.transferNonce(tokenId);
        vm.prank(alice);
        marketplace.startAuction(
            ChainNameMarketplaceV3.StartAuctionRequest({
                tokenId: tokenId,
                reservePrice: 1000,
                startAt: startAt,
                endAt: endAt,
                expectedTransferNonce: auctionNonce,
                expectedFeeBps: 100
            })
        );
        bytes32 node = registry.nodeForLabelHash(bytes32(tokenId));
        assertEq(registry.ownerOf(tokenId), address(marketplace));
        assertEq(resolver.addr(node), address(0));
        (ChainNameMarketLensV3.AuctionPageItem[] memory auctionPage, uint256 auctionCursor) =
            marketLens.getAuctions(0, 24);
        assertEq(auctionPage.length, 1);
        assertEq(auctionPage[0].tokenId, tokenId);
        assertEq(auctionCursor, 1);
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
        vm.warp(endAt - 4 minutes);
        vm.prank(carol);
        marketplace.placeBid{ value: 1200 }(
            ChainNameMarketplaceV3.BidRequest({
                tokenId: tokenId,
                amount: 1200,
                recipient: carol,
                expectedHighestBidder: bob,
                expectedHighestBidRecipient: bob,
                expectedHighestBid: 1000,
                expectedEndAt: endAt,
                expectedAuctionNonce: 1,
                expectedFeeBps: 100
            })
        );
        uint64 extendedEnd = endAt + 10 minutes;
        assertEq(marketplace.claimableBalance(bob), 1000);
        assertEq(marketplace.totalAuctionEscrow(), 1200);
        vm.warp(extendedEnd + 1);
        marketplace.finalizeAuction(
            ChainNameMarketplaceV3.FinalizeAuctionRequest({
                tokenId: tokenId,
                expectedHighestBidder: carol,
                expectedHighestBidRecipient: carol,
                expectedHighestBid: 1200,
                expectedEndAt: extendedEnd,
                expectedAuctionNonce: 1,
                expectedFeeBps: 100
            })
        );
        assertEq(registry.ownerOf(tokenId), carol);
        assertEq(resolver.addr(node), carol);
        assertEq(marketplace.auctionEntryCount(), 0);
        assertEq(marketplace.claimableBalance(alice), 1188);
        assertEq(marketplace.totalAuctionEscrow(), 0);
        assertEq(marketplace.protectedBalance(), 2188);
        assertTrue(marketplace.isSolvent());
    }

    function test_MigrationReservesEligibleV2AndPreservesExpiryWithoutLiabilityImport() public {
        uint64 legacyExpiry = uint64(vm.getBlockTimestamp() + 100 days);
        legacy.seed("legacy", alice, 1, legacyExpiry, carol);
        assertEq(migration.legacyGracePeriod(), 30 days);
        assertFalse(registry.isAvailable("legacy"));
        vm.prank(alice);
        (uint256 tokenId,) = migration.claim("legacy", bob, alice, true, carol);
        assertEq(registry.ownerOf(tokenId), bob);
        assertEq(registry.expiresAt(tokenId), legacyExpiry);
        assertEq(resolver.addr(registry.nodeForLabelHash(bytes32(tokenId))), carol);
        assertEq(legacy.ownerOf(tokenId), alice);
        assertEq(controller.totalReferralLiability(), 0);

        vm.expectRevert(ChainNameRegistryV3.NameNotAvailable.selector);
        vm.prank(alice);
        migration.claim("legacy", bob, alice, true, carol);
    }

    function test_MigrationReservationClosesPreWindowPublicRegistrationRace() public {
        uint64 deployedAt = uint64(vm.getBlockTimestamp());
        uint64 startsAt = deployedAt + 1 days;
        uint64 endsAt = startsAt + 30 days;
        _deploySuiteWithMigrationWindow(
            ChainNameControllerV3.SettlementKind.NATIVE, address(0), startsAt, endsAt
        );
        uint64 legacyExpiry = deployedAt + 100 days;
        legacy.seed("legacy", alice, 1, legacyExpiry, alice);
        uint256 tokenId = uint256(keccak256(bytes("legacy")));

        assertLt(vm.getBlockTimestamp(), startsAt);
        assertTrue(migration.isReserved(tokenId));
        assertFalse(registry.isAvailable("legacy"));
        vm.expectRevert(ChainNameMigrationV3.MigrationWindowClosed.selector);
        vm.prank(alice);
        migration.claim("legacy", alice, alice, false, address(0));

        vm.prank(owner);
        migration.setMigrationPaused(true);
        assertTrue(migration.isReserved(tokenId));
        vm.expectRevert(ChainNameRegistryV3.MigrationReservationActive.selector);
        vm.prank(address(controller));
        registry.registerFromController("legacy", bob, deployedAt + 365 days);

        vm.prank(owner);
        migration.setMigrationPaused(false);
        vm.warp(startsAt);
        vm.prank(alice);
        migration.claim("legacy", alice, alice, false, address(0));
        assertEq(registry.ownerOf(tokenId), alice);
        assertEq(registry.expiresAt(tokenId), legacyExpiry);
    }

    function test_MigrationReservationEndsOnlyAfterInclusiveAnnouncedWindow() public {
        uint64 deployedAt = uint64(vm.getBlockTimestamp());
        uint64 startsAt = deployedAt + 1 days;
        uint64 endsAt = startsAt + 30 days;
        _deploySuiteWithMigrationWindow(
            ChainNameControllerV3.SettlementKind.NATIVE, address(0), startsAt, endsAt
        );
        legacy.seed("legacy", alice, 1, deployedAt + 100 days, alice);
        uint256 tokenId = uint256(keccak256(bytes("legacy")));

        vm.warp(endsAt);
        assertTrue(migration.isReserved(tokenId));
        assertFalse(registry.isAvailable("legacy"));
        vm.warp(uint256(endsAt) + 1);
        assertFalse(migration.isReserved(tokenId));
        assertTrue(registry.isAvailable("legacy"));
    }

    function test_MigrationReservationReadFailureFailsClosed() public {
        uint256 tokenId = uint256(keccak256(bytes("unavailable")));
        vm.mockCallRevert(
            address(migration),
            abi.encodeWithSelector(migration.isReserved.selector, tokenId),
            abi.encodeWithSignature("Error(string)", "legacy read unavailable")
        );

        assertFalse(registry.isAvailable("unavailable"));
        vm.expectRevert(ChainNameRegistryV3.MigrationReservationUnavailable.selector);
        vm.prank(address(controller));
        registry.registerFromController(
            "unavailable", bob, uint64(vm.getBlockTimestamp() + 365 days)
        );
        vm.clearMockedCalls();
    }

    function test_MigrationPreservesExactGraceExpiryAndRejectsInconsistentSourceState() public {
        uint64 graceExpiry = uint64(vm.getBlockTimestamp() - 10 days);
        legacy.seed("grace", alice, 2, graceExpiry, alice);
        vm.prank(alice);
        (uint256 tokenId,) = migration.claim("grace", alice, alice, false, address(0));

        assertEq(registry.expiresAt(tokenId), graceExpiry);
        assertEq(uint8(registry.statusOf(tokenId)), uint8(ChainNameRegistryV3.NameStatus.GRACE));

        uint64 releasedExpiry = uint64(vm.getBlockTimestamp() - 30 days - 1);
        legacy.seed("inconsistent", alice, 2, releasedExpiry, alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                ChainNameMigrationV3.LegacyExpiryInconsistent.selector, 2, releasedExpiry
            )
        );
        vm.prank(alice);
        migration.claim("inconsistent", alice, alice, false, address(0));
    }

    function test_MigrationExpiryBoundariesRemainInclusiveWithoutExtension() public {
        uint64 currentTimestamp = uint64(vm.getBlockTimestamp());
        legacy.seed("active-edge", alice, 1, currentTimestamp, alice);
        vm.prank(alice);
        (uint256 activeTokenId,) = migration.claim("active-edge", alice, alice, false, address(0));
        assertEq(registry.expiresAt(activeTokenId), currentTimestamp);
        assertEq(
            uint8(registry.statusOf(activeTokenId)), uint8(ChainNameRegistryV3.NameStatus.ACTIVE)
        );

        uint64 graceBoundary = currentTimestamp - 30 days;
        legacy.seed("grace-edge", alice, 2, graceBoundary, alice);
        vm.prank(alice);
        (uint256 graceTokenId,) = migration.claim("grace-edge", alice, alice, false, address(0));
        assertEq(registry.expiresAt(graceTokenId), graceBoundary);
        assertEq(
            uint8(registry.statusOf(graceTokenId)), uint8(ChainNameRegistryV3.NameStatus.GRACE)
        );
    }

    function test_MigrationDeploymentRejectsDifferentV3GracePeriod() public {
        MockLegacyV2 incompatibleLegacy = new MockLegacyV2();
        incompatibleLegacy.setGracePeriod(31 days);
        vm.expectRevert(
            abi.encodeWithSelector(
                ChainNameMigrationV3.IncompatibleGracePeriods.selector, 31 days, 30 days
            )
        );
        new ChainNameMigrationV3(
            address(registry),
            address(resolver),
            address(incompatibleLegacy),
            block.chainid,
            uint64(vm.getBlockTimestamp()),
            uint64(vm.getBlockTimestamp() + 30 days),
            owner
        );

        incompatibleLegacy.setGracePeriod(29 days);
        vm.expectRevert(
            abi.encodeWithSelector(
                ChainNameMigrationV3.IncompatibleGracePeriods.selector, 29 days, 30 days
            )
        );
        new ChainNameMigrationV3(
            address(registry),
            address(resolver),
            address(incompatibleLegacy),
            block.chainid,
            uint64(vm.getBlockTimestamp()),
            uint64(vm.getBlockTimestamp() + 30 days),
            owner
        );
    }

    function test_MigrationRejectsLabelsOutsideTheExactHistoricalV2AsciiGrammar() public {
        uint64 legacyExpiry = uint64(vm.getBlockTimestamp() + 100 days);
        legacy.seed("Legacy", alice, 1, legacyExpiry, alice);
        vm.expectRevert(ChainNameMigrationV3.InvalidLegacyLabel.selector);
        vm.prank(alice);
        migration.claim("Legacy", alice, alice, false, address(0));

        legacy.seed(unicode"é", alice, 1, legacyExpiry, alice);
        vm.expectRevert(ChainNameMigrationV3.InvalidLegacyLabel.selector);
        vm.prank(alice);
        migration.claim(unicode"é", alice, alice, false, address(0));

        assertEq(registry.balanceOf(alice), 0);
    }

    function requestReward(uint256 amount) internal pure returns (uint256) {
        return amount / 10;
    }
}

contract V3SuiteERC20Test is V3SuiteTestBase {
    MockERC20 internal token;

    function setUp() public override {
        vm.warp(1_800_000_000);
        attestor = vm.addr(ATTESTOR_PRIVATE_KEY);
        token = new MockERC20("USD Test", "USDT", 6);
        _deploySuite(ChainNameControllerV3.SettlementKind.ERC20, address(token));
        token.mint(alice, 100_000_000);
        token.mint(bob, 100_000_000);
        vm.prank(alice);
        token.approve(address(controller), type(uint256).max);
        vm.prank(bob);
        token.approve(address(marketplace), type(uint256).max);
    }

    function test_SixDecimalRegistrationAndFixedSaleExactDelta() public {
        uint256 tokenId = _register("alice", alice, alice, referrer, bytes32("erc20"), false);
        assertEq(token.balanceOf(address(controller)), ANNUAL_PRICE);
        assertEq(controller.referralBalance(referrer), ANNUAL_PRICE / 10);
        vm.prank(alice);
        registry.approve(address(marketplace), tokenId);
        uint64 deadline = uint64(vm.getBlockTimestamp() + 1 days);
        uint64 listingNonce = registry.transferNonce(tokenId);
        vm.prank(alice);
        marketplace.listName(
            ChainNameMarketplaceV3.ListRequest({
                tokenId: tokenId,
                price: 250_000,
                deadline: deadline,
                expectedTransferNonce: listingNonce,
                expectedFeeBps: 100
            })
        );
        vm.prank(bob);
        marketplace.buyName(
            ChainNameMarketplaceV3.BuyRequest({
                tokenId: tokenId,
                expectedSeller: alice,
                recipient: bob,
                expectedPrice: 250_000,
                expectedDeadline: deadline,
                expectedListingNonce: 1,
                expectedFeeBps: 100
            })
        );
        assertEq(token.balanceOf(address(marketplace)), 250_000);
        assertTrue(controller.isSolvent());
        assertTrue(marketplace.isSolvent());
    }

    function test_SixDecimalOfferAndAuctionUseTheSameProtectedAccounting() public {
        uint256 tokenId =
            _register("alice", alice, alice, address(0), bytes32("erc20-market"), false);
        uint64 offerDeadline = uint64(vm.getBlockTimestamp() + 1 days);
        uint64 offerTransferNonce = registry.transferNonce(tokenId);
        vm.prank(bob);
        bytes32 offerId = marketplace.makeOffer(
            ChainNameMarketplaceV3.OfferRequest({
                tokenId: tokenId,
                recipient: bob,
                expectedOwner: alice,
                amount: 300_000,
                deadline: offerDeadline,
                expectedTransferNonce: offerTransferNonce,
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
                expectedRecipient: bob,
                expectedAmount: 300_000,
                expectedDeadline: offerDeadline,
                expectedFeeBps: 100
            })
        );
        assertEq(marketplace.claimableBalance(alice), 297_000);

        vm.prank(bob);
        registry.approve(address(marketplace), tokenId);
        uint64 startAt = uint64(vm.getBlockTimestamp());
        uint64 endAt = startAt + 1 hours;
        uint64 auctionTransferNonce = registry.transferNonce(tokenId);
        vm.prank(bob);
        marketplace.startAuction(
            ChainNameMarketplaceV3.StartAuctionRequest({
                tokenId: tokenId,
                reservePrice: 400_000,
                startAt: startAt,
                endAt: endAt,
                expectedTransferNonce: auctionTransferNonce,
                expectedFeeBps: 100
            })
        );
        vm.prank(alice);
        token.approve(address(marketplace), type(uint256).max);
        vm.prank(alice);
        marketplace.placeBid(
            ChainNameMarketplaceV3.BidRequest({
                tokenId: tokenId,
                amount: 400_000,
                recipient: alice,
                expectedHighestBidder: address(0),
                expectedHighestBidRecipient: address(0),
                expectedHighestBid: 0,
                expectedEndAt: endAt,
                expectedAuctionNonce: 1,
                expectedFeeBps: 100
            })
        );
        assertEq(marketplace.totalAuctionEscrow(), 400_000);
        vm.warp(endAt);
        marketplace.finalizeAuction(
            ChainNameMarketplaceV3.FinalizeAuctionRequest({
                tokenId: tokenId,
                expectedHighestBidder: alice,
                expectedHighestBidRecipient: alice,
                expectedHighestBid: 400_000,
                expectedEndAt: endAt,
                expectedAuctionNonce: 1,
                expectedFeeBps: 100
            })
        );
        assertEq(registry.ownerOf(tokenId), alice);
        assertEq(marketplace.totalAuctionEscrow(), 0);
        assertEq(marketplace.claimableBalance(bob), 396_000);
        assertEq(marketplace.protectedBalance(), 693_000);
        assertEq(marketplace.settlementBalance(), 700_000);
        assertTrue(marketplace.isSolvent());
        assertTrue(marketplace.isSuiteSolvent());
    }

    function test_FeeOnTransferSettlementRejectedBeforeMint() public {
        MockFeeOnTransferERC20 feeToken = new MockFeeOnTransferERC20(6);
        _deploySuite(ChainNameControllerV3.SettlementKind.ERC20, address(feeToken));
        feeToken.mint(alice, 10_000_000);
        vm.prank(alice);
        feeToken.approve(address(controller), type(uint256).max);
        (
            ChainNameControllerV3.RegistrationRequest memory request,
            ChainNameControllerV3.ResolverInitialization memory initialization,
            ChainNameControllerV3.NormalizationAttestation memory attestation,
            bytes32 commitment
        ) = _prepare("alice", alice, alice, address(0), bytes32("fot"), false);
        vm.prank(alice);
        controller.commit(commitment);
        vm.warp(vm.getBlockTimestamp() + 60);
        vm.expectPartialRevert(ChainNameControllerV3.SettlementTransferMismatch.selector);
        vm.prank(alice);
        controller.register(request, initialization, attestation);
        assertEq(registry.balanceOf(alice), 0);
    }
}
