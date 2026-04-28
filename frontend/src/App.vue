<script setup lang="ts">
import { useWallet } from './composables/useWallet'
import { shortenAddr } from './utils/format'

const { address, isConnected, isWrongNetwork, connecting, connect, switchNetwork } = useWallet()
</script>

<template>
  <div class="site-shell">
    <header class="site-header">
      <div class="header-inner">
        <RouterLink to="/" class="brand">
          <span class="brand-dot"></span>
          <span class="brand-name">wWEBD<span class="brand-accent">DEX</span></span>
        </RouterLink>

        <nav class="site-nav">
          <RouterLink to="/" class="nav-link">Swap</RouterLink>
          <RouterLink to="/liquidity" class="nav-link">Liquidity</RouterLink>
          <RouterLink to="/bridge" class="nav-link">Bridge</RouterLink>
          <RouterLink to="/stats" class="nav-link">Stats</RouterLink>
        </nav>

        <div style="flex-shrink:0">
          <button v-if="!isConnected" class="btn-connect" :disabled="connecting" @click="connect">
            {{ connecting ? 'Connecting…' : 'Connect Wallet' }}
          </button>
          <button v-else-if="isWrongNetwork" class="btn-connect" style="color:var(--warning);border-color:rgba(240,168,32,.4)" @click="switchNetwork">
            Wrong Network
          </button>
          <div v-else class="btn-connect" style="cursor:default">
            {{ shortenAddr(address) }}
          </div>
        </div>
      </div>
    </header>

    <main class="site-main">
      <RouterView />
    </main>

    <footer class="site-footer">
      <div class="footer-inner">
        <p class="footer-brand">wWEBD<span class="brand-accent">DEX</span></p>
        <p class="footer-copy">WebDollar ↔ USDC on Polygon · Non-custodial AMM</p>
        <div class="footer-links">
          <RouterLink to="/" class="footer-link">Swap</RouterLink>
          <RouterLink to="/liquidity" class="footer-link">Liquidity</RouterLink>
          <RouterLink to="/bridge" class="footer-link">Bridge</RouterLink>
          <RouterLink to="/stats" class="footer-link">Stats</RouterLink>
          <a href="https://webdollar.io" target="_blank" rel="noopener" class="footer-link">webdollar.io</a>
        </div>
      </div>
    </footer>
  </div>
</template>
