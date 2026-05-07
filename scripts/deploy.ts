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
  console.log('2. Deploying wWEBD...')
  const WWEBDContract = await ethers.getContractFactory('wWEBD')
  const wwebd = await WWEBDContract.deploy(deployer.address)
  await wwebd.waitForDeployment()
  console.log(`   wWEBD: ${await wwebd.getAddress()}`)

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
