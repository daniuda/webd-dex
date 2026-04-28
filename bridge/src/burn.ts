import axios from 'axios'
import nacl from 'nacl'
import { createHash } from 'crypto'
import { config } from './config.js'

// ─── WEBD Transaction Builder (adaptat din webd-windows-miner/electron/txBuilder.ts) ──

const WEBD_UNITS = 10_000
const DEFAULT_TX_VERSION = 0x02
const WEBD_TOKEN_ID = Buffer.from([0x01])
const WIF_PREFIX = Buffer.from([0x58, 0x40, 0x43, 0xfe])
const WIF_SUFFIX = 0xff

function normalizeWebdBase64(input: string): string {
  return input.trim().replace(/\$/g, '/').replace(/#/g, 'O').replace(/@/g, 'l')
}

function decodeAddressToUnencodedHex(address: string): string {
  const raw = Buffer.from(normalizeWebdBase64(address), 'base64')
  if (raw.length < 30) throw new Error('Adresa invalida (prea scurta)')
  const prefix = raw.subarray(0, 4)
  const suffix = raw[raw.length - 1]
  if (!prefix.equals(WIF_PREFIX) || suffix !== WIF_SUFFIX) throw new Error('Adresa invalida (prefix/suffix)')
  const unencoded = raw.subarray(5, 25)
  if (unencoded.length !== 20) throw new Error('Adresa invalida (unencoded != 20 bytes)')
  return unencoded.toString('hex')
}

function num1(v: number) { const b = Buffer.alloc(1); b[0] = v & 0xff; return b }
function num2(v: number) { const b = Buffer.alloc(2); b[1] = v & 0xff; b[0] = (v >> 8) & 0xff; return b }
function num3(v: number) { const b = Buffer.alloc(3); b[2] = v & 0xff; b[1] = (v >> 8) & 0xff; b[0] = (v >> 16) & 0xff; return b }
function num7(v: number) {
  const out = Buffer.alloc(7)
  let n = Math.floor(v)
  for (let i = 0; i < 7; i++) { out[i] = n & 0xff; n = (n - out[i]) / 256 }
  return out
}

function serializeTo(addr: Buffer, amount: number) {
  return Buffer.concat([num1(1), addr, num7(amount)])
}

function serializeFrom(pubKey: Buffer, sig: Buffer, amount: number) {
  return Buffer.concat([num1(1), pubKey, sig, num7(amount), num1(WEBD_TOKEN_ID.length), WEBD_TOKEN_ID])
}

export type WebdTxResult = { txId: string; serializedHex: string }

export function buildWebdTx(params: {
  recipientAddress: string
  amountWebd: number
  feeWebd: number
  nonce: number
}): WebdTxResult {
  const { secretHex, publicKeyHex, unencodedAddressHex } = getBridgeWallet()

  const amountUnits = Math.round(params.amountWebd * WEBD_UNITS)
  const feeUnits = Math.round(params.feeWebd * WEBD_UNITS)
  const fromAmountUnits = amountUnits + feeUnits

  const fromUnencoded = Buffer.from(unencodedAddressHex, 'hex')
  const fromPublicKey = Buffer.from(publicKeyHex, 'hex')
  const toUnencoded = Buffer.from(decodeAddressToUnencodedHex(params.recipientAddress), 'hex')

  const nonce = params.nonce
  const timeLock = 0

  const signingPayload = Buffer.concat([
    num1(DEFAULT_TX_VERSION), num2(nonce), num3(timeLock),
    fromUnencoded, fromPublicKey, fromPublicKey,
    num1(1), num7(fromAmountUnits),
    serializeTo(toUnencoded, amountUnits),
  ])

  const secretSeed = Buffer.from(secretHex, 'hex')
  const keyPair = nacl.sign.keyPair.fromSeed(secretSeed)
  const signature = Buffer.from(nacl.sign.detached(signingPayload, keyPair.secretKey))

  const serialized = Buffer.concat([
    num1(DEFAULT_TX_VERSION), num2(nonce), num3(timeLock),
    serializeFrom(fromPublicKey, signature, fromAmountUnits),
    serializeTo(toUnencoded, amountUnits),
  ])

  const txId = createHash('sha256').update(createHash('sha256').update(serialized).digest()).digest('hex')
  return { txId, serializedHex: serialized.toString('hex') }
}

// ─── Broadcast ───────────────────────────────────────────────────────────────

export async function broadcastWebdTx(serializedHex: string, txId: string): Promise<void> {
  const nodes = config.webdFallbackNodes.length > 0 ? config.webdFallbackNodes : [config.webdNodeApi]
  const errors: string[] = []

  for (const node of nodes) {
    try {
      const url = `${node}/chain/transactions/new`
      const resp = await axios.post(url, { tx: serializedHex }, { timeout: 15_000 })
      const remoteTxId = resp.data?.txId || resp.data?.transaction
      if (typeof remoteTxId === 'string' && /^[a-f0-9]{64}$/i.test(remoteTxId)) {
        console.log(`[burn] Broadcast ok via ${node}, txId: ${remoteTxId.slice(0, 12)}`)
        return
      }
      errors.push(`${node}: unexpected response ${JSON.stringify(resp.data).slice(0, 100)}`)
    } catch (err) {
      errors.push(`${node}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  throw new Error(`Broadcast esuat pe toate nodurile: ${errors.join('; ')}`)
}

// ─── Wallet helper ────────────────────────────────────────────────────────────

function getBridgeWallet() {
  const { bridgeWalletSecretHex: secretHex, bridgeWalletPublicKeyHex: publicKeyHex, bridgeWalletUnencodedAddressHex: unencodedAddressHex } = config
  if (!secretHex || !publicKeyHex || !unencodedAddressHex) {
    throw new Error('Bridge wallet credentials nu sunt configurate in .env')
  }
  return { secretHex, publicKeyHex, unencodedAddressHex }
}

// ─── getNonce ────────────────────────────────────────────────────────────────

export async function getWebdNonce(webdAddress: string): Promise<number> {
  const nodes = config.webdFallbackNodes.length > 0 ? config.webdFallbackNodes : [config.webdNodeApi]
  for (const node of nodes) {
    try {
      const resp = await axios.get(`${node}/wallets/${encodeURIComponent(webdAddress)}/nonce`, { timeout: 8_000 })
      const nonce = resp.data?.nonce ?? resp.data?.result
      if (typeof nonce === 'number') return nonce
    } catch {
      // try next
    }
  }
  return 0
}

/**
 * Trimite WEBD nativ catre adresa userului.
 * Apelata de monitor.ts dupa detectarea unui burn wWEBD pe Polygon.
 */
export async function releaseWEBD(toWebdAddress: string, amountWebd: number): Promise<string> {
  const feeWebd = config.bridgeTxFeeWebd
  const netAmount = amountWebd - feeWebd
  if (netAmount <= 0) throw new Error(`Amount prea mic dupa scaderea fee-ului (${feeWebd} WEBD)`)

  const nonce = await getWebdNonce(config.bridgeLockWebdAddress)
  const { txId, serializedHex } = buildWebdTx({
    recipientAddress: toWebdAddress,
    amountWebd: netAmount,
    feeWebd,
    nonce,
  })
  console.log(`[burn] Releasing ${netAmount} WEBD to ${toWebdAddress}, fee ${feeWebd}, txId: ${txId.slice(0, 12)}`)
  await broadcastWebdTx(serializedHex, txId)
  return txId
}
