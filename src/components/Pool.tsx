import { useState, useEffect } from 'react'
import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import { CONTRACTS, TOKENS, FEE_TIERS } from '../config/contracts'
import { POSITION_MANAGER_ABI, ERC20_ABI, POOL_ABI } from '../config/abis'
import { getDisplayPriceBounds, formatAmount, sqrtPriceX96ToPrice, formatPrice } from '../utils/math'
import { getTokenByAddress, type Token } from '../utils/tokens'
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

export function Pool() {
  const { address, isConnected } = useAccount()
  const [positions, setPositions] = useState<Position[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showAddLiquidity, setShowAddLiquidity] = useState(false)
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null)

  // Get number of positions owned
  const { data: positionCount } = useReadContract({
    address: CONTRACTS.nonfungiblePositionManager,
    abi: POSITION_MANAGER_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  // Fetch position token IDs
  useEffect(() => {
    const fetchPositions = async () => {
      if (!address || !positionCount || positionCount === 0n) {
        setPositions([])
        return
      }

      setIsLoading(true)
      const count = Number(positionCount)
      const fetchedPositions: Position[] = []

      // We'll fetch up to 10 positions for performance
      const maxPositions = Math.min(count, 10)

      for (let i = 0; i < maxPositions; i++) {
        try {
          // This would need to be done with proper multicall in production
          // For now, we'll show a placeholder
        } catch (err) {
          console.error('Error fetching position:', err)
        }
      }

      setPositions(fetchedPositions)
      setIsLoading(false)
    }

    fetchPositions()
  }, [address, positionCount])

  if (showAddLiquidity) {
    return (
      <AddLiquidity 
        onBack={() => setShowAddLiquidity(false)}
        existingPosition={selectedPosition}
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
          <p>No positions found</p>
          <span className="empty-hint">
            {positionCount && positionCount > 0n 
              ? `You have ${positionCount.toString()} position(s). Loading...`
              : 'Create a new position to start earning fees'
            }
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
          <h2>Your Positions</h2>
          <button 
            className="add-liquidity-button"
            onClick={() => {
              setSelectedPosition(null)
              setShowAddLiquidity(true)
            }}
          >
            + New Position
          </button>
        </div>

        {renderPositions()}

        <div className="pool-info">
          <h3>Available Pools</h3>
          <div className="pool-list">
            <PoolCard 
              poolAddress="0x8703324e56B0724158bdd0B25251fFb5D3343Aba"
              token0={TOKENS.WATN}
              token1={TOKENS.USDC}
              fee={500}
              onAddLiquidity={() => setShowAddLiquidity(true)}
            />
          </div>
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
