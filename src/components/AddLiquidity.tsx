import { useState, useEffect, useMemo } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useBalance } from 'wagmi'
import { parseUnits, formatUnits } from 'viem'
import { TokenInput } from './TokenInput'
import { TokenSelectModal } from './TokenSelectModal'
import { DEFAULT_TOKENS, sortTokens, type Token } from '../utils/tokens'
import { CONTRACTS, FEE_TIERS, DEFAULT_SLIPPAGE, DEFAULT_DEADLINE_MINUTES } from '../config/contracts'
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
  
  // Fee tier
  const [selectedFee, setSelectedFee] = useState(3000)
  
  // Price range
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [isFullRange, setIsFullRange] = useState(false)
  
  // UI state
  const [showPriceInputs, setShowPriceInputs] = useState(true)
  
  // Sort tokens for proper ordering
  const [token0, token1] = useMemo(() => sortTokens(tokenA, tokenB), [tokenA, tokenB])
  const isToken0First = token0.address === tokenA.address

  // Get pool address
  const { data: poolAddress } = useReadContract({
    address: CONTRACTS.v3Factory,
    abi: FACTORY_ABI,
    functionName: 'getPool',
    args: [token0.address, token1.address, selectedFee],
  })

  const poolExists = poolAddress && poolAddress !== '0x0000000000000000000000000000000000000000'

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
    if (!slot0) return null
    return sqrtPriceX96ToPrice(slot0[0] as bigint, token0.decimals, token1.decimals)
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
    if (currentPrice && !minPrice && !maxPrice) {
      // Set default range to ±20% of current price
      const lower = currentPrice * 0.8
      const upper = currentPrice * 1.2
      setMinPrice(formatPrice(lower))
      setMaxPrice(formatPrice(upper))
    }
  }, [currentPrice, minPrice, maxPrice])

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
            {FEE_TIERS.map(tier => (
              <button
                key={tier.fee}
                className={`fee-tier-option ${selectedFee === tier.fee ? 'selected' : ''}`}
                onClick={() => setSelectedFee(tier.fee)}
              >
                <span className="fee-label">{tier.label}</span>
                <span className="fee-desc">
                  {tier.fee === 100 && 'Very stable pairs'}
                  {tier.fee === 500 && 'Stable pairs'}
                  {tier.fee === 3000 && 'Most pairs'}
                  {tier.fee === 10000 && 'Exotic pairs'}
                </span>
              </button>
            ))}
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
