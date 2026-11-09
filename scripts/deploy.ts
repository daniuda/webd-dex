import { ethers, network } from 'hardhat'
import * as fs from 'fs'
import * as path from 'path'

// USDC addresses per network (empty = deploy MockUSDC)
const USDC_ADDRESSES: Record<string, string> = {
  polygon: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  polygonAmoy: '', // MockUSDC will be deployed
  hardhat: '',
}

async function main() {
  const [deployer] = await ethers.getSigners()
  const networkName = network.name
  console.log(`\nDeploy on: ${networkName}`)
  console.log(`Deployer: ${deployer.address}`)
  console.log(`Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} MATIC\n`)

  // 1. Deploy Factory
  console.log('1. Deploying Factory...')
  const FactoryContract = await ethers.getContractFactory('Factory')
  const factory = await FactoryContract.deploy(deployer.address)
  await factory.waitForDeployment()
  console.log(`   Factory: ${await factory.getAddress()}`)

  // 2. Deploy wWEBD
  // ADMIN_ADDRESS (optional env var): the DEFAULT_ADMIN_ROLE/PAUSER_ROLE holder.
  // Defaults to the deployer, which is fine for testnet but should be a multisig
  // (e.g. a Gnosis Safe) before any mainnet deploy with real funds — see
  // docs/superpowers/specs/2026-11-09-webd-dex-legal-risk-design.md.
  // BRIDGE_HOT_WALLET_ADDRESS (optional env var): gets MINTER_ROLE only, capped
  // on-chain by setMintCaps below. Defaults to the deployer for local/testnet runs
  // where there is no separate bridge process yet.
  const adminAddress = process.env.ADMIN_ADDRESS || deployer.address
  const bridgeHotWalletAddress = process.env.BRIDGE_HOT_WALLET_ADDRESS || deployer.address

  console.log('2. Deploying wWEBD...')
  const WWEBDContract = await ethers.getContractFactory('wWEBD')
  const wwebd = await WWEBDContract.deploy(adminAddress)
  await wwebd.waitForDeployment()
  console.log(`   wWEBD: ${await wwebd.getAddress()} (admin: ${adminAddress})`)

  if (bridgeHotWalletAddress.toLowerCase() !== adminAddress.toLowerCase()) {
    console.log(`   Granting MINTER_ROLE to bridge hot wallet ${bridgeHotWalletAddress}...`)
    await (await wwebd.grantRole(await wwebd.MINTER_ROLE(), bridgeHotWalletAddress)).wait()
    console.log(`   Revoking MINTER_ROLE from deployer (${deployer.address})...`)
    await (await wwebd.revokeRole(await wwebd.MINTER_ROLE(), adminAddress)).wait()
  }

  // On-chain mint caps: per-tx cap matches the bridge's own BRIDGE_MAX_AMOUNT_WEBD
  // default (10000 WEBD); daily cap is a coarser backstop against a fully
  // compromised hot wallet. Both are wei-denominated (1 WEBD = 1e18 wei of wWEBD).
  // Admin (not the hot wallet) can raise/lower these later via setMintCaps().
  const maxMintPerTx = ethers.parseEther(process.env.MAX_MINT_PER_TX_WEBD || '10000')
  const maxMintPerDay = ethers.parseEther(process.env.MAX_MINT_PER_DAY_WEBD || '100000')
  console.log(`   Setting mint caps: per-tx=${ethers.formatEther(maxMintPerTx)} wWEBD, per-day=${ethers.formatEther(maxMintPerDay)} wWEBD`)
  await (await wwebd.setMintCaps(maxMintPerTx, maxMintPerDay)).wait()

  // 3. Deploy MinimalForwarder (EIP-2771 gasless meta-tx support)
  console.log('3. Deploying MinimalForwarder...')
  const ForwarderContract = await ethers.getContractFactory('MinimalForwarder')
  const forwarder = await ForwarderContract.deploy()
  await forwarder.waitForDeployment()
  console.log(`   MinimalForwarder: ${await forwarder.getAddress()}`)

  // 4. Deploy Router (trusts MinimalForwarder for meta-tx)
  console.log('4. Deploying Router...')
  const RouterContract = await ethers.getContractFactory('Router')
  const router = await RouterContract.deploy(await factory.getAddress(), await forwarder.getAddress())
  await router.waitForDeployment()
  console.log(`   Router: ${await router.getAddress()}`)

  // 4b. Deploy MockUSDC on testnet if no real USDC configured
  let usdcAddress = USDC_ADDRESSES[networkName] || ''
  if (!usdcAddress && networkName !== 'polygon') {
    console.log('4b. Deploying MockUSDC (testnet only)...')
    const MockUSDCContract = await ethers.getContractFactory('MockUSDC')
    const mockUsdc = await MockUSDCContract.deploy(deployer.address)
    await mockUsdc.waitForDeployment()
    usdcAddress = await mockUsdc.getAddress()
    console.log(`   MockUSDC: ${usdcAddress}`)
  }

  // 5. Create wWEBD/USDC pair
  let pairAddress = ''
  if (usdcAddress && usdcAddress !== ethers.ZeroAddress) {
    console.log('5. Creating wWEBD/USDC pair...')
    const tx = await factory.createPair(await wwebd.getAddress(), usdcAddress)
    await tx.wait()
    pairAddress = await factory.getPair(await wwebd.getAddress(), usdcAddress)
    console.log(`   Pair wWEBD/USDC: ${pairAddress}`)
  } else {
    console.log('5. Skipping pair creation')
  }

  // 6. Save deployment addresses
  const deployment = {
    network: networkName,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      factory: await factory.getAddress(),
      wwebd: await wwebd.getAddress(),
      forwarder: await forwarder.getAddress(),
      router: await router.getAddress(),
      pairWebdUsdc: pairAddress,
      usdc: usdcAddress,
    },
  }

  const deploymentsDir = path.join(__dirname, '..', 'deployments')
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir)
  const outPath = path.join(deploymentsDir, `${networkName}.json`)
  fs.writeFileSync(outPath, JSON.stringify(deployment, null, 2))
  console.log(`\nSaved to: ${outPath}`)
  console.log('\nDeploy finished.')
  console.log('\n--- frontend/.env ---')
  console.log(`VITE_FACTORY_ADDRESS=${await factory.getAddress()}`)
  console.log(`VITE_WWWEBD_ADDRESS=${await wwebd.getAddress()}`)
  console.log(`VITE_USDC_ADDRESS=${usdcAddress}`)
  console.log(`VITE_ROUTER_ADDRESS=${await router.getAddress()}`)
  console.log(`VITE_FORWARDER_ADDRESS=${await forwarder.getAddress()}`)
  console.log('\n--- bridge/.env additions ---')
  console.log(`WWWEBD_ADDRESS=${await wwebd.getAddress()}`)
  console.log(`FORWARDER_ADDRESS=${await forwarder.getAddress()}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
