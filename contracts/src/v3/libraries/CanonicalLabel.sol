// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

/// @notice Strict UTF-8 and display-safety validation for an off-chain normalized label.
/// @dev Full ENSIP-15 normalization is deliberately performed before the transaction. The contract
///      binds identity to the exact normalized UTF-8 bytes and rejects malformed, invisible, bidi,
///      dotted, control, and non-canonical ASCII forms. It admits a context-bounded ZWJ so exact
///      ENSIP-15-normalized emoji sequences remain usable. This filter is defense-in-depth, not an
///      on-chain implementation or proof of the full ENSIP-15 table/profile.
library CanonicalLabel {
    function validate(string memory label, uint256 maxBytes, uint256 maxCodepoints)
        internal
        pure
        returns (bool valid, uint16 codepoints)
    {
        bytes memory value = bytes(label);
        if (value.length == 0 || value.length > maxBytes) return (false, 0);

        uint256 index;
        bool previousHyphen;
        uint32 previousCodepoint;
        while (index < value.length) {
            uint8 first = uint8(value[index]);
            uint256 width;
            uint32 codepoint;

            if (first < 0x80) {
                width = 1;
                codepoint = first;
                bool hyphen = first == 0x2d;
                bool lowercase = first >= 0x61 && first <= 0x7a;
                bool digit = first >= 0x30 && first <= 0x39;
                if (!(lowercase || digit || hyphen)) return (false, 0);
                if (hyphen && (index == 0 || index + 1 == value.length || previousHyphen)) {
                    return (false, 0);
                }
                previousHyphen = hyphen;
            } else {
                previousHyphen = false;
                if (first >= 0xc2 && first <= 0xdf) {
                    width = 2;
                    codepoint = first & 0x1f;
                } else if (first >= 0xe0 && first <= 0xef) {
                    width = 3;
                    codepoint = first & 0x0f;
                } else if (first >= 0xf0 && first <= 0xf4) {
                    width = 4;
                    codepoint = first & 0x07;
                } else {
                    return (false, 0);
                }
                if (index + width > value.length) return (false, 0);
                for (uint256 continuation = 1; continuation < width;) {
                    uint8 next = uint8(value[index + continuation]);
                    if (next < 0x80 || next > 0xbf) return (false, 0);
                    codepoint = (codepoint << 6) | (next & 0x3f);
                    unchecked {
                        ++continuation;
                    }
                }
                if (
                    (width == 2 && codepoint < 0x80) || (width == 3 && codepoint < 0x800)
                        || (width == 4 && codepoint < 0x10000) || codepoint > 0x10ffff
                        || (codepoint >= 0xd800 && codepoint <= 0xdfff)
                ) return (false, 0);
                if (
                    codepoint == 0x200d
                        && (codepoints == 0
                            || previousCodepoint < 0x80
                            || previousCodepoint == 0x200d
                            || index + width == value.length
                            || uint8(value[index + width]) < 0xc2)
                ) return (false, 0);
                if (_unsafeDisplayCodepoint(codepoint)) return (false, 0);
            }

            previousCodepoint = codepoint;
            unchecked {
                ++codepoints;
                index += width;
            }
            if (codepoints > maxCodepoints) return (false, 0);
        }
        return (true, codepoints);
    }

    function _unsafeDisplayCodepoint(uint32 codepoint) private pure returns (bool) {
        return (codepoint >= 0x80 && codepoint <= 0x9f) || codepoint == 0x200b
            || codepoint == 0x200c || (codepoint >= 0x202a && codepoint <= 0x202e)
            || (codepoint >= 0x2060 && codepoint <= 0x2069)
            || (codepoint >= 0xfe00 && codepoint <= 0xfe0f) || codepoint == 0x3002
            || codepoint == 0xff0e || codepoint == 0xff61;
    }
}
