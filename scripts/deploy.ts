import { ethers, network } from 'hardhat'
import * as fs from 'fs'
import * as path from 'path'

// USDC addresses per network
const USDC_ADDRESSES: Record<string, string> = {
  polygon: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',  // Circle native USDC on Polygon (6 dec)
  polygonAmoy: '0x0000000000000000000000000000000000000000', // replace with testnet USDC if available
  hardhat: '',  // deployed dynamically in tests
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

  // 3. Deploy Router
  console.log('3. Deploying Router...')
  const RouterContract = await ethers.getContractFactory('Router')
  const router = await RouterContract.deploy(await factory.getAddress())
  await router.waitForDeployment()
  console.log(`   Router: ${await router.getAddress()}`)

  // 4. Create wWEBD/USDC pair
  const usdcAddress = USDC_ADDRESSES[networkName]
  let pairAddress = ''
  if (usdcAddress && usdcAddress !== ethers.ZeroAddress) {
    console.log('4. Creating wWEBD/USDC pair...')
    const tx = await factory.createPair(await wwebd.getAddress(), usdcAddress)
    await tx.wait()
    pairAddress = await factory.getPair(await wwebd.getAddress(), usdcAddress)
    console.log(`   Pair wWEBD/USDC: ${pairAddress}`)
  } else {
    console.log('4. Skipping pair creation (no USDC address for this network)')
  }

  // 5. Save deployment addresses
  const deployment = {
    network: networkName,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      factory: await factory.getAddress(),
      wwebd: await wwebd.getAddress(),
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
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
