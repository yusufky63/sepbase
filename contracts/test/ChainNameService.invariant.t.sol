// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import { StdInvariant } from "forge-std/StdInvariant.sol";
import { Test } from "forge-std/Test.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { ChainNameService } from "../src/ChainNameService.sol";

contract ChainNameServiceHandler is Test, IERC721Receiver {
    ChainNameService public immutable service;
    uint256 public immutable annualPrice;
    uint256 private nonce;

    constructor(ChainNameService service_, uint256 annualPrice_) {
        service = service_;
        annualPrice = annualPrice_;
        vm.deal(address(this), 10_000 ether);
    }

    function register(uint64 seed, uint8 rawDuration) external {
        uint8 duration = uint8(bound(rawDuration, 1, 5));
        string memory label = string.concat("name-", vm.toString(seed), "-", vm.toString(nonce++));
        uint256 amount = annualPrice * duration;
        service.register{ value: amount }(label, duration, address(this), address(0), amount, 0);
    }

    function renew(uint8 rawDuration) external {
        uint256 balance = service.balanceOf(address(this));
        if (balance == 0) return;
        uint8 duration = uint8(bound(rawDuration, 1, 5));
        uint256 tokenId = service.tokenOfOwnerByIndex(address(this), 0);
        if (service.statusOf(tokenId) == ChainNameService.NameStatus.RELEASED) return;
        uint256 amount = annualPrice * duration;
        service.renew{ value: amount }(tokenId, duration, amount);
    }

    function list(uint96 rawPrice) external {
        uint256 balance = service.balanceOf(address(this));
        if (balance == 0) return;
        uint256 tokenId = service.tokenOfOwnerByIndex(address(this), 0);
        if (service.statusOf(tokenId) != ChainNameService.NameStatus.ACTIVE) return;
        service.listForSale(tokenId, bound(uint256(rawPrice), 1, type(uint96).max), 0);
    }

    function cancel() external {
        (ChainNameService.Listing[] memory page,) = service.getListings(0, 1);
        if (page.length == 0 || page[0].seller != address(this)) return;
        service.cancelListing(page[0].tokenId);
    }

    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return IERC721Receiver.onERC721Received.selector;
    }
}

contract ChainNameServiceInvariantTest is StdInvariant, Test {
    uint256 private constant PRICE = 500_000_000_000_000;
    ChainNameService private service;
    ChainNameServiceHandler private handler;

    function setUp() public {
        service = new ChainNameService(
            "Sepbase Names",
            "SEPBASE",
            "sepbase",
            address(this),
            address(this),
            30 days,
            ChainNameService.SettlementKind.NATIVE,
            address(0),
            PRICE,
            uint24(100 | (25 << 8) | (5 << 16)),
            1000,
            0,
            "http://localhost:3000/api/metadata/"
        );
        handler = new ChainNameServiceHandler(service, PRICE);
        targetContract(address(handler));
    }

    function invariant_ProtectedLiabilityNeverExceedsSettlementBalance() public view {
        assertLe(service.totalProtectedLiability(), service.settlementBalance());
        assertTrue(service.isSolvent());
    }

    function invariant_AllMintedNamesRemainEnumerated() public view {
        assertEq(service.balanceOf(address(handler)), service.totalSupply());
        (, uint256 listingTotal) = service.getListings(0, 1);
        assertLe(listingTotal, service.totalSupply());
    }

    function invariant_RecentQueryRemainsBounded() public view {
        assertLe(service.getRecentRegistrations(20).length, 20);
    }
}
