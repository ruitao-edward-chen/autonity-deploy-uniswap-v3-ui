import { useState, useEffect, useCallback } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useBalance, usePublicClient } from 'wagmi'
import { parseUnits, formatUnits, encodeFunctionData } from 'viem'
import { TokenInput } from './TokenInput'
import { TokenSelectModal } from './TokenSelectModal'
import { DEFAULT_TOKENS, NATIVE_ATN, isNativeCurrency, type Token } from '../utils/tokens'
import { CONTRACTS, DEFAULT_SLIPPAGE, DEFAULT_DEADLINE_MINUTES } from '../config/contracts'
import { ERC20_ABI, QUOTER_V2_ABI, SWAP_ROUTER_ABI, WATN_ABI } from '../config/abis'
import { getDeadline, applySlippage } from '../utils/math'

type SelectingToken = 'input' | 'output' | null

export function Swap() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  
  const [tokenIn, setTokenIn] = useState<Token>(NATIVE_ATN)
  const [tokenOut, setTokenOut] = useState<Token>(DEFAULT_TOKENS[1]) // USDC
  const [amountIn, setAmountIn] = useState('')
  const [amountOut, setAmountOut] = useState('')
  const [selectingToken, setSelectingToken] = useState<SelectingToken>(null)
  const [slippage, setSlippage] = useState(DEFAULT_SLIPPAGE)
  const [isQuoting, setIsQuoting] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  // Get native balance
  const { data: nativeBalance } = useBalance({ address })
  
  // Get token balance for input token
  const { data: tokenInBalance } = useReadContract({
    address: isNativeCurrency(tokenIn) ? undefined : tokenIn.address,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !isNativeCurrency(tokenIn) },
  })

  // Get allowance for input token
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: isNativeCurrency(tokenIn) ? undefined : tokenIn.address,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, CONTRACTS.swapRouter02] : undefined,
    query: { enabled: !!address && !isNativeCurrency(tokenIn) },
  })

  const { writeContract, data: txHash, isPending: isWriting, reset: resetWrite } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash })

  const inputBalance = isNativeCurrency(tokenIn) 
    ? nativeBalance?.value 
    : tokenInBalance as bigint | undefined

  // Check if this is a wrap or unwrap operation
  const isWrap = isNativeCurrency(tokenIn) && tokenOut.symbol === 'WATN'
  const isUnwrap = tokenIn.symbol === 'WATN' && isNativeCurrency(tokenOut)
  const isWrapOrUnwrap = isWrap || isUnwrap

  // Get quote when input amount changes
  const getQuote = useCallback(async () => {
    if (!amountIn || parseFloat(amountIn) === 0 || !publicClient) {
      setAmountOut('')
      return
    }

    // Wrap/unwrap is 1:1
    if (isWrapOrUnwrap) {
      setAmountOut(amountIn)
      setQuoteError(null)
      return
    }

    setIsQuoting(true)
    setQuoteError(null)

    try {
      const inputToken = isNativeCurrency(tokenIn) 
        ? DEFAULT_TOKENS.find(t => t.symbol === 'WATN')! 
        : tokenIn
      const outputToken = isNativeCurrency(tokenOut)
        ? DEFAULT_TOKENS.find(t => t.symbol === 'WATN')!
        : tokenOut
      
      const amountInWei = parseUnits(amountIn, inputToken.decimals)

      // Use staticCall to simulate the quote
      const result = await publicClient.simulateContract({
        address: CONTRACTS.quoterV2,
        abi: QUOTER_V2_ABI,
        functionName: 'quoteExactInputSingle',
        args: [{
          tokenIn: inputToken.address,
          tokenOut: outputToken.address,
          amountIn: amountInWei,
          fee: 500, // 0.05% fee tier (the existing WATN/USDC pool)
          sqrtPriceLimitX96: 0n,
        }],
      })

      const quotedAmountOut = result.result[0] as bigint
      setAmountOut(formatUnits(quotedAmountOut, outputToken.decimals))
    } catch (err) {
      console.error('Quote error:', err)
      setQuoteError('Unable to get quote. Pool may not exist or have liquidity.')
      setAmountOut('')
    } finally {
      setIsQuoting(false)
    }
  }, [amountIn, tokenIn, tokenOut, publicClient, isWrapOrUnwrap])

  useEffect(() => {
    const timer = setTimeout(getQuote, 500)
    return () => clearTimeout(timer)
  }, [getQuote])

  // Reset on successful tx
  useEffect(() => {
    if (isConfirmed) {
      setAmountIn('')
      setAmountOut('')
      resetWrite()
      refetchAllowance()
    }
  }, [isConfirmed, resetWrite, refetchAllowance])

  const handleSwapTokens = () => {
    setTokenIn(tokenOut)
    setTokenOut(tokenIn)
    setAmountIn(amountOut)
    setAmountOut(amountIn)
  }

  const handleTokenSelect = (token: Token) => {
    if (selectingToken === 'input') {
      if (token.address === tokenOut.address) {
        handleSwapTokens()
      } else {
        setTokenIn(token)
        setAmountOut('')
      }
    } else if (selectingToken === 'output') {
      if (token.address === tokenIn.address) {
        handleSwapTokens()
      } else {
        setTokenOut(token)
        setAmountOut('')
      }
    }
    setSelectingToken(null)
  }

  const needsApproval = () => {
    if (isNativeCurrency(tokenIn)) return false
    if (!amountIn || parseFloat(amountIn) === 0) return false
    if (allowance === undefined) return true
    
    const amountInWei = parseUnits(amountIn, tokenIn.decimals)
    return (allowance as bigint) < amountInWei
  }

  const handleApprove = async () => {
    if (!address) return
    
    const amountInWei = parseUnits(amountIn, tokenIn.decimals)
    
    writeContract({
      address: tokenIn.address,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [CONTRACTS.swapRouter02, amountInWei * 2n], // Approve a bit more
    })
  }

  const handleSwap = async () => {
    if (!address || !amountIn || !amountOut) return

    const watnToken = DEFAULT_TOKENS.find(t => t.symbol === 'WATN')!
    const amountInWei = parseUnits(amountIn, tokenIn.decimals || 18)

    try {
      // Handle wrap: ATN -> WATN
      if (isWrap) {
        writeContract({
          address: watnToken.address,
          abi: WATN_ABI,
          functionName: 'deposit',
          value: amountInWei,
        })
        return
      }

      // Handle unwrap: WATN -> ATN
      if (isUnwrap) {
        writeContract({
          address: watnToken.address,
          abi: WATN_ABI,
          functionName: 'withdraw',
          args: [amountInWei],
        })
        return
      }

      // Regular swap through Uniswap
      const inputToken = isNativeCurrency(tokenIn) ? watnToken : tokenIn
      const outputToken = isNativeCurrency(tokenOut) ? watnToken : tokenOut

      const amountOutWei = parseUnits(amountOut, outputToken.decimals)
      const minAmountOut = applySlippage(amountOutWei, slippage, true)
      const deadline = getDeadline(DEFAULT_DEADLINE_MINUTES)

      if (isNativeCurrency(tokenIn)) {
        // ATN -> Token: Wrap and swap in one transaction
        const wrapData = encodeFunctionData({
          abi: WATN_ABI,
          functionName: 'deposit',
        })
        
        const swapData = encodeFunctionData({
          abi: SWAP_ROUTER_ABI,
          functionName: 'exactInputSingle',
          args: [{
            tokenIn: inputToken.address,
            tokenOut: outputToken.address,
            fee: 500, // 0.05% fee tier
            recipient: address,
            amountIn: amountInWei,
            amountOutMinimum: minAmountOut,
            sqrtPriceLimitX96: 0n,
          }],
        })

        writeContract({
          address: CONTRACTS.swapRouter02,
          abi: SWAP_ROUTER_ABI,
          functionName: 'multicall',
          args: [deadline, [wrapData, swapData]],
          value: amountInWei,
        })
      } else if (isNativeCurrency(tokenOut)) {
        // Token -> ETH: Swap and unwrap
        writeContract({
          address: CONTRACTS.swapRouter02,
          abi: SWAP_ROUTER_ABI,
          functionName: 'exactInputSingle',
          args: [{
            tokenIn: inputToken.address,
            tokenOut: outputToken.address,
            fee: 500, // 0.05% fee tier
            recipient: address,
            amountIn: amountInWei,
            amountOutMinimum: minAmountOut,
            sqrtPriceLimitX96: 0n,
          }],
        })
      } else {
        // Token -> Token
        writeContract({
          address: CONTRACTS.swapRouter02,
          abi: SWAP_ROUTER_ABI,
          functionName: 'exactInputSingle',
          args: [{
            tokenIn: inputToken.address,
            tokenOut: outputToken.address,
            fee: 500, // 0.05% fee tier
            recipient: address,
            amountIn: amountInWei,
            amountOutMinimum: minAmountOut,
            sqrtPriceLimitX96: 0n,
          }],
        })
      }
    } catch (err) {
      console.error('Swap error:', err)
    }
  }

  const getButtonText = () => {
    if (!isConnected) return 'Connect Wallet'
    if (isWriting || isConfirming) return 'Confirming...'
    if (!amountIn || parseFloat(amountIn) === 0) return 'Enter Amount'
    if (quoteError) return 'Insufficient Liquidity'
    if (inputBalance !== undefined && parseUnits(amountIn, tokenIn.decimals) > inputBalance) {
      return `Insufficient ${tokenIn.symbol}`
    }
    if (needsApproval()) return `Approve ${tokenIn.symbol}`
    if (isWrap) return 'Wrap'
    if (isUnwrap) return 'Unwrap'
    return 'Swap'
  }

  const isButtonDisabled = () => {
    if (!isConnected) return true
    if (isWriting || isConfirming) return true
    if (!amountIn || parseFloat(amountIn) === 0) return true
    if (quoteError) return true
    if (inputBalance !== undefined && parseUnits(amountIn, tokenIn.decimals) > inputBalance) return true
    return false
  }

  const handleButtonClick = () => {
    if (needsApproval()) {
      handleApprove()
    } else {
      handleSwap()
    }
  }

  return (
    <div className="swap-container">
      <div className="swap-card">
        <div className="swap-header">
          <h2>Swap</h2>
          <button 
            className="settings-button"
            onClick={() => setShowSettings(!showSettings)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>

        {showSettings && (
          <div className="settings-panel">
            <label className="settings-label">
              Slippage Tolerance
              <div className="slippage-options">
                {[0.1, 0.5, 1.0].map(s => (
                  <button
                    key={s}
                    className={`slippage-option ${slippage === s ? 'active' : ''}`}
                    onClick={() => setSlippage(s)}
                  >
                    {s}%
                  </button>
                ))}
                <input
                  type="number"
                  value={slippage}
                  onChange={e => setSlippage(parseFloat(e.target.value) || 0.5)}
                  className="slippage-input"
                  min="0.01"
                  max="50"
                  step="0.1"
                />
              </div>
            </label>
          </div>
        )}

        <div className="swap-inputs">
          <TokenInput
            token={tokenIn}
            amount={amountIn}
            onAmountChange={setAmountIn}
            onTokenSelect={() => setSelectingToken('input')}
            balance={inputBalance}
            label="You pay"
            showMax
          />

          <button className="swap-direction-button" onClick={handleSwapTokens}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <polyline points="19 12 12 19 5 12" />
            </svg>
          </button>

          <TokenInput
            token={tokenOut}
            amount={isQuoting ? '...' : amountOut}
            onAmountChange={() => {}}
            onTokenSelect={() => setSelectingToken('output')}
            label="You receive"
            disabled
          />
        </div>

        {amountIn && amountOut && !quoteError && (
          <div className="swap-details">
            <div className="swap-detail-row">
              <span>Rate</span>
              <span>1 {tokenIn.symbol} = {(parseFloat(amountOut) / parseFloat(amountIn)).toFixed(6)} {tokenOut.symbol}</span>
            </div>
            {isWrapOrUnwrap ? (
              <div className="swap-detail-row">
                <span>Type</span>
                <span>{isWrap ? 'Wrap' : 'Unwrap'} (no fees)</span>
              </div>
            ) : (
              <>
                <div className="swap-detail-row">
                  <span>Slippage</span>
                  <span>{slippage}%</span>
                </div>
                <div className="swap-detail-row">
                  <span>Min. received</span>
                  <span>{(parseFloat(amountOut) * (1 - slippage / 100)).toFixed(6)} {tokenOut.symbol}</span>
                </div>
              </>
            )}
          </div>
        )}

        {quoteError && (
          <div className="swap-error">
            {quoteError}
          </div>
        )}

        <button
          className="swap-button"
          onClick={handleButtonClick}
          disabled={isButtonDisabled()}
        >
          {getButtonText()}
        </button>
      </div>

      <TokenSelectModal
        isOpen={selectingToken !== null}
        onClose={() => setSelectingToken(null)}
        onSelect={handleTokenSelect}
        includeNative
      />
    </div>
  )
}
