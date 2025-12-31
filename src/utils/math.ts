/**
 * Uniswap V3 Math Utilities
 * 
 * IMPORTANT: Tick values can be astronomical (-887272 to 887272 for full range).
 * Computing 1.0001^tick for extreme values crashes browsers.
 * Always use bounds checking before price calculations.
 */

// Safe bounds for tick calculations - beyond these, return placeholders
const SAFE_TICK_LOWER = -500000
const SAFE_TICK_UPPER = 500000

// Min and max ticks for Uniswap V3
export const MIN_TICK = -887272
export const MAX_TICK = 887272

// Q96 = 2^96 - Used in sqrtPriceX96 calculations
const Q96 = 2n ** 96n

/**
 * Check if tick value is safe for price calculations
 */
export function isTickSafe(tick: number): boolean {
  return tick >= SAFE_TICK_LOWER && tick <= SAFE_TICK_UPPER
}

/**
 * Convert tick to price with safety bounds checking
 * Returns null if tick is out of safe bounds
 */
export function tickToPrice(tick: number, decimals0: number, decimals1: number): number | null {
  // Safety check for astronomical tick values that would crash the browser
  if (!isTickSafe(tick)) {
    return null
  }
  
  try {
    // price = 1.0001^tick * 10^(decimals0 - decimals1)
    const price = Math.pow(1.0001, tick) * Math.pow(10, decimals0 - decimals1)
    
    // Additional safety: check for infinity or NaN
    if (!Number.isFinite(price) || price <= 0) {
      return null
    }
    
    return price
  } catch {
    return null
  }
}

/**
 * Convert price to tick (inverse of tickToPrice)
 */
export function priceToTick(price: number, decimals0: number, decimals1: number): number {
  // Adjust for decimal difference
  const adjustedPrice = price / Math.pow(10, decimals0 - decimals1)
  // tick = log(price) / log(1.0001)
  const tick = Math.log(adjustedPrice) / Math.log(1.0001)
  return Math.round(tick)
}

/**
 * Round tick to nearest valid tick based on tick spacing
 */
export function nearestUsableTick(tick: number, tickSpacing: number): number {
  const rounded = Math.round(tick / tickSpacing) * tickSpacing
  return Math.max(MIN_TICK, Math.min(MAX_TICK, rounded))
}

/**
 * Convert sqrtPriceX96 to price
 */
export function sqrtPriceX96ToPrice(
  sqrtPriceX96: bigint,
  decimals0: number,
  decimals1: number
): number {
  // price = (sqrtPriceX96 / 2^96)^2 * 10^(decimals0 - decimals1)
  const sqrtPrice = Number(sqrtPriceX96) / Number(Q96)
  const price = sqrtPrice * sqrtPrice * Math.pow(10, decimals0 - decimals1)
  return price
}

/**
 * Convert price to sqrtPriceX96
 */
export function priceToSqrtPriceX96(
  price: number,
  decimals0: number,
  decimals1: number
): bigint {
  // Adjust for decimals
  const adjustedPrice = price / Math.pow(10, decimals0 - decimals1)
  // sqrtPriceX96 = sqrt(price) * 2^96
  const sqrtPrice = Math.sqrt(adjustedPrice)
  return BigInt(Math.floor(sqrtPrice * Number(Q96)))
}

/**
 * Get price bounds for display, handling extreme ticks safely
 */
export function getDisplayPriceBounds(
  tickLower: number,
  tickUpper: number,
  decimals0: number,
  decimals1: number
): { priceLower: string; priceUpper: string; isFullRange: boolean } {
  // More generous full-range detection - catches positions with extreme ticks
  const isFullRange = tickLower <= MIN_TICK + 1000 || tickUpper >= MAX_TICK - 1000
  
  if (isFullRange) {
    return {
      priceLower: '0',
      priceUpper: '∞',
      isFullRange: true,
    }
  }
  
  const priceLower = tickToPrice(tickLower, decimals0, decimals1)
  const priceUpper = tickToPrice(tickUpper, decimals0, decimals1)
  
  // Handle extreme price values (likely wrong decimal handling or inverted)
  const formatBoundPrice = (price: number | null, isLower: boolean): string => {
    if (price === null) return isLower ? '~0' : '~∞'
    
    // If price is astronomically high, it's likely inverted - show the inverse
    if (price > 1e12) {
      const inverted = 1 / price
      return formatPrice(inverted) + ' (inv)'
    }
    // If price is astronomically low
    if (price < 1e-12 && price > 0) {
      return isLower ? '~0' : formatPrice(price)
    }
    
    return formatPrice(price)
  }
  
  return {
    priceLower: formatBoundPrice(priceLower, true),
    priceUpper: formatBoundPrice(priceUpper, false),
    isFullRange: false,
  }
}

/**
 * Format price for display
 */
export function formatPrice(price: number): string {
  if (price === 0) return '0'
  if (!Number.isFinite(price)) return '∞'
  
  if (price >= 1000000) {
    return price.toExponential(2)
  } else if (price >= 1000) {
    return price.toLocaleString(undefined, { maximumFractionDigits: 2 })
  } else if (price >= 1) {
    return price.toFixed(4)
  } else if (price >= 0.0001) {
    return price.toFixed(6)
  } else {
    return price.toExponential(4)
  }
}

/**
 * Format token amount for display
 */
export function formatAmount(amount: bigint, decimals: number, precision: number = 4): string {
  const divisor = BigInt(10 ** decimals)
  const intPart = amount / divisor
  const fracPart = amount % divisor
  
  if (fracPart === 0n) {
    return intPart.toLocaleString()
  }
  
  const fracStr = fracPart.toString().padStart(decimals, '0')
  const trimmedFrac = fracStr.slice(0, precision).replace(/0+$/, '')
  
  if (trimmedFrac === '') {
    return intPart.toLocaleString()
  }
  
  return `${intPart.toLocaleString()}.${trimmedFrac}`
}

/**
 * Parse token amount from user input
 */
export function parseAmount(input: string, decimals: number): bigint {
  if (!input || input === '') return 0n
  
  // Remove commas
  const cleaned = input.replace(/,/g, '')
  
  const parts = cleaned.split('.')
  const intPart = parts[0] || '0'
  let fracPart = parts[1] || ''
  
  // Pad or truncate fractional part
  if (fracPart.length > decimals) {
    fracPart = fracPart.slice(0, decimals)
  } else {
    fracPart = fracPart.padEnd(decimals, '0')
  }
  
  return BigInt(intPart + fracPart)
}

/**
 * Calculate slippage-adjusted amounts
 */
export function applySlippage(
  amount: bigint,
  slippagePercent: number,
  isMinimum: boolean
): bigint {
  const factor = isMinimum ? (100 - slippagePercent) : (100 + slippagePercent)
  return (amount * BigInt(Math.floor(factor * 100))) / 10000n
}

/**
 * Get deadline timestamp
 */
export function getDeadline(minutesFromNow: number): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + minutesFromNow * 60)
}

/**
 * Calculate liquidity amounts for a given price range
 * This is a simplified version - real implementation would be more complex
 */
export function getLiquidityAmounts(
  sqrtPriceX96: bigint,
  sqrtPriceAX96: bigint,
  sqrtPriceBX96: bigint,
  liquidity: bigint
): { amount0: bigint; amount1: bigint } {
  // Ensure sqrtPriceA < sqrtPriceB
  if (sqrtPriceAX96 > sqrtPriceBX96) {
    [sqrtPriceAX96, sqrtPriceBX96] = [sqrtPriceBX96, sqrtPriceAX96]
  }
  
  let amount0 = 0n
  let amount1 = 0n
  
  if (sqrtPriceX96 <= sqrtPriceAX96) {
    // Current price is below range - all token0
    amount0 = (liquidity * Q96 * (sqrtPriceBX96 - sqrtPriceAX96)) / (sqrtPriceAX96 * sqrtPriceBX96)
  } else if (sqrtPriceX96 < sqrtPriceBX96) {
    // Current price is within range
    amount0 = (liquidity * Q96 * (sqrtPriceBX96 - sqrtPriceX96)) / (sqrtPriceX96 * sqrtPriceBX96)
    amount1 = (liquidity * (sqrtPriceX96 - sqrtPriceAX96)) / Q96
  } else {
    // Current price is above range - all token1
    amount1 = (liquidity * (sqrtPriceBX96 - sqrtPriceAX96)) / Q96
  }
  
  return { amount0, amount1 }
}
