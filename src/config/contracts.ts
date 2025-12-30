// Deployed Uniswap V3 contract addresses on Autonity Mainnet
export const CONTRACTS = {
  // Core
  v3Factory: '0xa97663aaf56C75d77A2327b8D5A4dac2F9b22184' as const,
  
  // Periphery
  swapRouter02: '0x97477e45C0aBB8e84A32B704049D00Cc5DEcE264' as const,
  quoterV2: '0x0171f46B15Eae88cf332D85731Da2139b86082aF' as const,
  nonfungiblePositionManager: '0x6AFF1a938149f4ceC87eCC4de3125Eff21860E8f' as const,
  
  // Utilities
  multicall2: '0xCFA57b39e6189c4B61352943b6021Db88f453131' as const,
  tickLens: '0x84c77c4AF68ebbB49177D9F41902AC62bCD8E3D0' as const,
  
  // Staking
  v3Staker: '0x98D5c374cd058b4047d302580ad79f54624Cee81' as const,
}

// Known tokens on Autonity Mainnet
export const TOKENS = {
  WATN: {
    address: '0x08178Ac13A98eE9DeA065DE1Ef233ce0b15a72Eb' as const,
    symbol: 'WATN',
    name: 'Wrapped Auton',
    decimals: 18,
    logoURI: '/watn.svg',
  },
  USDC: {
    address: '0xA13C67173822D9b11354a9404f221A3331FBd8C7' as const,
    symbol: 'USDC.pol',
    name: 'USD Coin (Polygon Bridge)',
    decimals: 6,
    logoURI: '/usdc.svg',
  },
}

// Known pools
// Token order is determined by address: WATN (0x08...) < USDC (0xA1...) so WATN is token0
export const POOLS = {
  WATN_USDC: {
    address: '0x8703324e56B0724158bdd0B25251fFb5D3343Aba' as const,
    token0: TOKENS.WATN,
    token1: TOKENS.USDC,
    fee: 3000, // 0.3%
  },
}

// Fee tiers available
export const FEE_TIERS = [
  { fee: 100, label: '0.01%', tickSpacing: 1 },
  { fee: 500, label: '0.05%', tickSpacing: 10 },
  { fee: 3000, label: '0.3%', tickSpacing: 60 },
  { fee: 10000, label: '1%', tickSpacing: 200 },
]

export const DEFAULT_SLIPPAGE = 0.5 // 0.5%
export const DEFAULT_DEADLINE_MINUTES = 20
