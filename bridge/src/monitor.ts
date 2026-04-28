import axios from 'axios'
import { config } from './config.js'
import {
  getPendingDeposits, getPendingWithdrawals,
  updateRequestStatus, isWebdTxProcessed, markWebdTxProcessed,
  isEvmBurnProcessed, markEvmBurnProcessed,
  createRequest, getRequest,
} from './db.js'
import { mintWWEBD, watchBurnEvents } from './mint.js'
import { releaseWEBD } from './burn.js'
import { randomUUID } from 'crypto'

// ─── WEBD block scanner ───────────────────────────────────────────────────────

type WebdTx = {
  txId?: string
  id?: string
  from?: Array<{ unencodedAddress?: string; address?: string }>
  to?: Array<{ unencodedAddress?: string; address?: string; amount?: number }>
}

type WebdBlock = {
  height?: number
  transactions?: WebdTx[]
  txs?: WebdTx[]
}

async function fetchBlockFromNode(node: string, height: number): Promise<WebdBlock | null> {
  try {
    const resp = await axios.get(`${node}/block/${height}`, { timeout: 8_000 })
    return resp.data as WebdBlock
  } catch {
    return null
  }
}

async function getChainHeight(node: string): Promise<number | null> {
  try {
    const resp = await axios.get(`${node}/height`, { timeout: 8_000 })
    const h = resp.data?.height ?? resp.data?.result
    return typeof h === 'number' ? h : null
  } catch {
    return null
  }
}

// Retine ultimul block scanat pentru a nu reprocesa
let lastScannedHeight = -1

/**
 * Scaneaza block-urile noi de pe WEBD node si detecteaza depozite catre bridge lock address.
 * Pentru fiecare tx nou catre bridgeLockAddress, creeaza sau actualizeaza bridge request-ul.
 */
async function scanWebdBlocks(): Promise<void> {
  const nodes = config.webdFallbackNodes.length > 0 ? config.webdFallbackNodes : [config.webdNodeApi]

  let tipHeight: number | null = null
  let activeNode = ''
  for (const node of nodes) {
    tipHeight = await getChainHeight(node)
    if (tipHeight !== null) { activeNode = node; break }
  }
  if (tipHeight === null || !activeNode) return

  if (lastScannedHeight < 0) {
    // Prima pornire: incepem de la bloc curent - 10 (scurtam coada initiala)
    lastScannedHeight = Math.max(0, tipHeight - 10)
  }

  const lockAddrNorm = config.bridgeLockWebdAddress.toLowerCase().trim()

  for (let h = lastScannedHeight + 1; h <= tipHeight; h++) {
    const block = await fetchBlockFromNode(activeNode, h)
    if (!block) continue

    const txs: WebdTx[] = Array.isArray(block.transactions) ? block.transactions : (Array.isArray(block.txs) ? block.txs : [])

    for (const tx of txs) {
      const txId = tx.txId || tx.id || ''
      if (!txId || isWebdTxProcessed(txId)) continue

      // Verificam daca vreun output este catre bridge lock address
      const toEntries = Array.isArray(tx.to) ? tx.to : []
      for (const out of toEntries) {
        const outAddr = (out.unencodedAddress || out.address || '').toLowerCase().trim()
        if (!outAddr || outAddr !== lockAddrNorm) continue
        if (!out.amount || out.amount <= 0) continue

        const amountWebd = out.amount / 10_000  // internal units → WEBD
        console.log(`[monitor] Deposit detected: ${amountWebd} WEBD, txId: ${txId.slice(0, 12)}, height: ${h}`)

        // Gasim request-ul pending care asteapta aceasta tranzactie
        const pending = getPendingDeposits().find(r => !r.webdTxId)
        if (pending) {
          updateRequestStatus(pending.id, 'confirmed', { webdTxId: txId })
          await processMint(pending.id, pending.evmAddress, amountWebd, txId)
        } else {
          console.log(`[monitor] No pending deposit request found for txId ${txId.slice(0, 12)}. Skipping.`)
        }

        markWebdTxProcessed(txId)
      }
    }
    lastScannedHeight = h
  }
}

async function processMint(requestId: string, evmAddress: string, amountWebd: number, webdTxId: string): Promise<void> {
  try {
    const evmTxHash = await mintWWEBD(evmAddress, amountWebd)
    updateRequestStatus(requestId, 'minted', { webdTxId, evmTxHash })
    console.log(`[monitor] Mint ok for request ${requestId}: ${amountWebd} wWEBD → ${evmAddress}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    updateRequestStatus(requestId, 'failed', { errorMsg: `Mint failed: ${msg}` })
    console.error(`[monitor] Mint failed for request ${requestId}: ${msg}`)
  }
}

// ─── Polygon burn watcher ─────────────────────────────────────────────────────

let burnCleanup: (() => void) | null = null

function startPolygonWatcher(): void {
  if (burnCleanup) burnCleanup()

  burnCleanup = watchBurnEvents(async (fromEvm, amountWebd, txHash) => {
    if (isEvmBurnProcessed(txHash)) return
    markEvmBurnProcessed(txHash)

    // Gasim request-ul de withdrawal pentru aceasta adresa EVM
    const pending = getPendingWithdrawals().find(r => r.evmAddress.toLowerCase() === fromEvm.toLowerCase() && !r.evmTxHash)
    if (!pending) {
      console.log(`[monitor] BridgeBurn from ${fromEvm} (${amountWebd} wWEBD) — no matching withdrawal request. Skipping.`)
      return
    }

    updateRequestStatus(pending.id, 'confirmed', { evmTxHash: txHash })
    await processRelease(pending.id, pending.webdAddress, amountWebd, txHash)
  })

  console.log('[monitor] Polygon burn watcher started')
}

async function processRelease(requestId: string, webdAddress: string, amountWebd: number, evmTxHash: string): Promise<void> {
  try {
    const webdTxId = await releaseWEBD(webdAddress, amountWebd)
    updateRequestStatus(requestId, 'released', { webdTxId, evmTxHash })
    console.log(`[monitor] Release ok for request ${requestId}: ${amountWebd} WEBD → ${webdAddress}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    updateRequestStatus(requestId, 'failed', { errorMsg: `Release failed: ${msg}` })
    console.error(`[monitor] Release failed for request ${requestId}: ${msg}`)
  }
}

// ─── Main monitor loop ────────────────────────────────────────────────────────

let webdIntervalId: ReturnType<typeof setInterval> | null = null

export function startMonitor(): void {
  console.log('[monitor] Starting WEBD block scanner...')
  scanWebdBlocks().catch(err => console.error('[monitor] scan error:', err))
  webdIntervalId = setInterval(() => {
    scanWebdBlocks().catch(err => console.error('[monitor] scan error:', err))
  }, config.webdPollIntervalMs)

  if (config.wwwebdAddress) {
    startPolygonWatcher()
  } else {
    console.warn('[monitor] WWWEBD_ADDRESS not set — Polygon burn watcher disabled')
  }
}

export function stopMonitor(): void {
  if (webdIntervalId) { clearInterval(webdIntervalId); webdIntervalId = null }
  if (burnCleanup) { burnCleanup(); burnCleanup = null }
  console.log('[monitor] Stopped')
}

export {
  createRequest,
  getRequest,
  randomUUID,
}
