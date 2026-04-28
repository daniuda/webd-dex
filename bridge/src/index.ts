import express from 'express'
import { randomUUID } from 'crypto'
import { config } from './config.js'
import { initDb, createRequest, getRequest, getRecentRequests } from './db.js'
import { startMonitor, stopMonitor } from './monitor.js'
import { getWWEBDBalance } from './mint.js'

const app = express()
app.use(express.json())

// ─── Health ───────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() })
})

// ─── Deposit: WEBD → wWEBD ────────────────────────────────────────────────────

/**
 * POST /api/bridge/deposit
 * Body: { webdAddress: string, evmAddress: string, amountWebd: number }
 *
 * Creeaza o cerere de deposit. Userul trebuie sa trimita amountWebd WEBD
 * catre BRIDGE_LOCK_WEBD_ADDRESS. Bridge-ul va detecta tranzactia si va
 * minta wWEBD catre evmAddress.
 */
app.post('/api/bridge/deposit', (req, res) => {
  try {
    const { webdAddress, evmAddress, amountWebd } = req.body as {
      webdAddress?: string
      evmAddress?: string
      amountWebd?: number
    }

    if (!webdAddress || typeof webdAddress !== 'string') {
      res.status(400).json({ error: 'webdAddress este obligatoriu' }); return
    }
    if (!evmAddress || !/^0x[a-fA-F0-9]{40}$/.test(evmAddress)) {
      res.status(400).json({ error: 'evmAddress invalid (trebuie adresa EVM valida)' }); return
    }
    if (!amountWebd || typeof amountWebd !== 'number' || amountWebd <= 0) {
      res.status(400).json({ error: 'amountWebd trebuie sa fie un numar pozitiv' }); return
    }
    if (amountWebd > config.bridgeMaxAmountWebd) {
      res.status(400).json({ error: `Suma maxima per request: ${config.bridgeMaxAmountWebd} WEBD` }); return
    }
    if (amountWebd <= config.bridgeTxFeeWebd) {
      res.status(400).json({ error: `Suma trebuie sa fie mai mare decat fee-ul: ${config.bridgeTxFeeWebd} WEBD` }); return
    }

    const id = randomUUID()
    createRequest({ id, direction: 'deposit', webdAddress, evmAddress, amountWebd, createdAt: Date.now() })

    res.json({
      ok: true,
      requestId: id,
      instructions: {
        sendTo: config.bridgeLockWebdAddress,
        amount: amountWebd,
        note: `Trimite exact ${amountWebd} WEBD catre ${config.bridgeLockWebdAddress}. Bridge-ul va detecta automat tranzactia si va minta ${amountWebd} wWEBD catre ${evmAddress} pe Polygon.`,
      },
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

// ─── Withdrawal: wWEBD → WEBD ─────────────────────────────────────────────────

/**
 * POST /api/bridge/withdraw
 * Body: { evmAddress: string, webdAddress: string, amountWebd: number }
 *
 * Inregistreaza o cerere de retragere. Userul trebuie sa apeleze
 * wWEBD.burnForWithdrawal(amount) pe Polygon. Bridge-ul detecteaza
 * evenimentul BridgeBurn si trimite WEBD nativ catre webdAddress.
 */
app.post('/api/bridge/withdraw', (req, res) => {
  try {
    const { evmAddress, webdAddress, amountWebd } = req.body as {
      evmAddress?: string
      webdAddress?: string
      amountWebd?: number
    }

    if (!evmAddress || !/^0x[a-fA-F0-9]{40}$/.test(evmAddress)) {
      res.status(400).json({ error: 'evmAddress invalid' }); return
    }
    if (!webdAddress || typeof webdAddress !== 'string') {
      res.status(400).json({ error: 'webdAddress este obligatoriu' }); return
    }
    if (!amountWebd || typeof amountWebd !== 'number' || amountWebd <= 0) {
      res.status(400).json({ error: 'amountWebd trebuie sa fie un numar pozitiv' }); return
    }
    if (amountWebd > config.bridgeMaxAmountWebd) {
      res.status(400).json({ error: `Suma maxima per request: ${config.bridgeMaxAmountWebd} WEBD` }); return
    }
    if (amountWebd <= config.bridgeTxFeeWebd) {
      res.status(400).json({ error: `Suma trebuie sa fie mai mare decat fee-ul: ${config.bridgeTxFeeWebd} WEBD` }); return
    }

    const id = randomUUID()
    createRequest({ id, direction: 'withdrawal', webdAddress, evmAddress, amountWebd, createdAt: Date.now() })

    res.json({
      ok: true,
      requestId: id,
      instructions: {
        callContract: config.wwwebdAddress,
        method: 'burnForWithdrawal',
        amount: amountWebd,
        note: `Apeleaza burnForWithdrawal(${BigInt(Math.round(amountWebd * 1e18)).toString()}) pe contractul wWEBD (${config.wwwebdAddress}). Bridge-ul va detecta burn-ul si va trimite ${amountWebd - config.bridgeTxFeeWebd} WEBD (minus fee ${config.bridgeTxFeeWebd} WEBD) catre ${webdAddress}.`,
      },
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

// ─── Status ───────────────────────────────────────────────────────────────────

app.get('/api/bridge/status/:requestId', (req, res) => {
  const request = getRequest(req.params.requestId)
  if (!request) { res.status(404).json({ error: 'Request not found' }); return }
  res.json(request)
})

// ─── Recent requests (admin view) ─────────────────────────────────────────────

app.get('/api/bridge/requests', (_req, res) => {
  res.json(getRecentRequests(50))
})

// ─── Bridge info ──────────────────────────────────────────────────────────────

app.get('/api/bridge/info', async (_req, res) => {
  let bridgeBalance = null
  try {
    if (config.wwwebdAddress && config.bridgeHotWalletKey) {
      const { ethers } = await import('ethers')
      const wallet = new ethers.Wallet(config.bridgeHotWalletKey)
      bridgeBalance = await getWWEBDBalance(wallet.address)
    }
  } catch { /* ignore */ }

  res.json({
    lockAddress: config.bridgeLockWebdAddress,
    wwwebdContract: config.wwwebdAddress,
    maxAmountWebd: config.bridgeMaxAmountWebd,
    feeWebd: config.bridgeTxFeeWebd,
    bridgeHotWalletBalance: bridgeBalance,
  })
})

// ─── Start ────────────────────────────────────────────────────────────────────

function start() {
  initDb()
  startMonitor()

  const server = app.listen(config.port, () => {
    console.log(`[bridge] API running on port ${config.port}`)
    console.log(`[bridge] Lock address: ${config.bridgeLockWebdAddress || '(not set)'}`)
    console.log(`[bridge] wWEBD contract: ${config.wwwebdAddress || '(not set)'}`)
  })

  const shutdown = () => {
    console.log('\n[bridge] Shutting down...')
    stopMonitor()
    server.close(() => process.exit(0))
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

start()
