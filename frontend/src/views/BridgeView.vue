<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { getBridgeInfo, submitDeposit, submitWithdrawal, getBridgeStatus, type BridgeInfo, type BridgeRequest } from '../services/bridgeApi'
import { useWallet } from '../composables/useWallet'

const wallet = useWallet()
const tab = ref<'deposit' | 'withdraw'>('deposit')

const info = ref<BridgeInfo | null>(null)
const infoError = ref('')

const webdAddress = ref('')
const evmAddress = ref('')
const amount = ref('')
const loading = ref(false)
const error = ref('')

const requestId = ref('')
const requestStatus = ref<BridgeRequest | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  try {
    info.value = await getBridgeInfo()
  } catch {
    infoError.value = 'Bridge API unavailable'
  }
  if (wallet.isConnected.value) evmAddress.value = wallet.address.value
})

onUnmounted(() => { if (pollTimer) clearInterval(pollTimer) })

function startPolling(id: string) {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = setInterval(async () => {
    const s = await getBridgeStatus(id)
    requestStatus.value = s
    if (s.status === 'minted' || s.status === 'released' || s.status === 'failed') {
      clearInterval(pollTimer!)
      pollTimer = null
    }
  }, 5000)
}

async function submitDeposit_() {
  error.value = ''; loading.value = true
  try {
    const res = await submitDeposit({
      webdAddress: webdAddress.value,
      evmAddress: evmAddress.value || wallet.address.value,
      amountWebd: parseFloat(amount.value),
    })
    requestId.value = res.requestId
    requestStatus.value = null
    startPolling(res.requestId)
    alert(`✅ Request created!\n\nSend exactly ${res.instructions.amount} WEBD to:\n${res.instructions.sendTo}\n\nRequest ID: ${res.requestId}`)
  } catch (e: unknown) {
    const ax = e as { response?: { data?: { error?: string } }; message?: string }
    error.value = ax.response?.data?.error || ax.message || String(e)
  } finally { loading.value = false }
}

async function submitWithdraw_() {
  error.value = ''; loading.value = true
  try {
    const res = await submitWithdrawal({
      evmAddress: wallet.address.value,
      webdAddress: webdAddress.value,
      amountWebd: parseFloat(amount.value),
    })
    requestId.value = res.requestId
    requestStatus.value = null
    startPolling(res.requestId)
    alert(`✅ Request created!\n\nCall burnForWithdrawal(${BigInt(Math.round(parseFloat(amount.value) * 1e18)).toString()}) on contract:\n${res.instructions.callContract}\n\nRequest ID: ${res.requestId}`)
  } catch (e: unknown) {
    const ax = e as { response?: { data?: { error?: string } }; message?: string }
    error.value = ax.response?.data?.error || ax.message || String(e)
  } finally { loading.value = false }
}

function statusColor(s: string) {
  if (s === 'minted' || s === 'released') return 'var(--success)'
  if (s === 'failed') return 'var(--error)'
  if (s === 'confirmed') return 'var(--accent)'
  return 'var(--warning)'
}
</script>

<template>
  <div class="page-narrow">
    <!-- Bridge info -->
    <div v-if="info" class="card" style="margin-bottom:16px">
      <div style="font-size:13px;color:var(--text-dim);margin-bottom:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em">Bridge Info</div>
      <div class="info-row">
        <span>Lock address (WEBD native)</span>
        <span class="info-val" style="font-size:11px;font-family:monospace">{{ info.lockAddress }}</span>
      </div>
      <div class="info-row">
        <span>Max per request</span>
        <span class="info-val">{{ info.maxAmountWebd.toLocaleString() }} WEBD</span>
      </div>
      <div class="info-row">
        <span>Bridge fee</span>
        <span class="info-val">{{ info.feeWebd }} WEBD</span>
      </div>
      <div v-if="info.bridgeHotWalletBalance !== null" class="info-row">
        <span>Hot wallet wWEBD</span>
        <span class="info-val">{{ info.bridgeHotWalletBalance }}</span>
      </div>
    </div>
    <div v-if="infoError" class="alert alert-warn" style="margin-bottom:16px">{{ infoError }}</div>

    <div class="card">
      <div class="card-title">Bridge</div>

      <div class="tabs" style="margin-bottom:20px">
        <button :class="['tab-btn', tab === 'deposit' ? 'active' : '']" @click="tab = 'deposit'">WEBD → wWEBD</button>
        <button :class="['tab-btn', tab === 'withdraw' ? 'active' : '']" @click="tab = 'withdraw'">wWEBD → WEBD</button>
      </div>

      <!-- DEPOSIT -->
      <template v-if="tab === 'deposit'">
        <div class="alert alert-info" style="margin-bottom:16px;font-size:13px">
          Send WEBD native to the bridge lock address. You will receive wWEBD on Polygon automatically.
        </div>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div class="input-group">
            <div class="input-label">Your WEBD address (sender)</div>
            <div class="panel" style="padding:10px 14px">
              <input class="token-input" style="font-size:14px" placeholder="WEBD$..." v-model="webdAddress" />
            </div>
          </div>
          <div class="input-group">
            <div class="input-label">Destination EVM address (Polygon)</div>
            <div class="panel" style="padding:10px 14px">
              <input class="token-input" style="font-size:14px" placeholder="0x..." v-model="evmAddress" />
            </div>
            <div v-if="wallet.isConnected.value" style="font-size:12px;color:var(--text-dim)">
              <span class="balance-max" @click="evmAddress = wallet.address.value">Use connected wallet</span>
            </div>
          </div>
          <div class="input-group">
            <div class="input-label">Amount (WEBD)</div>
            <div class="panel" style="padding:10px 14px">
              <input class="token-input" style="font-size:20px" type="number" min="0" placeholder="0.0" v-model="amount" />
            </div>
            <div v-if="info" style="font-size:12px;color:var(--text-dim)">
              Fee: {{ info.feeWebd }} WEBD · Max: {{ info.maxAmountWebd.toLocaleString() }} WEBD
            </div>
          </div>
        </div>
        <div v-if="error" class="alert alert-error" style="margin-top:14px">{{ error }}</div>
        <button class="btn btn-primary" style="margin-top:20px"
          :disabled="loading || !webdAddress || !evmAddress || !amount"
          @click="submitDeposit_()">
          <span v-if="loading" class="spinner"></span>
          Create Deposit Request
        </button>
      </template>

      <!-- WITHDRAW -->
      <template v-else>
        <div class="alert alert-info" style="margin-bottom:16px;font-size:13px">
          Register your withdrawal, then call <strong>burnForWithdrawal(amount)</strong> on the wWEBD contract. You will receive WEBD native.
        </div>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div class="input-group">
            <div class="input-label">Your EVM address (Polygon)</div>
            <div class="panel" style="padding:10px 14px">
              <div v-if="wallet.isConnected.value" class="token-input" style="font-size:14px;color:var(--text-dim)">
                {{ wallet.address.value }}
              </div>
              <input v-else class="token-input" style="font-size:14px" placeholder="0x..." v-model="evmAddress" />
            </div>
            <div v-if="!wallet.isConnected.value">
              <button class="btn btn-outline btn-sm" @click="wallet.connect()">Connect Wallet</button>
            </div>
          </div>
          <div class="input-group">
            <div class="input-label">Destination WEBD address</div>
            <div class="panel" style="padding:10px 14px">
              <input class="token-input" style="font-size:14px" placeholder="WEBD$..." v-model="webdAddress" />
            </div>
          </div>
          <div class="input-group">
            <div class="input-label">Amount (wWEBD to burn)</div>
            <div class="panel" style="padding:10px 14px">
              <input class="token-input" style="font-size:20px" type="number" min="0" placeholder="0.0" v-model="amount" />
            </div>
            <div v-if="info" style="font-size:12px;color:var(--text-dim)">
              You receive: {{ amount ? Math.max(0, parseFloat(amount) - info.feeWebd).toFixed(4) : '0' }} WEBD (after fee {{ info.feeWebd }} WEBD)
            </div>
          </div>
        </div>
        <div v-if="error" class="alert alert-error" style="margin-top:14px">{{ error }}</div>
        <button class="btn btn-primary" style="margin-top:20px"
          :disabled="loading || !webdAddress || !amount || (!wallet.isConnected.value && !evmAddress)"
          @click="submitWithdraw_()">
          <span v-if="loading" class="spinner"></span>
          Create Withdrawal Request
        </button>
      </template>
    </div>

    <!-- Request status tracker -->
    <div v-if="requestId" class="card" style="margin-top:16px">
      <div style="font-size:13px;font-weight:600;color:var(--text-dim);margin-bottom:10px;text-transform:uppercase;letter-spacing:.06em">Request Status</div>
      <div class="info-row">
        <span>ID</span>
        <span style="font-size:11px;font-family:monospace;color:var(--text-dim)">{{ requestId }}</span>
      </div>
      <div v-if="requestStatus">
        <div class="info-row">
          <span>Status</span>
          <span :style="`color:${statusColor(requestStatus.status)};font-weight:600`">{{ requestStatus.status.toUpperCase() }}</span>
        </div>
        <div v-if="requestStatus.evmTxHash" class="info-row">
          <span>EVM Tx</span>
          <a :href="`https://polygonscan.com/tx/${requestStatus.evmTxHash}`" target="_blank" style="font-size:12px;font-family:monospace">
            {{ requestStatus.evmTxHash.slice(0,10) }}… ↗
          </a>
        </div>
        <div v-if="requestStatus.webdTxId" class="info-row">
          <span>WEBD Tx</span>
          <span style="font-size:12px;font-family:monospace;color:var(--text-dim)">{{ requestStatus.webdTxId.slice(0,12) }}…</span>
        </div>
        <div v-if="requestStatus.errorMsg" class="alert alert-error" style="margin-top:10px;font-size:12px">
          {{ requestStatus.errorMsg }}
        </div>
      </div>
      <div v-else style="font-size:13px;color:var(--text-dim)">Polling for updates…</div>
    </div>
  </div>
</template>
