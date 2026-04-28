export function formatAmount(value: bigint, decimals: number, displayDecimals = 6): string {
  const divisor = 10n ** BigInt(decimals)
  const intPart = value / divisor
  const fracPart = value % divisor
  const fracStr = fracPart.toString().padStart(decimals, '0').slice(0, displayDecimals)
  const trimmed = fracStr.replace(/0+$/, '')
  return trimmed ? `${intPart}.${trimmed}` : intPart.toString()
}

export function parseAmount(value: string, decimals: number): bigint {
  if (!value || value === '.') return 0n
  const [intStr, fracStr = ''] = value.split('.')
  const frac = fracStr.slice(0, decimals).padEnd(decimals, '0')
  return BigInt(intStr || '0') * 10n ** BigInt(decimals) + BigInt(frac)
}

export function shortenAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function formatUsd(value: number, decimals = 2): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}
