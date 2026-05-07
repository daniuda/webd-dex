import { ethers } from 'ethers'
import { config } from './config.js'

/**
 * Meta-transaction relay (EIP-2771 / Solution 2).
 *
 * Flow:
 *   1. Frontend encodes calldata (e.g. swapExactTokensForTokens)
 *   2. Frontend fetches nonce via GET /api/relay/nonce/:address
 *   3. Frontend signs EIP-712 ForwardRequest (nonce + calldata)
 *   4. Frontend POSTs { from, to, value, gas, deadline, data, signature } to POST /api/relay
 *   5. Bridge hot wallet calls MinimalForwarder.execute(request) — pays MATIC
 *   6. Router receives call with _msgSender() = original user address
 */

// OZ v5 ERC2771Forwarder ABI (only what the relay needs)
const FORWARDER_ABI = [
  'function execute((address from, address to, uint256 value, uint256 gas, uint48 deadline, bytes data, bytes signature) request) payable',
  'function nonces(address owner) view returns (uint256)',
  'function verify((address from, address to, uint256 value, uint256 gas, uint48 deadline, bytes data, bytes signature) request) view returns (bool)',
]

export interface RelayRequest {
  from: string
  to: string
  value: string   // bigint as decimal or hex string, default "0"
  gas: string     // bigint as decimal or hex string, default "300000"
  deadline: number
  data: string    // calldata hex
  signature: string
}

let _provider: ethers.JsonRpcProvider
let _wallet: ethers.Wallet
let _forwarder: ethers.Contract

function getProvider(): ethers.JsonRpcProvider {
  if (!_provider) _provider = new ethers.JsonRpcProvider(config.polygonRpc)
  return _provider
}

function getWallet(): ethers.Wallet {
  if (!_wallet) {
    if (!config.bridgeHotWalletKey) throw new Error('BRIDGE_HOT_WALLET_PRIVATE_KEY not set')
    _wallet = new ethers.Wallet(config.bridgeHotWalletKey, getProvider())
  }
  return _wallet
}

function getForwarder(): ethers.Contract {
  if (!_forwarder) {
    if (!config.forwarderAddress) throw new Error('FORWARDER_ADDRESS not set')
    _forwarder = new ethers.Contract(config.forwarderAddress, FORWARDER_ABI, getWallet())
  }
  return _forwarder
}

export async function getNonce(userAddress: string): Promise<string> {
  const nonce: bigint = await getForwarder().nonces(userAddress)
  return nonce.toString()
}

export async function relayTransaction(req: RelayRequest): Promise<string> {
  const forwardData = {
    from: req.from,
    to: req.to,
    value: BigInt(req.value || '0'),
    gas: BigInt(req.gas || '300000'),
    deadline: Number(req.deadline),
    data: req.data,
    signature: req.signature,
  }

  // Optional: verify before paying gas
  const valid: boolean = await getForwarder().verify(forwardData)
  if (!valid) throw new Error('Semnatura meta-tx invalida')

  console.log(`[relay] Relaying meta-tx from ${req.from} to ${req.to}`)
  const tx = await getForwarder().execute(forwardData, { gasLimit: 500_000 })
  const receipt = await tx.wait(1)
  console.log(`[relay] Meta-tx relayed. txHash: ${receipt.hash}`)
  return receipt.hash as string
}
