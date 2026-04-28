import { expect } from 'chai'
import { ethers } from 'hardhat'
import { wWEBD } from '../typechain-types'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'

describe('wWEBD', () => {
  let token: wWEBD
  let admin: HardhatEthersSigner
  let bridge: HardhatEthersSigner
  let user: HardhatEthersSigner

  const ONE_WEBD = ethers.parseEther('1')   // 1e18 wei = 1 wWEBD
  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes('MINTER_ROLE'))

  beforeEach(async () => {
    ;[admin, bridge, user] = await ethers.getSigners()
    const Factory = await ethers.getContractFactory('wWEBD')
    token = (await Factory.deploy(admin.address)) as wWEBD
  })

  it('are setate name si symbol corect', async () => {
    expect(await token.name()).to.equal('Wrapped WebDollar')
    expect(await token.symbol()).to.equal('wWEBD')
    expect(await token.decimals()).to.equal(18)
  })

  it('admin are MINTER_ROLE la deploy', async () => {
    expect(await token.hasRole(MINTER_ROLE, admin.address)).to.be.true
  })

  it('admin poate acorda MINTER_ROLE unui bridge operator', async () => {
    await token.connect(admin).grantRole(MINTER_ROLE, bridge.address)
    expect(await token.hasRole(MINTER_ROLE, bridge.address)).to.be.true
  })

  it('mint emite tokenele corect si actualizeaza balanta', async () => {
    await token.connect(admin).mint(user.address, ONE_WEBD)
    expect(await token.balanceOf(user.address)).to.equal(ONE_WEBD)
    expect(await token.totalSupply()).to.equal(ONE_WEBD)
  })

  it('mint emite evenimentul BridgeMint', async () => {
    await expect(token.connect(admin).mint(user.address, ONE_WEBD))
      .to.emit(token, 'BridgeMint')
      .withArgs(user.address, ONE_WEBD)
  })

  it('burn reduce balanta si totalSupply', async () => {
    await token.connect(admin).mint(user.address, ONE_WEBD)
    await token.connect(admin).burn(user.address, ONE_WEBD)
    expect(await token.balanceOf(user.address)).to.equal(0n)
    expect(await token.totalSupply()).to.equal(0n)
  })

  it('burn emite evenimentul BridgeBurn', async () => {
    await token.connect(admin).mint(user.address, ONE_WEBD)
    await expect(token.connect(admin).burn(user.address, ONE_WEBD))
      .to.emit(token, 'BridgeBurn')
      .withArgs(user.address, ONE_WEBD)
  })

  it('burnForWithdrawal permite userului sa arda proprii tokeni', async () => {
    await token.connect(admin).mint(user.address, ONE_WEBD)
    await expect(token.connect(user).burnForWithdrawal(ONE_WEBD))
      .to.emit(token, 'BridgeBurn')
      .withArgs(user.address, ONE_WEBD)
    expect(await token.balanceOf(user.address)).to.equal(0n)
  })

  it('non-MINTER nu poate apela mint', async () => {
    await expect(token.connect(user).mint(user.address, ONE_WEBD))
      .to.be.revertedWithCustomError(token, 'AccessControlUnauthorizedAccount')
  })

  it('non-MINTER nu poate apela burn', async () => {
    await token.connect(admin).mint(user.address, ONE_WEBD)
    await expect(token.connect(user).burn(user.address, ONE_WEBD))
      .to.be.revertedWithCustomError(token, 'AccessControlUnauthorizedAccount')
  })

  it('conversie bridge: 10000 WEBD internal units = 1 wWEBD', async () => {
    // WEBD nativ are 10000 internal units per WEBD
    // wWEBD_wei = webd_internal_units * 10^14
    const webdInternalUnits = 10000n
    const expectedWei = webdInternalUnits * 10n ** 14n  // = 1e18 = 1 wWEBD
    expect(expectedWei).to.equal(ONE_WEBD)
    await token.connect(admin).mint(user.address, expectedWei)
    expect(await token.balanceOf(user.address)).to.equal(ONE_WEBD)
  })
})
