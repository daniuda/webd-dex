<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useLiquidity } from '../composables/useLiquidity'
import { useWallet } from '../composables/useWallet'
import { formatAmount } from '../utils/format'
import { WWWEBD_DECIMALS, USDC_DECIMALS } from '../services/dexApi'

const wallet = useWallet()
const liq = useLiquidity()
const tab = ref<'add' | 'remove'>('add')

onMounted(() => liq.load())
</script>

<template>
  <div class="page-narrow">
    <div class="card">
      <div class="card-title">Liquidity</div>

      <div class="tabs" style="margin-bottom:20px">
        <button :class="['tab-btn', tab === 'add' ? 'active' : '']" @click="tab = 'add'">Add</button>
        <button :class="['tab-btn', tab === 'remove' ? 'active' : '']" @click="tab = 'remove'">Remove</button>
      </div>

      <!-- ─── ADD TAB ─── -->
      <template v-if="tab === 'add'">
        <div class="panel">
          <div class="input-label">wWEBD amount</div>
          <div class="input-row" style="margin-top:8px">
            <input class="token-input" type="number" min="0" placeholder="0.0"
              v-model="liq.amountWWEBDStr.value"
              @input="liq.syncUSDCFromWWEBD()" />
            <div class="token-badge">wWEBD</div>
          </div>
          <div class="balance-row" style="margin-top:6px">
            <span>Balance: {{ formatAmount(liq.wwwebdBalance.value, WWWEBD_DECIMALS, 4) }}</span>
            <span class="balance-max" @click="liq.amountWWEBDStr.value = formatAmount(liq.wwwebdBalance.value, WWWEBD_DECIMALS, 6); liq.syncUSDCFromWWEBD()">MAX</span>
          </div>
        </div>

        <div class="swap-arrow">+</div>

        <div class="panel">
          <div class="input-label">USDC amount</div>
          <div class="input-row" style="margin-top:8px">
            <input class="token-input" type="number" min="0" placeholder="0.0"
              v-model="liq.amountUSDCStr.value"
              @input="liq.syncWWEBDFromUSDC()" />
            <div class="token-badge">USDC</div>
          </div>
          <div class="balance-row" style="margin-top:6px">
            <span>Balance: {{ formatAmount(liq.usdcBalance.value, USDC_DECIMALS, 4) }}</span>
            <span class="balance-max" @click="liq.amountUSDCStr.value = formatAmount(liq.usdcBalance.value, USDC_DECIMALS, 6); liq.syncWWEBDFromUSDC()">MAX</span>
          </div>
        </div>

        <div style="margin-top:14px;display:flex;flex-direction:column;gap:4px">
          <div class="info-row">
            <span>Slippage</span>
            <span class="info-val">{{ liq.slippage.value }}%</span>
          </div>
          <div v-if="liq.reserveWWEBD.value > 0n" class="info-row">
            <span>Pool rate</span>
            <span class="info-val">
              1 wWEBD = {{ formatAmount(liq.reserveUSDC.value * 10n**BigInt(WWWEBD_DECIMALS) / (liq.reserveWWEBD.value || 1n), WWWEBD_DECIMALS, 4) }} USDC
            </span>
          </div>
        </div>

        <div v-if="liq.error.value" class="alert alert-error" style="margin-top:14px">{{ liq.error.value }}</div>
        <div v-if="liq.txHash.value" class="alert alert-success" style="margin-top:14px">
          Liquidity added!
          <a :href="`https://polygonscan.com/tx/${liq.txHash.value}`" target="_blank" style="margin-left:6px">View ↗</a>
        </div>

        <div style="margin-top:20px;display:flex;flex-direction:column;gap:10px">
          <template v-if="!wallet.isConnected.value">
            <button class="btn btn-primary" @click="wallet.connect()">Connect Wallet</button>
          </template>
          <template v-else-if="wallet.isWrongNetwork.value">
            <button class="btn btn-primary" style="background:var(--warning)" @click="wallet.switchNetwork()">Switch to Polygon</button>
          </template>
          <template v-else>
            <button v-if="liq.needsApproveWWEBD.value" class="btn btn-outline"
              :disabled="liq.loading.value" @click="liq.doApproveWWEBD()">
              <span v-if="liq.loading.value" class="spinner"></span>
              Approve wWEBD
            </button>
            <button v-if="liq.needsApproveUSDC.value" class="btn btn-outline"
              :disabled="liq.loading.value" @click="liq.doApproveUSDC()">
              <span v-if="liq.loading.value" class="spinner"></span>
              Approve USDC
            </button>
            <button class="btn btn-primary"
              :disabled="liq.loading.value || liq.amountWWEBDBig.value === 0n || liq.amountUSDCBig.value === 0n || liq.needsApproveWWEBD.value || liq.needsApproveUSDC.value"
              @click="liq.doAddLiquidity()">
              <span v-if="liq.loading.value" class="spinner"></span>
              Add Liquidity
            </button>
          </template>
        </div>
      </template>

      <!-- ─── REMOVE TAB ─── -->
      <template v-else>
        <div class="panel">
          <div class="input-label">Your LP position</div>
          <div style="margin-top:12px;display:flex;flex-direction:column;gap:6px">
            <div class="info-row">
              <span>LP tokens</span>
              <span class="info-val">{{ formatAmount(liq.userLp.value, 18, 6) }}</span>
            </div>
            <div class="info-row">
              <span>Pool share</span>
              <span class="info-val">{{ liq.userSharePct.value.toFixed(2) }}%</span>
            </div>
            <div class="info-row">
              <span>wWEBD in pool</span>
              <span class="info-val">{{ formatAmount(liq.userWWEBDInPool.value, WWWEBD_DECIMALS, 4) }}</span>
            </div>
            <div class="info-row">
              <span>USDC in pool</span>
              <span class="info-val">{{ formatAmount(liq.userUSDCInPool.value, USDC_DECIMALS, 4) }}</span>
            </div>
          </div>
        </div>

        <div style="margin-top:20px">
          <div class="input-label" style="margin-bottom:8px">Remove amount: {{ liq.removePct.value }}%</div>
          <input type="range" min="0" max="100" v-model="liq.removePctStr.value"
            style="width:100%;accent-color:var(--accent)" />
          <div style="display:flex;gap:8px;margin-top:10px">
            <button v-for="pct in [25,50,75,100]" :key="pct"
              class="btn btn-outline btn-sm" style="flex:1"
              @click="liq.removePctStr.value = String(pct)">{{ pct }}%</button>
          </div>
        </div>

        <div style="margin-top:14px;display:flex;flex-direction:column;gap:4px">
          <div class="info-row">
            <span>You receive wWEBD</span>
            <span class="info-val">{{ formatAmount(liq.removeWWEBD.value, WWWEBD_DECIMALS, 4) }}</span>
          </div>
          <div class="info-row">
            <span>You receive USDC</span>
            <span class="info-val">{{ formatAmount(liq.removeUSDC.value, USDC_DECIMALS, 4) }}</span>
          </div>
        </div>

        <div v-if="liq.error.value" class="alert alert-error" style="margin-top:14px">{{ liq.error.value }}</div>
        <div v-if="liq.txHash.value" class="alert alert-success" style="margin-top:14px">
          Liquidity removed!
          <a :href="`https://polygonscan.com/tx/${liq.txHash.value}`" target="_blank" style="margin-left:6px">View ↗</a>
        </div>

        <div style="margin-top:20px">
          <button v-if="!wallet.isConnected.value" class="btn btn-primary" @click="wallet.connect()">Connect Wallet</button>
          <button v-else-if="wallet.isWrongNetwork.value" class="btn btn-primary" style="background:var(--warning)" @click="wallet.switchNetwork()">Switch to Polygon</button>
          <button v-else class="btn btn-danger btn-primary"
            :disabled="liq.loading.value || liq.removeLP.value === 0n"
            @click="liq.doRemoveLiquidity()">
            <span v-if="liq.loading.value" class="spinner"></span>
            Remove Liquidity
          </button>
        </div>
      </template>
    </div>
  </div>
</template>
