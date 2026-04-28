import { createRouter, createWebHistory } from 'vue-router'
import SwapView from '../views/SwapView.vue'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: SwapView },
    { path: '/liquidity', component: () => import('../views/LiquidityView.vue') },
    { path: '/bridge', component: () => import('../views/BridgeView.vue') },
    { path: '/stats', component: () => import('../views/StatsView.vue') },
  ],
})
