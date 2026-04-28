import { ethers } from 'ethers'

const ROUTER_ADDR = import.meta.env.VITE_ROUTER_ADDRESS
const WWWEBD_ADDR = import.meta.env.VITE_WWWEBD_ADDRESS
const USDC_ADDR = import.meta.env.VITE_USDC_ADDRESS
const FACTORY_ADDR = import.meta.env.VITE_FACTORY_ADDRESS
const RPC = import.meta.env.VITE_POLYGON_RPC || 'https://polygon-rpc.com'

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function totalSupply() view returns (uint256)',
]

const PAIR_ABI = [
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
]

const FACTORY_ABI = [
  'function getPair(address tokenA, address tokenB) view returns (address pair)',
]

const ROUTER_ABI = [
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address tokenIn, address tokenOut, address to, uint256 deadline) returns (uint256 amountOut)',
  'function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity)',
  'function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB)',
  'function getAmountOut(uint256 amountIn, address tokenIn, address tokenOut) view returns (uint256)',
  'function getAmountIn(uint256 amountOut, address tokenIn, address tokenOut) view returns (uint256)',
]

export const WWWEBD_DECIMALS = 18
export const USDC_DECIMALS = 6

function readProvider() {
  return new ethers.JsonRpcProvider(RPC)
}

export async function getPairReserves(): Promise<{ reserveWWEBD: bigint; reserveUSDC: bigint; pairAddr: string }> {
  const provider = readProvider()
  const factory = new ethers.Contract(FACTORY_ADDR, FACTORY_ABI, provider)
  const pairAddr: string = await factory.getPair(WWWEBD_ADDR, USDC_ADDR)
  if (pairAddr === ethers.ZeroAddress) return { reserveWWEBD: 0n, reserveUSDC: 0n, pairAddr }
  const pair = new ethers.Contract(pairAddr, PAIR_ABI, provider)
  const [r0, r1] = await pair.getReserves()
  const token0: string = await pair.token0()
  const isWWebdToken0 = token0.toLowerCase() === WWWEBD_ADDR.toLowerCase()
  return {
    reserveWWEBD: isWWebdToken0 ? BigInt(r0) : BigInt(r1),
    reserveUSDC: isWWebdToken0 ? BigInt(r1) : BigInt(r0),
    pairAddr,
  }
}

export async function getPairLpSupply(pairAddr: string): Promise<bigint> {
  if (!pairAddr || pairAddr === ethers.ZeroAddress) return 0n
  const provider = readProvider()
  const pair = new ethers.Contract(pairAddr, ERC20_ABI, provider)
  return BigInt(await pair.totalSupply())
}

export async function getUserLpBalance(pairAddr: string, userAddr: string): Promise<bigint> {
  if (!pairAddr || pairAddr === ethers.ZeroAddress || !userAddr) return 0n
  const provider = readProvider()
  const pair = new ethers.Contract(pairAddr, ERC20_ABI, provider)
  return BigInt(await pair.balanceOf(userAddr))
}

export async function getTokenBalance(tokenAddr: string, userAddr: string): Promise<bigint> {
  if (!userAddr) return 0n
  const provider = readProvider()
  const token = new ethers.Contract(tokenAddr, ERC20_ABI, provider)
  return BigInt(await token.balanceOf(userAddr))
}

export async function getAllowance(tokenAddr: string, ownerAddr: string, spenderAddr: string): Promise<bigint> {
  if (!ownerAddr) return 0n
  const provider = readProvider()
  const token = new ethers.Contract(tokenAddr, ERC20_ABI, provider)
  return BigInt(await token.allowance(ownerAddr, spenderAddr))
}

export async function approve(
  tokenAddr: string,
  spenderAddr: string,
  amount: bigint,
  signer: ethers.Signer,
): Promise<void> {
  const token = new ethers.Contract(tokenAddr, ERC20_ABI, signer)
  const tx = await token.approve(spenderAddr, amount)
  await tx.wait()
}

export async function swap(
  amountIn: bigint,
  amountOutMin: bigint,
  tokenIn: string,
  tokenOut: string,
  to: string,
  signer: ethers.Signer,
): Promise<string> {
  const router = new ethers.Contract(ROUTER_ADDR, ROUTER_ABI, signer)
  const deadline = Math.floor(Date.now() / 1000) + 600
  const tx = await router.swapExactTokensForTokens(amountIn, amountOutMin, tokenIn, tokenOut, to, deadline)
  const receipt = await tx.wait()
  return receipt.hash
}

export async function addLiquidity(
  amountWWEBD: bigint,
  amountUSDC: bigint,
  slippagePct: number,
  to: string,
  signer: ethers.Signer,
): Promise<string> {
  const router = new ethers.Contract(ROUTER_ADDR, ROUTER_ABI, signer)
  const deadline = Math.floor(Date.now() / 1000) + 600
  const factor = BigInt(Math.round((1 - slippagePct / 100) * 10000))
  const minA = (amountWWEBD * factor) / 10000n
  const minB = (amountUSDC * factor) / 10000n
  const tx = await router.addLiquidity(WWWEBD_ADDR, USDC_ADDR, amountWWEBD, amountUSDC, minA, minB, to, deadline)
  const receipt = await tx.wait()
  return receipt.hash
}

export async function removeLiquidity(
  lpAmount: bigint,
  minWWEBD: bigint,
  minUSDC: bigint,
  to: string,
  signer: ethers.Signer,
): Promise<string> {
  const provider = readProvider()
  const factory = new ethers.Contract(FACTORY_ADDR, FACTORY_ABI, provider)
  const pairAddr: string = await factory.getPair(WWWEBD_ADDR, USDC_ADDR)
  const router = new ethers.Contract(ROUTER_ADDR, ROUTER_ABI, signer)
  const pairToken = new ethers.Contract(pairAddr, ERC20_ABI, signer)
  const allowance = BigInt(await pairToken.allowance(to, ROUTER_ADDR))
  if (allowance < lpAmount) {
    const txApprove = await pairToken.approve(ROUTER_ADDR, lpAmount)
    await txApprove.wait()
  }
  const deadline = Math.floor(Date.now() / 1000) + 600
  const tx = await router.removeLiquidity(WWWEBD_ADDR, USDC_ADDR, lpAmount, minWWEBD, minUSDC, to, deadline)
  const receipt = await tx.wait()
  return receipt.hash
}

export { WWWEBD_ADDR, USDC_ADDR, ROUTER_ADDR, FACTORY_ADDR }
