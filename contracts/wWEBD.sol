// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title wWEBD
 * @notice Wrapped WebDollar token (ERC20) on Polygon.
 *         Minting/burning is controlled by the bridge operator (MINTER_ROLE).
 *         Conversion: 1 WEBD native = 1 wWEBD (18 decimals).
 *         Bridge factor: wWEBD_wei = webd_internal_units * 10^14
 *         (WEBD native uses 10000 internal units per WEBD).
 */
contract wWEBD is ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    event BridgeMint(address indexed to, uint256 amount);
    event BridgeBurn(address indexed from, uint256 amount);

    constructor(address admin) ERC20("Wrapped WebDollar", "wWEBD") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
    }

    /**
     * @notice Mint wWEBD to an address. Called by bridge on deposit.
     * @param to    Recipient EVM address
     * @param amount Amount in wei (18 decimals)
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
        emit BridgeMint(to, amount);
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
