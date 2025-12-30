import { useState } from 'react'
import type { Token } from '../utils/tokens'
import { formatTokenBalance } from '../utils/tokens'

interface TokenInputProps {
  token: Token | null
  amount: string
  onAmountChange: (amount: string) => void
  onTokenSelect: () => void
  balance?: bigint
  label: string
  disabled?: boolean
  showMax?: boolean
}

export function TokenInput({
  token,
  amount,
  onAmountChange,
  onTokenSelect,
  balance,
  label,
  disabled = false,
  showMax = false,
}: TokenInputProps) {
  const [focused, setFocused] = useState(false)

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    // Only allow numbers and one decimal point
    if (/^[0-9]*\.?[0-9]*$/.test(value) || value === '') {
      onAmountChange(value)
    }
  }

  const handleMaxClick = () => {
    if (balance && token) {
      const maxAmount = formatTokenBalance(balance, token.decimals)
      onAmountChange(maxAmount)
    }
  }

  return (
    <div className={`token-input ${focused ? 'focused' : ''}`}>
      <div className="token-input-header">
        <span className="token-input-label">{label}</span>
        {token && balance !== undefined && (
          <span className="token-balance">
            Balance: {formatTokenBalance(balance, token.decimals)}
            {showMax && balance > 0n && (
              <button className="max-button" onClick={handleMaxClick}>
                MAX
              </button>
            )}
          </span>
        )}
      </div>
      <div className="token-input-row">
        <input
          type="text"
          inputMode="decimal"
          placeholder="0.0"
          value={amount}
          onChange={handleAmountChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={disabled}
          className="amount-input"
        />
        <button className="token-select-button" onClick={onTokenSelect}>
          {token ? (
            <>
              <TokenLogo token={token} />
              <span>{token.symbol}</span>
            </>
          ) : (
            <span>Select</span>
          )}
          <ChevronDown />
        </button>
      </div>
    </div>
  )
}

function TokenLogo({ token }: { token: Token }) {
  const getInitial = () => token.symbol[0]
  
  // Use a colored circle with initial for now
  const colors: Record<string, string> = {
    'WATN': '#6366f1',
    'ATN': '#6366f1',
    'USDC.pol': '#2775ca',
  }
  
  return (
    <div 
      className="token-logo"
      style={{ backgroundColor: colors[token.symbol] || '#888' }}
    >
      {getInitial()}
    </div>
  )
}

function ChevronDown() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}
