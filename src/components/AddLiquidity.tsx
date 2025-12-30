import { useState, useEffect, useMemo } from 'react'
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt, useBalance } from 'wagmi'
import { parseUnits, formatUnits } from 'viem'
import { TokenInput } from './TokenInput'
import { TokenSelectModal } from './TokenSelectModal'
import { DEFAULT_TOKENS, sortTokens, type Token } from '../utils/tokens'
import { CONTRACTS, FEE_TIERS, DEFAULT_SLIPPAGE, DEFAULT_DEADLINE_MINUTES, POOLS } from '../config/contracts'
import { ERC20_ABI, POSITION_MANAGER_ABI, POOL_ABI, FACTORY_ABI } from '../config/abis'
import { 
  nearestUsableTick, 
  priceToTick, 
  tickToPrice, 
  MIN_TICK, 
  MAX_TICK,
  getDeadline,
  applySlippage,
  sqrtPriceX96ToPrice,
  priceToSqrtPriceX96,
  formatPrice,
  isTickSafe
} from '../utils/math'

interface AddLiquidityProps {
  onBack: () => void
  existingPosition?: {
    tokenId: bigint
    token0: Token
    token1: Token
    fee: number
    tickLower: number
    tickUpper: number
  } | null
}

export function AddLiquidity({ onBack, existingPosition }: AddLiquidityProps) {
  const { address } = useAccount()
  
  // Token selection
  const [tokenA, setTokenA] = useState<Token>(DEFAULT_TOKENS[0]) // WATN
  const [tokenB, setTokenB] = useState<Token>(DEFAULT_TOKENS[1]) // USDC
  const [selectingToken, setSelectingToken] = useState<'A' | 'B' | null>(null)
  
  // Amounts
  const [amountA, setAmountA] = useState('')
  const [amountB, setAmountB] = useState('')
  
  // Fee tier - default to 0.05% (500) since that's the existing WATN/USDC pool
  const [selectedFee, setSelectedFee] = useState(500)
  
  // Price range
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [isFullRange, setIsFullRange] = useState(false)
  
  // UI state
  const [showPriceInputs, setShowPriceInputs] = useState(true)
  
  // Sort tokens for proper ordering
  const [token0, token1] = useMemo(() => sortTokens(tokenA, tokenB), [tokenA, tokenB])
  const isToken0First = token0.address === tokenA.address

  // Check which fee tiers have existing pools for the selected token pair
  const poolQueries = useMemo(() => 
    FEE_TIERS.map(tier => ({
      address: CONTRACTS.v3Factory as `0x${string}`,
      abi: FACTORY_ABI,
      functionName: 'getPool' as const,
      args: [token0.address, token1.address, tier.fee] as const,
    })),
    [token0.address, token1.address]
  )

  const { data: poolResults } = useReadContracts({
    contracts: poolQueries,
  })

  // Map fee tiers to their pool existence status
  const feePoolMap = useMemo(() => {
    const zeroAddress = '0x0000000000000000000000000000000000000000'
    const map: Record<number, { exists: boolean; address?: string }> = {}
    
    // Check if selected tokens are WATN/USDC pair
    const watnAddr = POOLS.WATN_USDC.token0.address.toLowerCase()
    const usdcAddr = POOLS.WATN_USDC.token1.address.toLowerCase()
    const t0 = token0.address.toLowerCase()
    const t1 = token1.address.toLowerCase()
    const isWatnUsdcPair = (t0 === watnAddr && t1 === usdcAddr) || (t0 === usdcAddr && t1 === watnAddr)
    
    FEE_TIERS.forEach((tier, index) => {
      const result = poolResults?.[index]?.result as `0x${string}` | undefined
      const hasPoolFromFactory = result && result.toLowerCase() !== zeroAddress.toLowerCase()
      
      // For WATN/USDC pair at 0.05% fee, use known pool as fallback
      const isKnownPool = isWatnUsdcPair && tier.fee === POOLS.WATN_USDC.fee
      
      map[tier.fee] = {
        exists: hasPoolFromFactory || isKnownPool,
        address: hasPoolFromFactory ? result : (isKnownPool ? POOLS.WATN_USDC.address : undefined)
      }
    })
    
    return map
  }, [poolResults, token0.address, token1.address])

  // Get current pool address based on selected fee
  const poolAddress = feePoolMap[selectedFee]?.address
  const poolExists = feePoolMap[selectedFee]?.exists || false

  // Debug logging
  console.log('Pool lookup:', 'token0:', token0.address, 'token1:', token1.address, 'fee:', selectedFee, 'poolAddress:', poolAddress, 'poolExists:', poolExists, 'feePoolMap:', feePoolMap)

  // Get pool state if exists
  const { data: slot0 } = useReadContract({
    address: poolExists ? poolAddress : undefined,
    abi: POOL_ABI,
    functionName: 'slot0',
    query: { enabled: poolExists },
  })

  const { data: tickSpacingRaw } = useReadContract({
    address: poolExists ? poolAddress : undefined,
    abi: POOL_ABI,
    functionName: 'tickSpacing',
    query: { enabled: poolExists },
  })

  const tickSpacing = tickSpacingRaw ? Number(tickSpacingRaw) : FEE_TIERS.find(f => f.fee === selectedFee)?.tickSpacing || 60

  // Current price from pool
  const currentPrice = useMemo(() => {
    if (!slot0) {
      console.log('No slot0 data')
      return null
    }
    const sqrtPriceX96 = slot0[0] as bigint
    console.log('slot0:', { sqrtPriceX96: sqrtPriceX96.toString(), tick: slot0[1] })
    return sqrtPriceX96ToPrice(sqrtPriceX96, token0.decimals, token1.decimals)
  }, [slot0, token0.decimals, token1.decimals])

  const currentTick = slot0 ? Number(slot0[1]) : 0

  // Get token balances
  const { data: balanceA } = useReadContract({
    address: tokenA.address,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const { data: balanceB } = useReadContract({
    address: tokenB.address,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  // Get allowances
  const { data: allowanceA, refetch: refetchAllowanceA } = useReadContract({
    address: tokenA.address,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, CONTRACTS.nonfungiblePositionManager] : undefined,
    query: { enabled: !!address },
  })

  const { data: allowanceB, refetch: refetchAllowanceB } = useReadContract({
    address: tokenB.address,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, CONTRACTS.nonfungiblePositionManager] : undefined,
    query: { enabled: !!address },
  })

  const { writeContract, data: txHash, isPending: isWriting, reset: resetWrite } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash })

  // Calculate ticks from prices
  const { tickLower, tickUpper } = useMemo(() => {
    if (isFullRange) {
      return {
        tickLower: nearestUsableTick(MIN_TICK, tickSpacing),
        tickUpper: nearestUsableTick(MAX_TICK, tickSpacing),
      }
    }

    const priceLower = parseFloat(minPrice) || 0
    const priceUpper = parseFloat(maxPrice) || Infinity

    if (priceLower <= 0 || priceUpper <= 0 || priceLower >= priceUpper) {
      return { tickLower: 0, tickUpper: 0 }
    }

    // Convert prices to ticks (price is token1/token0)
    const rawTickLower = priceToTick(priceLower, token0.decimals, token1.decimals)
    const rawTickUpper = priceToTick(priceUpper, token0.decimals, token1.decimals)

    return {
      tickLower: nearestUsableTick(rawTickLower, tickSpacing),
      tickUpper: nearestUsableTick(rawTickUpper, tickSpacing),
    }
  }, [minPrice, maxPrice, isFullRange, tickSpacing, token0.decimals, token1.decimals])

  // Determine position type based on price range
  const positionType = useMemo(() => {
    if (!currentPrice || tickLower >= tickUpper) return 'invalid'
    if (isFullRange) return 'full-range'
    if (currentTick < tickLower) return 'above-range' // Only token0 needed
    if (currentTick >= tickUpper) return 'below-range' // Only token1 needed
    return 'in-range' // Both tokens needed
  }, [currentPrice, currentTick, tickLower, tickUpper, isFullRange])

  // Set initial prices from current pool price
  useEffect(() => {
    if (currentPrice && minPrice === '' && maxPrice === '') {
      // Set default range to ±50% of current price for better UX
      const lower = currentPrice * 0.5
      const upper = currentPrice * 1.5
      console.log('Setting price range:', 'currentPrice:', currentPrice, 'lower:', lower, 'upper:', upper)
      setMinPrice(formatPrice(lower))
      setMaxPrice(formatPrice(upper))
    }
  }, [currentPrice]) // Only depend on currentPrice

  // Reset on success
  useEffect(() => {
    if (isConfirmed) {
      setAmountA('')
      setAmountB('')
      resetWrite()
      refetchAllowanceA()
      refetchAllowanceB()
    }
  }, [isConfirmed, resetWrite, refetchAllowanceA, refetchAllowanceB])

  const needsApprovalA = () => {
    if (!amountA || parseFloat(amountA) === 0) return false
    if (allowanceA === undefined) return true
    const amountWei = parseUnits(amountA, tokenA.decimals)
    return (allowanceA as bigint) < amountWei
  }

  const needsApprovalB = () => {
    if (!amountB || parseFloat(amountB) === 0) return false
    if (allowanceB === undefined) return true
    const amountWei = parseUnits(amountB, tokenB.decimals)
    return (allowanceB as bigint) < amountWei
  }

  const handleApprove = async (token: 'A' | 'B') => {
    if (!address) return

    const tokenAddr = token === 'A' ? tokenA.address : tokenB.address
    const amount = token === 'A' ? amountA : amountB
    const decimals = token === 'A' ? tokenA.decimals : tokenB.decimals

    const amountWei = parseUnits(amount, decimals)

    writeContract({
      address: tokenAddr,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [CONTRACTS.nonfungiblePositionManager, amountWei * 2n],
    })
  }

  const handleAddLiquidity = async () => {
    if (!address || tickLower >= tickUpper) return

    const amount0Desired = isToken0First 
      ? parseUnits(amountA || '0', tokenA.decimals)
      : parseUnits(amountB || '0', tokenB.decimals)
    const amount1Desired = isToken0First
      ? parseUnits(amountB || '0', tokenB.decimals)
      : parseUnits(amountA || '0', tokenA.decimals)

    const amount0Min = applySlippage(amount0Desired, DEFAULT_SLIPPAGE, true)
    const amount1Min = applySlippage(amount1Desired, DEFAULT_SLIPPAGE, true)
    const deadline = getDeadline(DEFAULT_DEADLINE_MINUTES)

    try {
      if (!poolExists && currentPrice) {
        // Need to create and initialize pool first
        const sqrtPriceX96 = priceToSqrtPriceX96(currentPrice, token0.decimals, token1.decimals)
        
        writeContract({
          address: CONTRACTS.nonfungiblePositionManager,
          abi: POSITION_MANAGER_ABI,
          functionName: 'createAndInitializePoolIfNecessary',
          args: [token0.address, token1.address, selectedFee, sqrtPriceX96],
        })
        return
      }

      // Mint new position
      writeContract({
        address: CONTRACTS.nonfungiblePositionManager,
        abi: POSITION_MANAGER_ABI,
        functionName: 'mint',
        args: [{
          token0: token0.address,
          token1: token1.address,
          fee: selectedFee,
          tickLower,
          tickUpper,
          amount0Desired,
          amount1Desired,
          amount0Min,
          amount1Min,
          recipient: address,
          deadline,
        }],
      })
    } catch (err) {
      console.error('Add liquidity error:', err)
    }
  }

  const getButtonText = () => {
    if (isWriting || isConfirming) return 'Confirming...'
    if (!poolExists) return 'Create Pool & Add Liquidity'
    if (tickLower >= tickUpper) return 'Invalid Price Range'
    if (needsApprovalA()) return `Approve ${tokenA.symbol}`
    if (needsApprovalB()) return `Approve ${tokenB.symbol}`
    if ((!amountA || parseFloat(amountA) === 0) && (!amountB || parseFloat(amountB) === 0)) {
      return 'Enter Amounts'
    }
    return 'Add Liquidity'
  }

  const handleButtonClick = () => {
    if (needsApprovalA()) {
      handleApprove('A')
    } else if (needsApprovalB()) {
      handleApprove('B')
    } else {
      handleAddLiquidity()
    }
  }

  const handleTokenSelect = (token: Token) => {
    if (selectingToken === 'A') {
      if (token.address === tokenB.address) {
        // Swap tokens
        setTokenA(tokenB)
        setTokenB(tokenA)
      } else {
        setTokenA(token)
      }
    } else if (selectingToken === 'B') {
      if (token.address === tokenA.address) {
        // Swap tokens
        setTokenA(tokenB)
        setTokenB(tokenA)
      } else {
        setTokenB(token)
      }
    }
    setSelectingToken(null)
  }

  return (
    <div className="add-liquidity-container">
      <div className="add-liquidity-card">
        <div className="add-liquidity-header">
          <button className="back-button" onClick={onBack}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
          <h2>Add Liquidity</h2>
        </div>

        {/* Fee Tier Selection */}
        <div className="fee-tier-section">
          <label className="section-label">Select Fee Tier</label>
          <div className="fee-tier-options">
            {FEE_TIERS.map(tier => {
              const hasPool = feePoolMap[tier.fee]?.exists || false
              
              return (
                <button
                  key={tier.fee}
                  className={`fee-tier-option ${selectedFee === tier.fee ? 'selected' : ''} ${hasPool ? 'has-pool' : 'no-pool'}`}
                  onClick={() => hasPool && setSelectedFee(tier.fee)}
                  disabled={!hasPool}
                >
                  <span className="fee-label">{tier.label}</span>
                  {hasPool && <span className="pool-exists-badge">Pool exists</span>}
                  {!hasPool && <span className="no-pool-badge">No pool</span>}
                </button>
              )
            })}
          </div>
        </div>

        {/* Price Range */}
        <div className="price-range-section">
          <div className="section-header">
            <label className="section-label">Set Price Range</label>
            <button 
              className={`full-range-toggle ${isFullRange ? 'active' : ''}`}
              onClick={() => setIsFullRange(!isFullRange)}
            >
              Full Range
            </button>
          </div>

          {currentPrice && (
            <div className="current-price">
              Current Price: <strong>{formatPrice(currentPrice)}</strong> {token1.symbol} per {token0.symbol}
            </div>
          )}

          {!isFullRange && (
            <div className="price-inputs">
              <div className="price-input-group">
                <label>Min Price</label>
                <input
                  type="text"
                  value={minPrice}
                  onChange={e => setMinPrice(e.target.value)}
                  placeholder="0.0"
                  className="price-input"
                />
                <span className="price-unit">{token1.symbol} per {token0.symbol}</span>
              </div>
              <div className="price-input-group">
                <label>Max Price</label>
                <input
                  type="text"
                  value={maxPrice}
                  onChange={e => setMaxPrice(e.target.value)}
                  placeholder="0.0"
                  className="price-input"
                />
                <span className="price-unit">{token1.symbol} per {token0.symbol}</span>
              </div>
            </div>
          )}

          {isFullRange && (
            <div className="full-range-warning">
              ⚠️ Full range positions may earn less fees due to lower capital efficiency
            </div>
          )}

          {/* Position type indicator */}
          <div className={`position-type-indicator ${positionType}`}>
            {positionType === 'in-range' && '✓ Price is in range - Both tokens required'}
            {positionType === 'above-range' && '↑ Price above range - Only ' + token0.symbol + ' required (one-sided)'}
            {positionType === 'below-range' && '↓ Price below range - Only ' + token1.symbol + ' required (one-sided)'}
            {positionType === 'full-range' && '∞ Full range position'}
            {positionType === 'invalid' && '⚠ Invalid price range'}
          </div>
        </div>

        {/* Token Amounts */}
        <div className="amounts-section">
          <label className="section-label">Deposit Amounts</label>
          
          <TokenInput
            token={tokenA}
            amount={amountA}
            onAmountChange={setAmountA}
            onTokenSelect={() => setSelectingToken('A')}
            balance={balanceA as bigint | undefined}
            label={tokenA.symbol}
            showMax
            disabled={positionType === 'below-range' && tokenA.address === token0.address || 
                     positionType === 'above-range' && tokenA.address === token1.address}
          />

          <div className="amount-separator">+</div>

          <TokenInput
            token={tokenB}
            amount={amountB}
            onAmountChange={setAmountB}
            onTokenSelect={() => setSelectingToken('B')}
            balance={balanceB as bigint | undefined}
            label={tokenB.symbol}
            showMax
            disabled={positionType === 'below-range' && tokenB.address === token0.address ||
                     positionType === 'above-range' && tokenB.address === token1.address}
          />
        </div>

        {/* Pool status */}
        {!poolExists && (
          <div className="pool-create-notice">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>This pool does not exist yet. You will create it by adding liquidity.</span>
          </div>
        )}

        <button
          className="add-liquidity-button"
          onClick={handleButtonClick}
          disabled={isWriting || isConfirming || (positionType === 'invalid' && !isFullRange)}
        >
          {getButtonText()}
        </button>
      </div>

      <TokenSelectModal
        isOpen={selectingToken !== null}
        onClose={() => setSelectingToken(null)}
        onSelect={handleTokenSelect}
        excludeToken={selectingToken === 'A' ? tokenB : tokenA}
      />
    </div>
  )
}
