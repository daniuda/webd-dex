import { ref, computed } from 'vue'
import {
  getPairReserves, getPairLpSupply, getUserLpBalance,
  getTokenBalance, getAllowance, approve, addLiquidity, removeLiquidity,
  WWWEBD_ADDR, USDC_ADDR, WWWEBD_DECIMALS, USDC_DECIMALS,
} from '../services/dexApi'
import { parseAmount, formatAmount } from '../utils/format'
import { useWallet } from './useWallet'

export function useLiquidity() {
  const { address, getSigner } = useWallet()

  const amountWWEBDStr = ref('')
  const amountUSDCStr = ref('')
  const removePctStr = ref('100')
  const slippage = ref(0.5)
  const loading = ref(false)
  const txHash = ref('')
  const error = ref('')

  const reserveWWEBD = ref(0n)
  const reserveUSDC = ref(0n)
  const pairAddr = ref('')
  const lpSupply = ref(0n)
  const userLp = ref(0n)
  const wwwebdBalance = ref(0n)
  const usdcBalance = ref(0n)
  const wwwebdAllowance = ref(0n)
  const usdcAllowance = ref(0n)

  const amountWWEBDBig = computed(() => {
    try { return parseAmount(amountWWEBDStr.value, WWWEBD_DECIMALS) } catch { return 0n }
  })
  const amountUSDCBig = computed(() => {
    try { return parseAmount(amountUSDCStr.value, USDC_DECIMALS) } catch { return 0n }
  })

  const removePct = computed(() => Math.min(100, Math.max(0, parseInt(removePctStr.value) || 0)))
  const removeLP = computed(() => (userLp.value * BigInt(removePct.value)) / 100n)
  const removeWWEBD = computed(() => lpSupply.value > 0n ? (removeLP.value * reserveWWEBD.value) / lpSupply.value : 0n)
  const removeUSDC = computed(() => lpSupply.value > 0n ? (removeLP.value * reserveUSDC.value) / lpSupply.value : 0n)

  const needsApproveWWEBD = computed(() => amountWWEBDBig.value > 0n && wwwebdAllowance.value < amountWWEBDBig.value)
  const needsApproveUSDC = computed(() => amountUSDCBig.value > 0n && usdcAllowance.value < amountUSDCBig.value)

  const userSharePct = computed(() => {
    if (lpSupply.value === 0n) return 0
    return Number(userLp.value * 10000n / lpSupply.value) / 100
  })

  const userWWEBDInPool = computed(() => lpSupply.value > 0n ? (userLp.value * reserveWWEBD.value) / lpSupply.value : 0n)
  const userUSDCInPool = computed(() => lpSupply.value > 0n ? (userLp.value * reserveUSDC.value) / lpSupply.value : 0n)

  async function load() {
    const { reserveWWEBD: rW, reserveUSDC: rU, pairAddr: pa } = await getPairReserves()
    reserveWWEBD.value = rW
    reserveUSDC.value = rU
    pairAddr.value = pa
    lpSupply.value = await getPairLpSupply(pa)
    if (address.value) {
      userLp.value = await getUserLpBalance(pa, address.value)
      wwwebdBalance.value = await getTokenBalance(WWWEBD_ADDR, address.value)
      usdcBalance.value = await getTokenBalance(USDC_ADDR, address.value)
      const routerAddr = import.meta.env.VITE_ROUTER_ADDRESS
      wwwebdAllowance.value = await getAllowance(WWWEBD_ADDR, address.value, routerAddr)
      usdcAllowance.value = await getAllowance(USDC_ADDR, address.value, routerAddr)
    }
  }

  function syncUSDCFromWWEBD() {
    if (reserveWWEBD.value === 0n || reserveUSDC.value === 0n) return
    const wwwebd = amountWWEBDBig.value
    if (wwwebd === 0n) { amountUSDCStr.value = ''; return }
    const usdc = (wwwebd * reserveUSDC.value) / reserveWWEBD.value
    amountUSDCStr.value = formatAmount(usdc, USDC_DECIMALS, 6)
  }

  function syncWWEBDFromUSDC() {
    if (reserveWWEBD.value === 0n || reserveUSDC.value === 0n) return
    const usdc = amountUSDCBig.value
    if (usdc === 0n) { amountWWEBDStr.value = ''; return }
    const wwwebd = (usdc * reserveWWEBD.value) / reserveUSDC.value
    amountWWEBDStr.value = formatAmount(wwwebd, WWWEBD_DECIMALS, 6)
  }

  async function doApproveWWEBD() {
    const signer = await getSigner()
    if (!signer) return
    loading.value = true; error.value = ''
    try {
      await approve(WWWEBD_ADDR, import.meta.env.VITE_ROUTER_ADDRESS, amountWWEBDBig.value, signer)
      wwwebdAllowance.value = amountWWEBDBig.value
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally { loading.value = false }
  }

  async function doApproveUSDC() {
    const signer = await getSigner()
    if (!signer) return
    loading.value = true; error.value = ''
    try {
      await approve(USDC_ADDR, import.meta.env.VITE_ROUTER_ADDRESS, amountUSDCBig.value, signer)
      usdcAllowance.value = amountUSDCBig.value
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally { loading.value = false }
  }

  async function doAddLiquidity() {
    const signer = await getSigner()
    if (!signer) return
    loading.value = true; error.value = ''; txHash.value = ''
    try {
      txHash.value = await addLiquidity(amountWWEBDBig.value, amountUSDCBig.value, slippage.value, address.value, signer)
      amountWWEBDStr.value = ''; amountUSDCStr.value = ''
      await load()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally { loading.value = false }
  }

  async function doRemoveLiquidity() {
    const signer = await getSigner()
    if (!signer || removeLP.value === 0n) return
    loading.value = true; error.value = ''; txHash.value = ''
    try {
      const factor = BigInt(Math.round((1 - slippage.value / 100) * 10000))
      const minW = (removeWWEBD.value * factor) / 10000n
      const minU = (removeUSDC.value * factor) / 10000n
      txHash.value = await removeLiquidity(removeLP.value, minW, minU, address.value, signer)
      await load()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally { loading.value = false }
  }

  return {
    amountWWEBDStr, amountUSDCStr, removePctStr, slippage, loading, txHash, error,
    reserveWWEBD, reserveUSDC, pairAddr, lpSupply, userLp,
    wwwebdBalance, usdcBalance, removeLP, removeWWEBD, removeUSDC,
    needsApproveWWEBD, needsApproveUSDC, userSharePct, userWWEBDInPool, userUSDCInPool,
    amountWWEBDBig, amountUSDCBig, // expunem computed-urile pentru validare
    load, syncUSDCFromWWEBD, syncWWEBDFromUSDC,
    doApproveWWEBD, doApproveUSDC, doAddLiquidity, doRemoveLiquidity,
  }
}
