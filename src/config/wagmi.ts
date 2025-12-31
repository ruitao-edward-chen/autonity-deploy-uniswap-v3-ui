import { http, createConfig } from 'wagmi'
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors'
import { autonity } from './chains'

// WalletConnect Project ID - https://cloud.walletconnect.com
const WALLETCONNECT_PROJECT_ID = 'f63ed9ea7d9e94406d5ebc9006ecd6fd'

export const wagmiConfig = createConfig({
  chains: [autonity],
  connectors: [
    injected({
      shimDisconnect: true,
    }),
    walletConnect({
      projectId: WALLETCONNECT_PROJECT_ID,
      metadata: {
        name: 'Mori',
        description: 'Mori Finance',
        url: 'https://morifi.xyz',
        icons: ['https://morifi.xyz/mori.svg'],
      },
      showQrModal: true,
    }),
    coinbaseWallet({
      appName: 'Mori',
      appLogoUrl: 'https://morifi.xyz/mori.svg',
    }),
  ],
  transports: {
    [autonity.id]: http(),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig
  }
}
