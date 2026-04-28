import { expect } from 'chai'
import { ethers } from 'hardhat'
import { Factory, Pair, wWEBD } from '../typechain-types'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'

// Simple ERC20 mock for USDC (6 decimals)
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address, uint256) returns (bool)',
  'function approve(address, uint256) returns (bool)',
  'function allowance(address, address) view returns (uint256)',
]

describe('Factory + Pair AMM', () => {
  let factory: Factory
  let wwebd: wWEBD
  let usdc: wWEBD  // reuse wWEBD as mock ERC20 (mintable)
  let pair: Pair
  let owner: HardhatEthersSigner
  let lp: HardhatEthersSigner
  let trader: HardhatEthersSigner

  const ONE_WEBD = ethers.parseEther('1')          // 1e18
  const WEBD_LIQUIDITY = ethers.parseEther('10000') // 10000 wWEBD
  const USDC_LIQUIDITY = ethers.parseUnits('1000', 18)  // 1000 "USDC" (18 dec for simplicity in tests)

  beforeEach(async () => {
    ;[owner, lp, trader] = await ethers.getSigners()

    // Deploy tokens
    const TokenFactory = await ethers.getContractFactory('wWEBD')
    wwebd = (await TokenFactory.deploy(owner.address)) as wWEBD
    usdc = (await TokenFactory.deploy(owner.address)) as wWEBD   // mock USDC

    // Deploy Factory
    const FactoryContract = await ethers.getContractFactory('Factory')
    factory = (await FactoryContract.deploy(owner.address)) as Factory

    // Create pair
    await factory.createPair(await wwebd.getAddress(), await usdc.getAddress())
    const pairAddr = await factory.getPair(await wwebd.getAddress(), await usdc.getAddress())
    pair = await ethers.getContractAt('Pair', pairAddr) as Pair

    // Mint tokens to lp and trader
    await wwebd.mint(lp.address, WEBD_LIQUIDITY * 2n)
    await usdc.mint(lp.address, USDC_LIQUIDITY * 2n)
    await wwebd.mint(trader.address, ethers.parseEther('500'))
  })

  describe('Factory', () => {
    it('createPair inregistreaza perechea corect', async () => {
      const addr = await factory.getPair(await wwebd.getAddress(), await usdc.getAddress())
      expect(addr).to.not.equal(ethers.ZeroAddress)
    })

    it('getPair este simetric (tokenA/tokenB si tokenB/tokenA returneaza acelasi pair)', async () => {
      const addr1 = await factory.getPair(await wwebd.getAddress(), await usdc.getAddress())
      const addr2 = await factory.getPair(await usdc.getAddress(), await wwebd.getAddress())
      expect(addr1).to.equal(addr2)
    })

    it('nu permite crearea unui pair duplicat', async () => {
      await expect(factory.createPair(await wwebd.getAddress(), await usdc.getAddress()))
        .to.be.revertedWith('Factory: PAIR_EXISTS')
    })

    it('nu permite pair cu acelasi token de doua ori', async () => {
      await expect(factory.createPair(await wwebd.getAddress(), await wwebd.getAddress()))
        .to.be.revertedWith('Factory: IDENTICAL_ADDRESSES')
    })

    it('allPairsLength creste dupa createPair', async () => {
      expect(await factory.allPairsLength()).to.equal(1)
    })
  })

  describe('Pair: Add Liquidity (mint)', () => {
    it('prima adaugare de lichiditate emite LP tokens si blocheaza MINIMUM_LIQUIDITY', async () => {
      const pairAddr = await pair.getAddress()
      await wwebd.connect(lp).transfer(pairAddr, WEBD_LIQUIDITY)
      await usdc.connect(lp).transfer(pairAddr, USDC_LIQUIDITY)

      await pair.connect(lp).mint(lp.address)

      const lpBalance = await pair.balanceOf(lp.address)
      expect(lpBalance).to.be.gt(0n)

      // MINIMUM_LIQUIDITY (1000) e blocat la address(1)
      expect(await pair.balanceOf('0x0000000000000000000000000000000000000001')).to.equal(1000n)
    })

    it('rezervele sunt actualizate dupa adaugarea de lichiditate', async () => {
      const pairAddr = await pair.getAddress()
      await wwebd.connect(lp).transfer(pairAddr, WEBD_LIQUIDITY)
      await usdc.connect(lp).transfer(pairAddr, USDC_LIQUIDITY)
      await pair.connect(lp).mint(lp.address)

      const [r0, r1] = await pair.getReserves()
      expect(r0 + r1).to.be.gt(0n)
    })
  })

  describe('Pair: Remove Liquidity (burn)', () => {
    it('burn returneaza tokenii proportional si arde LP tokens', async () => {
      const pairAddr = await pair.getAddress()
      await wwebd.connect(lp).transfer(pairAddr, WEBD_LIQUIDITY)
      await usdc.connect(lp).transfer(pairAddr, USDC_LIQUIDITY)
      await pair.connect(lp).mint(lp.address)

      const lpBalance = await pair.balanceOf(lp.address)
      await pair.connect(lp).transfer(pairAddr, lpBalance)
      await pair.connect(lp).burn(lp.address)

      // LP tokens arse — ramane doar MINIMUM_LIQUIDITY la address(1)
      expect(await pair.balanceOf(lp.address)).to.equal(0n)
      // LP-ul a primit inapoi tokenii (minus MINIMUM_LIQUIDITY fraction)
      expect(await wwebd.balanceOf(lp.address)).to.be.gt(0n)
    })
  })

  describe('Pair: Swap', () => {
    beforeEach(async () => {
      // Adauga lichiditate
      const pairAddr = await pair.getAddress()
      await wwebd.connect(lp).transfer(pairAddr, WEBD_LIQUIDITY)
      await usdc.connect(lp).transfer(pairAddr, USDC_LIQUIDITY)
      await pair.connect(lp).mint(lp.address)
    })

    it('swap wWEBD -> USDC: formula AMM corecta', async () => {
      const pairAddr = await pair.getAddress()
      const [r0, r1] = await pair.getReserves()

      const amountIn = ethers.parseEther('100')  // 100 wWEBD

      // Calculeaza amountOut cu formula 0.3% fee
      // Determinam care rezerva e pentru wWEBD
      const token0 = await pair.token0()
      const isWwebd0 = token0.toLowerCase() === (await wwebd.getAddress()).toLowerCase()
      const reserveIn = isWwebd0 ? r0 : r1
      const reserveOut = isWwebd0 ? r1 : r0

      const amountInWithFee = amountIn * 997n
      const expectedOut = (amountInWithFee * reserveOut) / (reserveIn * 1000n + amountInWithFee)

      // Trimite wWEBD catre pair
      await wwebd.connect(trader).transfer(pairAddr, amountIn)

      const usdcBefore = await usdc.balanceOf(trader.address)
      const amount0Out = isWwebd0 ? 0n : expectedOut
      const amount1Out = isWwebd0 ? expectedOut : 0n
      await pair.connect(trader).swap(amount0Out, amount1Out, trader.address)

      const usdcAfter = await usdc.balanceOf(trader.address)
      expect(usdcAfter - usdcBefore).to.equal(expectedOut)
    })

    it('swap revine daca output este 0', async () => {
      await expect(pair.swap(0, 0, trader.address))
        .to.be.revertedWith('Pair: INSUFFICIENT_OUTPUT_AMOUNT')
    })

    it('swap revine daca k invariant este violat (fara input)', async () => {
      await expect(pair.swap(ethers.parseEther('1'), 0, trader.address))
        .to.be.revertedWith('Pair: INSUFFICIENT_INPUT_AMOUNT')
    })

    it('fee 0.3% este aplicat corect — un swap mic verifica proportia', async () => {
      const pairAddr = await pair.getAddress()
      const [r0, r1] = await pair.getReserves()
      const token0 = await pair.token0()
      const isWwebd0 = token0.toLowerCase() === (await wwebd.getAddress()).toLowerCase()

      const amountIn = ethers.parseEther('10')
      const reserveIn = isWwebd0 ? r0 : r1
      const reserveOut = isWwebd0 ? r1 : r0

      // Cu fee (997/1000)
      const outWithFee = (amountIn * 997n * reserveOut) / (reserveIn * 1000n + amountIn * 997n)
      // Fara fee (1000/1000) — ar trebui sa fie mai mare
      const outNoFee = (amountIn * reserveOut) / (reserveIn + amountIn)

      expect(outWithFee).to.be.lt(outNoFee)

      // Executa swap-ul cu fee
      await wwebd.connect(trader).transfer(pairAddr, amountIn)
      const before = isWwebd0 ? await usdc.balanceOf(trader.address) : await wwebd.balanceOf(trader.address)
      const a0Out = isWwebd0 ? 0n : outWithFee
      const a1Out = isWwebd0 ? outWithFee : 0n
      await pair.connect(trader).swap(a0Out, a1Out, trader.address)
      const after = isWwebd0 ? await usdc.balanceOf(trader.address) : await wwebd.balanceOf(trader.address)
      expect(after - before).to.equal(outWithFee)
    })
  })

  describe('Pair: Sync', () => {
    it('sync actualizeaza rezervele la balantele reale', async () => {
      // Trimite tokeni direct fara a apela mint (donatie)
      const pairAddr = await pair.getAddress()
      await wwebd.mint(pairAddr, ethers.parseEther('50'))
      await usdc.mint(pairAddr, ethers.parseEther('5'))
      await pair.sync()

      const [r0, r1] = await pair.getReserves()
      expect(r0 + r1).to.be.gt(0n)
    })
  })
})
