import { ethers } from 'ethers'
import { config } from './config.js'

const WWWEBD_ABI = [
  'function mint(address to, uint256 amount) external',
  'function burn(address from, uint256 amount) external',
  'function balanceOf(address) view returns (uint256)',
  'event BridgeBurn(address indexed from, uint256 amount)',
]

// 1 WEBD nativ = 10000 internal units = 1e18 wei wWEBD
// wWEBD_wei = amountWebd * 10^18
const WEBD_TO_WEI = (amountWebd: number): bigint => {
  const wholePart = Math.floor(amountWebd)
  const fracPart = Math.round((amountWebd - wholePart) * 10_000)
  // amountWebd * 10^18 = wholePart * 10^18 + fracPart * 10^14
  return BigInt(wholePart) * 10n ** 18n + BigInt(fracPart) * 10n ** 14n
}

let provider: ethers.JsonRpcProvider
let wallet: ethers.Wallet
let contract: ethers.Contract

function getProvider(): ethers.JsonRpcProvider {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(config.polygonRpc)
  }
  return provider
}

function getWallet(): ethers.Wallet {
  if (!wallet) {
    if (!config.bridgeHotWalletKey) throw new Error('BRIDGE_HOT_WALLET_PRIVATE_KEY not set')
    wallet = new ethers.Wallet(config.bridgeHotWalletKey, getProvider())
  }
  return wallet
}

function getContract(): ethers.Contract {
  if (!contract) {
    if (!config.wwwebdAddress) throw new Error('WWWEBD_ADDRESS not set')
    contract = new ethers.Contract(config.wwwebdAddress, WWWEBD_ABI, getWallet())
  }
  return contract
}

/**
 * Mint wWEBD pe Polygon catre adresa EVM a userului.
 * Apelata de bridge dupa confirmarea depozitului WEBD nativ.
 */
export async function mintWWEBD(toEvmAddress: string, amountWebd: number): Promise<string> {
  const amount = WEBD_TO_WEI(amountWebd)
  console.log(`[mint] Minting ${amountWebd} wWEBD (${amount} wei) to ${toEvmAddress}`)

  const tx = await getContract().mint(toEvmAddress, amount)
  const receipt = await tx.wait(1)
  console.log(`[mint] Minted. txHash: ${receipt.hash}`)
  return receipt.hash as string
}

/**
 * Returneaza balanta wWEBD (in WEBD, nu wei) pentru o adresa EVM.
 */
export async function getWWEBDBalance(evmAddress: string): Promise<number> {
  const wei = await getContract().balanceOf(evmAddress) as bigint
  return Number(wei) / 1e18
}

/**
 * Asculta evenimentele BridgeBurn pe contractul wWEBD si apeleaza callback la fiecare burn detectat.
 * Folosit de monitor.ts pentru a declansa retrageri WEBD.
 */
export function watchBurnEvents(
  callback: (from: string, amountWebd: number, txHash: string) => void
): () => void {
  if (!config.wwwebdAddress) return () => {}

  const c = getContract()
  const listener = async (from: string, amount: bigint, event: ethers.EventLog) => {
    const amountWebd = Number(amount) / 1e18
    console.log(`[mint] BridgeBurn detected: ${amountWebd} wWEBD from ${from}, tx: ${event.transactionHash}`)
    callback(from, amountWebd, event.transactionHash)
  }
  c.on('BridgeBurn', listener)

  // Returneaza cleanup function
  return () => { c.off('BridgeBurn', listener) }
}

export { WEBD_TO_WEI }
