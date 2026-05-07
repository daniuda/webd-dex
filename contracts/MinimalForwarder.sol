// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";

/**
 * @title MinimalForwarder
 * @notice EIP-2771 trusted forwarder for gasless meta-transactions.
 *         Relay backend calls execute() on behalf of users — users sign EIP-712
 *         typed data, relay pays MATIC, Router sees the original msg.sender via
 *         ERC2771Context._msgSender().
 */
contract MinimalForwarder is ERC2771Forwarder {
    constructor() ERC2771Forwarder("MinimalForwarder") {}
}
