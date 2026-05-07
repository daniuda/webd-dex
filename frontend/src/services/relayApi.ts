import { ethers } from 'ethers'

const BRIDGE_API = import.meta.env.VITE_BRIDGE_API || 'http://localhost:4000'
const FORWARDER_ADDR: string = import.meta.env.VITE_FORWARDER_ADDRESS || ''

const FORWARDER_ABI = [
  'function nonces(address owner) view returns (uint256)',
]

const RPC: string = import.meta.env.VITE_POLYGON_RPC || 'https://rpc-amoy.polygon.technology'

// EIP-712 type for MinimalForwarder (OZ v5 ERC2771Forwarder)
const FORWARD_REQUEST_TYPES = {
  ForwardRequest: [
    { name: 'from',     type: 'address' },
    { name: 'to',       type: 'address' },
    { name: 'value',    type: 'uint256' },
    { name: 'gas',      type: 'uint256' },
    { name: 'nonce',    type: 'uint256' },
    { name: 'deadline', type: 'uint48'  },
    { name: 'data',     type: 'bytes'   },
  ],
}

async function getForwarderNonce(userAddress: string): Promise<bigint> {
  const res = await fetch(`${BRIDGE_API}/api/relay/nonce/${userAddress}`)
  if (!res.ok) throw new Error('Failed to fetch nonce')
  const { nonce } = await res.json()
  return BigInt(nonce)
}

/**
 * Returns the user's MATIC balance on Polygon.
 * Used to decide whether to use relay vs. direct tx.
 */
export async function getMaticBalance(userAddress: string): Promise<bigint> {
  const provider = new ethers.JsonRpcProvider(RPC)
  return await provider.getBalance(userAddress)
}

/**
 * Builds an EIP-712 ForwardRequest and signs it with the user's signer.
 * @param signer      User's ethers.Signer (MetaMask / injected)
 * @param toContract  Target contract address (Router)
 * @param calldata    Encoded function call (e.g. swapExactTokensForTokens)
 * @param gasLimit    Gas limit for the relayed call (default 300 000)
 */
export async function buildSignedRequest(
  signer: ethers.Signer,
  toContract: string,
  calldata: string,
  gasLimit: bigint = 300_000n,
): Promise<object> {
  if (!FORWARDER_ADDR) throw new Error('VITE_FORWARDER_ADDRESS not configured')

  const from = await signer.getAddress()
  const nonce = await getForwarderNonce(from)
  const deadline = Math.floor(Date.now() / 1000) + 600  // 10 minutes

  const network = await (signer.provider as ethers.JsonRpcProvider).getNetwork()
  const domain = {
    name: 'MinimalForwarder',
    version: '1',
    chainId: Number(network.chainId),
    verifyingContract: FORWARDER_ADDR,
  }

  const value = {
    from,
    to: toContract,
    value: 0n,
    gas: gasLimit,
    nonce,
    deadline,
    data: calldata,
  }

  const signature = await signer.signTypedData(domain, FORWARD_REQUEST_TYPES, value)

  return { from, to: toContract, value: '0', gas: gasLimit.toString(), deadline, data: calldata, signature }
}

/**
 * POSTs a signed ForwardRequest to the bridge relay.
 * Bridge hot wallet pays MATIC; Router's _msgSender() returns the real user.
 */
export async function relayRequest(request: object): Promise<string> {
  const res = await fetch(`${BRIDGE_API}/api/relay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Relay failed')
  return data.txHash as string
}

export { FORWARDER_ADDR }
