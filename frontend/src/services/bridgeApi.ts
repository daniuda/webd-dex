import axios from 'axios'

const BASE = import.meta.env.VITE_BRIDGE_API || ''

export type BridgeStatus = 'pending' | 'confirmed' | 'minted' | 'released' | 'failed'

export type BridgeRequest = {
  id: string
  direction: 'deposit' | 'withdrawal'
  webdAddress: string
  evmAddress: string
  amountWebd: number
  status: BridgeStatus
  webdTxId: string | null
  evmTxHash: string | null
  createdAt: number
  processedAt: number | null
  errorMsg: string | null
}

export type BridgeInfo = {
  lockAddress: string
  wwwebdContract: string
  maxAmountWebd: number
  feeWebd: number
  bridgeHotWalletBalance: string | null
}

export async function getBridgeInfo(): Promise<BridgeInfo> {
  const { data } = await axios.get(`${BASE}/api/bridge/info`)
  return data
}

export async function submitDeposit(params: {
  webdAddress: string
  evmAddress: string
  amountWebd: number
}): Promise<{ requestId: string; instructions: { sendTo: string; amount: number; note: string } }> {
  const { data } = await axios.post(`${BASE}/api/bridge/deposit`, params)
  return data
}

export async function submitWithdrawal(params: {
  evmAddress: string
  webdAddress: string
  amountWebd: number
}): Promise<{ requestId: string; instructions: { callContract: string; method: string; amount: number; note: string } }> {
  const { data } = await axios.post(`${BASE}/api/bridge/withdraw`, params)
  return data
}

export async function getBridgeStatus(requestId: string): Promise<BridgeRequest> {
  const { data } = await axios.get(`${BASE}/api/bridge/status/${requestId}`)
  return data
}
