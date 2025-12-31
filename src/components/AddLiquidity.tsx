import { useState, useEffect, useMemo } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits, encodeFunctionData } from 'viem'
import { TokenInput } from './TokenInput'
import { TokenSelectModal } from './TokenSelectModal'
import { DEFAULT_TOKENS, sortTokens, type Token } from '../utils/tokens'
import { CONTRACTS, FEE_TIERS, DEFAULT_DEADLINE_MINUTES, POOLS } from '../config/contracts'
import { ERC20_ABI, POSITION_MANAGER_ABI, POOL_ABI, FACTORY_ABI } from '../config/abis'
import { 
  nearestUsableTick, 
  priceToTick, 
  MIN_TICK, 
  MAX_TICK,
  getDeadline,
  sqrtPriceX96ToPrice,
  priceToSqrtPriceX96,
  formatPrice,
  getDisplayPriceBounds
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
    liquidity?: bigint
  } | null
  fixedPool?: {
    tokenA: Token
    tokenB: Token
    fee: number
    poolAddress: `0x${string}`
  }
}

type ManageTab = 'increase' | 'remove'

const MAX_UINT128 = (2n ** 128n) - 1n

export function AddLiquidity({ onBack, existingPosition, fixedPool }: AddLiquidityProps) {
  const { address } = useAccount()
  const isManaging = !!existingPosition
  const isFixedPool = !isManaging && !!fixedPool
  
  // Token selection
  const [tokenA, setTokenA] = useState<Token>(fixedPool?.tokenA ?? DEFAULT_TOKENS[0]) // WATN
  const [tokenB, setTokenB] = useState<Token>(fixedPool?.tokenB ?? DEFAULT_TOKENS[1]) // USDC
  const [selectingToken, setSelectingToken] = useState<'A' | 'B' | null>(null)
  
  // Amounts
  const [amountA, setAmountA] = useState('')
  const [amountB, setAmountB] = useState('')
  
  // Fee tier
  const [selectedFee, setSelectedFee] = useState(fixedPool?.fee ?? 3000)

  const feeTierLabel = useMemo(() => {
    return FEE_TIERS.find(t => t.fee === selectedFee)?.label || `${selectedFee / 10000}%`
  }, [selectedFee])
  
  // Price range
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [isFullRange, setIsFullRange] = useState(false)

  // Manage mode state
  const [manageTab, setManageTab] = useState<ManageTab>('increase')
  const [removePercent, setRemovePercent] = useState(50)
  
  // Sort tokens for proper ordering
  const [token0, token1] = useMemo(() => sortTokens(tokenA, tokenB), [tokenA, tokenB])
  const isToken0First = token0.address === tokenA.address

  useEffect(() => {
    if (!existingPosition) return

    setTokenA(existingPosition.token0)
    setTokenB(existingPosition.token1)
    setSelectedFee(existingPosition.fee)
    setManageTab('increase')
    setRemovePercent(50)
    setAmountA('')
    setAmountB('')

    // Keep display-only range info in sync for the UI
    const bounds = getDisplayPriceBounds(
      existingPosition.tickLower,
      existingPosition.tickUpper,
      existingPosition.token0.decimals,
      existingPosition.token1.decimals
    )
    setMinPrice(bounds.priceLower)
    setMaxPrice(bounds.priceUpper)
    setIsFullRange(bounds.isFullRange)
  }, [existingPosition])

  useEffect(() => {
    if (!fixedPool || existingPosition) return

    setTokenA(fixedPool.tokenA)
    setTokenB(fixedPool.tokenB)
    setSelectedFee(fixedPool.fee)
    setSelectingToken(null)
  }, [existingPosition, fixedPool])

  const positionLiquidity = useMemo(() => {
    if (!existingPosition) return 0n
    return existingPosition.liquidity ?? 0n
  }, [existingPosition])

  const liquidityToRemove = useMemo(() => {
    if (!isManaging) return 0n
    if (positionLiquidity <= 0n) return 0n
    if (!Number.isFinite(removePercent) || removePercent <= 0) return 0n

    const pct = Math.max(0, Math.min(100, Math.floor(removePercent)))
    return (positionLiquidity * BigInt(pct)) / 100n
  }, [isManaging, positionLiquidity, removePercent])

  // Get pool address from factory
  const { data: poolAddressRaw } = useReadContract({
    address: CONTRACTS.v3Factory,
    abi: FACTORY_ABI,
    functionName: 'getPool',
    args: [token0.address, token1.address, selectedFee],
    query: { enabled: !fixedPool },
  })

  // Check if this is the known WATN/USDC pool
  const isKnownPool = useMemo(() => {
    const watnAddr = POOLS.WATN_USDC.token0.address.toLowerCase()
    const usdcAddr = POOLS.WATN_USDC.token1.address.toLowerCase()
    const t0 = token0.address.toLowerCase()
    const t1 = token1.address.toLowerCase()
    return selectedFee === POOLS.WATN_USDC.fee && 
           ((t0 === watnAddr && t1 === usdcAddr) || (t0 === usdcAddr && t1 === watnAddr))
  }, [token0.address, token1.address, selectedFee])

  // Use known pool address as fallback if factory lookup fails
  const poolAddress = useMemo(() => {
    if (fixedPool) return fixedPool.poolAddress

    const factoryResult = poolAddressRaw as `0x${string}` | undefined
    const zeroAddress = '0x0000000000000000000000000000000000000000'
    
    // If factory returned a valid address, use it
    if (factoryResult && factoryResult.toLowerCase() !== zeroAddress.toLowerCase()) {
      return factoryResult
    }
    
    // Fallback to known pool address for WATN/USDC
    if (isKnownPool) {
      return POOLS.WATN_USDC.address
    }
    
    return undefined
  }, [fixedPool, poolAddressRaw, isKnownPool])

  const poolExists = Boolean(poolAddress)

  // Debug logging
  console.log('Pool lookup:', 'token0:', token0.address, 'token1:', token1.address, 'fee:', selectedFee, 'factoryResult:', poolAddressRaw, 'poolAddress:', poolAddress, 'isKnownPool:', isKnownPool, 'poolExists:', poolExists)

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
    if (existingPosition) {
      return {
        tickLower: existingPosition.tickLower,
        tickUpper: existingPosition.tickUpper,
      }
    }

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
  }, [existingPosition, isFullRange, maxPrice, minPrice, tickSpacing, token0.decimals, token1.decimals])

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
    if (existingPosition) return
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

  const handleMintPosition = async () => {
    if (!address || tickLower >= tickUpper) return

    const amount0Desired = isToken0First 
      ? parseUnits(amountA || '0', tokenA.decimals)
      : parseUnits(amountB || '0', tokenB.decimals)
    const amount1Desired = isToken0First
      ? parseUnits(amountB || '0', tokenB.decimals)
      : parseUnits(amountA || '0', tokenA.decimals)

    const deadline = getDeadline(DEFAULT_DEADLINE_MINUTES)

    console.log('Mint position params:', {
      token0: token0.address,
      token1: token1.address,
      fee: selectedFee,
      tickLower,
      tickUpper,
      amount0Desired: amount0Desired.toString(),
      amount1Desired: amount1Desired.toString(),
      deadline: deadline.toString(),
    })

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
          amount0Min: 0n, // Use 0 to avoid slippage failures
          amount1Min: 0n,
          recipient: address,
          deadline,
        }],
      })
    } catch (err) {
      console.error('Add liquidity error:', err)
    }
  }

  const handleIncreaseLiquidity = async () => {
    if (!address || !existingPosition || tickLower >= tickUpper) return

    const amount0Desired = isToken0First 
      ? parseUnits(amountA || '0', tokenA.decimals)
      : parseUnits(amountB || '0', tokenB.decimals)
    const amount1Desired = isToken0First
      ? parseUnits(amountB || '0', tokenB.decimals)
      : parseUnits(amountA || '0', tokenA.decimals)

    if (amount0Desired === 0n && amount1Desired === 0n) return

    const deadline = getDeadline(DEFAULT_DEADLINE_MINUTES)

    console.log('Increase liquidity params:', {
      tokenId: existingPosition.tokenId.toString(),
      amount0Desired: amount0Desired.toString(),
      amount1Desired: amount1Desired.toString(),
      deadline: deadline.toString(),
    })

    try {
      writeContract({
        address: CONTRACTS.nonfungiblePositionManager,
        abi: POSITION_MANAGER_ABI,
        functionName: 'increaseLiquidity',
        args: [{
          tokenId: existingPosition.tokenId,
          amount0Desired,
          amount1Desired,
          amount0Min: 0n, // Use 0 to avoid slippage failures
          amount1Min: 0n,
          deadline,
        }],
      })
    } catch (err) {
      console.error('Increase liquidity error:', err)
    }
  }

  const handleRemoveLiquidity = async () => {
    if (!address || !existingPosition) return
    if (positionLiquidity <= 0n) return
    if (liquidityToRemove <= 0n) return

    const deadline = getDeadline(DEFAULT_DEADLINE_MINUTES)

    try {
      const decreaseData = encodeFunctionData({
        abi: POSITION_MANAGER_ABI,
        functionName: 'decreaseLiquidity',
        args: [{
          tokenId: existingPosition.tokenId,
          liquidity: liquidityToRemove,
          amount0Min: 0n,
          amount1Min: 0n,
          deadline,
        }],
      })

      const collectData = encodeFunctionData({
        abi: POSITION_MANAGER_ABI,
        functionName: 'collect',
        args: [{
          tokenId: existingPosition.tokenId,
          recipient: address,
          amount0Max: MAX_UINT128,
          amount1Max: MAX_UINT128,
        }],
      })

      writeContract({
        address: CONTRACTS.nonfungiblePositionManager,
        abi: POSITION_MANAGER_ABI,
        functionName: 'multicall',
        args: [[decreaseData, collectData]],
      })
    } catch (err) {
      console.error('Remove liquidity error:', err)
    }
  }

  const getButtonText = () => {
    if (isWriting || isConfirming) return 'Confirming...'

    if (isManaging) {
      if (manageTab === 'remove') {
        if (positionLiquidity <= 0n) return 'No Liquidity'
        if (liquidityToRemove <= 0n) return 'Enter % to remove'
        return 'Remove Liquidity'
      }

      if (needsApprovalA()) return `Approve ${tokenA.symbol}`
      if (needsApprovalB()) return `Approve ${tokenB.symbol}`
      if ((!amountA || parseFloat(amountA) === 0) && (!amountB || parseFloat(amountB) === 0)) {
        return 'Enter Amounts'
      }
      return 'Increase Liquidity'
    }

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
    if (isManaging) {
      if (manageTab === 'remove') {
        handleRemoveLiquidity()
        return
      }

      if (needsApprovalA()) {
        handleApprove('A')
      } else if (needsApprovalB()) {
        handleApprove('B')
      } else {
        handleIncreaseLiquidity()
      }
      return
    }

    if (needsApprovalA()) {
      handleApprove('A')
    } else if (needsApprovalB()) {
      handleApprove('B')
    } else {
      handleMintPosition()
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
          <h2>{isManaging ? 'Manage Position' : (isFixedPool ? 'Add Liquidity (WATN / USDC)' : 'Add Liquidity')}</h2>
        </div>

        {(isManaging || isFixedPool) && (
          <div className="manage-position-summary">
            <div className="manage-position-summary-row">
              <div className="manage-position-summary-left">
                <span className="token-pair">{token0.symbol} / {token1.symbol}</span>
                <span className="fee-badge">{feeTierLabel}</span>
              </div>
              <span className="manage-position-summary-right">
                {isManaging ? `NFT #${existingPosition?.tokenId.toString()}` : 'Fixed pool'}
              </span>
            </div>
          </div>
        )}

        {isManaging && (
          <div className="manage-tabs">
            <button
              type="button"
              className={`manage-tab ${manageTab === 'increase' ? 'active' : ''}`}
              onClick={() => setManageTab('increase')}
            >
              Increase
            </button>
            <button
              type="button"
              className={`manage-tab ${manageTab === 'remove' ? 'active' : ''}`}
              onClick={() => setManageTab('remove')}
            >
              Remove
            </button>
          </div>
        )}

        {/* Fee Tier Selection */}
        {(!isManaging && !isFixedPool) && (
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
        )}

        {/* Price Range */}
        <div className="price-range-section">
          <div className="section-header">
            <label className="section-label">{isManaging ? 'Price Range (fixed)' : 'Set Price Range'}</label>
            {!isManaging && (
              <button 
                className={`full-range-toggle ${isFullRange ? 'active' : ''}`}
                onClick={() => setIsFullRange(!isFullRange)}
              >
                Full Range
              </button>
            )}
          </div>

          {currentPrice && (
            <div className="current-price">
              Current Price: <strong>{formatPrice(currentPrice)}</strong> {token1.symbol} per {token0.symbol}
            </div>
          )}

          {!isManaging && !isFullRange && (
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

          {/* Full range warning removed by request */}

          {isManaging && (
            <div className="position-range" style={{ marginTop: 'var(--spacing-sm)' }}>
              <div className="range-item">
                <span className="range-label">Min Price</span>
                <span className="range-value">{minPrice || '—'}</span>
              </div>
              <div className="range-arrow">↔</div>
              <div className="range-item">
                <span className="range-label">Max Price</span>
                <span className="range-value">{maxPrice || '—'}</span>
              </div>
            </div>
          )}

          {/* Position type indicator */}
          <div className={`position-type-indicator ${positionType}`}>
            {positionType === 'in-range' && 'Price is in range'}
            {positionType === 'above-range' && '↑ Price above range - Only ' + token0.symbol + ' required (one-sided)'}
            {positionType === 'below-range' && '↓ Price below range - Only ' + token1.symbol + ' required (one-sided)'}
            {positionType === 'full-range' && '∞ Full range position'}
            {positionType === 'invalid' && '⚠ Invalid price range'}
          </div>
        </div>

        {/* Token Amounts */}
        {(!isManaging || manageTab === 'increase') && (
          <div className="amounts-section">
            <label className="section-label">{isManaging ? 'Add Amounts' : 'Deposit Amounts'}</label>
            
            <TokenInput
              token={tokenA}
              amount={amountA}
              onAmountChange={setAmountA}
              onTokenSelect={() => setSelectingToken('A')}
              balance={balanceA as bigint | undefined}
              label={tokenA.symbol}
              showMax
              disableTokenSelect={isManaging || isFixedPool}
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
              disableTokenSelect={isManaging || isFixedPool}
              disabled={positionType === 'below-range' && tokenB.address === token0.address ||
                       positionType === 'above-range' && tokenB.address === token1.address}
            />
          </div>
        )}

        {isManaging && manageTab === 'remove' && (
          <div className="amounts-section">
            <label className="section-label">Remove Liquidity</label>

            <div className="current-price" style={{ textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span>Current liquidity</span>
                <strong>{positionLiquidity.toString()}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 6 }}>
                <span>Remove</span>
                <strong>{Math.max(0, Math.min(100, Math.floor(removePercent)))}%</strong>
              </div>
            </div>

            <div className="price-input-group" style={{ marginTop: 'var(--spacing-sm)' }}>
              <label>Percent to remove</label>
              <input
                type="number"
                value={removePercent}
                onChange={e => setRemovePercent(parseFloat(e.target.value) || 0)}
                min="0"
                max="100"
                step="1"
                className="price-input"
              />
              <span className="price-unit">%</span>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 'var(--spacing-sm)' }}>
              {[25, 50, 75, 100].map(p => (
                <button
                  key={p}
                  className={`slippage-option ${Math.floor(removePercent) === p ? 'active' : ''}`}
                  type="button"
                  onClick={() => setRemovePercent(p)}
                >
                  {p}%
                </button>
              ))}
            </div>

            <div className="position-type-indicator" style={{ marginTop: 'var(--spacing-sm)' }}>
              You will receive the withdrawn tokens back into your wallet (decrease + collect).
            </div>
          </div>
        )}

        {/* Pool status */}
        {!isManaging && !poolExists && (
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
          disabled={isWriting || isConfirming || (!isManaging && positionType === 'invalid' && !isFullRange) || (isManaging && manageTab === 'remove' && (positionLiquidity <= 0n || liquidityToRemove <= 0n))}
        >
          {getButtonText()}
        </button>
      </div>

      <TokenSelectModal
        isOpen={!isManaging && !isFixedPool && selectingToken !== null}
        onClose={() => setSelectingToken(null)}
        onSelect={handleTokenSelect}
        excludeToken={selectingToken === 'A' ? tokenB : tokenA}
      />
    </div>
  )
}
