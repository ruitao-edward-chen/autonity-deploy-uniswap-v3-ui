import { http, createConfig } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { autonity } from './chains'

export const wagmiConfig = createConfig({
  chains: [autonity],
  connectors: [
    injected(),
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
