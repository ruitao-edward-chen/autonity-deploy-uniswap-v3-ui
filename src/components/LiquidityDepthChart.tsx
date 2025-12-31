import { useState, useEffect, useMemo } from 'react'
import { usePublicClient } from 'wagmi'
import { CONTRACTS } from '../config/contracts'
import { TICK_LENS_ABI } from '../config/abis'

interface TickData {
  tick: number
  liquidityNet: bigint
  liquidityGross: bigint
}

interface LiquidityDepthChartProps {
  poolAddress: string
  currentTick: number
  tickSpacing: number
  token0Symbol: string
  token1Symbol: string
}

export function LiquidityDepthChart({
  poolAddress,
  currentTick,
  tickSpacing,
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
        
        // Fetch 5 words around current price for wider coverage
        const wordIndices = [
          currentWordIndex - 2,
          currentWordIndex - 1,
          currentWordIndex,
          currentWordIndex + 1,
          currentWordIndex + 2,
        ]
        
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

  // Process tick data into liquidity distribution
  const { liquidityByTick, minTick, maxTick, maxLiquidity } = useMemo(() => {
    if (tickData.length === 0) {
      return { liquidityByTick: new Map(), minTick: 0, maxTick: 0, maxLiquidity: 1n }
    }
    
    // Build cumulative liquidity from lowest tick
    const liquidityMap = new Map<number, bigint>()
    let runningLiquidity = 0n
    
    // First pass: calculate liquidity at each initialized tick
    for (const tick of tickData) {
      runningLiquidity += tick.liquidityNet
      liquidityMap.set(tick.tick, runningLiquidity > 0n ? runningLiquidity : 0n)
    }
    
    // Find range that includes current tick
    const allTicks = Array.from(liquidityMap.keys()).sort((a, b) => a - b)
    const tickMin = Math.min(...allTicks, currentTick - tickSpacing * 50)
    const tickMax = Math.max(...allTicks, currentTick + tickSpacing * 50)
    
    // Find max liquidity for scaling
    let maxLiq = 1n
    for (const liq of liquidityMap.values()) {
      if (liq > maxLiq) maxLiq = liq
    }
    
    return {
      liquidityByTick: liquidityMap,
      minTick: tickMin,
      maxTick: tickMax,
      maxLiquidity: maxLiq,
    }
  }, [tickData, currentTick, tickSpacing])

  // Create display buckets for the chart
  const chartBuckets = useMemo(() => {
    const NUM_BUCKETS = 40
    const buckets: Array<{
      tickStart: number
      tickEnd: number
      liquidity: bigint
      containsCurrent: boolean
      position: 'left' | 'current' | 'right'
    }> = []
    
    const totalRange = maxTick - minTick
    if (totalRange <= 0) return buckets
    
    const bucketSize = Math.ceil(totalRange / NUM_BUCKETS)
    
    // Get sorted tick data for interpolation
    const sortedTicks = Array.from(liquidityByTick.entries()).sort((a, b) => a[0] - b[0])
    
    for (let i = 0; i < NUM_BUCKETS; i++) {
      const tickStart = minTick + i * bucketSize
      const tickEnd = tickStart + bucketSize
      const containsCurrent = currentTick >= tickStart && currentTick < tickEnd
      
      // Find liquidity at this bucket (use the tick just before this range)
      let bucketLiquidity = 0n
      for (const [tick, liq] of sortedTicks) {
        if (tick <= tickStart) {
          bucketLiquidity = liq
        } else {
          break
        }
      }
      
      // Also check if any tick in this bucket has liquidity
      for (const [tick, liq] of sortedTicks) {
        if (tick >= tickStart && tick < tickEnd && liq > bucketLiquidity) {
          bucketLiquidity = liq
        }
      }
      
      buckets.push({
        tickStart,
        tickEnd,
        liquidity: bucketLiquidity,
        containsCurrent,
        position: tickEnd <= currentTick ? 'left' : tickStart >= currentTick ? 'right' : 'current',
      })
    }
    
    return buckets
  }, [minTick, maxTick, currentTick, liquidityByTick])

  // Calculate where current price line should be
  const currentPricePosition = useMemo(() => {
    const totalRange = maxTick - minTick
    if (totalRange <= 0) return 50
    return ((currentTick - minTick) / totalRange) * 100
  }, [currentTick, minTick, maxTick])

  // Summary stats
  const { inRangeLiquidity, outOfRangeLiquidity } = useMemo(() => {
    let inRange = 0n
    let outRange = 0n
    
    for (const bucket of chartBuckets) {
      if (bucket.containsCurrent) {
        inRange = bucket.liquidity
      } else if (bucket.liquidity > 0n) {
        outRange += bucket.liquidity
      }
    }
    
    return { inRangeLiquidity: inRange, outOfRangeLiquidity: outRange }
  }, [chartBuckets])

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

  if (error || chartBuckets.length === 0) {
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
          {chartBuckets.map((bucket, i) => {
            const heightPercent = maxLiquidity > 0n 
              ? Number((bucket.liquidity * 100n) / maxLiquidity)
              : 0
            
            const barClass = bucket.containsCurrent 
              ? 'current' 
              : bucket.liquidity > 0n 
                ? (bucket.position === 'left' ? 'out-left' : 'out-right')
                : ''
            
            return (
              <div 
                key={i}
                className={`depth-bar ${barClass}`}
                style={{ height: `${Math.max(heightPercent > 0 ? 4 : 0, heightPercent)}%` }}
                title={`Ticks: ${bucket.tickStart} - ${bucket.tickEnd}\nLiquidity: ${formatLiquidity(bucket.liquidity)}`}
              />
            )
          })}
          
          {/* Current price indicator */}
          <div 
            className="depth-current-price-line" 
            style={{ left: `${currentPricePosition}%` }}
          />
        </div>
      </div>
      
      {/* X-axis labels */}
      <div className="depth-chart-xaxis">
        <span>← Lower prices</span>
        <span className="current-label">Current</span>
        <span>Higher prices →</span>
      </div>
      
      {/* Liquidity summary */}
      <div className="depth-chart-summary">
        <div className="summary-item">
          <span className="summary-dot in-range" />
          <span>In range: {formatLiquidity(inRangeLiquidity)}</span>
        </div>
        <div className="summary-item">
          <span className="summary-dot out-range" />
          <span>Out of range: {formatLiquidity(outOfRangeLiquidity)}</span>
        </div>
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
      const remainder = (value % u.v) * 10n / u.v
      if (remainder > 0n) {
        return `${whole.toString()}.${remainder.toString()}${u.s}`
      }
      return `${whole.toString()}${u.s}`
    }
  }

  return value.toString()
}
