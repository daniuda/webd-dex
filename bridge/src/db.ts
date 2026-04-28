import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'
import * as fs from 'fs'
import * as path from 'path'
import { config } from './config.js'

export type BridgeDirection = 'deposit' | 'withdrawal'
export type BridgeStatus = 'pending' | 'confirmed' | 'minted' | 'released' | 'failed'

export type BridgeRequest = {
  id: string
  direction: BridgeDirection
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

type DbData = {
  requests: BridgeRequest[]
  processedWebdTxs: string[]
  processedEvmBurns: string[]
}

const defaultData: DbData = { requests: [], processedWebdTxs: [], processedEvmBurns: [] }

let db: Low<DbData>

export async function initDb(): Promise<void> {
  const dir = path.dirname(config.dbPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const adapter = new JSONFile<DbData>(config.dbPath)
  db = new Low<DbData>(adapter, defaultData)
  await db.read()
  // Ensure all keys exist
  db.data.requests ??= []
  db.data.processedWebdTxs ??= []
  db.data.processedEvmBurns ??= []
  await db.write()
}

function save(): Promise<void> {
  return db.write()
}

export function createRequest(req: Omit<BridgeRequest, 'status' | 'webdTxId' | 'evmTxHash' | 'processedAt' | 'errorMsg'>): void {
  const full: BridgeRequest = { ...req, status: 'pending', webdTxId: null, evmTxHash: null, processedAt: null, errorMsg: null }
  db.data.requests.push(full)
  save()
}

export function getRequest(id: string): BridgeRequest | undefined {
  return db.data.requests.find(r => r.id === id)
}

export function updateRequestStatus(id: string, status: BridgeStatus, extra?: { webdTxId?: string; evmTxHash?: string; errorMsg?: string }): void {
  const req = db.data.requests.find(r => r.id === id)
  if (!req) return
  req.status = status
  req.processedAt = Date.now()
  if (extra?.webdTxId) req.webdTxId = extra.webdTxId
  if (extra?.evmTxHash) req.evmTxHash = extra.evmTxHash
  if (extra?.errorMsg) req.errorMsg = extra.errorMsg
  save()
}

export function getPendingDeposits(): BridgeRequest[] {
  return db.data.requests.filter(r => r.direction === 'deposit' && (r.status === 'pending' || r.status === 'confirmed'))
}

export function getPendingWithdrawals(): BridgeRequest[] {
  return db.data.requests.filter(r => r.direction === 'withdrawal' && (r.status === 'pending' || r.status === 'confirmed'))
}

export function isWebdTxProcessed(txId: string): boolean {
  return db.data.processedWebdTxs.includes(txId)
}

export function markWebdTxProcessed(txId: string): void {
  if (!db.data.processedWebdTxs.includes(txId)) {
    db.data.processedWebdTxs.push(txId)
    save()
  }
}

export function isEvmBurnProcessed(txHash: string): boolean {
  return db.data.processedEvmBurns.includes(txHash.toLowerCase())
}

export function markEvmBurnProcessed(txHash: string): void {
  const h = txHash.toLowerCase()
  if (!db.data.processedEvmBurns.includes(h)) {
    db.data.processedEvmBurns.push(h)
    save()
  }
}

export function getRecentRequests(limit = 50): BridgeRequest[] {
  return [...db.data.requests].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit)
}
