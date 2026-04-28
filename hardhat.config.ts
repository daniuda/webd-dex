import { HardhatUserConfig } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'
import * as dotenv from 'dotenv'
dotenv.config()

const PRIVATE_KEY = process.env.PRIVATE_KEY_DEPLOYER || '0x' + '0'.repeat(64)
const POLYGON_RPC = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com'
const POLYGONSCAN_KEY = process.env.POLYGONSCAN_API_KEY || ''

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.20',
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {},
    polygonAmoy: {
      url: 'https://rpc-amoy.polygon.technology',
      chainId: 80002,
      accounts: [PRIVATE_KEY],
    },
    polygon: {
      url: POLYGON_RPC,
      chainId: 137,
      accounts: [PRIVATE_KEY],
    },
  },
  etherscan: {
    apiKey: {
      polygon: POLYGONSCAN_KEY,
      polygonAmoy: POLYGONSCAN_KEY,
    },
    customChains: [
      {
        network: 'polygonAmoy',
        chainId: 80002,
        urls: {
          apiURL: 'https://api-amoy.polygonscan.com/api',
          browserURL: 'https://amoy.polygonscan.com',
        },
      },
    ],
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
}

export default config
