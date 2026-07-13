// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import { Test } from "forge-std/Test.sol";
import { CanonicalLabel } from "../src/v3/libraries/CanonicalLabel.sol";

contract CanonicalLabelHarness {
    function validate(string calldata label) external pure returns (bool valid, uint16 codepoints) {
        return CanonicalLabel.validate(label, 96, 32);
    }
}

contract V3CanonicalFuzzTest is Test {
    CanonicalLabelHarness internal harness = new CanonicalLabelHarness();

    function testFuzz_CanonicalAsciiLabelsBindExactBytes(bytes32 entropy, uint8 rawLength)
        public
        view
    {
        uint256 length = bound(rawLength, 1, 32);
        bytes memory alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
        bytes memory label = new bytes(length);
        for (uint256 index; index < length;) {
            label[index] = alphabet[uint8(entropy[index]) % alphabet.length];
            unchecked {
                ++index;
            }
        }
        (bool valid, uint16 codepoints) = harness.validate(string(label));
        assertTrue(valid);
        assertEq(codepoints, length);
        assertEq(keccak256(bytes(string(label))), keccak256(label));
    }

    function testFuzz_InvalidUtf8LeadingContinuationIsRejected(uint8 rawFirst, bytes32 tail)
        public
        view
    {
        uint8 first = uint8(bound(rawFirst, 0x80, 0xc1));
        bytes memory value = new bytes(5);
        value[0] = bytes1(first);
        value[1] = tail[0];
        value[2] = tail[1];
        value[3] = tail[2];
        value[4] = tail[3];
        (bool valid,) = harness.validate(string(value));
        assertFalse(valid);
    }

    function testFuzz_UnsafeJoinerNeedsNonAsciiNeighbors(uint8 asciiBefore, uint8 asciiAfter)
        public
        view
    {
        bytes memory value = bytes.concat(
            bytes1(uint8(0x61 + (asciiBefore % 26))),
            hex"e2808d",
            bytes1(uint8(0x61 + (asciiAfter % 26)))
        );
        (bool valid,) = harness.validate(string(value));
        assertFalse(valid);
    }
}
