<script setup lang="ts">
import { onMounted } from 'vue'
import { useSwap } from '../composables/useSwap'
import { useWallet } from '../composables/useWallet'
import { formatAmount } from '../utils/format'
import { WWWEBD_DECIMALS, USDC_DECIMALS } from '../services/dexApi'

const wallet = useWallet()
const swap = useSwap()

onMounted(() => swap.loadMarket())

function setMaxSell() {
  const decimals = swap.sellToken.value === 'wwwebd' ? WWWEBD_DECIMALS : USDC_DECIMALS
  swap.sellAmountStr.value = formatAmount(swap.sellBalance.value, decimals, 6)
}
</script>

<template>
  <div class="page-narrow">
    <div class="card">
      <div class="card-title">Swap</div>

      <!-- Sell side -->
      <div class="panel">
        <div class="input-label">You sell</div>
        <div class="input-row" style="margin-top:8px">
          <input
            class="token-input"
            type="number"
            min="0"
            placeholder="0.0"
            v-model="swap.sellAmountStr.value"
          />
          <div class="token-badge">
            {{ swap.sellToken.value === 'wwwebd' ? 'wWEBD' : 'USDC' }}
          </div>
        </div>
        <div class="balance-row" style="margin-top:8px">
          <span>Balance: {{ formatAmount(swap.sellBalance.value, swap.sellDecimals.value, 4) }}</span>
          <span class="balance-max" @click="setMaxSell">MAX</span>
        </div>
      </div>

      <!-- Flip arrow -->
      <div class="swap-arrow" @click="swap.flipTokens()" style="cursor:pointer" title="Flip tokens">⇅</div>

      <!-- Buy side -->
      <div class="panel">
        <div class="input-label">You receive (estimated)</div>
        <div class="input-row" style="margin-top:8px">
          <input
            class="token-input"
            type="number"
            min="0"
            placeholder="0.0"
            :value="swap.buyAmountStr.value"
            readonly
          />
          <div class="token-badge">
            {{ swap.sellToken.value === 'wwwebd' ? 'USDC' : 'wWEBD' }}
          </div>
        </div>
        <div class="balance-row" style="margin-top:8px">
          <span>Balance: {{ formatAmount(swap.buyBalance.value, swap.buyDecimals.value, 4) }}</span>
        </div>
      </div>

      <!-- Info rows -->
      <div v-if="swap.buyAmountBig.value > 0n" style="margin-top:16px;display:flex;flex-direction:column;gap:4px">
        <div class="info-row">
          <span>Price impact</span>
          <span :class="['info-val', swap.priceImpact.value > 5 ? 'info-val-accent' : '']"
            :style="swap.priceImpact.value > 5 ? 'color:var(--error)' : ''">
            {{ swap.priceImpact.value.toFixed(2) }}%
          </span>
        </div>
        <div class="info-row">
          <span>Slippage tolerance</span>
          <span class="info-val">{{ swap.slippage.value }}%</span>
        </div>
        <div class="info-row">
          <span>Min received</span>
          <span class="info-val">
            {{ formatAmount(
              BigInt(Math.floor(Number(swap.buyAmountBig.value) * (1 - swap.slippage.value / 100))),
              swap.buyDecimals.value, 6
            ) }} {{ swap.sellToken.value === 'wwwebd' ? 'USDC' : 'wWEBD' }}
          </span>
        </div>
      </div>

      <!-- Slippage -->
      <div class="info-row" style="margin-top:12px;gap:8px;justify-content:flex-start">
        <span style="font-size:13px;color:var(--text-dim)">Slippage:</span>
        <button
          v-for="pct in [0.1, 0.5, 1.0]" :key="pct"
          :class="['btn','btn-sm','btn-outline', swap.slippage.value === pct ? 'active-slippage' : '']"
          @click="swap.slippage.value = pct"
          style="padding:4px 10px;font-size:12px"
        >{{ pct }}%</button>
      </div>

      <!-- Error / Tx -->
      <div v-if="swap.error.value" class="alert alert-error" style="margin-top:14px">{{ swap.error.value }}</div>
      <div v-if="swap.txHash.value" class="alert alert-success" style="margin-top:14px">
        Swap confirmed!
        <a :href="`https://polygonscan.com/tx/${swap.txHash.value}`" target="_blank" style="margin-left:6px">View on Polygonscan ↗</a>
      </div>

      <!-- Action buttons -->
      <div style="margin-top:20px">
        <button v-if="!wallet.isConnected.value" class="btn btn-primary" @click="wallet.connect()">
          Connect Wallet
        </button>
        <button v-else-if="wallet.isWrongNetwork.value" class="btn btn-primary" style="background:var(--warning)" @click="wallet.switchNetwork()">
          Switch to Polygon
        </button>
        <template v-else>
          <button
            v-if="swap.needsApproval.value"
            class="btn btn-primary"
            :disabled="swap.loading.value || swap.sellAmountBig.value === 0n"
            @click="swap.doApprove()"
          >
            <span v-if="swap.loading.value" class="spinner"></span>
            Approve {{ swap.sellToken.value === 'wwwebd' ? 'wWEBD' : 'USDC' }}
          </button>
          <button
            v-else
            class="btn btn-primary"
            :disabled="swap.loading.value || swap.sellAmountBig.value === 0n || swap.buyAmountBig.value === 0n"
            @click="swap.doSwap()"
          >
            <span v-if="swap.loading.value" class="spinner"></span>
            Swap
          </button>
        </template>
      </div>
    </div>

    <!-- Pool info -->
    <div v-if="swap.reserveWWEBD.value > 0n" style="margin-top:16px" class="card">
      <div style="font-size:13px;color:var(--text-dim);margin-bottom:8px">Pool reserves</div>
      <div class="info-row">
        <span>wWEBD</span>
        <span class="info-val">{{ formatAmount(swap.reserveWWEBD.value, WWWEBD_DECIMALS, 2) }}</span>
      </div>
      <div class="info-row">
        <span>USDC</span>
        <span class="info-val">{{ formatAmount(swap.reserveUSDC.value, USDC_DECIMALS, 2) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.active-slippage {
  background: var(--accent-bg);
  color: var(--accent);
  border-color: var(--accent-border);
}
</style>
