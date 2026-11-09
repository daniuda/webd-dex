// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title wWEBD
 * @notice Wrapped WebDollar token (ERC20) on Polygon.
 *         Minting/burning is controlled by the bridge operator (MINTER_ROLE).
 *         Conversion: 1 WEBD native = 1 wWEBD (18 decimals).
 *         Bridge factor: wWEBD_wei = webd_internal_units * 10^14
 *         (WEBD native uses 10000 internal units per WEBD).
 *
 * Risk reduction vs. a bare mint-on-demand hot wallet (see docs/superpowers/specs/
 * 2026-11-09-webd-dex-legal-risk-design.md):
 *  - MINTER_ROLE (the day-to-day bridge hot wallet) is capped on-chain, per-tx
 *    and per rolling 24h window, so a leaked hot-wallet key cannot mint past
 *    those limits even if the off-chain bridge server is fully compromised.
 *  - DEFAULT_ADMIN_ROLE / PAUSER_ROLE should be a separate address (ideally a
 *    multisig) from the hot wallet, so caps/pause cannot be changed by the
 *    same key that signs routine mints. The deploy script grants MINTER_ROLE
 *    to the bridge hot wallet and keeps admin/pauser on the deployer/multisig.
 */
contract wWEBD is ERC20, AccessControl, Pausable {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint256 public constant DAY = 1 days;

    /// @notice Maximum wWEBD mintable in a single mint() call. 0 = no limit.
    uint256 public maxMintPerTx;
    /// @notice Maximum wWEBD mintable across any rolling 24h window. 0 = no limit.
    uint256 public maxMintPerDay;

    uint256 private _dayWindowStart;
    uint256 private _mintedInWindow;

    event BridgeMint(address indexed to, uint256 amount);
    event BridgeBurn(address indexed from, uint256 amount);
    event MintCapsUpdated(uint256 maxPerTx, uint256 maxPerDay);

    constructor(address admin) ERC20("Wrapped WebDollar", "wWEBD") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    /**
     * @notice Set on-chain mint caps. Restricted to admin (not the minter/bridge
     *         hot wallet), so a compromised bridge key cannot raise its own limit.
     * @param perTx  Max wWEBD per single mint() call, in wei. 0 disables the check.
     * @param perDay Max wWEBD mintable in any rolling 24h window, in wei. 0 disables the check.
     */
    function setMintCaps(uint256 perTx, uint256 perDay) external onlyRole(DEFAULT_ADMIN_ROLE) {
        maxMintPerTx = perTx;
        maxMintPerDay = perDay;
        emit MintCapsUpdated(perTx, perDay);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @notice Mint wWEBD to an address. Called by bridge on deposit.
     *         Enforces whenNotPaused plus the on-chain per-tx/per-day caps.
     * @param to    Recipient EVM address
     * @param amount Amount in wei (18 decimals)
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) whenNotPaused {
        require(maxMintPerTx == 0 || amount <= maxMintPerTx, "wWEBD: amount exceeds per-tx cap");
        _enforceDailyCap(amount);
        _mint(to, amount);
        emit BridgeMint(to, amount);
    }

    function _enforceDailyCap(uint256 amount) private {
        if (maxMintPerDay == 0) return;
        if (block.timestamp >= _dayWindowStart + DAY) {
            _dayWindowStart = block.timestamp;
            _mintedInWindow = 0;
        }
        require(_mintedInWindow + amount <= maxMintPerDay, "wWEBD: amount exceeds daily cap");
        _mintedInWindow += amount;
    }

    /**
     * @notice Burn wWEBD from an address. Called by bridge on withdrawal.
     * @param from  Address to burn from (must have approved bridge or bridge calls directly)
     * @param amount Amount in wei (18 decimals)
     */
    function burn(address from, uint256 amount) external onlyRole(MINTER_ROLE) {
        _burn(from, amount);
        emit BridgeBurn(from, amount);
    }

    /**
     * @notice Self-initiated burn for withdrawal: user calls this directly.
     *         Emits BridgeBurn so the bridge monitor can detect it.
     * @param amount Amount in wei (18 decimals)
     */
    function burnForWithdrawal(uint256 amount) external {
        _burn(msg.sender, amount);
        emit BridgeBurn(msg.sender, amount);
    }
}
