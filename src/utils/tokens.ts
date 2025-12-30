import { TOKENS } from '../config/contracts'

export interface Token {
  address: `0x${string}`
  symbol: string
  name: string
  decimals: number
  logoURI?: string
}

// Default token list
export const DEFAULT_TOKENS: Token[] = [
  {
    address: TOKENS.WATN.address,
    symbol: 'WATN',
    name: 'Wrapped Auton',
    decimals: 18,
    logoURI: '/watn.svg',
  },
  {
    address: TOKENS.USDC.address,
    symbol: 'USDC.pol',
    name: 'USD Coin (Polygon Bridge)',
    decimals: 6,
    logoURI: '/usdc.svg',
  },
]

// Native ATN representation
export const NATIVE_ATN: Token = {
  address: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  symbol: 'ATN',
  name: 'Auton',
  decimals: 18,
  logoURI: '/atn.svg',
}

/**
 * Check if token is the native currency
 */
export function isNativeCurrency(token: Token): boolean {
  return token.address === NATIVE_ATN.address || token.symbol === 'ATN'
}

/**
 * Get the wrapped version of native currency
 */
export function getWrappedToken(): Token {
  return DEFAULT_TOKENS.find(t => t.symbol === 'WATN')!
}

/**
 * Sort tokens by address (required for Uniswap pairs)
 */
export function sortTokens(tokenA: Token, tokenB: Token): [Token, Token] {
  return tokenA.address.toLowerCase() < tokenB.address.toLowerCase()
    ? [tokenA, tokenB]
    : [tokenB, tokenA]
}

/**
 * Get token by address
 */
export function getTokenByAddress(address: string): Token | undefined {
  return DEFAULT_TOKENS.find(
    t => t.address.toLowerCase() === address.toLowerCase()
  )
}

/**
 * Format token balance for display
 */
export function formatTokenBalance(balance: bigint, decimals: number): string {
  const divisor = BigInt(10 ** decimals)
  const intPart = balance / divisor
  const fracPart = balance % divisor
  
  // Format integer part with commas
  const intStr = intPart.toLocaleString()
  
  if (fracPart === 0n) {
    return intStr
  }
  
  // Get fractional part, pad to decimals length, then trim trailing zeros
  let fracStr = fracPart.toString().padStart(decimals, '0')
  // Keep at most 6 significant digits
  fracStr = fracStr.slice(0, 6).replace(/0+$/, '')
  
  if (fracStr === '') {
    return intStr
  }
  
  return `${intStr}.${fracStr}`
}
