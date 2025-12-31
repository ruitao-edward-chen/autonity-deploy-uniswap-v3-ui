import { useState, useEffect } from 'react'
import { useAccount, useReadContract, usePublicClient } from 'wagmi'
import { CONTRACTS, TOKENS, FEE_TIERS, POOLS } from '../config/contracts'
import { POSITION_MANAGER_ABI, POOL_ABI } from '../config/abis'
import { getDisplayPriceBounds, formatAmount, sqrtPriceX96ToPrice, formatPrice } from '../utils/math'
import { DEFAULT_TOKENS, getTokenByAddress, type Token } from '../utils/tokens'
import { AddLiquidity } from './AddLiquidity'

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
  const [error, setError] = useState<string | null>(null)
  const publicClient = usePublicClient()

  const fixedPool = POOLS.WATN_USDC
  const fixedTokenA = DEFAULT_TOKENS.find(t => t.symbol === 'WATN')!
  const fixedTokenB = DEFAULT_TOKENS.find(t => t.symbol === 'USDC.pol')!

  // Get number of positions owned
  const { data: positionCount } = useReadContract({
    address: CONTRACTS.nonfungiblePositionManager,
    abi: POSITION_MANAGER_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  // Fetch position token IDs and details
  useEffect(() => {
    const fetchPositions = async () => {
      if (!address || !positionCount || positionCount === 0n || !publicClient) {
        setPositions([])
        return
      }

      setIsLoading(true)
      setError(null)
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

    return (
      <div className="positions-list">
        {positions.map(position => (
          <PositionCard 
            key={position.tokenId.toString()} 
            position={position}
            onManage={() => {
              setSelectedPosition(position)
              setShowAddLiquidity(true)
            }}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="pool-container">
      <div className="pool-card">
        <div className="pool-header">
          <h2>Liquidity (WATN / USDC)</h2>
          <button 
            className="add-liquidity-button"
            onClick={() => {
              setSelectedPosition(null)
              setShowAddLiquidity(true)
            }}
          >
            + Add
          </button>
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
  onManage: () => void
}

function PositionCard({ position, onManage }: PositionCardProps) {
  const { priceLower, priceUpper, isFullRange } = getDisplayPriceBounds(
    position.tickLower,
    position.tickUpper,
    position.token0.decimals,
    position.token1.decimals
  )

  const feeTier = FEE_TIERS.find(f => f.fee === position.fee)

  return (
    <div className="position-card">
      <div className="position-header">
        <div className="position-tokens">
          <span className="token-pair">
            {position.token0.symbol} / {position.token1.symbol}
          </span>
          <span className="fee-badge">{feeTier?.label || `${position.fee / 10000}%`}</span>
        </div>
        <span className={`position-status ${position.liquidity > 0n ? 'active' : 'closed'}`}>
          {position.liquidity > 0n ? 'In Range' : 'Closed'}
        </span>
      </div>

      <div className="position-range">
        <div className="range-item">
          <span className="range-label">Min Price</span>
          <span className="range-value">{priceLower}</span>
        </div>
        <div className="range-arrow">↔</div>
        <div className="range-item">
          <span className="range-label">Max Price</span>
          <span className="range-value">{priceUpper}</span>
        </div>
      </div>

      {isFullRange && (
        <div className="full-range-badge">Full Range Position</div>
      )}

      <div className="position-liquidity">
        <span>Liquidity: {formatAmount(position.liquidity, 0)}</span>
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
  token0: typeof TOKENS.USDC
  token1: typeof TOKENS.WATN
  fee: number
  onAddLiquidity: () => void
}

function PoolCard({ poolAddress, token0, token1, fee, onAddLiquidity }: PoolCardProps) {
  const { data: slot0 } = useReadContract({
    address: poolAddress as `0x${string}`,
    abi: POOL_ABI,
    functionName: 'slot0',
  })

  const { data: liquidity } = useReadContract({
    address: poolAddress as `0x${string}`,
    abi: POOL_ABI,
    functionName: 'liquidity',
  })

  const currentPrice = slot0 
    ? sqrtPriceX96ToPrice(slot0[0] as bigint, token0.decimals, token1.decimals)
    : null

  const feeTier = FEE_TIERS.find(f => f.fee === fee)

  return (
    <div className="pool-item-card">
      <div className="pool-item-header">
        <div className="pool-tokens">
          <div className="token-icons">
            <div className="token-icon" style={{ backgroundColor: '#2775ca' }}>U</div>
            <div className="token-icon" style={{ backgroundColor: '#6366f1', marginLeft: '-8px' }}>W</div>
          </div>
          <span className="pool-pair">{token0.symbol} / {token1.symbol}</span>
          <span className="fee-badge">{feeTier?.label}</span>
        </div>
      </div>

      <div className="pool-stats">
        <div className="pool-stat">
          <span className="stat-label">Current Price</span>
          <span className="stat-value">
            {currentPrice !== null ? formatPrice(currentPrice) : '—'} {token1.symbol} per {token0.symbol}
          </span>
        </div>
        <div className="pool-stat">
          <span className="stat-label">TVL</span>
          <span className="stat-value">
            {liquidity ? formatAmount(liquidity as bigint, 0) : '—'}
          </span>
        </div>
      </div>

      <button className="pool-add-button" onClick={onAddLiquidity}>
        Add Liquidity
      </button>
    </div>
  )
}
