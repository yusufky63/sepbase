// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import { ChainNameMarketplaceV3 } from "./ChainNameMarketplaceV3.sol";
import { IChainNameRegistryV3 } from "./interfaces/IChainNameRegistryV3.sol";

/// @title Chain Name Market Lens v3
/// @notice Bounded, indexer-free pagination over marketplace enumerable storage.
/// @dev Callers should pin a single block while paging because permissionless swap-pop cleanup can
///      reorder raw indices in later blocks. Each call scans at most 100 entries and returns its
/// next raw cursor even when stale records were filtered.
contract ChainNameMarketLensV3 {
    string public constant VERSION = "3.0.0";
    uint8 internal constant MAX_PAGE_SIZE = 50;
    uint8 internal constant MAX_PAGE_SCAN = 100;

    struct ListingPageItem {
        uint256 tokenId;
        ChainNameMarketplaceV3.Listing listing;
    }

    struct OfferPageItem {
        bytes32 offerId;
        ChainNameMarketplaceV3.Offer offer;
        ChainNameMarketplaceV3.OfferState state;
        bool stale;
    }

    struct AuctionPageItem {
        uint256 tokenId;
        ChainNameMarketplaceV3.Auction auction;
    }

    error InvalidMarketplace();
    error InvalidPage(uint256 cursor, uint256 limit);

    ChainNameMarketplaceV3 public immutable marketplace;
    IChainNameRegistryV3 public immutable registry;

    constructor(address marketplace_) {
        if (marketplace_ == address(0) || marketplace_.code.length == 0) {
            revert InvalidMarketplace();
        }
        marketplace = ChainNameMarketplaceV3(payable(marketplace_));
        registry = ChainNameMarketplaceV3(payable(marketplace_)).registry();
    }

    function getListings(uint256 cursor, uint256 limit)
        external
        view
        returns (ListingPageItem[] memory items, uint256 nextCursor)
    {
        uint256 length = marketplace.listingEntryCount();
        _validatePage(cursor, limit, length);
        items = new ListingPageItem[](limit);
        uint256 count;
        uint256 scanned;
        nextCursor = cursor;
        while (nextCursor < length && count < limit && scanned < MAX_PAGE_SCAN) {
            (uint256 tokenId, ChainNameMarketplaceV3.Listing memory listing) =
                marketplace.listingEntryAt(nextCursor);
            if (_listingActive(tokenId, listing)) {
                items[count++] = ListingPageItem({ tokenId: tokenId, listing: listing });
            }
            unchecked {
                ++nextCursor;
                ++scanned;
            }
        }
        _truncate(items, count);
    }

    function getOffers(uint256 tokenId, uint256 cursor, uint256 limit)
        external
        view
        returns (OfferPageItem[] memory items, uint256 nextCursor)
    {
        uint256 length = marketplace.offerEntryCount(tokenId);
        _validatePage(cursor, limit, length);
        items = new OfferPageItem[](limit);
        uint256 count;
        uint256 scanned;
        nextCursor = cursor;
        while (nextCursor < length && count < limit && scanned < MAX_PAGE_SCAN) {
            (bytes32 offerId, ChainNameMarketplaceV3.Offer memory offer) =
                marketplace.offerEntryAt(tokenId, nextCursor);
            if (_offerActive(offer)) {
                items[count++] = OfferPageItem({
                    offerId: offerId,
                    offer: offer,
                    state: ChainNameMarketplaceV3.OfferState.ACTIVE,
                    stale: false
                });
            }
            unchecked {
                ++nextCursor;
                ++scanned;
            }
        }
        _truncate(items, count);
    }

    /// @notice Stable global offer history including ACTIVE, REFUNDED, and ACCEPTED records.
    function getGlobalOffers(uint256 cursor, uint256 limit, bool includeTerminal)
        external
        view
        returns (OfferPageItem[] memory items, uint256 nextCursor)
    {
        return _getScopedOffers(cursor, limit, includeTerminal, 0, address(0));
    }

    function getBuyerOffers(address buyer, uint256 cursor, uint256 limit, bool includeTerminal)
        external
        view
        returns (OfferPageItem[] memory items, uint256 nextCursor)
    {
        return _getScopedOffers(cursor, limit, includeTerminal, 1, buyer);
    }

    function getOwnerOffers(address tokenOwner, uint256 cursor, uint256 limit, bool includeTerminal)
        external
        view
        returns (OfferPageItem[] memory items, uint256 nextCursor)
    {
        return _getScopedOffers(cursor, limit, includeTerminal, 2, tokenOwner);
    }

    function getAuctions(uint256 cursor, uint256 limit)
        external
        view
        returns (AuctionPageItem[] memory items, uint256 nextCursor)
    {
        uint256 length = marketplace.auctionEntryCount();
        _validatePage(cursor, limit, length);
        items = new AuctionPageItem[](limit);
        uint256 count;
        uint256 scanned;
        nextCursor = cursor;
        while (nextCursor < length && count < limit && scanned < MAX_PAGE_SCAN) {
            (uint256 tokenId, ChainNameMarketplaceV3.Auction memory auction) =
                marketplace.auctionEntryAt(nextCursor);
            if (_auctionActive(tokenId, auction)) {
                items[count++] = AuctionPageItem({ tokenId: tokenId, auction: auction });
            }
            unchecked {
                ++nextCursor;
                ++scanned;
            }
        }
        _truncate(items, count);
    }

    function _listingActive(uint256 tokenId, ChainNameMarketplaceV3.Listing memory listing)
        internal
        view
        returns (bool)
    {
        if (listing.seller == address(0) || block.timestamp > listing.deadline) {
            return false;
        }
        if (registry.statusOf(tokenId) != IChainNameRegistryV3.NameStatus.ACTIVE) return false;
        try registry.ownerOf(tokenId) returns (address tokenOwner) {
            if (tokenOwner != listing.seller) return false;
        } catch {
            return false;
        }
        if (registry.transferNonce(tokenId) != listing.transferNonce) return false;
        return registry.getApproved(tokenId) == address(marketplace)
            || registry.isApprovedForAll(listing.seller, address(marketplace));
    }

    function _offerActive(ChainNameMarketplaceV3.Offer memory offer) internal view returns (bool) {
        if (offer.buyer == address(0) || block.timestamp > offer.deadline) return false;
        if (registry.statusOf(offer.tokenId) != IChainNameRegistryV3.NameStatus.ACTIVE) {
            return false;
        }
        try registry.ownerOf(offer.tokenId) returns (address tokenOwner) {
            if (tokenOwner != offer.ownerSnapshot) return false;
        } catch {
            return false;
        }
        return registry.transferNonce(offer.tokenId) == offer.transferNonce;
    }

    function _auctionActive(uint256 tokenId, ChainNameMarketplaceV3.Auction memory auction)
        internal
        view
        returns (bool)
    {
        if (auction.seller == address(0)) return false;
        if (registry.statusOf(tokenId) != IChainNameRegistryV3.NameStatus.ACTIVE) return false;
        try registry.ownerOf(tokenId) returns (address tokenOwner) {
            return tokenOwner == address(marketplace)
                && registry.transferNonce(tokenId) == auction.transferNonce;
        } catch {
            return false;
        }
    }

    function _getScopedOffers(
        uint256 cursor,
        uint256 limit,
        bool includeTerminal,
        uint8 scope,
        address account
    ) internal view returns (OfferPageItem[] memory items, uint256 nextCursor) {
        uint256 length = marketplace.globalOfferEntryCount();
        _validatePage(cursor, limit, length);
        items = new OfferPageItem[](limit);
        uint256 count;
        uint256 scanned;
        nextCursor = cursor;
        while (nextCursor < length && count < limit && scanned < MAX_PAGE_SCAN) {
            (bytes32 offerId, ChainNameMarketplaceV3.Offer memory offer) =
                marketplace.globalOfferEntryAt(nextCursor);
            ChainNameMarketplaceV3.OfferState state = marketplace.offerStates(offerId);
            bool matches = scope == 0 || (scope == 1 && offer.buyer == account)
                || (scope == 2 && offer.ownerSnapshot == account);
            bool stale = state == ChainNameMarketplaceV3.OfferState.ACTIVE && !_offerActive(offer);
            if (
                matches
                    && (state == ChainNameMarketplaceV3.OfferState.ACTIVE
                        || (includeTerminal && state != ChainNameMarketplaceV3.OfferState.NONE))
            ) {
                items[count++] = OfferPageItem({
                    offerId: offerId, offer: offer, state: state, stale: stale
                });
            }
            unchecked {
                ++nextCursor;
                ++scanned;
            }
        }
        _truncate(items, count);
    }

    function _validatePage(uint256 cursor, uint256 limit, uint256 length) internal pure {
        if (cursor > length || limit == 0 || limit > MAX_PAGE_SIZE) {
            revert InvalidPage(cursor, limit);
        }
    }

    function _truncate(ListingPageItem[] memory items, uint256 count) internal pure {
        assembly ("memory-safe") {
            mstore(items, count)
        }
    }

    function _truncate(OfferPageItem[] memory items, uint256 count) internal pure {
        assembly ("memory-safe") {
            mstore(items, count)
        }
    }

    function _truncate(AuctionPageItem[] memory items, uint256 count) internal pure {
        assembly ("memory-safe") {
            mstore(items, count)
        }
    }
}
