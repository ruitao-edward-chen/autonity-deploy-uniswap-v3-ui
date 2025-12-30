import { defineChain } from 'viem'

export const autonity = defineChain({
  id: 65000000,
  name: 'Autonity',
  nativeCurrency: {
    name: 'Auton',
    symbol: 'ATN',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.autonity-apis.com'],
    },
  },
  blockExplorers: {
    default: {
      name: 'AutonityScan',
      url: 'https://autonityscan.org',
    },
  },
})

export const CHAIN_ID = 65000000
