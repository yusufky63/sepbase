// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { SignatureChecker } from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

import { CanonicalLabel } from "./libraries/CanonicalLabel.sol";
import { IChainNameRegistryV3 } from "./interfaces/IChainNameRegistryV3.sol";
import { IChainNameResolverWriterV3 } from "./interfaces/IChainNameResolverWriterV3.sol";

/// @title Chain Name Registrar Controller v3
/// @notice Commit-reveal, registration pricing, immutable settlement, and referral accounting.
/// @dev The commitment binds the exact normalized node and resolver initialization hash. ENSIP-15
///      transformation itself is deliberately performed by clients pinned to the registry's
/// published normalization profile; this contract accepts only the exact bytes the user reveals and
/// never
///      silently transforms display text.
contract ChainNameControllerV3 is Ownable2Step, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    string public constant VERSION = "3.0.0";
    uint64 internal constant YEAR = 365 days;
    uint8 internal constant MIN_DURATION_YEARS = 1;
    uint8 internal constant MAX_DURATION_YEARS = 5;
    uint8 internal constant MAX_LABEL_CODEPOINTS = 32;
    uint8 internal constant MAX_LABEL_BYTES = 96;
    uint16 internal constant BPS_DENOMINATOR = 10_000;
    uint16 internal constant MAX_REFERRAL_REWARD_BPS = 2000;
    uint64 internal constant MAX_COMMITMENT_WINDOW = 7 days;
    uint64 internal constant MAX_ATTESTATION_WINDOW = 7 days;
    uint256 internal constant MAX_ANNUAL_PRICE =
        type(uint256).max / (uint256(type(uint8).max) * MAX_DURATION_YEARS);

    enum SettlementKind {
        NATIVE,
        ERC20
    }

    bytes32 public constant NORMALIZATION_ATTESTATION_TYPEHASH = keccak256(
        "NormalizationAttestation(uint256 chainId,address controller,bytes32 normalizationProfileHash,bytes32 labelHash,address recipient,uint64 validUntil)"
    );

    struct ResolverInitialization {
        address addressRecord;
        string[] textKeys;
        string[] textValues;
    }

    struct RegistrationRequest {
        string label;
        address recipient;
        uint8 durationYears;
        address referrer;
        bytes32 secret;
        bytes32 resolverInitializationHash;
        bytes32 normalizationAttestationHash;
        uint256 expectedAmount;
        uint16 expectedReferralRewardBps;
    }

    struct NormalizationAttestation {
        uint64 validUntil;
        bytes signature;
    }

    error InvalidRegistry();
    error InvalidResolver();
    error InvalidLabel();
    error InvalidDuration();
    error InvalidCommitmentWindow();
    error InvalidAnnualPrice();
    error InvalidSettlementConfig();
    error InvalidResolverInitialization();
    error InvalidNormalizationAttestor();
    error InvalidNormalizationAttestation();
    error NormalizationAttestationExpired(uint64 validUntil);
    error ZeroAddress();
    error InvalidRecipient();
    error RegistrationPaused();
    error RenewalWindowClosed();
    error InvalidReferrer();
    error ReferralRateTooHigh();
    error ReferralRateChanged(uint16 expected, uint16 actual);
    error PriceChanged(uint256 expected, uint256 actual);
    error CommitmentExists(uint64 committedAt);
    error CommitmentMissing();
    error CommitmentConsumed();
    error CommitmentTooNew(uint64 validAfter);
    error CommitmentExpired(uint64 expiredAt);
    error IncorrectPayment(uint256 expected, uint256 received);
    error UnexpectedNativeValue(uint256 received);
    error SettlementTransferMismatch(uint256 expected, uint256 senderDelta, uint256 recipientDelta);
    error SettlementTokenRecoveryForbidden();
    error NoRecoverableBalance();
    error NoReferralRewards();
    error InsufficientTreasuryBalance();
    error ProtocolInsolvent(uint256 balance, uint256 liability);
    error TransferFailed();

    event SettlementConfigured(SettlementKind indexed kind, address indexed token);
    event CommitmentCreated(
        bytes32 indexed commitment, address indexed committer, uint64 committedAt
    );
    event CommitmentConsumedEvent(bytes32 indexed commitment, address indexed payer);
    event RegistrationCompleted(
        uint256 indexed tokenId,
        bytes32 indexed node,
        address indexed recipient,
        address payer,
        uint64 expiration,
        uint256 amount,
        bytes32 resolverInitializationHash
    );
    event RenewalCompleted(
        uint256 indexed tokenId,
        address indexed payer,
        uint64 previousExpiry,
        uint64 newExpiry,
        uint256 amount
    );
    event ReferralAttributed(
        uint256 indexed tokenId, address indexed referrer, address indexed payer, uint256 amount
    );
    event ReferralRewardClaimed(
        address indexed referrer, address indexed recipient, uint256 amount
    );
    event AnnualPriceChanged(uint256 previousPrice, uint256 newPrice);
    event ReferralRewardBpsChanged(uint16 previousBps, uint16 newBps);
    event TreasuryChanged(address indexed previousTreasury, address indexed newTreasury);
    event RegistrationPauseChanged(bool paused);
    event TreasuryWithdrawal(address indexed treasury, uint256 amount);
    event UnsupportedTokenRecovered(address indexed token, uint256 amount);
    event UnexpectedNativeSwept(uint256 amount);

    IChainNameRegistryV3 public immutable registry;
    IChainNameResolverWriterV3 public immutable resolver;
    address public immutable normalizationAttestor;
    uint64 public immutable maxNormalizationAttestationValidity;
    uint64 public immutable minCommitmentAge;
    uint64 public immutable maxCommitmentAge;
    SettlementKind public immutable settlementKind;
    IERC20 public immutable settlementToken;
    uint24 private immutable _shortNamePriceMultipliers;

    address public treasury;
    uint256 public annualPrice;
    uint16 public referralRewardBps;
    uint256 public totalReferralLiability;
    bool public registrationsPaused;

    mapping(bytes32 commitment => uint64 committedAt) public commitments;
    mapping(bytes32 commitment => bool consumed) public commitmentConsumed;
    mapping(address referrer => uint256 amount) public referralBalance;

    constructor(
        address registry_,
        address resolver_,
        address initialOwner,
        address treasury_,
        uint64 minCommitmentAge_,
        uint64 maxCommitmentAge_,
        address normalizationAttestor_,
        uint64 maxNormalizationAttestationValidity_,
        SettlementKind settlementKind_,
        address settlementToken_,
        uint256 annualPrice_,
        uint24 shortNamePriceMultipliers_,
        uint16 referralRewardBps_
    ) Ownable(initialOwner) EIP712("ChainNameControllerV3", "3") {
        if (registry_ == address(0) || registry_.code.length == 0) {
            revert InvalidRegistry();
        }
        if (resolver_ == address(0) || resolver_.code.length == 0) revert InvalidResolver();
        if (initialOwner == address(0) || initialOwner == address(this)) revert ZeroAddress();
        if (treasury_ == address(0) || treasury_ == address(this)) revert ZeroAddress();
        if (
            minCommitmentAge_ == 0 || maxCommitmentAge_ <= minCommitmentAge_
                || maxCommitmentAge_ > MAX_COMMITMENT_WINDOW
        ) revert InvalidCommitmentWindow();
        if (normalizationAttestor_ == address(0)) revert InvalidNormalizationAttestor();
        if (
            maxNormalizationAttestationValidity_ == 0
                || maxNormalizationAttestationValidity_ > MAX_ATTESTATION_WINDOW
        ) revert InvalidNormalizationAttestation();
        if (annualPrice_ == 0 || annualPrice_ > MAX_ANNUAL_PRICE) revert InvalidAnnualPrice();
        uint256 oneCharacterMultiplier = shortNamePriceMultipliers_ & 0xff;
        uint256 twoCharacterMultiplier = (shortNamePriceMultipliers_ >> 8) & 0xff;
        uint256 threeCharacterMultiplier = (shortNamePriceMultipliers_ >> 16) & 0xff;
        if (
            threeCharacterMultiplier == 0 || twoCharacterMultiplier < threeCharacterMultiplier
                || oneCharacterMultiplier < twoCharacterMultiplier
        ) revert InvalidAnnualPrice();
        if (referralRewardBps_ > MAX_REFERRAL_REWARD_BPS) revert ReferralRateTooHigh();
        if (settlementKind_ == SettlementKind.NATIVE) {
            if (settlementToken_ != address(0)) revert InvalidSettlementConfig();
        } else if (settlementToken_ == address(0) || settlementToken_.code.length == 0) {
            revert InvalidSettlementConfig();
        }

        registry = IChainNameRegistryV3(registry_);
        resolver = IChainNameResolverWriterV3(resolver_);
        treasury = treasury_;
        minCommitmentAge = minCommitmentAge_;
        maxCommitmentAge = maxCommitmentAge_;
        normalizationAttestor = normalizationAttestor_;
        maxNormalizationAttestationValidity = maxNormalizationAttestationValidity_;
        settlementKind = settlementKind_;
        settlementToken = IERC20(settlementToken_);
        annualPrice = annualPrice_;
        _shortNamePriceMultipliers = shortNamePriceMultipliers_;
        referralRewardBps = referralRewardBps_;
        emit SettlementConfigured(settlementKind_, settlementToken_);
    }

    function isValidLabel(string calldata label) public pure returns (bool) {
        (bool valid,) = CanonicalLabel.validate(label, MAX_LABEL_BYTES, MAX_LABEL_CODEPOINTS);
        return valid;
    }

    function hashResolverInitialization(ResolverInitialization calldata initialization)
        public
        pure
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                initialization.addressRecord, initialization.textKeys, initialization.textValues
            )
        );
    }

    function hashNormalizationAttestation(NormalizationAttestation calldata attestation)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(attestation.validUntil, keccak256(attestation.signature)));
    }

    function normalizationAttestationDigest(bytes32 labelHash, address recipient, uint64 validUntil)
        public
        view
        returns (bytes32)
    {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    NORMALIZATION_ATTESTATION_TYPEHASH,
                    block.chainid,
                    address(this),
                    registry.normalizationProfileHash(),
                    labelHash,
                    recipient,
                    validUntil
                )
            )
        );
    }

    function makeCommitment(
        bytes32 node,
        address payer,
        address recipient,
        uint8 durationYears,
        bytes32 resolverInitializationHash,
        bytes32 normalizationAttestationHash,
        address referrer,
        bytes32 secret,
        uint256 expectedAmount,
        uint16 expectedReferralRewardBps
    ) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                block.chainid,
                address(this),
                node,
                payer,
                recipient,
                durationYears,
                resolverInitializationHash,
                normalizationAttestationHash,
                referrer,
                settlementKind,
                address(settlementToken),
                expectedAmount,
                expectedReferralRewardBps,
                secret
            )
        );
    }

    /// @notice Records a commitment exactly once. Expired hashes cannot be recycled; use a new
    /// secret.
    function commit(bytes32 commitment) external {
        if (registrationsPaused) revert RegistrationPaused();
        uint64 existing = commitments[commitment];
        if (existing != 0) revert CommitmentExists(existing);
        uint64 committedAt = SafeCast.toUint64(block.timestamp);
        commitments[commitment] = committedAt;
        emit CommitmentCreated(commitment, msg.sender, committedAt);
    }

    function quote(string calldata label, uint8 durationYears) public view returns (uint256) {
        (bool valid, uint16 codepoints) =
            CanonicalLabel.validate(label, MAX_LABEL_BYTES, MAX_LABEL_CODEPOINTS);
        if (!valid) revert InvalidLabel();
        _validateDuration(durationYears);
        return _quoteAmount(codepoints, durationYears);
    }

    /// @notice Reveals exact normalized bytes and atomically initializes committed resolver
    /// records.
    function register(
        RegistrationRequest calldata request,
        ResolverInitialization calldata initialization,
        NormalizationAttestation calldata attestation
    ) external payable nonReentrant returns (uint256 tokenId, bytes32 node) {
        if (registrationsPaused) revert RegistrationPaused();
        _requireSolvent();
        _validateRecipient(request.recipient);
        (bool valid, uint16 codepoints) =
            CanonicalLabel.validate(request.label, MAX_LABEL_BYTES, MAX_LABEL_CODEPOINTS);
        if (!valid) revert InvalidLabel();
        _validateDuration(request.durationYears);
        if (initialization.textKeys.length != initialization.textValues.length) {
            revert InvalidResolverInitialization();
        }
        bytes32 initializationHash = hashResolverInitialization(initialization);
        if (initializationHash != request.resolverInitializationHash) {
            revert InvalidResolverInitialization();
        }
        _validateReferral(request.referrer, request.recipient, request.expectedReferralRewardBps);

        bytes32 labelHash = keccak256(bytes(request.label));
        bytes32 attestationHash = hashNormalizationAttestation(attestation);
        if (attestationHash != request.normalizationAttestationHash) {
            revert InvalidNormalizationAttestation();
        }
        node = registry.nodeForLabelHash(labelHash);
        uint256 requiredAmount = _quoteAmount(codepoints, request.durationYears);
        if (request.expectedAmount != requiredAmount) {
            revert PriceChanged(request.expectedAmount, requiredAmount);
        }
        bytes32 commitment = makeCommitment(
            node,
            msg.sender,
            request.recipient,
            request.durationYears,
            request.resolverInitializationHash,
            request.normalizationAttestationHash,
            request.referrer,
            request.secret,
            request.expectedAmount,
            request.expectedReferralRewardBps
        );
        _consumeCommitment(commitment);
        _verifyNormalizationAttestation(labelHash, request.recipient, attestation);
        _collectPayment(msg.sender, requiredAmount);

        uint64 expiration =
            SafeCast.toUint64(block.timestamp + uint256(YEAR) * request.durationYears);
        (tokenId, node) =
            registry.registerFromController(request.label, request.recipient, expiration);
        resolver.initializeRecords(
            tokenId,
            initialization.addressRecord,
            initialization.textKeys,
            initialization.textValues
        );
        _creditReferral(tokenId, request.referrer, msg.sender, requiredAmount);
        emit RegistrationCompleted(
            tokenId,
            node,
            request.recipient,
            msg.sender,
            expiration,
            requiredAmount,
            initializationHash
        );
    }

    /// @notice Renews without creating a referral reward, as required by the v3 user contract.
    function renew(uint256 tokenId, uint8 durationYears, uint256 expectedAmount)
        external
        payable
        nonReentrant
    {
        _requireSolvent();
        _validateDuration(durationYears);
        IChainNameRegistryV3.NameStatus status = registry.statusOf(tokenId);
        if (
            status != IChainNameRegistryV3.NameStatus.ACTIVE
                && status != IChainNameRegistryV3.NameStatus.GRACE
        ) {
            revert RenewalWindowClosed();
        }
        string memory label = registry.labelOf(tokenId);
        (bool valid, uint16 codepoints) =
            CanonicalLabel.validate(label, MAX_LABEL_BYTES, MAX_LABEL_CODEPOINTS);
        if (!valid) revert InvalidLabel();
        uint256 requiredAmount = _quoteAmount(codepoints, durationYears);
        if (expectedAmount != requiredAmount) revert PriceChanged(expectedAmount, requiredAmount);
        _collectPayment(msg.sender, requiredAmount);
        uint64 previous = registry.expiresAt(tokenId);
        uint256 base = previous > block.timestamp ? previous : block.timestamp;
        uint64 expiration = SafeCast.toUint64(base + uint256(YEAR) * durationYears);
        registry.renewFromController(tokenId, expiration);
        emit RenewalCompleted(tokenId, msg.sender, previous, expiration, requiredAmount);
    }

    function claimReferralRewards(address recipient) external nonReentrant {
        _validateRecipient(recipient);
        uint256 amount = referralBalance[msg.sender];
        if (amount == 0) revert NoReferralRewards();
        referralBalance[msg.sender] = 0;
        totalReferralLiability -= amount;
        _payout(recipient, amount);
        emit ReferralRewardClaimed(msg.sender, recipient, amount);
    }

    function protectedBalance() public view returns (uint256) {
        return totalReferralLiability;
    }

    function settlementBalance() public view returns (uint256) {
        return settlementKind == SettlementKind.NATIVE
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

    function setAnnualPrice(uint256 newAnnualPrice) external onlyOwner {
        if (newAnnualPrice == 0 || newAnnualPrice > MAX_ANNUAL_PRICE) revert InvalidAnnualPrice();
        uint256 previous = annualPrice;
        annualPrice = newAnnualPrice;
        emit AnnualPriceChanged(previous, newAnnualPrice);
    }

    function setReferralRewardBps(uint16 newBps) external onlyOwner {
        if (newBps > MAX_REFERRAL_REWARD_BPS) revert ReferralRateTooHigh();
        uint16 previous = referralRewardBps;
        referralRewardBps = newBps;
        emit ReferralRewardBpsChanged(previous, newBps);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0) || newTreasury == address(this)) revert ZeroAddress();
        address previous = treasury;
        treasury = newTreasury;
        emit TreasuryChanged(previous, newTreasury);
    }

    function setRegistrationsPaused(bool paused) external onlyOwner {
        registrationsPaused = paused;
        emit RegistrationPauseChanged(paused);
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
        if (settlementKind == SettlementKind.ERC20 && token == address(settlementToken)) {
            revert SettlementTokenRecoveryForbidden();
        }
        uint256 amount = IERC20(token).balanceOf(address(this));
        if (amount == 0) revert NoRecoverableBalance();
        IERC20(token).safeTransfer(treasury, amount);
        emit UnsupportedTokenRecovered(token, amount);
    }

    function sweepUnexpectedNative() external onlyOwner nonReentrant {
        if (settlementKind != SettlementKind.ERC20) revert InvalidSettlementConfig();
        uint256 amount = address(this).balance;
        if (amount == 0) revert NoRecoverableBalance();
        (bool success,) = payable(treasury).call{ value: amount }("");
        if (!success) revert TransferFailed();
        emit UnexpectedNativeSwept(amount);
    }

    function _consumeCommitment(bytes32 commitment) internal {
        uint64 committedAt = commitments[commitment];
        if (committedAt == 0) revert CommitmentMissing();
        if (commitmentConsumed[commitment]) revert CommitmentConsumed();
        uint64 validAfter = SafeCast.toUint64(uint256(committedAt) + minCommitmentAge);
        uint64 expiredAt = SafeCast.toUint64(uint256(committedAt) + maxCommitmentAge);
        if (block.timestamp < validAfter) revert CommitmentTooNew(validAfter);
        if (block.timestamp > expiredAt) revert CommitmentExpired(expiredAt);
        commitmentConsumed[commitment] = true;
        emit CommitmentConsumedEvent(commitment, msg.sender);
    }

    function _verifyNormalizationAttestation(
        bytes32 labelHash,
        address recipient,
        NormalizationAttestation calldata attestation
    ) internal view {
        if (
            attestation.validUntil < block.timestamp
                || attestation.validUntil > block.timestamp + maxNormalizationAttestationValidity
        ) revert NormalizationAttestationExpired(attestation.validUntil);
        if (!SignatureChecker.isValidSignatureNow(
                normalizationAttestor,
                normalizationAttestationDigest(labelHash, recipient, attestation.validUntil),
                attestation.signature
            )) {
            revert InvalidNormalizationAttestation();
        }
    }

    function _validateReferral(address referrer, address recipient, uint16 expectedBps)
        internal
        view
    {
        if (expectedBps != referralRewardBps) {
            revert ReferralRateChanged(expectedBps, referralRewardBps);
        }
        if (referrer != address(0) && (referrer == msg.sender || referrer == recipient)) {
            revert InvalidReferrer();
        }
    }

    function _creditReferral(uint256 tokenId, address referrer, address payer, uint256 amount)
        internal
    {
        if (referrer == address(0)) return;
        uint256 reward = _mulBps(amount, referralRewardBps);
        if (reward != 0) {
            referralBalance[referrer] += reward;
            totalReferralLiability += reward;
        }
        emit ReferralAttributed(tokenId, referrer, payer, reward);
    }

    function _quoteAmount(uint256 codepoints, uint8 durationYears) internal view returns (uint256) {
        uint256 multiplier = 1;
        if (codepoints < 4) {
            multiplier = (_shortNamePriceMultipliers >> ((codepoints - 1) * 8)) & 0xff;
        }
        unchecked {
            return annualPrice * multiplier * durationYears;
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
        _requireExactTransfer(
            amount,
            payerBefore,
            settlementToken.balanceOf(payer),
            contractBefore,
            settlementToken.balanceOf(address(this))
        );
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

    function _requireSolvent() internal view {
        uint256 balance = settlementBalance();
        uint256 liability = protectedBalance();
        if (balance < liability) revert ProtocolInsolvent(balance, liability);
    }

    function _validateDuration(uint8 durationYears) internal pure {
        if (durationYears < MIN_DURATION_YEARS || durationYears > MAX_DURATION_YEARS) {
            revert InvalidDuration();
        }
    }

    function _validateRecipient(address recipient) internal view {
        if (recipient == address(0) || recipient == address(this)) revert InvalidRecipient();
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
