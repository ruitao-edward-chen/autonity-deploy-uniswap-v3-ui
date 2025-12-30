import { DEFAULT_TOKENS, NATIVE_ATN, type Token } from '../utils/tokens'

interface TokenSelectModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (token: Token) => void
  excludeToken?: Token | null
  includeNative?: boolean
}

export function TokenSelectModal({
  isOpen,
  onClose,
  onSelect,
  excludeToken,
  includeNative = false,
}: TokenSelectModalProps) {
  if (!isOpen) return null

  const tokens = includeNative ? [NATIVE_ATN, ...DEFAULT_TOKENS] : DEFAULT_TOKENS
  const filteredTokens = tokens.filter(
    t => t.address.toLowerCase() !== excludeToken?.address.toLowerCase()
  )

  const handleSelect = (token: Token) => {
    onSelect(token)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Select a token</h3>
          <button className="modal-close" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="token-list">
          {filteredTokens.map(token => (
            <button
              key={token.address}
              className="token-list-item"
              onClick={() => handleSelect(token)}
            >
              <div 
                className="token-logo"
                style={{ 
                  backgroundColor: getTokenColor(token.symbol)
                }}
              >
                {token.symbol[0]}
              </div>
              <div className="token-info">
                <span className="token-symbol">{token.symbol}</span>
                <span className="token-name">{token.name}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function getTokenColor(symbol: string): string {
  const colors: Record<string, string> = {
    'WATN': '#6366f1',
    'ATN': '#6366f1',
    'USDC.pol': '#2775ca',
  }
  return colors[symbol] || '#888'
}
