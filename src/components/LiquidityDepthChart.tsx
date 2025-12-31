import { useState, useEffect, useMemo } from 'react'
import { usePublicClient } from 'wagmi'
import { CONTRACTS } from '../config/contracts'
import { TICK_LENS_ABI } from '../config/abis'

interface TickData {
  tick: number
  liquidityNet: bigint
  liquidityGross: bigint
}

interface LiquidityBar {
  tick: number
  price: number
  liquidity: bigint
  isCurrentTick: boolean
}

interface LiquidityDepthChartProps {
  poolAddress: string
  currentTick: number
  tickSpacing: number
  decimals0: number
  decimals1: number
  token0Symbol: string
  token1Symbol: string
}

export function LiquidityDepthChart({
  poolAddress,
  currentTick,
  tickSpacing,
  decimals0,
  decimals1,
  token0Symbol,
  token1Symbol,
}: LiquidityDepthChartProps) {
  const publicClient = usePublicClient()
  const [tickData, setTickData] = useState<TickData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch tick data around current price
  useEffect(() => {
    const fetchTickData = async () => {
      if (!publicClient || !poolAddress) return
      
      setIsLoading(true)
      setError(null)
      
      try {
        // Get tick bitmap indices around current tick
        // Each bitmap word covers 256 * tickSpacing ticks
        const ticksPerWord = 256 * tickSpacing
        const currentWordIndex = Math.floor(currentTick / ticksPerWord)
        
        // Fetch 3 words around current price (covers ~768 * tickSpacing ticks)
        const wordIndices = [currentWordIndex - 1, currentWordIndex, currentWordIndex + 1]
        
        const allTicks: TickData[] = []
        
        for (const wordIndex of wordIndices) {
          try {
            const result = await publicClient.readContract({
              address: CONTRACTS.tickLens,
              abi: TICK_LENS_ABI,
              functionName: 'getPopulatedTicksInWord',
              args: [poolAddress as `0x${string}`, wordIndex as unknown as number],
            }) as Array<{ tick: number; liquidityNet: bigint; liquidityGross: bigint }>
            
            if (result && result.length > 0) {
              for (const t of result) {
                allTicks.push({
                  tick: Number(t.tick),
                  liquidityNet: BigInt(t.liquidityNet),
                  liquidityGross: BigInt(t.liquidityGross),
                })
              }
            }
          } catch (e) {
            // Word might be empty, that's ok
            console.log(`Word ${wordIndex} empty or error:`, e)
          }
        }
        
        // Sort by tick
        allTicks.sort((a, b) => a.tick - b.tick)
        setTickData(allTicks)
      } catch (err) {
        console.error('Error fetching tick data:', err)
        setError('Failed to load liquidity data')
      } finally {
        setIsLoading(false)
      }
    }
    
    fetchTickData()
  }, [publicClient, poolAddress, currentTick, tickSpacing])

  // Calculate liquidity at each tick level
  const liquidityBars = useMemo(() => {
    if (tickData.length === 0) return []
    
    const bars: LiquidityBar[] = []
    let currentLiquidity = 0n
    
    // Calculate decimal factor for price display
    const decimalFactor = Math.pow(10, decimals0 - decimals1)
    const invertedDecimalFactor = Math.pow(10, decimals1 - decimals0)
    
    // Determine which decimal factor to use based on tick sign
    // If current tick is positive and large, we need inverted factor
    const useInvertedFactor = currentTick > 100000
    const factor = useInvertedFactor ? invertedDecimalFactor : decimalFactor
    
    // Build cumulative liquidity from lowest tick
    for (const tick of tickData) {
      currentLiquidity += tick.liquidityNet
      
      const rawPrice = Math.pow(1.0001, tick.tick)
      const price = rawPrice * factor
      
      bars.push({
        tick: tick.tick,
        price,
        liquidity: currentLiquidity > 0n ? currentLiquidity : 0n,
        isCurrentTick: Math.abs(tick.tick - currentTick) < tickSpacing,
      })
    }
    
    return bars
  }, [tickData, currentTick, tickSpacing, decimals0, decimals1])

  // Find max liquidity for scaling
  const maxLiquidity = useMemo(() => {
    if (liquidityBars.length === 0) return 1n
    return liquidityBars.reduce((max, bar) => bar.liquidity > max ? bar.liquidity : max, 0n)
  }, [liquidityBars])

  // Filter bars to show only around current price
  const visibleBars = useMemo(() => {
    if (liquidityBars.length === 0) return []
    
    // Show bars within ~20% of current tick range
    const tickRange = tickSpacing * 100
    const minTick = currentTick - tickRange
    const maxTick = currentTick + tickRange
    
    return liquidityBars.filter(bar => bar.tick >= minTick && bar.tick <= maxTick)
  }, [liquidityBars, currentTick, tickSpacing])

  if (isLoading) {
    return (
      <div className="liquidity-depth-chart">
        <div className="depth-chart-loading">
          <div className="spinner" style={{ width: 20, height: 20 }} />
          <span>Loading liquidity data...</span>
        </div>
      </div>
    )
  }

  if (error || visibleBars.length === 0) {
    return (
      <div className="liquidity-depth-chart">
        <div className="depth-chart-empty">
          {error || 'No liquidity data available'}
        </div>
      </div>
    )
  }

  return (
    <div className="liquidity-depth-chart">
      <div className="depth-chart-header">
        <span className="depth-chart-title">Liquidity Depth</span>
        <span className="depth-chart-subtitle">{token1Symbol}/{token0Symbol}</span>
      </div>
      
      <div className="depth-chart-container">
        {/* Y-axis labels */}
        <div className="depth-chart-yaxis">
          <span>High</span>
          <span>Low</span>
        </div>
        
        {/* Chart area */}
        <div className="depth-chart-bars">
          {visibleBars.map((bar, i) => {
            const heightPercent = maxLiquidity > 0n 
              ? Number((bar.liquidity * 100n) / maxLiquidity)
              : 0
            
            return (
              <div 
                key={i}
                className={`depth-bar ${bar.isCurrentTick ? 'current' : ''}`}
                style={{ height: `${Math.max(2, heightPercent)}%` }}
                title={`Price: ${bar.price.toFixed(4)}\nLiquidity: ${formatLiquidity(bar.liquidity)}`}
              />
            )
          })}
          
          {/* Current price indicator */}
          <div className="depth-current-price-line" />
        </div>
      </div>
      
      {/* X-axis labels */}
      <div className="depth-chart-xaxis">
        <span>← Lower prices</span>
        <span className="current-label">Current</span>
        <span>Higher prices →</span>
      </div>
    </div>
  )
}

function formatLiquidity(value: bigint): string {
  if (value === 0n) return '0'
  
  const units: Array<{ v: bigint; s: string }> = [
    { v: 1_000_000_000_000_000_000n, s: 'Q' },
    { v: 1_000_000_000_000_000n, s: 'q' },
    { v: 1_000_000_000_000n, s: 'T' },
    { v: 1_000_000_000n, s: 'B' },
    { v: 1_000_000n, s: 'M' },
    { v: 1_000n, s: 'K' },
  ]

  for (const u of units) {
    if (value >= u.v) {
      const whole = value / u.v
      return `${whole.toString()}${u.s}`
    }
  }

  return value.toString()
}
