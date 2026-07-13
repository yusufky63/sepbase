// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import { IChainNameRegistryV3 } from "./interfaces/IChainNameRegistryV3.sol";
import { IChainNameControllerV3 } from "./interfaces/IChainNameControllerV3.sol";

/// @title Chain Name Marketplace v3
/// @notice Fixed listings, escrow-safe offers, and timed English auctions for a single v3 registry.
/// @dev Seller proceeds, bidder refunds, offer principal, and auction principal are unified
/// protected liabilities. Every outbound payment uses a pull claim. Existing refunds and claims
/// remain
///      available while trading is paused or either contract reports insolvency.
contract ChainNameMarketplaceV3 is Ownable2Step, ReentrancyGuard, IERC721Receiver {
    using SafeERC20 for IERC20;

    string public constant VERSION = "3.0.0";
    uint16 internal constant BPS_DENOMINATOR = 10_000;
    uint16 internal constant MAX_MARKETPLACE_FEE_BPS = 500;
    uint16 internal constant MAX_BID_INCREMENT_BPS = 5000;
    uint64 internal constant MAX_LISTING_DURATION = 180 days;
    uint64 internal constant MAX_OFFER_DURATION = 30 days;
    uint64 internal constant MIN_AUCTION_DURATION = 1 hours;
    uint64 internal constant MAX_AUCTION_DURATION = 30 days;
    uint64 internal constant MAX_AUCTION_START_DELAY = 7 days;
    uint64 internal constant MAX_EXTENSION_WINDOW = 1 hours;
    uint64 internal constant MAX_EXTENSION_DURATION = 1 hours;
    uint8 internal constant MAX_EXTENSION_COUNT = 10;

    enum OfferState {
        NONE,
        ACTIVE,
        REFUNDED,
        ACCEPTED
    }

    struct Listing {
        address seller;
        uint256 price;
        uint64 deadline;
        uint64 transferNonce;
        uint64 listingNonce;
        uint16 feeBps;
    }

    struct Offer {
        uint256 tokenId;
        address buyer;
        address recipient;
        address ownerSnapshot;
        uint256 amount;
        uint64 deadline;
        uint64 transferNonce;
        uint16 feeBps;
    }

    struct Auction {
        address seller;
        address highestBidder;
        address highestBidRecipient;
        uint256 reservePrice;
        uint256 highestBid;
        uint64 startAt;
        uint64 endAt;
        uint64 hardEndAt;
        uint64 transferNonce;
        uint64 auctionNonce;
        uint16 feeBps;
        uint8 extensionsUsed;
    }

    struct ListRequest {
        uint256 tokenId;
        uint256 price;
        uint64 deadline;
        uint64 expectedTransferNonce;
        uint16 expectedFeeBps;
    }

    struct BuyRequest {
        uint256 tokenId;
        address expectedSeller;
        address recipient;
        uint256 expectedPrice;
        uint64 expectedDeadline;
        uint64 expectedListingNonce;
        uint16 expectedFeeBps;
    }

    struct OfferRequest {
        uint256 tokenId;
        address recipient;
        address expectedOwner;
        uint256 amount;
        uint64 deadline;
        uint64 expectedTransferNonce;
        uint16 expectedFeeBps;
    }

    struct AcceptOfferRequest {
        bytes32 offerId;
        address expectedBuyer;
        address expectedRecipient;
        uint256 expectedAmount;
        uint64 expectedDeadline;
        uint16 expectedFeeBps;
    }

    struct StartAuctionRequest {
        uint256 tokenId;
        uint256 reservePrice;
        uint64 startAt;
        uint64 endAt;
        uint64 expectedTransferNonce;
        uint16 expectedFeeBps;
    }

    struct BidRequest {
        uint256 tokenId;
        uint256 amount;
        address recipient;
        address expectedHighestBidder;
        address expectedHighestBidRecipient;
        uint256 expectedHighestBid;
        uint64 expectedEndAt;
        uint64 expectedAuctionNonce;
        uint16 expectedFeeBps;
    }

    struct FinalizeAuctionRequest {
        uint256 tokenId;
        address expectedHighestBidder;
        address expectedHighestBidRecipient;
        uint256 expectedHighestBid;
        uint64 expectedEndAt;
        uint64 expectedAuctionNonce;
        uint16 expectedFeeBps;
    }

    error ZeroAddress();
    error InvalidRecipient();
    error InvalidRegistry();
    error InvalidSettlementConfig();
    error InvalidFee();
    error InvalidPrice();
    error InvalidDeadline();
    error InvalidAuctionWindow();
    error InvalidBidIncrement();
    error InvalidAntiSnipingPolicy();
    error MarketplacePaused();
    error NameNotActive();
    error NotAuthorized();
    error ApprovalRequired();
    error ListingNotFound();
    error ListingExists();
    error ListingStale();
    error ListingGuardFailed();
    error OfferNotFound();
    error OfferStale();
    error OfferGuardFailed();
    error SelfOfferForbidden();
    error SelfPurchaseForbidden();
    error NonceOverflow();
    error AuctionExists();
    error AuctionNotFound();
    error AuctionAlreadyStarted();
    error AuctionNotStarted();
    error AuctionNotEnded();
    error AuctionHasBid();
    error AuctionGuardFailed();
    error BidTooLow(uint256 minimum, uint256 received);
    error SellerCannotBid();
    error IncorrectPayment(uint256 expected, uint256 received);
    error UnexpectedNativeValue(uint256 received);
    error SettlementTransferMismatch(uint256 expected, uint256 senderDelta, uint256 recipientDelta);
    error TransferFailed();
    error NoClaimableBalance();
    error NoRecoverableBalance();
    error SettlementTokenRecoveryForbidden();
    error InsufficientTreasuryBalance();
    error ProtocolInsolvent(uint256 balance, uint256 liability);
    error RegistryInsolvent();
    error UnexpectedNFTTransfer();

    event SettlementConfigured(
        IChainNameControllerV3.SettlementKind indexed kind, address indexed token
    );
    event ListingCreated(
        uint256 indexed tokenId,
        address indexed seller,
        uint256 price,
        uint64 deadline,
        uint64 transferNonce,
        uint64 listingNonce,
        uint16 feeBps
    );
    event ListingUpdated(
        uint256 indexed tokenId,
        uint256 price,
        uint64 deadline,
        uint64 transferNonce,
        uint64 listingNonce,
        uint16 feeBps
    );
    event ListingCancelled(uint256 indexed tokenId, address indexed seller);
    event ListingInvalidated(uint256 indexed tokenId, address indexed previousSeller);
    event NamePurchased(
        uint256 indexed tokenId,
        address indexed seller,
        address indexed buyer,
        address recipient,
        uint256 price,
        uint256 fee
    );
    event OfferCreated(
        bytes32 indexed offerId,
        uint256 indexed tokenId,
        address indexed buyer,
        address recipient,
        address ownerSnapshot,
        uint256 amount,
        uint64 deadline,
        uint64 transferNonce,
        uint16 feeBps
    );
    event OfferRefunded(bytes32 indexed offerId, address indexed buyer, uint256 amount);
    event OfferAccepted(
        bytes32 indexed offerId,
        uint256 indexed tokenId,
        address indexed seller,
        address buyer,
        address recipient,
        uint256 amount,
        uint256 fee
    );
    event AuctionStarted(
        uint256 indexed tokenId,
        address indexed seller,
        uint256 reservePrice,
        uint64 startAt,
        uint64 endAt,
        uint64 hardEndAt,
        uint64 transferNonce,
        uint64 auctionNonce,
        uint16 feeBps
    );
    event BidPlaced(
        uint256 indexed tokenId,
        address indexed bidder,
        address indexed recipient,
        uint256 amount,
        address previousBidder,
        address previousBidRecipient,
        uint256 previousBid
    );
    event AuctionExtended(uint256 indexed tokenId, uint64 previousEndAt, uint64 newEndAt);
    event AuctionCancelled(uint256 indexed tokenId, address indexed seller);
    event AuctionFinalized(
        uint256 indexed tokenId,
        address indexed seller,
        address indexed winner,
        address recipient,
        uint256 amount,
        uint256 fee,
        bool refunded
    );
    event AuctionBidRefunded(uint256 indexed tokenId, address indexed bidder, uint256 amount);
    event ExpiredAuctionCustodyAbandoned(uint256 indexed tokenId, address indexed seller);
    event ClaimableBalanceCredited(address indexed account, uint256 amount);
    event ClaimableBalanceClaimed(
        address indexed account, address indexed recipient, uint256 amount
    );
    event MarketplaceFeeChanged(uint16 previousBps, uint16 newBps);
    event TreasuryChanged(address indexed previousTreasury, address indexed newTreasury);
    event MarketplacePauseChanged(bool paused);
    event TreasuryWithdrawal(address indexed treasury, uint256 amount);
    event UnsupportedTokenRecovered(address indexed token, uint256 amount);
    event UnexpectedNativeSwept(uint256 amount);

    IChainNameRegistryV3 public immutable registry;
    IChainNameControllerV3 public immutable controller;
    IChainNameControllerV3.SettlementKind public immutable settlementKind;
    IERC20 public immutable settlementToken;
    uint16 public immutable minBidIncrementBps;
    uint64 public immutable antiSnipingWindow;
    uint64 public immutable extensionDuration;
    uint8 public immutable maxExtensions;

    address public treasury;
    uint16 public marketplaceFeeBps;
    bool public marketPaused;
    uint256 public totalOfferEscrow;
    uint256 public totalAuctionEscrow;
    uint256 public totalClaimableLiability;

    mapping(uint256 tokenId => Listing listing) public listings;
    mapping(uint256 tokenId => uint64 nonce) public latestListingNonce;
    mapping(bytes32 offerId => Offer offer) public offers;
    mapping(bytes32 offerId => OfferState state) public offerStates;
    mapping(address buyer => mapping(uint256 tokenId => uint64 nonce)) public nextOfferNonce;
    mapping(uint256 tokenId => Auction auction) public auctions;
    mapping(uint256 tokenId => uint64 nonce) public latestAuctionNonce;
    mapping(address account => uint256 amount) public claimableBalance;
    uint256[] private _listingTokenIds;
    mapping(uint256 tokenId => uint256 indexPlusOne) private _listingIndexPlusOne;
    mapping(uint256 tokenId => bytes32[] offerIds) private _offerIdsByToken;
    mapping(bytes32 offerId => uint256 indexPlusOne) private _offerIndexPlusOne;
    bytes32[] private _globalOfferIds;
    uint256[] private _auctionTokenIds;
    mapping(uint256 tokenId => uint256 indexPlusOne) private _auctionIndexPlusOne;

    constructor(
        address registry_,
        address controller_,
        address initialOwner,
        address treasury_,
        uint16 marketplaceFeeBps_,
        uint16 minBidIncrementBps_,
        uint64 antiSnipingWindow_,
        uint64 extensionDuration_,
        uint8 maxExtensions_
    ) Ownable(initialOwner) {
        if (registry_ == address(0) || registry_.code.length == 0) {
            revert InvalidRegistry();
        }
        if (controller_ == address(0) || controller_.code.length == 0) {
            revert InvalidSettlementConfig();
        }
        if (initialOwner == address(0) || initialOwner == address(this)) revert ZeroAddress();
        if (treasury_ == address(0) || treasury_ == address(this)) revert ZeroAddress();
        if (marketplaceFeeBps_ > MAX_MARKETPLACE_FEE_BPS) revert InvalidFee();
        if (minBidIncrementBps_ == 0 || minBidIncrementBps_ > MAX_BID_INCREMENT_BPS) {
            revert InvalidBidIncrement();
        }
        if (
            (maxExtensions_ == 0 && (antiSnipingWindow_ != 0 || extensionDuration_ != 0))
                || (maxExtensions_ != 0
                    && (antiSnipingWindow_ == 0
                        || extensionDuration_ == 0
                        || antiSnipingWindow_ > MAX_EXTENSION_WINDOW
                        || extensionDuration_ > MAX_EXTENSION_DURATION
                        || maxExtensions_ > MAX_EXTENSION_COUNT))
        ) revert InvalidAntiSnipingPolicy();

        IChainNameRegistryV3 registryContract = IChainNameRegistryV3(registry_);
        IChainNameControllerV3 controllerContract = IChainNameControllerV3(controller_);
        if (controllerContract.registry() != registry_) revert InvalidRegistry();
        IChainNameControllerV3.SettlementKind kind = controllerContract.settlementKind();
        address token = controllerContract.settlementToken();
        if (kind == IChainNameControllerV3.SettlementKind.NATIVE) {
            if (token != address(0)) revert InvalidSettlementConfig();
        } else if (token == address(0) || token.code.length == 0) {
            revert InvalidSettlementConfig();
        }

        registry = registryContract;
        controller = controllerContract;
        settlementKind = kind;
        settlementToken = IERC20(token);
        treasury = treasury_;
        marketplaceFeeBps = marketplaceFeeBps_;
        minBidIncrementBps = minBidIncrementBps_;
        antiSnipingWindow = antiSnipingWindow_;
        extensionDuration = extensionDuration_;
        maxExtensions = maxExtensions_;
        emit SettlementConfigured(kind, token);
    }

    /// @notice Lists an active name with exact nonce, fee, and deadline guards.
    function listName(ListRequest calldata request) external {
        _requireTradingHealthy();
        if (request.price == 0) revert InvalidPrice();
        _validateDeadline(request.deadline, MAX_LISTING_DURATION);
        if (request.expectedFeeBps != marketplaceFeeBps) revert ListingGuardFailed();
        if (registry.statusOf(request.tokenId) != IChainNameRegistryV3.NameStatus.ACTIVE) {
            revert NameNotActive();
        }
        if (registry.ownerOf(request.tokenId) != msg.sender) revert NotAuthorized();
        if (registry.transferNonce(request.tokenId) != request.expectedTransferNonce) {
            revert ListingGuardFailed();
        }
        if (!_isApproved(msg.sender, request.tokenId)) revert ApprovalRequired();
        Listing storage existing = listings[request.tokenId];
        if (existing.seller != address(0) && !_isListingStale(request.tokenId, existing)) {
            revert ListingExists();
        }
        if (existing.seller != address(0)) {
            emit ListingInvalidated(request.tokenId, existing.seller);
        }
        if (_listingIndexPlusOne[request.tokenId] == 0) _addListingIndex(request.tokenId);
        uint64 listingNonce = _nextNonce(latestListingNonce[request.tokenId]);
        latestListingNonce[request.tokenId] = listingNonce;
        listings[request.tokenId] = Listing({
            seller: msg.sender,
            price: request.price,
            deadline: request.deadline,
            transferNonce: request.expectedTransferNonce,
            listingNonce: listingNonce,
            feeBps: request.expectedFeeBps
        });
        emit ListingCreated(
            request.tokenId,
            msg.sender,
            request.price,
            request.deadline,
            request.expectedTransferNonce,
            listingNonce,
            request.expectedFeeBps
        );
    }

    /// @notice Updates a listing only when the caller's complete expected snapshot still matches.
    function updateListing(
        uint256 tokenId,
        uint256 expectedPrice,
        uint64 expectedDeadline,
        uint64 expectedTransferNonce,
        uint64 expectedListingNonce,
        uint16 expectedFeeBps,
        uint256 newPrice,
        uint64 newDeadline,
        uint16 expectedCurrentFeeBps
    ) external {
        _requireTradingHealthy();
        if (newPrice == 0) revert InvalidPrice();
        _validateDeadline(newDeadline, MAX_LISTING_DURATION);
        Listing storage listing = listings[tokenId];
        if (listing.seller == address(0)) revert ListingNotFound();
        if (
            listing.seller != msg.sender || listing.price != expectedPrice
                || listing.deadline != expectedDeadline || listing.feeBps != expectedFeeBps
                || listing.transferNonce != expectedTransferNonce
                || listing.listingNonce != expectedListingNonce
                || marketplaceFeeBps != expectedCurrentFeeBps
        ) revert ListingGuardFailed();
        if (_isListingStale(tokenId, listing)) revert ListingStale();
        listing.price = newPrice;
        listing.deadline = newDeadline;
        listing.feeBps = expectedCurrentFeeBps;
        uint64 newListingNonce = _nextNonce(latestListingNonce[tokenId]);
        latestListingNonce[tokenId] = newListingNonce;
        listing.listingNonce = newListingNonce;
        emit ListingUpdated(
            tokenId,
            newPrice,
            newDeadline,
            listing.transferNonce,
            newListingNonce,
            expectedCurrentFeeBps
        );
    }

    function cancelListing(
        uint256 tokenId,
        uint256 expectedPrice,
        uint64 expectedDeadline,
        uint64 expectedTransferNonce,
        uint64 expectedListingNonce,
        uint16 expectedFeeBps
    ) external {
        Listing memory listing = listings[tokenId];
        if (listing.seller == address(0)) revert ListingNotFound();
        if (
            listing.seller != msg.sender || listing.price != expectedPrice
                || listing.deadline != expectedDeadline || listing.feeBps != expectedFeeBps
                || listing.transferNonce != expectedTransferNonce
                || listing.listingNonce != expectedListingNonce
        ) revert ListingGuardFailed();
        delete listings[tokenId];
        _removeListingIndex(tokenId);
        emit ListingCancelled(tokenId, msg.sender);
    }

    /// @notice Removes an expired, transferred, unapproved, or inactive listing.
    function invalidateListing(uint256 tokenId) external {
        Listing memory listing = listings[tokenId];
        if (listing.seller == address(0)) revert ListingNotFound();
        if (!_isListingStale(tokenId, listing)) revert ListingGuardFailed();
        delete listings[tokenId];
        _removeListingIndex(tokenId);
        emit ListingInvalidated(tokenId, listing.seller);
    }

    /// @notice Buys a fixed listing using full seller, price, deadline, and fee guards.
    function buyName(BuyRequest calldata request) external payable nonReentrant {
        _requireTradingHealthy();
        _validateRecipient(request.recipient);
        Listing memory listing = listings[request.tokenId];
        if (listing.seller == address(0)) revert ListingNotFound();
        if (
            listing.seller != request.expectedSeller || listing.price != request.expectedPrice
                || listing.deadline != request.expectedDeadline
                || listing.listingNonce != request.expectedListingNonce
                || listing.feeBps != request.expectedFeeBps
        ) revert ListingGuardFailed();
        if (msg.sender == listing.seller || request.recipient == listing.seller) {
            revert SelfPurchaseForbidden();
        }
        if (_isListingStale(request.tokenId, listing)) revert ListingStale();
        _collectPayment(msg.sender, listing.price);
        delete listings[request.tokenId];
        _removeListingIndex(request.tokenId);
        uint256 fee = _creditSale(listing.seller, listing.price, listing.feeBps);
        registry.safeTransferFrom(listing.seller, request.recipient, request.tokenId);
        emit NamePurchased(
            request.tokenId, listing.seller, msg.sender, request.recipient, listing.price, fee
        );
    }

    /// @notice Escrows a bid-like offer while binding it to the current name owner and transfer
    /// nonce.
    function makeOffer(OfferRequest calldata request)
        external
        payable
        nonReentrant
        returns (bytes32 offerId)
    {
        _requireTradingHealthy();
        _validateRecipient(request.recipient);
        if (request.amount == 0) revert InvalidPrice();
        _validateDeadline(request.deadline, MAX_OFFER_DURATION);
        if (request.expectedFeeBps != marketplaceFeeBps) revert OfferGuardFailed();
        if (registry.statusOf(request.tokenId) != IChainNameRegistryV3.NameStatus.ACTIVE) {
            revert NameNotActive();
        }
        address tokenOwner = registry.ownerOf(request.tokenId);
        if (tokenOwner != request.expectedOwner) revert OfferGuardFailed();
        if (tokenOwner == msg.sender || request.recipient == tokenOwner) {
            revert SelfOfferForbidden();
        }
        if (registry.transferNonce(request.tokenId) != request.expectedTransferNonce) {
            revert OfferGuardFailed();
        }
        _collectPayment(msg.sender, request.amount);
        uint64 nonce = nextOfferNonce[msg.sender][request.tokenId]++;
        offerId =
            keccak256(abi.encode(block.chainid, address(this), request.tokenId, msg.sender, nonce));
        offers[offerId] = Offer({
            tokenId: request.tokenId,
            buyer: msg.sender,
            recipient: request.recipient,
            ownerSnapshot: tokenOwner,
            amount: request.amount,
            deadline: request.deadline,
            transferNonce: request.expectedTransferNonce,
            feeBps: request.expectedFeeBps
        });
        offerStates[offerId] = OfferState.ACTIVE;
        _addOfferIndex(request.tokenId, offerId);
        totalOfferEscrow += request.amount;
        emit OfferCreated(
            offerId,
            request.tokenId,
            msg.sender,
            request.recipient,
            tokenOwner,
            request.amount,
            request.deadline,
            request.expectedTransferNonce,
            request.expectedFeeBps
        );
    }

    /// @notice Cancels the caller's offer and moves principal to its pull-payment balance.
    function cancelOffer(
        bytes32 offerId,
        uint256 expectedAmount,
        uint64 expectedDeadline,
        uint16 expectedFeeBps
    ) external {
        Offer memory offer = offers[offerId];
        if (offerStates[offerId] != OfferState.ACTIVE) revert OfferNotFound();
        if (
            offer.buyer != msg.sender || offer.amount != expectedAmount
                || offer.deadline != expectedDeadline || offer.feeBps != expectedFeeBps
        ) revert OfferGuardFailed();
        _refundOffer(offerId, offer);
    }

    /// @notice Refunds an expired or ownership-invalidated offer without making an external
    /// payment.
    function invalidateOffer(bytes32 offerId) external {
        Offer memory offer = offers[offerId];
        if (offerStates[offerId] != OfferState.ACTIVE) revert OfferNotFound();
        if (!_isOfferStale(offer)) revert OfferGuardFailed();
        _refundOffer(offerId, offer);
    }

    /// @notice Accepts an escrowed offer and credits seller proceeds as a pull payment.
    function acceptOffer(AcceptOfferRequest calldata request) external nonReentrant {
        _requireTradingHealthy();
        Offer memory offer = offers[request.offerId];
        if (offerStates[request.offerId] != OfferState.ACTIVE) revert OfferNotFound();
        if (
            offer.buyer != request.expectedBuyer || offer.recipient != request.expectedRecipient
                || offer.amount != request.expectedAmount
                || offer.deadline != request.expectedDeadline
                || offer.feeBps != request.expectedFeeBps
        ) revert OfferGuardFailed();
        if (offer.ownerSnapshot != msg.sender) revert NotAuthorized();
        if (_isOfferStale(offer)) revert OfferStale();
        if (!_isApproved(msg.sender, offer.tokenId)) revert ApprovalRequired();
        offerStates[request.offerId] = OfferState.ACCEPTED;
        _removeOfferIndex(offer.tokenId, request.offerId);
        totalOfferEscrow -= offer.amount;
        uint256 fee = _creditSale(msg.sender, offer.amount, offer.feeBps);
        registry.safeTransferFrom(msg.sender, offer.recipient, offer.tokenId);
        emit OfferAccepted(
            request.offerId,
            offer.tokenId,
            msg.sender,
            offer.buyer,
            offer.recipient,
            offer.amount,
            fee
        );
    }

    /// @notice Starts an English auction by escrowing the NFT, never settlement principal.
    function startAuction(StartAuctionRequest calldata request) external nonReentrant {
        _requireTradingHealthy();
        if (request.reservePrice == 0) revert InvalidPrice();
        _validateAuctionWindow(request.startAt, request.endAt);
        uint64 hardEndAt = request.endAt;
        if (maxExtensions != 0) {
            hardEndAt = uint64(uint256(request.endAt) + uint256(extensionDuration) * maxExtensions);
        }
        if (hardEndAt > registry.expiresAt(request.tokenId)) revert InvalidAuctionWindow();
        if (request.expectedFeeBps != marketplaceFeeBps) revert AuctionGuardFailed();
        if (registry.statusOf(request.tokenId) != IChainNameRegistryV3.NameStatus.ACTIVE) {
            revert NameNotActive();
        }
        if (registry.ownerOf(request.tokenId) != msg.sender) revert NotAuthorized();
        if (registry.transferNonce(request.tokenId) != request.expectedTransferNonce) {
            revert AuctionGuardFailed();
        }
        if (!_isApproved(msg.sender, request.tokenId)) revert ApprovalRequired();
        if (auctions[request.tokenId].seller != address(0)) revert AuctionExists();
        Listing memory listing = listings[request.tokenId];
        if (listing.seller != address(0)) {
            delete listings[request.tokenId];
            _removeListingIndex(request.tokenId);
            emit ListingInvalidated(request.tokenId, listing.seller);
        }

        registry.safeTransferFrom(msg.sender, address(this), request.tokenId);
        uint64 escrowNonce = registry.transferNonce(request.tokenId);
        uint64 auctionNonce = _nextNonce(latestAuctionNonce[request.tokenId]);
        latestAuctionNonce[request.tokenId] = auctionNonce;
        auctions[request.tokenId] = Auction({
            seller: msg.sender,
            highestBidder: address(0),
            highestBidRecipient: address(0),
            reservePrice: request.reservePrice,
            highestBid: 0,
            startAt: request.startAt,
            endAt: request.endAt,
            hardEndAt: hardEndAt,
            transferNonce: escrowNonce,
            auctionNonce: auctionNonce,
            feeBps: request.expectedFeeBps,
            extensionsUsed: 0
        });
        _addAuctionIndex(request.tokenId);
        emit AuctionStarted(
            request.tokenId,
            msg.sender,
            request.reservePrice,
            request.startAt,
            request.endAt,
            hardEndAt,
            escrowNonce,
            auctionNonce,
            request.expectedFeeBps
        );
    }

    /// @notice Places a full-principal bid; the previous bid becomes immediately claimable.
    function placeBid(BidRequest calldata request) external payable nonReentrant {
        _requireTradingHealthy();
        _validateRecipient(request.recipient);
        Auction storage auction = auctions[request.tokenId];
        if (auction.seller == address(0)) revert AuctionNotFound();
        if (block.timestamp < auction.startAt) revert AuctionNotStarted();
        if (block.timestamp >= auction.endAt) revert AuctionNotEnded();
        if (auction.seller == msg.sender) revert SellerCannotBid();
        if (auction.seller == request.recipient) revert SellerCannotBid();
        if (
            auction.highestBidder != request.expectedHighestBidder
                || auction.highestBidRecipient != request.expectedHighestBidRecipient
                || auction.highestBid != request.expectedHighestBid
                || auction.endAt != request.expectedEndAt
                || auction.auctionNonce != request.expectedAuctionNonce
                || auction.feeBps != request.expectedFeeBps
        ) revert AuctionGuardFailed();
        if (!_isAuctionCustodyValid(request.tokenId, auction.transferNonce)) {
            revert AuctionGuardFailed();
        }
        uint256 minimum = auction.highestBid == 0
            ? auction.reservePrice
            : auction.highestBid + _minimumIncrement(auction.highestBid);
        if (request.amount < minimum) revert BidTooLow(minimum, request.amount);
        _collectPayment(msg.sender, request.amount);

        address previousBidder = auction.highestBidder;
        address previousBidRecipient = auction.highestBidRecipient;
        uint256 previousBid = auction.highestBid;
        if (previousBid != 0) {
            totalAuctionEscrow -= previousBid;
            _creditClaimable(previousBidder, previousBid);
        }
        auction.highestBidder = msg.sender;
        auction.highestBidRecipient = request.recipient;
        auction.highestBid = request.amount;
        totalAuctionEscrow += request.amount;
        if (
            maxExtensions != 0 && auction.extensionsUsed < maxExtensions
                && auction.endAt > block.timestamp
                && auction.endAt - block.timestamp <= antiSnipingWindow
        ) {
            uint64 previousEndAt = auction.endAt;
            uint256 candidate = uint256(previousEndAt) + extensionDuration;
            auction.endAt = uint64(candidate > auction.hardEndAt ? auction.hardEndAt : candidate);
            unchecked {
                ++auction.extensionsUsed;
            }
            if (auction.endAt != previousEndAt) {
                emit AuctionExtended(request.tokenId, previousEndAt, auction.endAt);
            }
        }
        emit BidPlaced(
            request.tokenId,
            msg.sender,
            request.recipient,
            request.amount,
            previousBidder,
            previousBidRecipient,
            previousBid
        );
    }

    /// @notice Cancels a bid-free auction and returns custody to its seller.
    function cancelAuction(
        uint256 tokenId,
        uint256 expectedReservePrice,
        uint64 expectedEndAt,
        uint64 expectedAuctionNonce,
        uint16 expectedFeeBps
    ) external nonReentrant {
        Auction memory auction = auctions[tokenId];
        if (auction.seller == address(0)) revert AuctionNotFound();
        if (auction.seller != msg.sender) revert NotAuthorized();
        if (auction.highestBid != 0) revert AuctionHasBid();
        if (
            auction.reservePrice != expectedReservePrice || auction.endAt != expectedEndAt
                || auction.auctionNonce != expectedAuctionNonce || auction.feeBps != expectedFeeBps
        ) revert AuctionGuardFailed();
        delete auctions[tokenId];
        _removeAuctionIndex(tokenId);
        if (_isAuctionCustodyValid(tokenId, auction.transferNonce)) {
            registry.transferFrom(address(this), auction.seller, tokenId);
        }
        emit AuctionCancelled(tokenId, auction.seller);
    }

    /// @notice Finalizes deterministically to the bid-bound recipient without an ERC-721 callback.
    /// @dev `transferFrom` avoids a malicious receiver callback blocking permissionless settlement.
    ///      A bidder choosing a contract recipient is responsible for that recipient's NFT
    /// controls.
    function finalizeAuction(FinalizeAuctionRequest calldata request) external nonReentrant {
        Auction memory auction = auctions[request.tokenId];
        if (auction.seller == address(0)) revert AuctionNotFound();
        if (block.timestamp < auction.endAt) revert AuctionNotEnded();
        if (
            auction.highestBidder != request.expectedHighestBidder
                || auction.highestBidRecipient != request.expectedHighestBidRecipient
                || auction.highestBid != request.expectedHighestBid
                || auction.endAt != request.expectedEndAt
                || auction.auctionNonce != request.expectedAuctionNonce
                || auction.feeBps != request.expectedFeeBps
        ) revert AuctionGuardFailed();
        delete auctions[request.tokenId];
        _removeAuctionIndex(request.tokenId);

        bool custodyValid = _isAuctionCustodyValid(request.tokenId, auction.transferNonce);
        bool nameLive = _isNameLive(request.tokenId);
        if (auction.highestBid == 0) {
            if (custodyValid && nameLive) {
                registry.transferFrom(address(this), auction.seller, request.tokenId);
            } else if (custodyValid) {
                emit ExpiredAuctionCustodyAbandoned(request.tokenId, auction.seller);
            }
            emit AuctionFinalized(
                request.tokenId, auction.seller, address(0), address(0), 0, 0, false
            );
            return;
        }
        if (!custodyValid || !nameLive) {
            totalAuctionEscrow -= auction.highestBid;
            _creditClaimable(auction.highestBidder, auction.highestBid);
            emit AuctionBidRefunded(request.tokenId, auction.highestBidder, auction.highestBid);
            emit AuctionFinalized(
                request.tokenId,
                auction.seller,
                auction.highestBidder,
                auction.highestBidRecipient,
                auction.highestBid,
                0,
                true
            );
            return;
        }
        registry.transferFrom(address(this), auction.highestBidRecipient, request.tokenId);
        totalAuctionEscrow -= auction.highestBid;
        uint256 fee = _creditSale(auction.seller, auction.highestBid, auction.feeBps);
        emit AuctionFinalized(
            request.tokenId,
            auction.seller,
            auction.highestBidder,
            auction.highestBidRecipient,
            auction.highestBid,
            fee,
            false
        );
    }

    /// @notice Claims seller proceeds or refunds to a chosen recipient.
    function claimBalance(address recipient) external nonReentrant {
        _validateRecipient(recipient);
        uint256 amount = claimableBalance[msg.sender];
        if (amount == 0) revert NoClaimableBalance();
        claimableBalance[msg.sender] = 0;
        totalClaimableLiability -= amount;
        _payout(recipient, amount);
        emit ClaimableBalanceClaimed(msg.sender, recipient, amount);
    }

    /// @notice Raw enumerable entries consumed by the bounded market lens.
    function listingEntryCount() external view returns (uint256) {
        return _listingTokenIds.length;
    }

    function listingEntryAt(uint256 index)
        external
        view
        returns (uint256 tokenId, Listing memory listing)
    {
        tokenId = _listingTokenIds[index];
        listing = listings[tokenId];
    }

    function offerEntryCount(uint256 tokenId) external view returns (uint256) {
        return _offerIdsByToken[tokenId].length;
    }

    function offerEntryAt(uint256 tokenId, uint256 index)
        external
        view
        returns (bytes32 offerId, Offer memory offer)
    {
        offerId = _offerIdsByToken[tokenId][index];
        offer = offers[offerId];
    }

    function globalOfferEntryCount() external view returns (uint256) {
        return _globalOfferIds.length;
    }

    function globalOfferEntryAt(uint256 index)
        external
        view
        returns (bytes32 offerId, Offer memory offer)
    {
        offerId = _globalOfferIds[index];
        offer = offers[offerId];
    }

    function auctionEntryCount() external view returns (uint256) {
        return _auctionTokenIds.length;
    }

    function auctionEntryAt(uint256 index)
        external
        view
        returns (uint256 tokenId, Auction memory auction)
    {
        tokenId = _auctionTokenIds[index];
        auction = auctions[tokenId];
    }

    function protectedBalance() public view returns (uint256) {
        return totalOfferEscrow + totalAuctionEscrow + totalClaimableLiability;
    }

    function settlementBalance() public view returns (uint256) {
        return settlementKind == IChainNameControllerV3.SettlementKind.NATIVE
            ? address(this).balance
            : settlementToken.balanceOf(address(this));
    }

    function isSolvent() public view returns (bool) {
        return settlementBalance() >= protectedBalance();
    }

    function treasuryAvailableBalance() public view returns (uint256) {
        uint256 balance = settlementBalance();
        uint256 liability = protectedBalance();
        return balance > liability ? balance - liability : 0;
    }

    /// @notice Aggregates protected liabilities across registration/referral and marketplace
    /// vaults.
    function suiteProtectedBalance() external view returns (uint256) {
        return controller.protectedBalance() + protectedBalance();
    }

    /// @notice Aggregates the same settlement asset held by both economic suite contracts.
    function suiteSettlementBalance() external view returns (uint256) {
        return controller.settlementBalance() + settlementBalance();
    }

    function isSuiteSolvent() external view returns (bool) {
        return controller.isSolvent() && isSolvent();
    }

    function setMarketplaceFeeBps(uint16 newBps) external onlyOwner {
        if (newBps > MAX_MARKETPLACE_FEE_BPS) revert InvalidFee();
        uint16 previous = marketplaceFeeBps;
        marketplaceFeeBps = newBps;
        emit MarketplaceFeeChanged(previous, newBps);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0) || newTreasury == address(this)) revert ZeroAddress();
        address previous = treasury;
        treasury = newTreasury;
        emit TreasuryChanged(previous, newTreasury);
    }

    function setMarketPaused(bool paused) external onlyOwner {
        marketPaused = paused;
        emit MarketplacePauseChanged(paused);
    }

    function withdrawTreasury() external onlyOwner nonReentrant {
        _requireSolvent();
        uint256 amount = treasuryAvailableBalance();
        if (amount == 0) revert InsufficientTreasuryBalance();
        _payout(treasury, amount);
        emit TreasuryWithdrawal(treasury, amount);
    }

    function recoverUnsupportedERC20(address token) external onlyOwner nonReentrant {
        if (token == address(0)) revert ZeroAddress();
        if (
            settlementKind == IChainNameControllerV3.SettlementKind.ERC20
                && token == address(settlementToken)
        ) {
            revert SettlementTokenRecoveryForbidden();
        }
        uint256 amount = IERC20(token).balanceOf(address(this));
        if (amount == 0) revert NoRecoverableBalance();
        IERC20(token).safeTransfer(treasury, amount);
        emit UnsupportedTokenRecovered(token, amount);
    }

    function sweepUnexpectedNative() external onlyOwner nonReentrant {
        if (settlementKind != IChainNameControllerV3.SettlementKind.ERC20) {
            revert InvalidSettlementConfig();
        }
        uint256 amount = address(this).balance;
        if (amount == 0) revert NoRecoverableBalance();
        (bool success,) = payable(treasury).call{ value: amount }("");
        if (!success) revert TransferFailed();
        emit UnexpectedNativeSwept(amount);
    }

    /// @dev Rejects unsolicited NFT deposits so only `startAuction` can establish custody.
    function onERC721Received(address operator, address, uint256, bytes calldata)
        external
        view
        returns (bytes4)
    {
        if (msg.sender != address(registry) || operator != address(this)) {
            revert UnexpectedNFTTransfer();
        }
        return IERC721Receiver.onERC721Received.selector;
    }

    function _addListingIndex(uint256 tokenId) internal {
        _listingTokenIds.push(tokenId);
        _listingIndexPlusOne[tokenId] = _listingTokenIds.length;
    }

    function _removeListingIndex(uint256 tokenId) internal {
        uint256 indexPlusOne = _listingIndexPlusOne[tokenId];
        if (indexPlusOne == 0) return;
        uint256 index = indexPlusOne - 1;
        uint256 lastIndex = _listingTokenIds.length - 1;
        if (index != lastIndex) {
            uint256 moved = _listingTokenIds[lastIndex];
            _listingTokenIds[index] = moved;
            _listingIndexPlusOne[moved] = index + 1;
        }
        _listingTokenIds.pop();
        delete _listingIndexPlusOne[tokenId];
    }

    function _addOfferIndex(uint256 tokenId, bytes32 offerId) internal {
        _offerIdsByToken[tokenId].push(offerId);
        _offerIndexPlusOne[offerId] = _offerIdsByToken[tokenId].length;
        _globalOfferIds.push(offerId);
    }

    function _removeOfferIndex(uint256 tokenId, bytes32 offerId) internal {
        uint256 indexPlusOne = _offerIndexPlusOne[offerId];
        if (indexPlusOne == 0) return;
        bytes32[] storage offerIds = _offerIdsByToken[tokenId];
        uint256 index = indexPlusOne - 1;
        uint256 lastIndex = offerIds.length - 1;
        if (index != lastIndex) {
            bytes32 moved = offerIds[lastIndex];
            offerIds[index] = moved;
            _offerIndexPlusOne[moved] = index + 1;
        }
        offerIds.pop();
        delete _offerIndexPlusOne[offerId];
    }

    function _addAuctionIndex(uint256 tokenId) internal {
        _auctionTokenIds.push(tokenId);
        _auctionIndexPlusOne[tokenId] = _auctionTokenIds.length;
    }

    function _removeAuctionIndex(uint256 tokenId) internal {
        uint256 indexPlusOne = _auctionIndexPlusOne[tokenId];
        if (indexPlusOne == 0) return;
        uint256 index = indexPlusOne - 1;
        uint256 lastIndex = _auctionTokenIds.length - 1;
        if (index != lastIndex) {
            uint256 moved = _auctionTokenIds[lastIndex];
            _auctionTokenIds[index] = moved;
            _auctionIndexPlusOne[moved] = index + 1;
        }
        _auctionTokenIds.pop();
        delete _auctionIndexPlusOne[tokenId];
    }

    function _refundOffer(bytes32 offerId, Offer memory offer) internal {
        offerStates[offerId] = OfferState.REFUNDED;
        _removeOfferIndex(offer.tokenId, offerId);
        totalOfferEscrow -= offer.amount;
        _creditClaimable(offer.buyer, offer.amount);
        emit OfferRefunded(offerId, offer.buyer, offer.amount);
    }

    function _creditSale(address seller, uint256 amount, uint16 feeBps)
        internal
        returns (uint256 fee)
    {
        fee = _mulBps(amount, feeBps);
        _creditClaimable(seller, amount - fee);
    }

    function _creditClaimable(address account, uint256 amount) internal {
        if (amount == 0) return;
        claimableBalance[account] += amount;
        totalClaimableLiability += amount;
        emit ClaimableBalanceCredited(account, amount);
    }

    function _isListingStale(uint256 tokenId, Listing memory listing) internal view returns (bool) {
        if (block.timestamp > listing.deadline) return true;
        if (registry.statusOf(tokenId) != IChainNameRegistryV3.NameStatus.ACTIVE) return true;
        try registry.ownerOf(tokenId) returns (address tokenOwner) {
            if (tokenOwner != listing.seller) return true;
        } catch {
            return true;
        }
        if (registry.transferNonce(tokenId) != listing.transferNonce) return true;
        return !_isApproved(listing.seller, tokenId);
    }

    function _isOfferStale(Offer memory offer) internal view returns (bool) {
        if (block.timestamp > offer.deadline) return true;
        if (registry.statusOf(offer.tokenId) != IChainNameRegistryV3.NameStatus.ACTIVE) {
            return true;
        }
        try registry.ownerOf(offer.tokenId) returns (address tokenOwner) {
            if (tokenOwner != offer.ownerSnapshot) return true;
        } catch {
            return true;
        }
        return registry.transferNonce(offer.tokenId) != offer.transferNonce;
    }

    function _isAuctionCustodyValid(uint256 tokenId, uint64 expectedNonce)
        internal
        view
        returns (bool)
    {
        try registry.ownerOf(tokenId) returns (address tokenOwner) {
            return tokenOwner == address(this) && registry.transferNonce(tokenId) == expectedNonce;
        } catch {
            return false;
        }
    }

    function _isNameLive(uint256 tokenId) internal view returns (bool) {
        return registry.statusOf(tokenId) == IChainNameRegistryV3.NameStatus.ACTIVE;
    }

    function _isApproved(address tokenOwner, uint256 tokenId) internal view returns (bool) {
        return registry.getApproved(tokenId) == address(this)
            || registry.isApprovedForAll(tokenOwner, address(this));
    }

    function _validateDeadline(uint64 deadline, uint64 maximumDuration) internal view {
        if (deadline <= block.timestamp || deadline > block.timestamp + maximumDuration) {
            revert InvalidDeadline();
        }
    }

    function _validateAuctionWindow(uint64 startAt, uint64 endAt) internal view {
        if (
            startAt < block.timestamp || startAt > block.timestamp + MAX_AUCTION_START_DELAY
                || endAt < uint256(startAt) + MIN_AUCTION_DURATION
                || endAt > uint256(startAt) + MAX_AUCTION_DURATION
        ) revert InvalidAuctionWindow();
    }

    function _validateRecipient(address recipient) internal view {
        if (recipient == address(0) || recipient == address(this)) revert InvalidRecipient();
    }

    function _requireTradingHealthy() internal view {
        if (marketPaused) revert MarketplacePaused();
        _requireSolvent();
        if (!controller.isSolvent()) revert RegistryInsolvent();
    }

    function _requireSolvent() internal view {
        uint256 balance = settlementBalance();
        uint256 liability = protectedBalance();
        if (balance < liability) revert ProtocolInsolvent(balance, liability);
    }

    function _collectPayment(address payer, uint256 amount) internal {
        if (settlementKind == IChainNameControllerV3.SettlementKind.NATIVE) {
            if (msg.value != amount) revert IncorrectPayment(amount, msg.value);
            return;
        }
        if (msg.value != 0) revert UnexpectedNativeValue(msg.value);
        uint256 payerBefore = settlementToken.balanceOf(payer);
        uint256 contractBefore = settlementToken.balanceOf(address(this));
        settlementToken.safeTransferFrom(payer, address(this), amount);
        _requireExactTransfer(
            amount,
            payerBefore,
            settlementToken.balanceOf(payer),
            contractBefore,
            settlementToken.balanceOf(address(this))
        );
    }

    function _payout(address recipient, uint256 amount) internal {
        if (settlementKind == IChainNameControllerV3.SettlementKind.NATIVE) {
            (bool success,) = payable(recipient).call{ value: amount }("");
            if (!success) revert TransferFailed();
            return;
        }
        uint256 contractBefore = settlementToken.balanceOf(address(this));
        uint256 recipientBefore = settlementToken.balanceOf(recipient);
        settlementToken.safeTransfer(recipient, amount);
        _requireExactTransfer(
            amount,
            contractBefore,
            settlementToken.balanceOf(address(this)),
            recipientBefore,
            settlementToken.balanceOf(recipient)
        );
    }

    function _requireExactTransfer(
        uint256 expected,
        uint256 senderBefore,
        uint256 senderAfter,
        uint256 recipientBefore,
        uint256 recipientAfter
    ) internal pure {
        uint256 senderDelta = senderBefore >= senderAfter ? senderBefore - senderAfter : 0;
        uint256 recipientDelta =
            recipientAfter >= recipientBefore ? recipientAfter - recipientBefore : 0;
        if (senderDelta != expected || recipientDelta != expected) {
            revert SettlementTransferMismatch(expected, senderDelta, recipientDelta);
        }
    }

    function _minimumIncrement(uint256 amount) internal view returns (uint256) {
        uint256 increment = _mulBps(amount, minBidIncrementBps);
        return increment == 0 ? 1 : increment;
    }

    function _nextNonce(uint64 current) internal pure returns (uint64) {
        if (current == type(uint64).max) revert NonceOverflow();
        unchecked {
            return current + 1;
        }
    }

    function _mulBps(uint256 amount, uint16 bps) internal pure returns (uint256) {
        return
            (amount / BPS_DENOMINATOR) * bps + ((amount % BPS_DENOMINATOR) * bps) / BPS_DENOMINATOR;
    }

    receive() external payable {
        revert UnexpectedNativeValue(msg.value);
    }

    fallback() external payable {
        revert UnexpectedNativeValue(msg.value);
    }
}
