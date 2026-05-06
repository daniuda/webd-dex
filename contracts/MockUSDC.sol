// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Testnet-only mock USDC with 6 decimals and open mint.
contract MockUSDC is ERC20 {
    constructor(address initialHolder) ERC20("USD Coin (Mock)", "USDC") {
        _mint(initialHolder, 10_000_000 * 10 ** 6); // 10M USDC to deployer
    }

    function decimals() public pure override returns (uint8) { return 6; }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
