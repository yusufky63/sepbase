// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import { IERC4906 } from "@openzeppelin/contracts/interfaces/IERC4906.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {
    ERC721Enumerable
} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Chain Name Service
/// @notice A standalone ERC-721 name registry with resolution, referrals, and fixed-price sales.
/// @dev Each deployment supports one suffix and one immutable settlement asset.
contract ChainNameService is ERC721Enumerable, Ownable2Step, ReentrancyGuard, IERC4906 {
    using SafeERC20 for IERC20;

    string public constant VERSION = "2.0.0";
    uint64 internal constant YEAR = 365 days;
    uint8 internal constant MIN_DURATION_YEARS = 1;
    uint8 internal constant MAX_DURATION_YEARS = 5;
    uint8 internal constant MIN_LABEL_LENGTH = 1;
    uint8 internal constant MAX_LABEL_LENGTH = 32;
    uint8 internal constant MAX_SUFFIX_LENGTH = 16;
    uint8 internal constant MAX_COLLECTION_NAME_BYTES = 64;
    uint8 internal constant MAX_COLLECTION_SYMBOL_BYTES = 16;
    uint8 internal constant MAX_RECENT_QUERY = 20;
    uint16 internal constant RECENT_CAPACITY = 100;
    uint8 internal constant MAX_LISTING_QUERY = 50;
    uint16 internal constant MAX_RESERVED_BATCH = 100;
    uint64 internal constant MIN_GRACE_PERIOD = 1 days;
    uint64 internal constant MAX_GRACE_PERIOD = 90 days;
    uint16 internal constant BPS_DENOMINATOR = 10_000;
    uint16 internal constant MAX_REFERRAL_REWARD_BPS = 2000;
    uint16 internal constant MAX_MARKETPLACE_FEE_BPS = 500;
    uint256 internal constant MAX_ANNUAL_PRICE =
        type(uint256).max / (uint256(type(uint8).max) * MAX_DURATION_YEARS);

    enum SettlementKind {
        NATIVE,
        ERC20
    }

    enum NameStatus {
        UNREGISTERED,
        ACTIVE,
        GRACE,
        RELEASED
    }

    enum ListingCleanup {
        NONE,
        CANCELLED,
        INVALIDATED
    }

    struct Profile {
        string displayName;
        string bio;
        string avatar;
        string website;
        string twitter;
        string github;
    }

    struct RecentRegistration {
        uint256 tokenId;
        string label;
        address owner;
        uint64 registeredAt;
        uint64 expiresAt;
    }

    struct Listing {
        uint256 tokenId;
        address seller;
        uint256 price;
        uint64 listedAt;
        uint16 feeBps;
    }

    error InvalidLabel();
    error InvalidSuffix();
    error InvalidCollectionMetadata();
    error InvalidDuration();
    error InvalidGracePeriod();
    error InvalidAnnualPrice();
    error InvalidMetadataURI();
    error BatchTooLarge();
    error NameNotAvailable();
    error NameReserved();
    error IncorrectPayment(uint256 expected, uint256 received);
    error PriceChanged(uint256 expected, uint256 actual);
    error UnexpectedNativeValue(uint256 received);
    error InvalidSettlementConfig();
    error SettlementTransferMismatch(uint256 expected, uint256 senderDelta, uint256 recipientDelta);
    error SettlementTokenRecoveryForbidden();
    error NoRecoverableBalance();
    error ZeroAddress();
    error InvalidRecipient();
    error SelfTransferToContractForbidden();
    error RegistrationPaused();
    error MarketplacePaused();
    error RenewalWindowClosed();
    error NotAuthorized();
    error FieldTooLong();
    error TransferFailed();
    error InvalidQueryLimit(uint256 limit, uint256 max);
    error InvalidReferrer();
    error ReferralRateTooHigh();
    error ReferralRateChanged(uint16 expected, uint16 actual);
    error NoReferralRewards();
    error InsufficientTreasuryBalance();
    error ProtocolInsolvent(uint256 balance, uint256 liability);
    error InvalidListingPrice();
    error ListingNotFound();
    error ListingNotInvalidatable();
    error NameNotActive();
    error SellerMismatch();
    error BuyerIsSeller();
    error NoSaleProceeds();
    error MarketplaceFeeTooHigh();
    error MarketplaceFeeChanged(uint16 expected, uint16 actual);
    error ReleasedTokenLocked();
    error OwnershipRenounceDisabled();
    error NameDoesNotExist(uint256 tokenId);
    error NoPrimaryName();
    error PrimaryAlreadySet();
    error PrimaryStillValid();
    error PrimaryResolutionMismatch();

    event NameRegistered(
        uint256 indexed tokenId,
        string label,
        address indexed owner,
        address indexed payer,
        uint64 registeredAt,
        uint64 expiresAt,
        uint256 price
    );
    event NameRenewed(
        uint256 indexed tokenId,
        address indexed payer,
        uint64 oldExpiresAt,
        uint64 newExpiresAt,
        uint256 price
    );
    event NameDataUpdated(uint256 indexed tokenId, address indexed owner, address resolvedAddress);
    event PrimaryNameChanged(
        address indexed account, bool hasPrimary, uint256 indexed tokenId, string fullName
    );
    event AnnualPriceUpdated(uint256 previousPrice, uint256 newPrice);
    event SettlementConfigured(SettlementKind kind, address indexed token);
    event ReferralRewardBpsUpdated(uint16 previousBps, uint16 newBps);
    event ReferralAttributed(
        uint256 indexed tokenId, address indexed referrer, address indexed payer, uint256 reward
    );
    event ReferralRewardClaimed(
        address indexed referrer, address indexed recipient, uint256 amount
    );
    event NameListed(uint256 indexed tokenId, address indexed seller, uint256 price, uint16 feeBps);
    event ListingCancelled(uint256 indexed tokenId, address indexed seller);
    event ListingInvalidated(uint256 indexed tokenId, address indexed previousSeller);
    event NameSold(
        uint256 indexed tokenId,
        address indexed seller,
        address indexed buyer,
        uint256 price,
        uint256 fee
    );
    event SaleProceedsClaimed(address indexed seller, address indexed recipient, uint256 amount);
    event MarketplaceFeeBpsUpdated(uint16 previousBps, uint16 newBps);
    event ReservedLabelUpdated(bytes32 indexed labelHash, string label, bool reserved);
    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);
    event RegistrationsPauseChanged(bool paused);
    event MarketplacePauseChanged(bool paused);
    event MetadataBaseURIUpdated(string previousBaseURI, string newBaseURI);
    event TreasuryWithdrawal(address indexed treasury, uint256 amount);
    event UnsupportedTokenRecovered(address indexed token, uint256 amount);
    event UnexpectedNativeSwept(uint256 amount);

    string public suffix;
    address public treasury;
    uint64 public gracePeriod;
    bool public registrationsPaused;
    bool public marketplacePaused;

    SettlementKind public immutable settlementKind;
    IERC20 public immutable settlementToken;
    /// @notice Packed 1-, 2-, and 3-character annual price multipliers, one byte each.
    uint24 private immutable _shortNamePriceMultipliers;
    uint256 public annualPrice;
    uint16 public referralRewardBps;
    uint256 public totalReferralLiability;
    uint16 public marketplaceFeeBps;
    uint256 public totalMarketplaceLiability;

    string public metadataBaseURI;
    mapping(uint256 tokenId => string label) private _labels;
    mapping(uint256 tokenId => uint64 timestamp) public expiresAt;
    mapping(uint256 tokenId => address target) public resolvedAddress;
    mapping(uint256 tokenId => Profile profile) private _profiles;
    mapping(address account => uint256 tokenId) public primaryTokenId;
    mapping(address account => bool value) public hasPrimary;
    mapping(bytes32 labelHash => bool value) public reservedLabels;
    mapping(address referrer => uint256 amount) public referralBalance;
    mapping(uint256 tokenId => Listing listing) public listings;
    mapping(address seller => uint256 amount) public sellerBalance;
    mapping(uint256 tokenId => uint256 indexPlusOne) private _listingIndexPlusOne;

    RecentRegistration[RECENT_CAPACITY] private _recentRegistrations;
    uint16 private _recentCount;
    uint16 private _recentCursor;
    uint256[] private _listingTokenIds;

    /// @notice Creates an independent name registry deployment.
    constructor(
        string memory collectionName,
        string memory collectionSymbol,
        string memory suffix_,
        address initialOwner,
        address treasury_,
        uint64 gracePeriod_,
        SettlementKind settlementKind_,
        address settlementToken_,
        uint256 annualPrice_,
        uint24 shortNamePriceMultipliers_,
        uint16 referralRewardBps_,
        uint16 marketplaceFeeBps_,
        string memory metadataBaseURI_
    ) ERC721(collectionName, collectionSymbol) Ownable(initialOwner) {
        if (
            bytes(collectionName).length == 0
                || bytes(collectionName).length > MAX_COLLECTION_NAME_BYTES
                || bytes(collectionSymbol).length == 0
                || bytes(collectionSymbol).length > MAX_COLLECTION_SYMBOL_BYTES
        ) revert InvalidCollectionMetadata();
        if (!_isValidSuffix(suffix_)) revert InvalidSuffix();
        if (initialOwner == address(0) || initialOwner == address(this)) revert ZeroAddress();
        if (treasury_ == address(0) || treasury_ == address(this)) revert ZeroAddress();
        if (gracePeriod_ < MIN_GRACE_PERIOD || gracePeriod_ > MAX_GRACE_PERIOD) {
            revert InvalidGracePeriod();
        }
        if (annualPrice_ == 0 || annualPrice_ > MAX_ANNUAL_PRICE) revert InvalidAnnualPrice();
        uint256 oneCharacterMultiplier = shortNamePriceMultipliers_ & 0xff;
        uint256 twoCharacterMultiplier = (shortNamePriceMultipliers_ >> 8) & 0xff;
        uint256 threeCharacterMultiplier = (shortNamePriceMultipliers_ >> 16) & 0xff;
        if (
            threeCharacterMultiplier == 0 || twoCharacterMultiplier < threeCharacterMultiplier
                || oneCharacterMultiplier < twoCharacterMultiplier
        ) revert InvalidAnnualPrice();
        if (referralRewardBps_ > MAX_REFERRAL_REWARD_BPS) revert ReferralRateTooHigh();
        if (marketplaceFeeBps_ > MAX_MARKETPLACE_FEE_BPS) revert MarketplaceFeeTooHigh();
        _validateMetadataURI(metadataBaseURI_);

        if (settlementKind_ == SettlementKind.NATIVE) {
            if (settlementToken_ != address(0)) revert InvalidSettlementConfig();
        } else if (settlementToken_ == address(0) || settlementToken_.code.length == 0) {
            revert InvalidSettlementConfig();
        }

        suffix = suffix_;
        treasury = treasury_;
        gracePeriod = gracePeriod_;
        settlementKind = settlementKind_;
        settlementToken = IERC20(settlementToken_);
        _shortNamePriceMultipliers = shortNamePriceMultipliers_;
        annualPrice = annualPrice_;
        referralRewardBps = referralRewardBps_;
        marketplaceFeeBps = marketplaceFeeBps_;
        metadataBaseURI = metadataBaseURI_;

        emit SettlementConfigured(settlementKind_, settlementToken_);
    }

    /// @notice Returns the deterministic ERC-721 token ID for a label.
    function tokenIdFor(string calldata label) public pure returns (uint256) {
        return uint256(keccak256(bytes(label)));
    }

    /// @notice Validates a canonical lowercase label.
    function isValidLabel(string calldata label) public pure returns (bool valid) {
        assembly ("memory-safe") {
            let length := label.length
            valid := and(iszero(lt(length, 1)), iszero(gt(length, 32)))
            if valid {
                let offset := label.offset
                let previousHyphen := 0
                for { let index := 0 } lt(index, length) { index := add(index, 1) } {
                    let character := byte(0, calldataload(add(offset, index)))
                    let hyphen := eq(character, 45)
                    let lowercaseLetter := and(gt(character, 96), lt(character, 123))
                    let digit := and(gt(character, 47), lt(character, 58))
                    let edge := or(iszero(index), eq(add(index, 1), length))
                    if or(
                        iszero(or(or(lowercaseLetter, digit), hyphen)),
                        and(hyphen, or(edge, previousHyphen))
                    ) {
                        valid := 0
                        break
                    }
                    previousHyphen := hyphen
                }
            }
        }
    }

    /// @notice Returns true when a valid, unreserved label can be registered.
    function isAvailable(string calldata label) public view returns (bool) {
        if (!isValidLabel(label) || reservedLabels[keccak256(bytes(label))]) return false;
        NameStatus status = statusOf(tokenIdFor(label));
        return status == NameStatus.UNREGISTERED || status == NameStatus.RELEASED;
    }

    /// @notice Returns the lifecycle status of a token ID.
    function statusOf(uint256 tokenId) public view returns (NameStatus) {
        if (_ownerOf(tokenId) == address(0)) return NameStatus.UNREGISTERED;
        uint256 expiration = expiresAt[tokenId];
        if (block.timestamp <= expiration) return NameStatus.ACTIVE;
        if (block.timestamp <= expiration + gracePeriod) return NameStatus.GRACE;
        return NameStatus.RELEASED;
    }

    /// @notice Quotes a registration price in settlement base units.
    function quote(string calldata label, uint8 durationYears) public view returns (uint256) {
        if (!isValidLabel(label)) revert InvalidLabel();
        _validateDuration(durationYears);
        return _quoteAmount(bytes(label).length, durationYears);
    }

    /// @notice Returns the label and configured suffix.
    function fullName(uint256 tokenId) public view returns (string memory) {
        _requireOwned(tokenId);
        return string.concat(_labels[tokenId], ".", suffix);
    }

    /// @notice Resolves a valid label, returning zero when it has no effective resolution.
    function resolve(string calldata label) external view returns (address) {
        if (!isValidLabel(label)) revert InvalidLabel();
        uint256 tokenId = tokenIdFor(label);
        NameStatus status = statusOf(tokenId);
        return (status == NameStatus.ACTIVE || status == NameStatus.GRACE)
            && resolvedAddress[tokenId] != address(0)
            ? resolvedAddress[tokenId]
            : address(0);
    }

    /// @notice Returns stored profile data for an existing token.
    function profileOf(uint256 tokenId) external view returns (Profile memory) {
        _requireOwned(tokenId);
        return _profiles[tokenId];
    }

    /// @notice Returns an account's effective forward-confirmed primary name.
    function primaryNameOf(address account) external view returns (string memory) {
        if (!_isPrimaryValid(account)) return "";
        return fullName(primaryTokenId[account]);
    }

    /// @notice Returns newest registrations first from the bounded ring buffer.
    function getRecentRegistrations(uint256 limit)
        external
        view
        returns (RecentRegistration[] memory results)
    {
        if (limit == 0 || limit > MAX_RECENT_QUERY) {
            revert InvalidQueryLimit(limit, MAX_RECENT_QUERY);
        }
        uint256 resultLength = limit < _recentCount ? limit : _recentCount;
        results = new RecentRegistration[](resultLength);
        for (uint256 index; index < resultLength;) {
            uint256 storageIndex = _recentCursor > index
                ? _recentCursor - 1 - index
                : RECENT_CAPACITY + _recentCursor - 1 - index;
            results[index] = _recentRegistrations[storageIndex];
            unchecked {
                ++index;
            }
        }
    }

    /// @notice Returns an offset page of stored marketplace listings.
    function getListings(uint256 offset, uint256 limit)
        external
        view
        returns (Listing[] memory page, uint256 total)
    {
        if (limit == 0 || limit > MAX_LISTING_QUERY) {
            revert InvalidQueryLimit(limit, MAX_LISTING_QUERY);
        }
        total = _listingTokenIds.length;
        if (offset >= total) return (new Listing[](0), total);
        uint256 remaining = total - offset;
        uint256 length = limit < remaining ? limit : remaining;
        page = new Listing[](length);
        for (uint256 index; index < length;) {
            page[index] = listings[_listingTokenIds[offset + index]];
            unchecked {
                ++index;
            }
        }
    }

    /// @notice Returns settlement funds not protected for referrals or sellers.
    function treasuryAvailableBalance() public view returns (uint256) {
        uint256 balance = settlementBalance();
        uint256 liability = totalProtectedLiability();
        return balance >= liability ? balance - liability : 0;
    }

    /// @notice Returns the total referral and seller pull-payment liability.
    function totalProtectedLiability() public view returns (uint256) {
        return totalReferralLiability + totalMarketplaceLiability;
    }

    /// @notice Returns whether the configured settlement balance covers protected liabilities.
    function isSolvent() public view returns (bool) {
        return settlementBalance() >= totalProtectedLiability();
    }

    /// @notice Returns this contract's balance in the configured settlement asset.
    function settlementBalance() public view returns (uint256) {
        return settlementKind == SettlementKind.NATIVE
            ? address(this).balance
            : settlementToken.balanceOf(address(this));
    }

    /// @notice Registers an available label for one to five protocol years.
    function register(
        string calldata label,
        uint8 durationYears,
        address recipient,
        address referrer,
        uint256 expectedAmount,
        uint16 expectedReferralRewardBps
    ) external payable nonReentrant returns (uint256 tokenId) {
        if (registrationsPaused) revert RegistrationPaused();
        _requireSolvent();
        _validateRecipient(recipient);
        if (!isValidLabel(label)) revert InvalidLabel();
        if (reservedLabels[keccak256(bytes(label))]) revert NameReserved();
        _validateDuration(durationYears);

        tokenId = tokenIdFor(label);
        NameStatus previousStatus = statusOf(tokenId);
        if (previousStatus != NameStatus.UNREGISTERED && previousStatus != NameStatus.RELEASED) {
            revert NameNotAvailable();
        }
        if (referrer != address(0)) {
            if (referrer == msg.sender || referrer == recipient) revert InvalidReferrer();
            if (expectedReferralRewardBps != referralRewardBps) {
                revert ReferralRateChanged(expectedReferralRewardBps, referralRewardBps);
            }
        }

        uint256 requiredAmount = _quoteAmount(bytes(label).length, durationYears);
        if (expectedAmount != requiredAmount) revert PriceChanged(expectedAmount, requiredAmount);
        _collectPayment(msg.sender, requiredAmount);

        if (previousStatus == NameStatus.RELEASED) {
            _burn(tokenId);
            delete _labels[tokenId];
            delete expiresAt[tokenId];
            delete resolvedAddress[tokenId];
            delete _profiles[tokenId];
        }

        uint64 registeredAt = SafeCast.toUint64(block.timestamp);
        uint64 expiration = SafeCast.toUint64(block.timestamp + uint256(YEAR) * durationYears);
        _labels[tokenId] = label;
        expiresAt[tokenId] = expiration;
        resolvedAddress[tokenId] = recipient;
        delete _profiles[tokenId];

        if (referrer != address(0)) {
            uint256 reward = _mulBps(requiredAmount, referralRewardBps);
            if (reward != 0) {
                referralBalance[referrer] += reward;
                totalReferralLiability += reward;
            }
            emit ReferralAttributed(tokenId, referrer, msg.sender, reward);
        }

        _appendRecent(tokenId, label, recipient, registeredAt, expiration);
        _safeMint(recipient, tokenId);
        emit NameRegistered(
            tokenId, label, recipient, msg.sender, registeredAt, expiration, requiredAmount
        );
    }

    /// @notice Renews an existing name before its grace period closes.
    function renew(uint256 tokenId, uint8 durationYears, uint256 expectedAmount)
        external
        payable
        nonReentrant
    {
        _requireSolvent();
        if (_ownerOf(tokenId) == address(0)) revert NameDoesNotExist(tokenId);
        _validateDuration(durationYears);
        NameStatus status = statusOf(tokenId);
        if (status == NameStatus.RELEASED) revert RenewalWindowClosed();

        uint256 requiredAmount = _quoteAmount(bytes(_labels[tokenId]).length, durationYears);
        if (expectedAmount != requiredAmount) revert PriceChanged(expectedAmount, requiredAmount);
        _collectPayment(msg.sender, requiredAmount);

        uint64 oldExpiration = expiresAt[tokenId];
        if (status == NameStatus.GRACE && listings[tokenId].seller != address(0)) {
            _removeListing(tokenId, ListingCleanup.INVALIDATED);
        }
        uint256 base = oldExpiration > block.timestamp ? oldExpiration : block.timestamp;
        uint64 newExpiration = SafeCast.toUint64(base + uint256(YEAR) * durationYears);
        expiresAt[tokenId] = newExpiration;

        emit NameRenewed(tokenId, msg.sender, oldExpiration, newExpiration, requiredAmount);
        emit MetadataUpdate(tokenId);
    }

    /// @notice Updates forward resolution and the public profile in one transaction.
    function updateNameData(
        uint256 tokenId,
        address newResolvedAddress,
        Profile calldata newProfile
    ) external {
        address tokenOwner = _ownerOf(tokenId);
        if (tokenOwner == address(0)) revert NameDoesNotExist(tokenId);
        if (!_isAuthorized(tokenOwner, msg.sender, tokenId)) revert NotAuthorized();
        NameStatus status = statusOf(tokenId);
        if (status != NameStatus.ACTIVE && status != NameStatus.GRACE) revert NameNotActive();
        _validateProfile(newProfile);

        resolvedAddress[tokenId] = newResolvedAddress;
        _profiles[tokenId] = newProfile;
        if (
            hasPrimary[tokenOwner] && primaryTokenId[tokenOwner] == tokenId
                && newResolvedAddress != tokenOwner
        ) {
            _clearPrimary(tokenOwner);
        }

        emit NameDataUpdated(tokenId, tokenOwner, newResolvedAddress);
        emit MetadataUpdate(tokenId);
    }

    /// @notice Sets a forward-confirmed name as the caller's primary name.
    function setPrimaryName(uint256 tokenId) external {
        if (_ownerOf(tokenId) != msg.sender) revert NotAuthorized();
        NameStatus status = statusOf(tokenId);
        if (status != NameStatus.ACTIVE && status != NameStatus.GRACE) revert NameNotActive();
        if (resolvedAddress[tokenId] != msg.sender) revert PrimaryResolutionMismatch();
        if (hasPrimary[msg.sender] && primaryTokenId[msg.sender] == tokenId) {
            revert PrimaryAlreadySet();
        }

        hasPrimary[msg.sender] = true;
        primaryTokenId[msg.sender] = tokenId;
        emit PrimaryNameChanged(msg.sender, true, tokenId, fullName(tokenId));
    }

    /// @notice Clears the caller's stored primary name.
    function clearPrimaryName() external {
        if (!hasPrimary[msg.sender]) revert NoPrimaryName();
        _clearPrimary(msg.sender);
    }

    /// @notice Permissionlessly clears a stale or invalid primary-name mapping.
    function clearInvalidPrimary(address account) external {
        if (!hasPrimary[account]) revert NoPrimaryName();
        if (_isPrimaryValid(account)) revert PrimaryStillValid();
        _clearPrimary(account);
    }

    /// @notice Creates or updates a fixed-price listing in settlement base units.
    function listForSale(uint256 tokenId, uint256 price, uint16 expectedFeeBps) external {
        if (marketplacePaused) revert MarketplacePaused();
        _requireSolvent();
        if (_ownerOf(tokenId) != msg.sender) revert NotAuthorized();
        if (statusOf(tokenId) != NameStatus.ACTIVE) revert NameNotActive();
        if (price == 0) revert InvalidListingPrice();
        if (expectedFeeBps != marketplaceFeeBps) {
            revert MarketplaceFeeChanged(expectedFeeBps, marketplaceFeeBps);
        }

        if (_listingIndexPlusOne[tokenId] == 0) {
            _listingTokenIds.push(tokenId);
            _listingIndexPlusOne[tokenId] = _listingTokenIds.length;
        }
        listings[tokenId] = Listing({
            tokenId: tokenId,
            seller: msg.sender,
            price: price,
            listedAt: SafeCast.toUint64(block.timestamp),
            feeBps: marketplaceFeeBps
        });
        emit NameListed(tokenId, msg.sender, price, marketplaceFeeBps);
    }

    /// @notice Cancels the caller's listing even while the marketplace is paused.
    function cancelListing(uint256 tokenId) external {
        Listing memory listing = listings[tokenId];
        if (listing.seller == address(0)) revert ListingNotFound();
        if (listing.seller != msg.sender) revert SellerMismatch();
        _removeListing(tokenId, ListingCleanup.CANCELLED);
    }

    /// @notice Removes a listing whose seller or lifecycle state is no longer valid.
    function invalidateListing(uint256 tokenId) external {
        Listing memory listing = listings[tokenId];
        if (listing.seller == address(0)) revert ListingNotFound();
        bool valid = statusOf(tokenId) == NameStatus.ACTIVE && _ownerOf(tokenId) == listing.seller;
        if (valid) revert ListingNotInvalidatable();
        _removeListing(tokenId, ListingCleanup.INVALIDATED);
    }

    /// @notice Purchases an active fixed-price listing.
    function buyListedName(uint256 tokenId, uint256 expectedPrice) external payable nonReentrant {
        if (marketplacePaused) revert MarketplacePaused();
        _requireSolvent();
        Listing memory listing = listings[tokenId];
        if (listing.seller == address(0)) revert ListingNotFound();
        if (statusOf(tokenId) != NameStatus.ACTIVE) revert NameNotActive();
        if (_ownerOf(tokenId) != listing.seller) revert SellerMismatch();
        if (msg.sender == listing.seller) revert BuyerIsSeller();
        if (expectedPrice != listing.price) revert PriceChanged(expectedPrice, listing.price);

        _collectPayment(msg.sender, listing.price);
        _removeListing(tokenId, ListingCleanup.NONE);
        uint256 fee = _mulBps(listing.price, listing.feeBps);
        uint256 proceeds = listing.price - fee;
        sellerBalance[listing.seller] += proceeds;
        totalMarketplaceLiability += proceeds;

        _safeTransfer(listing.seller, msg.sender, tokenId);
        emit NameSold(tokenId, listing.seller, msg.sender, listing.price, fee);
    }

    /// @notice Claims the caller's referral rewards to a chosen recipient.
    function claimReferralRewards(address recipient) external nonReentrant {
        _validateRecipient(recipient);
        uint256 amount = referralBalance[msg.sender];
        if (amount == 0) revert NoReferralRewards();
        referralBalance[msg.sender] = 0;
        totalReferralLiability -= amount;
        _payout(recipient, amount);
        emit ReferralRewardClaimed(msg.sender, recipient, amount);
    }

    /// @notice Claims the caller's marketplace proceeds to a chosen recipient.
    function claimSaleProceeds(address recipient) external nonReentrant {
        _validateRecipient(recipient);
        uint256 amount = sellerBalance[msg.sender];
        if (amount == 0) revert NoSaleProceeds();
        sellerBalance[msg.sender] = 0;
        totalMarketplaceLiability -= amount;
        _payout(recipient, amount);
        emit SaleProceedsClaimed(msg.sender, recipient, amount);
    }

    /// @notice Updates the standard 4-32 character annual price in settlement base units.
    function setAnnualPrice(uint256 newAnnualPrice) external onlyOwner {
        if (newAnnualPrice == 0 || newAnnualPrice > MAX_ANNUAL_PRICE) {
            revert InvalidAnnualPrice();
        }
        uint256 previous = annualPrice;
        annualPrice = newAnnualPrice;
        emit AnnualPriceUpdated(previous, newAnnualPrice);
    }

    /// @notice Updates the bounded referral reward rate.
    function setReferralRewardBps(uint16 newRewardBps) external onlyOwner {
        if (newRewardBps > MAX_REFERRAL_REWARD_BPS) revert ReferralRateTooHigh();
        uint16 previous = referralRewardBps;
        referralRewardBps = newRewardBps;
        emit ReferralRewardBpsUpdated(previous, newRewardBps);
    }

    /// @notice Updates the fee applied only to newly created or refreshed listings.
    function setMarketplaceFeeBps(uint16 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_MARKETPLACE_FEE_BPS) revert MarketplaceFeeTooHigh();
        uint16 previous = marketplaceFeeBps;
        marketplaceFeeBps = newFeeBps;
        emit MarketplaceFeeBpsUpdated(previous, newFeeBps);
    }

    /// @notice Reserves or unreserves a bounded batch of canonical labels.
    function setReservedLabels(string[] calldata labels, bool reserved) external onlyOwner {
        if (labels.length > MAX_RESERVED_BATCH) revert BatchTooLarge();
        for (uint256 index; index < labels.length;) {
            string calldata label = labels[index];
            if (!isValidLabel(label)) revert InvalidLabel();
            bytes32 labelHash = keccak256(bytes(label));
            reservedLabels[labelHash] = reserved;
            emit ReservedLabelUpdated(labelHash, label, reserved);
            unchecked {
                ++index;
            }
        }
    }

    /// @notice Updates the fixed treasury payout address.
    function setTreasury(address newTreasury) external onlyOwner {
        _validateRecipient(newTreasury);
        address previous = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(previous, newTreasury);
    }

    /// @notice Updates the metadata base URI and signals collection-wide metadata refresh.
    function setMetadataBaseURI(string calldata newBaseURI) external onlyOwner {
        _validateMetadataURI(newBaseURI);
        string memory previous = metadataBaseURI;
        metadataBaseURI = newBaseURI;
        emit MetadataBaseURIUpdated(previous, newBaseURI);
        emit BatchMetadataUpdate(0, type(uint256).max);
    }

    /// @notice Pauses only new registrations.
    function setRegistrationsPaused(bool paused) external onlyOwner {
        registrationsPaused = paused;
        emit RegistrationsPauseChanged(paused);
    }

    /// @notice Pauses new listings and purchases while preserving cleanup and claims.
    function setMarketplacePaused(bool paused) external onlyOwner {
        marketplacePaused = paused;
        emit MarketplacePauseChanged(paused);
    }

    /// @notice Withdraws settlement surplus to the configured treasury.
    function withdrawTreasury() external onlyOwner nonReentrant {
        _requireSolvent();
        uint256 amount = treasuryAvailableBalance();
        if (amount == 0) revert InsufficientTreasuryBalance();
        _payout(treasury, amount);
        emit TreasuryWithdrawal(treasury, amount);
    }

    /// @notice Recovers an unrelated ERC-20 accidentally sent to this contract.
    function recoverUnsupportedERC20(address token) external onlyOwner nonReentrant {
        if (token == address(0)) revert ZeroAddress();
        if (settlementKind == SettlementKind.ERC20 && token == address(settlementToken)) {
            revert SettlementTokenRecoveryForbidden();
        }
        uint256 amount = IERC20(token).balanceOf(address(this));
        if (amount == 0) revert NoRecoverableBalance();
        IERC20(token).safeTransfer(treasury, amount);
        emit UnsupportedTokenRecovered(token, amount);
    }

    /// @notice Sweeps native currency that was forced into an ERC-20 settlement deployment.
    function sweepUnexpectedNative() external onlyOwner nonReentrant {
        if (settlementKind != SettlementKind.ERC20) revert InvalidSettlementConfig();
        uint256 amount = address(this).balance;
        if (amount == 0) revert NoRecoverableBalance();
        (bool success,) = payable(treasury).call{ value: amount }("");
        if (!success) revert TransferFailed();
        emit UnexpectedNativeSwept(amount);
    }

    /// @dev Ownership renunciation is disabled to keep required protocol administration explicit.
    function renounceOwnership() public pure override {
        revert OwnershipRenounceDisabled();
    }

    /// @inheritdoc ERC721
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Enumerable, IERC165)
        returns (bool)
    {
        return interfaceId == 0x49064906 || super.supportsInterface(interfaceId);
    }

    /// @dev Enforces lifecycle rules and resets owner-bound identity state on transfer.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721Enumerable)
        returns (address from)
    {
        address currentOwner = _ownerOf(tokenId);
        bool regularTransfer = currentOwner != address(0) && to != address(0);
        if (regularTransfer && statusOf(tokenId) == NameStatus.RELEASED) {
            revert ReleasedTokenLocked();
        }
        if (to == address(this)) revert SelfTransferToContractForbidden();

        from = super._update(to, tokenId, auth);
        if (from != address(0) && listings[tokenId].seller != address(0)) {
            _removeListing(tokenId, ListingCleanup.INVALIDATED);
        }
        if (from != address(0) && hasPrimary[from] && primaryTokenId[from] == tokenId) {
            _clearPrimary(from);
        }
        if (regularTransfer) {
            resolvedAddress[tokenId] = to;
            delete _profiles[tokenId];
            emit MetadataUpdate(tokenId);
        }
    }

    function _appendRecent(
        uint256 tokenId,
        string calldata label,
        address recipient,
        uint64 registeredAt,
        uint64 expiration
    ) internal {
        _recentRegistrations[_recentCursor] = RecentRegistration({
            tokenId: tokenId,
            label: label,
            owner: recipient,
            registeredAt: registeredAt,
            expiresAt: expiration
        });
        unchecked {
            ++_recentCursor;
            if (_recentCursor == RECENT_CAPACITY) _recentCursor = 0;
            if (_recentCount < RECENT_CAPACITY) ++_recentCount;
        }
    }

    function _removeListing(uint256 tokenId, ListingCleanup cleanup) internal {
        address seller = listings[tokenId].seller;
        uint256 index = _listingIndexPlusOne[tokenId] - 1;
        uint256 lastIndex = _listingTokenIds.length - 1;
        if (index != lastIndex) {
            uint256 movedTokenId = _listingTokenIds[lastIndex];
            _listingTokenIds[index] = movedTokenId;
            _listingIndexPlusOne[movedTokenId] = index + 1;
        }
        _listingTokenIds.pop();
        delete _listingIndexPlusOne[tokenId];
        delete listings[tokenId];

        if (cleanup == ListingCleanup.CANCELLED) {
            emit ListingCancelled(tokenId, seller);
        } else if (cleanup == ListingCleanup.INVALIDATED) {
            emit ListingInvalidated(tokenId, seller);
        }
    }

    function _collectPayment(address payer, uint256 amount) internal {
        if (settlementKind == SettlementKind.NATIVE) {
            if (msg.value != amount) revert IncorrectPayment(amount, msg.value);
            return;
        }
        if (msg.value != 0) revert UnexpectedNativeValue(msg.value);

        uint256 payerBefore = settlementToken.balanceOf(payer);
        uint256 contractBefore = settlementToken.balanceOf(address(this));
        settlementToken.safeTransferFrom(payer, address(this), amount);
        uint256 payerAfter = settlementToken.balanceOf(payer);
        uint256 contractAfter = settlementToken.balanceOf(address(this));
        _requireExactTransfer(amount, payerBefore, payerAfter, contractBefore, contractAfter);
    }

    function _payout(address recipient, uint256 amount) internal {
        if (settlementKind == SettlementKind.NATIVE) {
            (bool success,) = payable(recipient).call{ value: amount }("");
            if (!success) revert TransferFailed();
            return;
        }

        uint256 contractBefore = settlementToken.balanceOf(address(this));
        uint256 recipientBefore = settlementToken.balanceOf(recipient);
        settlementToken.safeTransfer(recipient, amount);
        uint256 contractAfter = settlementToken.balanceOf(address(this));
        uint256 recipientAfter = settlementToken.balanceOf(recipient);
        _requireExactTransfer(
            amount, contractBefore, contractAfter, recipientBefore, recipientAfter
        );
    }

    function _requireExactTransfer(
        uint256 expected,
        uint256 senderBefore,
        uint256 senderAfter,
        uint256 recipientBefore,
        uint256 recipientAfter
    ) internal pure {
        uint256 senderDelta;
        uint256 recipientDelta;
        unchecked {
            if (senderBefore >= senderAfter) senderDelta = senderBefore - senderAfter;
            if (recipientAfter >= recipientBefore) {
                recipientDelta = recipientAfter - recipientBefore;
            }
        }
        if (senderDelta != expected || recipientDelta != expected) {
            revert SettlementTransferMismatch(expected, senderDelta, recipientDelta);
        }
    }

    function _requireSolvent() internal view {
        uint256 balance = settlementBalance();
        if (settlementKind == SettlementKind.NATIVE) {
            unchecked {
                balance -= msg.value;
            }
        }
        uint256 liability = totalProtectedLiability();
        if (balance < liability) revert ProtocolInsolvent(balance, liability);
    }

    function _mulBps(uint256 amount, uint16 bps) internal pure returns (uint256) {
        uint256 whole = amount / BPS_DENOMINATOR;
        uint256 remainder = amount % BPS_DENOMINATOR;
        unchecked {
            return whole * bps + (remainder * bps) / BPS_DENOMINATOR;
        }
    }

    function _quoteAmount(uint256 labelLength, uint8 durationYears)
        internal
        view
        returns (uint256)
    {
        uint256 multiplier = 1;
        if (labelLength < 4) {
            unchecked {
                multiplier = (_shortNamePriceMultipliers >> ((labelLength - 1) * 8)) & 0xff;
            }
        }
        unchecked {
            return annualPrice * multiplier * durationYears;
        }
    }

    function _isPrimaryValid(address account) internal view returns (bool) {
        if (!hasPrimary[account]) return false;
        uint256 tokenId = primaryTokenId[account];
        if (_ownerOf(tokenId) != account) return false;
        NameStatus status = statusOf(tokenId);
        return (status == NameStatus.ACTIVE || status == NameStatus.GRACE)
            && resolvedAddress[tokenId] == account;
    }

    function _clearPrimary(address account) internal {
        hasPrimary[account] = false;
        primaryTokenId[account] = 0;
        emit PrimaryNameChanged(account, false, 0, "");
    }

    function _validateDuration(uint8 durationYears) internal pure {
        if (durationYears < MIN_DURATION_YEARS || durationYears > MAX_DURATION_YEARS) {
            revert InvalidDuration();
        }
    }

    function _validateRecipient(address recipient) internal view {
        if (recipient == address(0) || recipient == address(this)) revert InvalidRecipient();
    }

    function _validateMetadataURI(string memory uri) internal pure {
        bytes memory value = bytes(uri);
        if (value.length == 0 || value[value.length - 1] != "/") revert InvalidMetadataURI();
    }

    function _validateProfile(Profile calldata profile) internal pure {
        if (
            bytes(profile.displayName).length > 64 || bytes(profile.bio).length > 280
                || bytes(profile.avatar).length > 256 || bytes(profile.website).length > 256
                || bytes(profile.twitter).length > 64 || bytes(profile.github).length > 64
        ) revert FieldTooLong();
    }

    function _isValidSuffix(string memory suffix_) internal pure returns (bool) {
        bytes memory value = bytes(suffix_);
        if (value.length == 0 || value.length > MAX_SUFFIX_LENGTH) return false;
        for (uint256 index; index < value.length;) {
            bytes1 character = value[index];
            if (!((character >= "a" && character <= "z") || (character >= "0" && character <= "9")))
            {
                return false;
            }
            unchecked {
                ++index;
            }
        }
        return true;
    }

    /// @inheritdoc ERC721
    function _baseURI() internal view override returns (string memory) {
        return metadataBaseURI;
    }

    receive() external payable {
        revert UnexpectedNativeValue(msg.value);
    }

    fallback() external payable {
        revert UnexpectedNativeValue(msg.value);
    }
}
