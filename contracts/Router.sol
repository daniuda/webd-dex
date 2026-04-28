// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./Factory.sol";
import "./Pair.sol";

/**
 * @title Router
 * @notice User-facing interface for the DEX.
 *         Does NOT hold funds — all tokens go directly to Pair contracts.
 *         Provides: swapExactTokensForTokens, addLiquidity, removeLiquidity.
 */
contract Router {
    address public immutable factory;

    modifier ensure(uint256 deadline) {
        require(deadline >= block.timestamp, "Router: EXPIRED");
        _;
    }

    constructor(address _factory) {
        factory = _factory;
    }

    // ─── Internal helpers ────────────────────────────────────────────────────

    function _getPair(address tokenA, address tokenB) internal view returns (address pair) {
        pair = Factory(factory).getPair(tokenA, tokenB);
        require(pair != address(0), "Router: PAIR_NOT_FOUND");
    }

    function _getReserves(address tokenA, address tokenB)
        internal view
        returns (uint256 reserveA, uint256 reserveB)
    {
        address pair = _getPair(tokenA, tokenB);
        (uint112 r0, uint112 r1,) = Pair(pair).getReserves();
        address token0 = Pair(pair).token0();
        (reserveA, reserveB) = tokenA == token0 ? (uint256(r0), uint256(r1)) : (uint256(r1), uint256(r0));
    }

    function _getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        internal pure
        returns (uint256 amountOut)
    {
        require(amountIn > 0, "Router: INSUFFICIENT_INPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > 0, "Router: INSUFFICIENT_LIQUIDITY");
        uint256 amountInWithFee = amountIn * 997;
        amountOut = (amountInWithFee * reserveOut) / (reserveIn * 1000 + amountInWithFee);
    }

    function _getAmountIn(uint256 amountOut, uint256 reserveIn, uint256 reserveOut)
        internal pure
        returns (uint256 amountIn)
    {
        require(amountOut > 0, "Router: INSUFFICIENT_OUTPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > 0, "Router: INSUFFICIENT_LIQUIDITY");
        amountIn = (reserveIn * amountOut * 1000) / ((reserveOut - amountOut) * 997) + 1;
    }

    function _quote(uint256 amountA, uint256 reserveA, uint256 reserveB)
        internal pure
        returns (uint256 amountB)
    {
        require(amountA > 0, "Router: INSUFFICIENT_AMOUNT");
        require(reserveA > 0 && reserveB > 0, "Router: INSUFFICIENT_LIQUIDITY");
        amountB = (amountA * reserveB) / reserveA;
    }

    // ─── View helpers (callable off-chain) ───────────────────────────────────

    function getAmountOut(uint256 amountIn, address tokenIn, address tokenOut)
        external view
        returns (uint256 amountOut)
    {
        (uint256 reserveIn, uint256 reserveOut) = _getReserves(tokenIn, tokenOut);
        amountOut = _getAmountOut(amountIn, reserveIn, reserveOut);
    }

    function getAmountIn(uint256 amountOut, address tokenIn, address tokenOut)
        external view
        returns (uint256 amountIn)
    {
        (uint256 reserveIn, uint256 reserveOut) = _getReserves(tokenIn, tokenOut);
        amountIn = _getAmountIn(amountOut, reserveIn, reserveOut);
    }

    // ─── Swap ─────────────────────────────────────────────────────────────────

    /**
     * @notice Swap an exact amount of tokenIn for as much tokenOut as possible.
     * @param amountIn      Exact amount of input token
     * @param amountOutMin  Minimum acceptable output (slippage protection)
     * @param tokenIn       Input token address
     * @param tokenOut      Output token address
     * @param to            Recipient of output tokens
     * @param deadline      Unix timestamp after which the tx reverts
     */
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address tokenIn,
        address tokenOut,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 amountOut) {
        (uint256 reserveIn, uint256 reserveOut) = _getReserves(tokenIn, tokenOut);
        amountOut = _getAmountOut(amountIn, reserveIn, reserveOut);
        require(amountOut >= amountOutMin, "Router: INSUFFICIENT_OUTPUT_AMOUNT");

        address pair = _getPair(tokenIn, tokenOut);
        IERC20(tokenIn).transferFrom(msg.sender, pair, amountIn);

        address token0 = Pair(pair).token0();
        (uint256 amount0Out, uint256 amount1Out) = tokenIn == token0
            ? (uint256(0), amountOut)
            : (amountOut, uint256(0));
        Pair(pair).swap(amount0Out, amount1Out, to);
    }

    // ─── Liquidity ───────────────────────────────────────────────────────────

    /**
     * @notice Add liquidity to a pair. Creates the pair if it doesn't exist.
     * @param tokenA          First token
     * @param tokenB          Second token
     * @param amountADesired  Desired amount of tokenA to deposit
     * @param amountBDesired  Desired amount of tokenB to deposit
     * @param amountAMin      Minimum tokenA to deposit (slippage protection)
     * @param amountBMin      Minimum tokenB to deposit (slippage protection)
     * @param to              Recipient of LP tokens
     * @param deadline        Unix timestamp deadline
     */
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        // Create pair if needed
        if (Factory(factory).getPair(tokenA, tokenB) == address(0)) {
            Factory(factory).createPair(tokenA, tokenB);
        }

        (uint256 reserveA, uint256 reserveB) = _getReserves(tokenA, tokenB);

        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint256 amountBOptimal = _quote(amountADesired, reserveA, reserveB);
            if (amountBOptimal <= amountBDesired) {
                require(amountBOptimal >= amountBMin, "Router: INSUFFICIENT_B_AMOUNT");
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint256 amountAOptimal = _quote(amountBDesired, reserveB, reserveA);
                require(amountAOptimal >= amountAMin, "Router: INSUFFICIENT_A_AMOUNT");
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }

        address pair = _getPair(tokenA, tokenB);
        IERC20(tokenA).transferFrom(msg.sender, pair, amountA);
        IERC20(tokenB).transferFrom(msg.sender, pair, amountB);
        liquidity = Pair(pair).mint(to);
    }

    /**
     * @notice Remove liquidity from a pair.
     * @param tokenA      First token
     * @param tokenB      Second token
     * @param liquidity   Amount of LP tokens to burn
     * @param amountAMin  Minimum tokenA to receive (slippage protection)
     * @param amountBMin  Minimum tokenB to receive (slippage protection)
     * @param to          Recipient of underlying tokens
     * @param deadline    Unix timestamp deadline
     */
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 amountA, uint256 amountB) {
        address pair = _getPair(tokenA, tokenB);
        IERC20(pair).transferFrom(msg.sender, pair, liquidity);
        (uint256 amount0, uint256 amount1) = Pair(pair).burn(to);

        address token0 = Pair(pair).token0();
        (amountA, amountB) = tokenA == token0 ? (amount0, amount1) : (amount1, amount0);
        require(amountA >= amountAMin, "Router: INSUFFICIENT_A_AMOUNT");
        require(amountB >= amountBMin, "Router: INSUFFICIENT_B_AMOUNT");
    }
}
