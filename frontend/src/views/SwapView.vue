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
      <div class="card-title">Schimba WEBD cu USDC</div>

      <div class="panel">
        <div class="input-label">Dau</div>
        <div class="input-row" style="margin-top:8px">
          <input
            class="token-input"
            type="number"
            min="0"
            placeholder="0.0"
            v-model="swap.sellAmountStr.value"
          />
          <div class="token-badge">
            {{ swap.sellToken.value === 'wwwebd' ? 'WEBD' : 'USDC' }}
          </div>
        </div>
        <div class="balance-row" style="margin-top:8px">
          <span>Sold: {{ formatAmount(swap.sellBalance.value, swap.sellDecimals.value, 4) }}</span>
          <span class="balance-max" @click="setMaxSell">MAX</span>
        </div>
      </div>

      <div class="swap-arrow" @click="swap.flipTokens()" style="cursor:pointer" title="Schimba sensul">&#8645;</div>

      <div class="panel">
        <div class="input-label">Primesc (estimativ)</div>
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
            {{ swap.sellToken.value === 'wwwebd' ? 'USDC' : 'WEBD' }}
          </div>
        </div>
      </div>

      <div style="margin-top:16px">
        <button v-if="!wallet.isConnected.value" class="btn btn-primary" style="width:100%" @click="wallet.connect()">
          Conecteaza Wallet
        </button>
        <button v-else-if="wallet.isWrongNetwork.value" class="btn btn-primary" style="width:100%;background:var(--warning)" @click="wallet.switchNetwork()">
          Schimba pe Polygon
        </button>
        <template v-else>
          <button
            v-if="swap.needsApproval.value"
            class="btn btn-primary"
            style="width:100%"
            :disabled="swap.loading.value || swap.sellAmountBig.value === 0n"
            @click="swap.doApprove()"
          >
            <span v-if="swap.loading.value" class="spinner"></span>
            Aproba {{ swap.sellToken.value === 'wwwebd' ? 'WEBD' : 'USDC' }}
          </button>
          <button
            v-else
            class="btn btn-primary"
            style="width:100%"
            :disabled="swap.loading.value || swap.sellAmountBig.value === 0n || swap.buyAmountBig.value === 0n"
            @click="swap.doSwap()"
          >
            <span v-if="swap.loading.value" class="spinner"></span>
            Schimba
          </button>
        </template>
      </div>

      <div v-if="swap.error.value" class="alert alert-error" style="margin-top:14px">{{ swap.error.value }}</div>
      <div v-if="swap.txHash.value" class="alert alert-success" style="margin-top:14px">
        Tranzactie confirmata!
        <a :href="`https://polygonscan.com/tx/${swap.txHash.value}`" target="_blank" style="margin-left:6px">Vezi pe Polygonscan</a>
      </div>
    </div>

    <div class="card" style="margin-top:24px">
      <div class="card-title">Log activitate</div>
      <div style="font-size:13px;white-space:pre-line;color:var(--text-dim)">
        {{ swap.error.value || swap.txHash.value || 'Gata de schimb.' }}
      </div>
    </div>

    <div v-if="swap.reserveWWEBD.value > 0n" class="card" style="margin-top:16px">
      <div style="font-size:13px;color:var(--text-dim);margin-bottom:8px">Rezerve pool</div>
      <div class="info-row">
        <span>WEBD</span>
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
