import 'dotenv/config'

function required(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Missing required env var: ${key}`)
  return value
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback
}

export const config = {
  port: Number(optional('PORT', '4000')),

  // Polygon
  polygonRpc: optional('POLYGON_RPC_URL', 'https://polygon-rpc.com'),
  wwwebdAddress: optional('WWWEBD_ADDRESS', ''),
  bridgeHotWalletKey: optional('BRIDGE_HOT_WALLET_PRIVATE_KEY', ''),

  // WEBD nativ
  bridgeLockWebdAddress: optional('BRIDGE_LOCK_WEBD_ADDRESS', ''),
  bridgeWalletSecretHex: optional('BRIDGE_WALLET_SECRET_HEX', ''),
  bridgeWalletPublicKeyHex: optional('BRIDGE_WALLET_PUBLIC_KEY_HEX', ''),
  bridgeWalletUnencodedAddressHex: optional('BRIDGE_WALLET_UNENCODED_ADDRESS_HEX', ''),

  // Noduri WEBD
  webdNodeApi: optional('WEBD_NODE_API', 'https://node.spyclub.ro:8080'),
  webdFallbackNodes: optional('WEBD_FALLBACK_NODES', 'https://node.spyclub.ro:8080,https://daniuda.ddns.net:8080')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),

  // SQLite
  dbPath: optional('DB_PATH', './data/bridge.sqlite3'),

  // Limite
  bridgeMaxAmountWebd: Number(optional('BRIDGE_MAX_AMOUNT_WEBD', '10000')),
  bridgeTxFeeWebd: Number(optional('BRIDGE_TX_FEE_WEBD', '10')),

  // Polling interval ms
  webdPollIntervalMs: Number(optional('WEBD_POLL_INTERVAL_MS', '30000')),
  polygonPollIntervalMs: Number(optional('POLYGON_POLL_INTERVAL_MS', '15000')),
} as const
