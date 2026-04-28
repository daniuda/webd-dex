import { ref, computed } from 'vue'
import { ethers } from 'ethers'

const POLYGON_CHAIN_ID = parseInt(import.meta.env.VITE_CHAIN_ID || '137')
const POLYGON_PARAMS = {
  chainId: '0x' + POLYGON_CHAIN_ID.toString(16),
  chainName: POLYGON_CHAIN_ID === 137 ? 'Polygon Mainnet' : 'Polygon Amoy Testnet',
  nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
  rpcUrls: [import.meta.env.VITE_POLYGON_RPC || 'https://polygon-rpc.com'],
  blockExplorerUrls: [POLYGON_CHAIN_ID === 137 ? 'https://polygonscan.com' : 'https://amoy.polygonscan.com'],
}

const address = ref<string>('')
const chainId = ref<number>(0)
const connecting = ref(false)
const error = ref('')

const isConnected = computed(() => !!address.value)
const isWrongNetwork = computed(() => isConnected.value && chainId.value !== POLYGON_CHAIN_ID)

function getProvider(): ethers.BrowserProvider | null {
  const eth = (window as unknown as { ethereum?: ethers.Eip1193Provider }).ethereum
  if (!eth) return null
  return new ethers.BrowserProvider(eth)
}

async function connect(): Promise<void> {
  const eth = (window as unknown as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum
  if (!eth) { error.value = 'MetaMask not installed'; return }
  connecting.value = true
  error.value = ''
  try {
    const accounts = await eth.request({ method: 'eth_requestAccounts' }) as string[]
    address.value = accounts[0]
    const cid = await eth.request({ method: 'eth_chainId' }) as string
    chainId.value = parseInt(cid, 16)
    if (chainId.value !== POLYGON_CHAIN_ID) await switchNetwork()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    connecting.value = false
  }
}

async function switchNetwork(): Promise<void> {
  const eth = (window as unknown as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum
  if (!eth) return
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: POLYGON_PARAMS.chainId }] })
  } catch (e: unknown) {
    const code = (e as { code?: number }).code
    if (code === 4902) {
      await eth.request({ method: 'wallet_addEthereumChain', params: [POLYGON_PARAMS] })
    }
  }
  const cid = await eth.request({ method: 'eth_chainId' }) as string
  chainId.value = parseInt(cid, 16)
}

async function getSigner(): Promise<ethers.Signer | null> {
  const provider = getProvider()
  if (!provider) return null
  return provider.getSigner()
}

function disconnect(): void {
  address.value = ''
  chainId.value = 0
}

// Auto-detect injected account on load
const eth = (window as unknown as { ethereum?: { request: (args: { method: string }) => Promise<unknown>; on: (event: string, handler: (...args: unknown[]) => void) => void } }).ethereum
if (eth) {
  eth.request({ method: 'eth_accounts' }).then((accounts: unknown) => {
    const arr = accounts as string[]
    if (arr.length > 0) {
      address.value = arr[0]
      eth.request({ method: 'eth_chainId' }).then((cid: unknown) => {
        chainId.value = parseInt(cid as string, 16)
      })
    }
  })
  eth.on('accountsChanged', (accounts: unknown) => {
    const arr = accounts as string[]
    address.value = arr[0] || ''
  })
  eth.on('chainChanged', (cid: unknown) => {
    chainId.value = parseInt(cid as string, 16)
  })
}

export function useWallet() {
  return { address, chainId, connecting, error, isConnected, isWrongNetwork, connect, switchNetwork, getSigner, disconnect }
}
