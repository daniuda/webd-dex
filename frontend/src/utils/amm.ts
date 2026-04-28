export function calcAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  if (amountIn === 0n || reserveIn === 0n || reserveOut === 0n) return 0n
  const fee = amountIn * 997n
  return (fee * reserveOut) / (reserveIn * 1000n + fee)
}

export function calcAmountIn(amountOut: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  if (amountOut === 0n || reserveIn === 0n || reserveOut === 0n) return 0n
  if (amountOut >= reserveOut) return 0n
  return (reserveIn * amountOut * 1000n) / ((reserveOut - amountOut) * 997n) + 1n
}

export function calcPriceImpact(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): number {
  if (reserveIn === 0n || amountIn === 0n) return 0
  const amountOut = calcAmountOut(amountIn, reserveIn, reserveOut)
  const spotPrice = (reserveOut * amountIn) / reserveIn
  if (spotPrice === 0n) return 0
  const impact = Number(spotPrice - amountOut) * 100 / Number(spotPrice)
  return Math.max(0, impact)
}

export function calcMinAmountOut(amountOut: bigint, slippagePct: number): bigint {
  const factor = BigInt(Math.round((1 - slippagePct / 100) * 10000))
  return (amountOut * factor) / 10000n
}

export function calcLpMintAmount(
  amountA: bigint, amountB: bigint,
  reserveA: bigint, reserveB: bigint,
  totalSupply: bigint,
): bigint {
  if (totalSupply === 0n) {
    const k = amountA * amountB
    return bigintSqrt(k) - 1000n
  }
  const lpA = (amountA * totalSupply) / reserveA
  const lpB = (amountB * totalSupply) / reserveB
  return lpA < lpB ? lpA : lpB
}

function bigintSqrt(n: bigint): bigint {
  if (n < 0n) return 0n
  if (n < 2n) return n
  let x = n
  let y = (x + 1n) / 2n
  while (y < x) { x = y; y = (x + n / x) / 2n }
  return x
}
