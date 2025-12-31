import { useState, useEffect, useMemo } from 'react'
import { useAccount, useReadContract, usePublicClient } from 'wagmi'
import { CONTRACTS, TOKENS, FEE_TIERS, POOLS } from '../config/contracts'
import { ERC20_ABI, POSITION_MANAGER_ABI, POOL_ABI } from '../config/abis'
import { getDisplayPriceBounds, formatAmount, sqrtPriceX96ToPrice, formatPrice } from '../utils/math'
import { DEFAULT_TOKENS, getTokenByAddress, type Token } from '../utils/tokens'
import { AddLiquidity } from './AddLiquidity'
import { LiquidityDepthChart } from './LiquidityDepthChart'
import { formatUnits } from 'viem'

interface Position {
  tokenId: bigint
  token0: Token
  token1: Token
  fee: number
  tickLower: number
  tickUpper: number
  liquidity: bigint
  tokensOwed0: bigint
  tokensOwed1: bigint
}

export function Liquidity() {
  const { address, isConnected } = useAccount()
  const [positions, setPositions] = useState<Position[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showAddLiquidity, setShowAddLiquidity] = useState(false)
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null)
  const [showClosedPositions, setShowClosedPositions] = useState(false)
  const publicClient = usePublicClient()

  const fixedPool = POOLS.WATN_USDC
  const fixedTokenA = DEFAULT_TOKENS.find(t => t.symbol === 'WATN')!
  const fixedTokenB = DEFAULT_TOKENS.find(t => t.symbol === 'USDC.pol')!

  const { data: fixedSlot0 } = useReadContract({
    address: fixedPool.address,
    abi: POOL_ABI,
    functionName: 'slot0',
  })

  const currentTick = fixedSlot0 ? Number(fixedSlot0[1]) : null

  // Get number of positions owned
  const { data: positionCount, refetch: refetchPositionCount } = useReadContract({
    address: CONTRACTS.nonfungiblePositionManager,
    abi: POSITION_MANAGER_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await refetchPositionCount()
    // Small delay to show the refresh animation
    setTimeout(() => setIsRefreshing(false), 500)
  }

  // Fetch position token IDs and details
  useEffect(() => {
    const fetchPositions = async () => {
      if (!address || !positionCount || positionCount === 0n || !publicClient) {
        setPositions([])
        return
      }

      setIsLoading(true)
      const count = Number(positionCount)
      const fetchedPositions: Position[] = []

      const watnAddr = TOKENS.WATN.address.toLowerCase()
      const usdcAddr = TOKENS.USDC.address.toLowerCase()

      // Fetch up to 10 positions *in the fixed pool* for performance
      for (let i = 0; i < count && fetchedPositions.length < 10; i++) {
        try {
          // Get tokenId for this position index
          const tokenId = await publicClient.readContract({
            address: CONTRACTS.nonfungiblePositionManager,
            abi: POSITION_MANAGER_ABI,
            functionName: 'tokenOfOwnerByIndex',
            args: [address, BigInt(i)],
          }) as bigint

          // Get position details
          const positionData = await publicClient.readContract({
            address: CONTRACTS.nonfungiblePositionManager,
            abi: POSITION_MANAGER_ABI,
            functionName: 'positions',
            args: [tokenId],
          }) as readonly [bigint, string, string, string, number, number, number, bigint, bigint, bigint, bigint, bigint]

          const [
            , // nonce
            , // operator
            token0Address,
            token1Address,
            fee,
            tickLower,
            tickUpper,
            liquidity,
            , // feeGrowthInside0LastX128
            , // feeGrowthInside1LastX128
            tokensOwed0,
            tokensOwed1,
          ] = positionData

          const t0Addr = (token0Address as string).toLowerCase()
          const t1Addr = (token1Address as string).toLowerCase()
          const isTargetPair = (t0Addr === watnAddr && t1Addr === usdcAddr) || (t0Addr === usdcAddr && t1Addr === watnAddr)
          const isTargetFee = Number(fee) === fixedPool.fee

          if (!isTargetPair || !isTargetFee) {
            continue
          }

          // Get token info - use known tokens or create placeholder
          const token0 = getTokenByAddress(token0Address as `0x${string}`) || {
            address: token0Address as `0x${string}`,
            symbol: 'TKN0',
            name: 'Token 0',
            decimals: 18,
          }
          const token1 = getTokenByAddress(token1Address as `0x${string}`) || {
            address: token1Address as `0x${string}`,
            symbol: 'TKN1',
            name: 'Token 1',
            decimals: 18,
          }

          fetchedPositions.push({
            tokenId,
            token0,
            token1,
            fee: Number(fee),
            tickLower: Number(tickLower),
            tickUpper: Number(tickUpper),
            liquidity: BigInt(liquidity),
            tokensOwed0: BigInt(tokensOwed0),
            tokensOwed1: BigInt(tokensOwed1),
          })
        } catch (err) {
          console.error('Error fetching position', i, ':', err)
        }
      }

      setPositions(fetchedPositions)
      setIsLoading(false)
    }

    fetchPositions()
  }, [address, positionCount, publicClient])

  if (showAddLiquidity) {
    return (
      <AddLiquidity 
        onBack={() => {
          setShowAddLiquidity(false)
          setSelectedPosition(null)
        }}
        existingPosition={selectedPosition}
        fixedPool={!selectedPosition ? { tokenA: fixedTokenA, tokenB: fixedTokenB, fee: fixedPool.fee, poolAddress: fixedPool.address } : undefined}
      />
    )
  }

  const renderPositions = () => {
    if (!isConnected) {
      return (
        <div className="pool-empty">
          <div className="empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <p>Connect your wallet to view positions</p>
        </div>
      )
    }

    if (isLoading) {
      return (
        <div className="pool-loading">
          <div className="spinner" />
          <p>Loading positions...</p>
        </div>
      )
    }

    if (positions.length === 0) {
      return (
        <div className="pool-empty">
          <div className="empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="9" y1="21" x2="9" y2="9" />
            </svg>
          </div>
          <p>No liquidity positions found</p>
          <span className="empty-hint">
            {positionCount && positionCount > 0n
              ? `You have ${positionCount.toString()} position(s) overall, but none in the WATN/USDC pool.`
              : 'Create a new position in the WATN/USDC pool to start earning fees'}
          </span>
        </div>
      )
    }

    const activePositions = positions.filter(p => p.liquidity > 0n)
    const closedPositions = positions.filter(p => p.liquidity === 0n)

    return (
      <div className="positions-list">
        {activePositions.map(position => (
          <PositionCard 
            key={position.tokenId.toString()} 
            position={position}
            currentTick={currentTick}
            onManage={() => {
              setSelectedPosition(position)
              setShowAddLiquidity(true)
            }}
          />
        ))}

        {closedPositions.length > 0 && (
          <div className="position-card">
            <div className="position-header" style={{ marginBottom: showClosedPositions ? 'var(--spacing-md)' : 0 }}>
              <div className="position-tokens">
                <span className="token-pair">Closed positions</span>
                <span className="fee-badge">{closedPositions.length}</span>
              </div>
              <button className="small-button" onClick={() => setShowClosedPositions(v => !v)}>
                {showClosedPositions ? 'Hide' : 'Show'}
              </button>
            </div>

            {showClosedPositions && (
              <div className="positions-list" style={{ gap: 'var(--spacing-sm)' }}>
                {closedPositions.map(position => (
                  <PositionCard 
                    key={position.tokenId.toString()} 
                    position={position}
                    currentTick={currentTick}
                    onManage={() => {
                      setSelectedPosition(position)
                      setShowAddLiquidity(true)
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="pool-container">
      <div className="pool-card">
        <div className="pool-header">
          <h2>Liquidity</h2>
          <div className="pool-header-actions">
            <button 
              className="refresh-button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Refresh positions"
            >
              <svg 
                width="16" 
                height="16" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2"
                className={isRefreshing ? 'spinning' : ''}
              >
                <path d="M21 12a9 9 0 11-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
            </button>
            <button 
              className="pool-add-button-header"
              onClick={() => {
                setSelectedPosition(null)
                setShowAddLiquidity(true)
              }}
            >
              + Add Liquidity
            </button>
          </div>
        </div>

        <div className="pool-list" style={{ marginBottom: 'var(--spacing-lg)' }}>
          <PoolCard 
            poolAddress={fixedPool.address}
            token0={TOKENS.WATN}
            token1={TOKENS.USDC}
            fee={fixedPool.fee}
            onAddLiquidity={() => {
              setSelectedPosition(null)
              setShowAddLiquidity(true)
            }}
          />
        </div>

        <div className="pool-info" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
          <h3>Your Positions</h3>
          {renderPositions()}
        </div>
      </div>
    </div>
  )
}

interface PositionCardProps {
  position: Position
  currentTick: number | null
  onManage: () => void
}

// Visual price range bar component
function PriceRangeBar({ 
  tickLower, 
  tickUpper, 
  currentTick,
  token0Symbol,
  token1Symbol,
}: { 
  tickLower: number
  tickUpper: number
  currentTick: number | null
  token0Symbol: string
  token1Symbol: string
}) {
  // Calculate position of current price within the range
  // We'll show a wider view: 20% padding on each side of the range
  const rangeTicks = tickUpper - tickLower
  const paddingTicks = Math.max(rangeTicks * 0.3, 1000) // At least 1000 ticks padding
  
  const viewMin = tickLower - paddingTicks
  const viewMax = tickUpper + paddingTicks
  const viewRange = viewMax - viewMin

  // Calculate percentages for the bar
  const rangeStart = ((tickLower - viewMin) / viewRange) * 100
  const rangeEnd = ((tickUpper - viewMin) / viewRange) * 100
  const rangeWidth = rangeEnd - rangeStart

  // Current price position
  const currentPos = currentTick !== null 
    ? Math.max(0, Math.min(100, ((currentTick - viewMin) / viewRange) * 100))
    : null

  const isInRange = currentTick !== null && currentTick >= tickLower && currentTick < tickUpper
  const isBelowRange = currentTick !== null && currentTick < tickLower
  const isAboveRange = currentTick !== null && currentTick >= tickUpper

  return (
    <div className="price-range-visual">
      <div className="range-bar-container">
        {/* Background track */}
        <div className="range-bar-track" />
        
        {/* Active range highlight */}
        <div 
          className={`range-bar-active ${isInRange ? 'in-range' : 'out-of-range'}`}
          style={{ 
            left: `${rangeStart}%`, 
            width: `${rangeWidth}%` 
          }}
        />
        
        {/* Range boundary markers */}
        <div 
          className="range-boundary range-boundary-min"
          style={{ left: `${rangeStart}%` }}
        />
        <div 
          className="range-boundary range-boundary-max"
          style={{ left: `${rangeEnd}%` }}
        />
        
        {/* Current price marker */}
        {currentPos !== null && (
          <div 
            className={`current-price-marker ${isInRange ? 'in-range' : 'out-of-range'}`}
            style={{ left: `${currentPos}%` }}
          >
            <div className="price-marker-line" />
            <div className="price-marker-dot" />
          </div>
        )}
      </div>
      
      {/* Labels */}
      <div className="range-bar-labels">
        <span className="range-label-text">
          {isBelowRange && '← Price below range'}
          {isAboveRange && 'Price above range →'}
          {isInRange && '● Current price in range'}
          {currentTick === null && 'Loading...'}
        </span>
        <span className="range-label-hint">
          {token1Symbol}/{token0Symbol}
        </span>
      </div>
    </div>
  )
}

function PositionCard({ position, currentTick, onManage }: PositionCardProps) {
  const { priceLower, priceUpper, isFullRange, needsInversion } = getDisplayPriceBounds(
    position.tickLower,
    position.tickUpper,
    position.token0.decimals,
    position.token1.decimals
  )

  // Calculate current price from tick for display
  const currentPriceFromTick = useMemo(() => {
    if (currentTick === null) return null
    try {
      const rawPrice = Math.pow(1.0001, currentTick)
      const price = rawPrice * Math.pow(10, position.token0.decimals - position.token1.decimals)
      // If position prices needed inversion, current price display should match
      const displayPrice = price > 1e6 ? 1 / price : price
      return formatPrice(displayPrice)
    } catch {
      return null
    }
  }, [currentTick, position.token0.decimals, position.token1.decimals])

  // For inverted positions, swap the token labels
  const priceToken0 = needsInversion ? position.token1.symbol : position.token0.symbol
  const priceToken1 = needsInversion ? position.token0.symbol : position.token1.symbol

  const feeTier = FEE_TIERS.find(f => f.fee === position.fee)

  const hasLiquidity = position.liquidity > 0n
  const isInRange = currentTick !== null && currentTick >= position.tickLower && currentTick < position.tickUpper
  const statusText = !hasLiquidity ? 'Closed' : (currentTick === null ? 'Active' : (isInRange ? 'In Range' : 'Out of Range'))

  return (
    <div className="position-card">
      <div className="position-header">
        <div className="position-tokens">
          <span className="token-pair">
            {position.token0.symbol} / {position.token1.symbol}
          </span>
          <span className="fee-badge">{feeTier?.label || `${position.fee / 10000}%`}</span>
        </div>
        <span className={`position-status ${hasLiquidity ? (isInRange ? 'active' : 'out-of-range') : 'closed'}`}>
          {statusText}
        </span>
      </div>

      {/* Visual Price Range Bar */}
      {!isFullRange && hasLiquidity && (
        <>
          <PriceRangeBar
            tickLower={position.tickLower}
            tickUpper={position.tickUpper}
            currentTick={currentTick}
            token0Symbol={priceToken0}
            token1Symbol={priceToken1}
          />
          {currentPriceFromTick && (
            <div className="current-price-value">
              Current: <strong>{currentPriceFromTick}</strong> {priceToken1}/{priceToken0}
            </div>
          )}
        </>
      )}

      {isFullRange && (
        <div className="full-range-badge">∞ Full Range Position — Earns fees at any price</div>
      )}

      <div className="position-range">
        <div className="range-item">
          <span className="range-label">Min Price</span>
          <span className="range-value">
            {priceLower} <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-text-tertiary)' }}>{priceToken1}/{priceToken0}</span>
          </span>
        </div>
        <div className="range-arrow">↔</div>
        <div className="range-item">
          <span className="range-label">Max Price</span>
          <span className="range-value">
            {priceUpper} <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-text-tertiary)' }}>{priceToken1}/{priceToken0}</span>
          </span>
        </div>
      </div>

      <div className="position-liquidity">
        <span>Liquidity: {formatCompactBigint(position.liquidity)}</span>
      </div>

      {(position.tokensOwed0 > 0n || position.tokensOwed1 > 0n) && (
        <div className="position-fees">
          <span className="fees-label">Uncollected Fees:</span>
          <span>{formatAmount(position.tokensOwed0, position.token0.decimals)} {position.token0.symbol}</span>
          <span>{formatAmount(position.tokensOwed1, position.token1.decimals)} {position.token1.symbol}</span>
        </div>
      )}

      <button className="manage-button" onClick={onManage}>
        Manage
      </button>
    </div>
  )
}

interface PoolCardProps {
  poolAddress: string
  token0: (typeof TOKENS)[keyof typeof TOKENS]
  token1: (typeof TOKENS)[keyof typeof TOKENS]
  fee: number
  onAddLiquidity: () => void
}

function PoolCard({ poolAddress, token0, token1, fee, onAddLiquidity }: PoolCardProps) {
  const { data: slot0 } = useReadContract({
    address: poolAddress as `0x${string}`,
    abi: POOL_ABI,
    functionName: 'slot0',
  })

  const { data: tickSpacingRaw } = useReadContract({
    address: poolAddress as `0x${string}`,
    abi: POOL_ABI,
    functionName: 'tickSpacing',
  })

  const { data: token0Balance } = useReadContract({
    address: token0.address as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [poolAddress as `0x${string}`],
  })

  const { data: token1Balance } = useReadContract({
    address: token1.address as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [poolAddress as `0x${string}`],
  })

  const currentTick = slot0 ? Number(slot0[1]) : 0
  const tickSpacing = tickSpacingRaw ? Number(tickSpacingRaw) : 10

  const currentPrice = slot0 
    ? sqrtPriceX96ToPrice(slot0[0] as bigint, token0.decimals, token1.decimals)
    : null

  const approxTvlToken1 = useMemo(() => {
    if (!slot0 || token0Balance === undefined || token1Balance === undefined) return null

    const sqrtPriceX96 = slot0[0] as bigint
    const Q192 = 2n ** 192n
    const priceX192 = sqrtPriceX96 * sqrtPriceX96

    // value of token0 balance expressed in token1 raw units:
    // token0Value1Raw = token0Raw * (priceX192 / Q192)
    const token0ValueInToken1 = (token0Balance as bigint) * priceX192 / Q192
    const tvlToken1Raw = (token1Balance as bigint) + token0ValueInToken1

    return trimDecimals(formatUnits(tvlToken1Raw, token1.decimals), 2)
  }, [slot0, token0Balance, token1Balance, token1.decimals])

  const token0BalanceDisplay = useMemo(() => {
    if (token0Balance === undefined) return null
    return trimDecimals(formatUnits(token0Balance as bigint, token0.decimals), 4)
  }, [token0Balance, token0.decimals])

  const token1BalanceDisplay = useMemo(() => {
    if (token1Balance === undefined) return null
    return trimDecimals(formatUnits(token1Balance as bigint, token1.decimals), 2)
  }, [token1Balance, token1.decimals])

  // Calculate token ratio for visualization
  const tokenRatio = useMemo(() => {
    if (token0Balance === undefined || token1Balance === undefined || !currentPrice) return null
    
    const t0Val = parseFloat(formatUnits(token0Balance as bigint, token0.decimals)) * currentPrice
    const t1Val = parseFloat(formatUnits(token1Balance as bigint, token1.decimals))
    const total = t0Val + t1Val
    
    if (total === 0) return { token0Pct: 50, token1Pct: 50 }
    
    return {
      token0Pct: Math.round((t0Val / total) * 100),
      token1Pct: Math.round((t1Val / total) * 100),
    }
  }, [token0Balance, token1Balance, token0.decimals, token1.decimals, currentPrice])

  const feeTier = FEE_TIERS.find(f => f.fee === fee)

  return (
    <div className="pool-item-card">
      <div className="pool-item-header">
        <div className="pool-tokens">
          <div className="token-icons">
            <div className="token-icon" style={{ backgroundColor: '#6366f1' }}>W</div>
            <div className="token-icon" style={{ backgroundColor: '#2775ca', marginLeft: '-8px' }}>U</div>
          </div>
          <span className="pool-pair">{token0.symbol} / {token1.symbol}</span>
          <span className="fee-badge">{feeTier?.label}</span>
        </div>
      </div>

      {/* Current Price Display */}
      <div className="pool-price-display">
        <div className="price-main">
          <span className="price-value">{currentPrice !== null ? formatPrice(currentPrice) : '—'}</span>
          <span className="price-unit">{token1.symbol} per {token0.symbol}</span>
        </div>
      </div>

      {/* Token Composition Bar */}
      {tokenRatio && (
        <div className="pool-composition">
          <div className="composition-bar">
            <div 
              className="composition-segment token0"
              style={{ width: `${tokenRatio.token0Pct}%` }}
            />
            <div 
              className="composition-segment token1"
              style={{ width: `${tokenRatio.token1Pct}%` }}
            />
          </div>
          <div className="composition-labels">
            <span className="comp-label">
              <span className="comp-dot token0" />
              {token0BalanceDisplay} {token0.symbol} ({tokenRatio.token0Pct}%)
            </span>
            <span className="comp-label">
              <span className="comp-dot token1" />
              {token1BalanceDisplay} {token1.symbol} ({tokenRatio.token1Pct}%)
            </span>
          </div>
        </div>
      )}

      {/* TVL */}
      <div className="pool-tvl">
        <span className="tvl-label">Total Value Locked</span>
        <span className="tvl-value">
          {approxTvlToken1 !== null ? `≈ ${approxTvlToken1} ${token1.symbol}` : '—'}
        </span>
      </div>

      {/* Liquidity Depth Chart */}
      {slot0 && (
        <LiquidityDepthChart
          poolAddress={poolAddress}
          currentTick={currentTick}
          tickSpacing={tickSpacing}
          decimals0={token0.decimals}
          decimals1={token1.decimals}
          token0Symbol={token0.symbol}
          token1Symbol={token1.symbol}
        />
      )}

      <button className="pool-add-button" onClick={onAddLiquidity}>
        Add Liquidity
      </button>
    </div>
  )
}

function trimDecimals(value: string, maxDecimals: number): string {
  if (!value.includes('.') || maxDecimals <= 0) return value
  const [i, f = ''] = value.split('.')
  const cut = f.slice(0, maxDecimals).replace(/0+$/, '')
  return cut ? `${i}.${cut}` : i
}

function formatCompactBigint(value: bigint): string {
  if (value === 0n) return '0'
  
  const abs = value < 0n ? -value : value
  const sign = value < 0n ? '-' : ''

  // For very large numbers, use scientific notation
  if (abs >= 1_000_000_000_000_000_000_000n) { // > 10^21
    const str = abs.toString()
    const exp = str.length - 1
    const mantissa = str[0] + '.' + str.slice(1, 3)
    return `${sign}${mantissa}e${exp}`
  }

  const units: Array<{ v: bigint; s: string; name: string }> = [
    { v: 1_000_000_000_000_000_000n, s: 'Q', name: 'quintillion' },
    { v: 1_000_000_000_000_000n, s: 'q', name: 'quadrillion' },
    { v: 1_000_000_000_000n, s: 'T', name: 'trillion' },
    { v: 1_000_000_000n, s: 'B', name: 'billion' },
    { v: 1_000_000n, s: 'M', name: 'million' },
    { v: 1_000n, s: 'K', name: 'thousand' },
  ]

  for (const u of units) {
    if (abs >= u.v) {
      const whole = abs / u.v
      const remainder = abs % u.v
      const oneDecimal = (remainder * 10n) / u.v
      if (whole >= 100n || oneDecimal === 0n) return `${sign}${whole.toString()}${u.s}`
      return `${sign}${whole.toString()}.${oneDecimal.toString()}${u.s}`
    }
  }

  return `${sign}${abs.toString()}`
}
