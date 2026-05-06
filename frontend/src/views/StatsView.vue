<script setup lang="ts">

import { ref, onMounted, computed } from 'vue'
import { getPairReserves, getPairLpSupply, WWWEBD_DECIMALS, USDC_DECIMALS } from '../services/dexApi'
import { formatAmount } from '../utils/format'

const wwwebdAddr = import.meta.env.VITE_WWWEBD_ADDRESS as string
const routerAddr = import.meta.env.VITE_ROUTER_ADDRESS as string

const reserveWWEBD = ref(0n)
const reserveUSDC = ref(0n)
const pairAddr = ref('')
const lpSupply = ref(0n)
const loading = ref(true)
const error = ref('')

const priceWWEBD = computed(() => {
  if (reserveWWEBD.value === 0n) return 0
  // USDC has 6 decimals, wWEBD has 18
  // price = reserveUSDC / reserveWWEBD * 10^12
  return Number(reserveUSDC.value * 10n**12n) / Number(reserveWWEBD.value)
})

const tvlUSD = computed(() => {
  // TVL = 2 * reserveUSDC (in human units)
  return Number(reserveUSDC.value) / 1e6 * 2
})

onMounted(async () => {
  try {
    const data = await getPairReserves()
    reserveWWEBD.value = data.reserveWWEBD
    reserveUSDC.value = data.reserveUSDC
    pairAddr.value = data.pairAddr
    if (data.pairAddr && data.pairAddr !== '0x0000000000000000000000000000000000000000') {
      lpSupply.value = await getPairLpSupply(data.pairAddr)
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="page">
    <h2 style="margin-bottom:32px">Pool Stats</h2>

    <div v-if="loading" style="color:var(--text-dim);text-align:center;padding:60px">Loading…</div>
    <div v-else-if="error" class="alert alert-error">{{ error }}</div>
    <template v-else>

      <!-- KPI cards -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;margin-bottom:32px">
        <div class="card" style="text-align:center">
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);margin-bottom:8px">TVL</div>
          <div style="font-size:28px;font-weight:700;color:var(--text-h)">${{ tvlUSD.toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2}) }}</div>
        </div>
        <div class="card" style="text-align:center">
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);margin-bottom:8px">WEBD Price</div>
          <div style="font-size:28px;font-weight:700;color:var(--accent)">${{ priceWWEBD.toFixed(6) }}</div>
        </div>
        <div class="card" style="text-align:center">
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);margin-bottom:8px">LP Supply</div>
          <div style="font-size:28px;font-weight:700;color:var(--text-h)">{{ formatAmount(lpSupply, 18, 2) }}</div>
        </div>
      </div>

      <!-- Reserves -->
      <div class="card" style="margin-bottom:24px">
        <div class="card-title">Pool Reserves</div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Token</th>
              <th>Reserve</th>
              <th>Value (USD)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><span class="token-badge" style="display:inline-flex">WEBD</span></td>
              <td>{{ formatAmount(reserveWWEBD, WWWEBD_DECIMALS, 2) }}</td>
              <td>${{ (Number(reserveWWEBD) / 1e18 * priceWWEBD).toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2}) }}</td>
            </tr>
            <tr>
              <td><span class="token-badge" style="display:inline-flex">USDC</span></td>
              <td>{{ formatAmount(reserveUSDC, USDC_DECIMALS, 2) }}</td>
              <td>${{ (Number(reserveUSDC) / 1e6).toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2}) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Contract addresses -->
      <div class="card">
        <div class="card-title">Contract Addresses</div>
        <table class="data-table">
          <tbody>
            <tr>
              <td style="color:var(--text-dim)">Pair</td>
              <td>
                <a v-if="pairAddr" :href="`https://polygonscan.com/address/${pairAddr}`" target="_blank"
                  style="font-family:monospace;font-size:13px">{{ pairAddr }}</a>
                <span v-else style="color:var(--text-dim)">Not deployed</span>
              </td>
            </tr>
            <tr>
              <td style="color:var(--text-dim)">WEBD</td>
              <td>
                <a :href="`https://polygonscan.com/address/${wwwebdAddr}`" target="_blank"
                  style="font-family:monospace;font-size:13px">{{ wwwebdAddr || '—' }}</a>
              </td>
            </tr>
            <tr>
              <td style="color:var(--text-dim)">Router</td>
              <td>
                <a :href="`https://polygonscan.com/address/${routerAddr}`" target="_blank"
                  style="font-family:monospace;font-size:13px">{{ routerAddr || '—' }}</a>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

    </template>
  </div>
</template>
