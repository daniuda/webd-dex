import { expect } from 'chai'
import { ethers } from 'hardhat'
import { Factory, Pair, Router, wWEBD } from '../typechain-types'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'

describe('Router', () => {
  let factory: Factory
  let router: Router
  let wwebd: wWEBD
  let usdc: wWEBD
  let pair: Pair
  let owner: HardhatEthersSigner
  let lp: HardhatEthersSigner
  let trader: HardhatEthersSigner

  const WEBD_LIQ = ethers.parseEther('10000')
  const USDC_LIQ = ethers.parseEther('1000')
  const DEADLINE = () => Math.floor(Date.now() / 1000) + 3600

  beforeEach(async () => {
    ;[owner, lp, trader] = await ethers.getSigners()

    const TokenF = await ethers.getContractFactory('wWEBD')
    wwebd = (await TokenF.deploy(owner.address)) as wWEBD
    usdc = (await TokenF.deploy(owner.address)) as wWEBD

    const FactoryF = await ethers.getContractFactory('Factory')
    factory = (await FactoryF.deploy(owner.address)) as Factory

    const RouterF = await ethers.getContractFactory('Router')
    router = (await RouterF.deploy(await factory.getAddress())) as Router

    // Mint tokens
    await wwebd.mint(lp.address, WEBD_LIQ * 2n)
    await usdc.mint(lp.address, USDC_LIQ * 2n)
    await wwebd.mint(trader.address, ethers.parseEther('1000'))
    await usdc.mint(trader.address, ethers.parseEther('100'))

    // Approvals
    await wwebd.connect(lp).approve(await router.getAddress(), ethers.MaxUint256)
    await usdc.connect(lp).approve(await router.getAddress(), ethers.MaxUint256)
    await wwebd.connect(trader).approve(await router.getAddress(), ethers.MaxUint256)
    await usdc.connect(trader).approve(await router.getAddress(), ethers.MaxUint256)
  })

  describe('addLiquidity', () => {
    it('creeaza pair-ul si adauga lichiditate initial', async () => {
      const { liquidity } = await router.connect(lp).addLiquidity.staticCall(
        await wwebd.getAddress(), await usdc.getAddress(),
        WEBD_LIQ, USDC_LIQ, 0, 0, lp.address, DEADLINE()
      )
      expect(liquidity).to.be.gt(0n)

      await router.connect(lp).addLiquidity(
        await wwebd.getAddress(), await usdc.getAddress(),
        WEBD_LIQ, USDC_LIQ, 0, 0, lp.address, DEADLINE()
      )

      const pairAddr = await factory.getPair(await wwebd.getAddress(), await usdc.getAddress())
      pair = await ethers.getContractAt('Pair', pairAddr) as Pair
      expect(await pair.balanceOf(lp.address)).to.be.gt(0n)
    })

    it('a doua adaugare de lichiditate respecta ratia existenta', async () => {
      await router.connect(lp).addLiquidity(
        await wwebd.getAddress(), await usdc.getAddress(),
        WEBD_LIQ, USDC_LIQ, 0, 0, lp.address, DEADLINE()
      )

      const { amountA } = await router.connect(lp).addLiquidity.staticCall(
        await wwebd.getAddress(), await usdc.getAddress(),
        WEBD_LIQ, USDC_LIQ, 0, 0, lp.address, DEADLINE()
      )
      // amountA trebuie sa fie <= amountADesired
      expect(amountA).to.be.lte(WEBD_LIQ)
    })

    it('revine la deadline expirat', async () => {
      const expiredDeadline = Math.floor(Date.now() / 1000) - 10
      await expect(
        router.connect(lp).addLiquidity(
          await wwebd.getAddress(), await usdc.getAddress(),
          WEBD_LIQ, USDC_LIQ, 0, 0, lp.address, expiredDeadline
        )
      ).to.be.revertedWith('Router: EXPIRED')
    })
  })

  describe('swapExactTokensForTokens', () => {
    beforeEach(async () => {
      await router.connect(lp).addLiquidity(
        await wwebd.getAddress(), await usdc.getAddress(),
        WEBD_LIQ, USDC_LIQ, 0, 0, lp.address, DEADLINE()
      )
    })

    it('swap wWEBD -> USDC returneaza valoarea corecta', async () => {
      const amountIn = ethers.parseEther('100')
      const expectedOut = await router.getAmountOut(amountIn, await wwebd.getAddress(), await usdc.getAddress())

      const usdcBefore = await usdc.balanceOf(trader.address)
      await router.connect(trader).swapExactTokensForTokens(
        amountIn, 0, await wwebd.getAddress(), await usdc.getAddress(), trader.address, DEADLINE()
      )
      const usdcAfter = await usdc.balanceOf(trader.address)
      expect(usdcAfter - usdcBefore).to.equal(expectedOut)
    })

    it('swap USDC -> wWEBD functioneaza in directia inversa', async () => {
      const amountIn = ethers.parseEther('10')
      const webdBefore = await wwebd.balanceOf(trader.address)
      await router.connect(trader).swapExactTokensForTokens(
        amountIn, 0, await usdc.getAddress(), await wwebd.getAddress(), trader.address, DEADLINE()
      )
      expect(await wwebd.balanceOf(trader.address)).to.be.gt(webdBefore)
    })

    it('revine daca amountOut < amountOutMin (slippage)', async () => {
      const amountIn = ethers.parseEther('100')
      await expect(
        router.connect(trader).swapExactTokensForTokens(
          amountIn, ethers.MaxUint256,
          await wwebd.getAddress(), await usdc.getAddress(), trader.address, DEADLINE()
        )
      ).to.be.revertedWith('Router: INSUFFICIENT_OUTPUT_AMOUNT')
    })

    it('revine la deadline expirat', async () => {
      await expect(
        router.connect(trader).swapExactTokensForTokens(
          ethers.parseEther('10'), 0,
          await wwebd.getAddress(), await usdc.getAddress(), trader.address,
          Math.floor(Date.now() / 1000) - 1
        )
      ).to.be.revertedWith('Router: EXPIRED')
    })
  })

  describe('removeLiquidity', () => {
    beforeEach(async () => {
      await router.connect(lp).addLiquidity(
        await wwebd.getAddress(), await usdc.getAddress(),
        WEBD_LIQ, USDC_LIQ, 0, 0, lp.address, DEADLINE()
      )
      const pairAddr = await factory.getPair(await wwebd.getAddress(), await usdc.getAddress())
      pair = await ethers.getContractAt('Pair', pairAddr) as Pair
      await pair.connect(lp).approve(await router.getAddress(), ethers.MaxUint256)
    })

    it('remove lichiditate returneaza ambii tokeni', async () => {
      const lpBalance = await pair.balanceOf(lp.address)
      const webdBefore = await wwebd.balanceOf(lp.address)
      const usdcBefore = await usdc.balanceOf(lp.address)

      await router.connect(lp).removeLiquidity(
        await wwebd.getAddress(), await usdc.getAddress(),
        lpBalance, 0, 0, lp.address, DEADLINE()
      )

      expect(await wwebd.balanceOf(lp.address)).to.be.gt(webdBefore)
      expect(await usdc.balanceOf(lp.address)).to.be.gt(usdcBefore)
      expect(await pair.balanceOf(lp.address)).to.equal(0n)
    })

    it('revine daca amountAMin nu e respectat', async () => {
      const lpBalance = await pair.balanceOf(lp.address)
      await expect(
        router.connect(lp).removeLiquidity(
          await wwebd.getAddress(), await usdc.getAddress(),
          lpBalance, ethers.MaxUint256, 0, lp.address, DEADLINE()
        )
      ).to.be.revertedWith('Router: INSUFFICIENT_A_AMOUNT')
    })
  })

  describe('getAmountOut / getAmountIn', () => {
    beforeEach(async () => {
      await router.connect(lp).addLiquidity(
        await wwebd.getAddress(), await usdc.getAddress(),
        WEBD_LIQ, USDC_LIQ, 0, 0, lp.address, DEADLINE()
      )
    })

    it('getAmountOut returneaza valoare pozitiva', async () => {
      const out = await router.getAmountOut(ethers.parseEther('100'), await wwebd.getAddress(), await usdc.getAddress())
      expect(out).to.be.gt(0n)
    })

    it('getAmountIn returneaza valoare pozitiva', async () => {
      const inAmt = await router.getAmountIn(ethers.parseEther('10'), await wwebd.getAddress(), await usdc.getAddress())
      expect(inAmt).to.be.gt(0n)
    })
  })
})
