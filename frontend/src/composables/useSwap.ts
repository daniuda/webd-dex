import { ref, computed, watch } from 'vue'
import { getPairReserves, getTokenBalance, getAllowance, approve, swap, WWWEBD_ADDR, USDC_ADDR, WWWEBD_DECIMALS, USDC_DECIMALS } from '../services/dexApi'
import { calcAmountOut, calcPriceImpact, calcMinAmountOut } from '../utils/amm'
import { parseAmount, formatAmount } from '../utils/format'
import { useWallet } from './useWallet'

export function useSwap() {
  const { address, getSigner } = useWallet()

  const sellToken = ref<'wwwebd' | 'usdc'>('wwwebd')
  const sellAmountStr = ref('')
  const buyAmountStr = ref('')
  const slippage = ref(0.5)
  const loading = ref(false)
  const txHash = ref('')
  const error = ref('')

  const reserveWWEBD = ref(0n)
  const reserveUSDC = ref(0n)
  const sellBalance = ref(0n)
  const buyBalance = ref(0n)
  const sellAllowance = ref(0n)

  const sellAddr = computed(() => sellToken.value === 'wwwebd' ? WWWEBD_ADDR : USDC_ADDR)
  const buyAddr = computed(() => sellToken.value === 'wwwebd' ? USDC_ADDR : WWWEBD_ADDR)
  const sellDecimals = computed(() => sellToken.value === 'wwwebd' ? WWWEBD_DECIMALS : USDC_DECIMALS)
  const buyDecimals = computed(() => sellToken.value === 'wwwebd' ? USDC_DECIMALS : WWWEBD_DECIMALS)

  const sellAmountBig = computed(() => {
    try { return parseAmount(sellAmountStr.value, sellDecimals.value) } catch { return 0n }
  })

  const buyAmountBig = computed(() => {
    const rIn = sellToken.value === 'wwwebd' ? reserveWWEBD.value : reserveUSDC.value
    const rOut = sellToken.value === 'wwwebd' ? reserveUSDC.value : reserveWWEBD.value
    return calcAmountOut(sellAmountBig.value, rIn, rOut)
  })

  const priceImpact = computed(() => {
    const rIn = sellToken.value === 'wwwebd' ? reserveWWEBD.value : reserveUSDC.value
    const rOut = sellToken.value === 'wwwebd' ? reserveUSDC.value : reserveWWEBD.value
    return calcPriceImpact(sellAmountBig.value, rIn, rOut)
  })

  const needsApproval = computed(() => sellAmountBig.value > 0n && sellAllowance.value < sellAmountBig.value)

  watch(buyAmountBig, (v) => {
    buyAmountStr.value = v > 0n ? formatAmount(v, buyDecimals.value, 6) : ''
  })

  async function loadMarket() {
    const { reserveWWEBD: rW, reserveUSDC: rU } = await getPairReserves()
    reserveWWEBD.value = rW
    reserveUSDC.value = rU
    if (address.value) {
      sellBalance.value = await getTokenBalance(sellAddr.value, address.value)
      buyBalance.value = await getTokenBalance(buyAddr.value, address.value)
      sellAllowance.value = await getAllowance(sellAddr.value, address.value, import.meta.env.VITE_ROUTER_ADDRESS)
    }
  }

  function flipTokens() {
    sellToken.value = sellToken.value === 'wwwebd' ? 'usdc' : 'wwwebd'
    sellAmountStr.value = ''
    buyAmountStr.value = ''
    loadMarket()
  }

  async function doApprove() {
    const signer = await getSigner()
    if (!signer) return
    loading.value = true; error.value = ''
    try {
      await approve(sellAddr.value, import.meta.env.VITE_ROUTER_ADDRESS, sellAmountBig.value, signer)
      sellAllowance.value = await getAllowance(sellAddr.value, address.value, import.meta.env.VITE_ROUTER_ADDRESS)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  async function doSwap() {
    const signer = await getSigner()
    if (!signer || sellAmountBig.value === 0n) return
    loading.value = true; error.value = ''; txHash.value = ''
    try {
      const minOut = calcMinAmountOut(buyAmountBig.value, slippage.value)
      txHash.value = await swap(sellAmountBig.value, minOut, sellAddr.value, buyAddr.value, address.value, signer)
      sellAmountStr.value = ''
      await loadMarket()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  return {
    sellToken, sellAmountStr, buyAmountStr, slippage, loading, txHash, error,
    reserveWWEBD, reserveUSDC, sellBalance, buyBalance,
    sellAmountBig, buyAmountBig, priceImpact, needsApproval,
    sellDecimals, buyDecimals, sellAddr, buyAddr,
    loadMarket, flipTokens, doApprove, doSwap,
  }
}
