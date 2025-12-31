import { useState } from 'react'
import { useAccount, useConnect, useDisconnect, useBalance } from 'wagmi'
import { formatTokenBalance } from '../utils/tokens'

export function Header() {
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { data: balance } = useBalance({ address })
  const [showWalletModal, setShowWalletModal] = useState(false)

  const getConnectorIcon = (name: string) => {
    const lowerName = name.toLowerCase()
    if (lowerName.includes('metamask')) return '🦊'
    if (lowerName.includes('coinbase')) return '🔵'
    if (lowerName.includes('walletconnect')) return '🔗'
    if (lowerName.includes('injected')) return '💉'
    return '👛'
  }

  const getConnectorLabel = (name: string) => {
    if (name.toLowerCase().includes('injected')) return 'Browser Wallet'
    return name
  }

  return (
    <header className="header">
      <div className="header-content">
        <div className="logo">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="32" height="32" rx="6" fill="white"/>
            <rect x="0.5" y="0.5" width="31" height="31" rx="5.5" stroke="#0052ff" strokeOpacity="0.2"/>
            <text x="16" y="24" fontFamily="Arial, sans-serif" fontSize="20" fontWeight="bold" fill="#0052ff" textAnchor="middle">森</text>
          </svg>
          <span className="logo-text">Mori</span>
        </div>

        <div className="header-actions">
          {/* Chain Selector */}
          <button className="chain-selector">
            <svg className="chain-icon" width="20" height="20" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="14" fill="#1a1a2e" stroke="#4a4a6a" strokeWidth="2"/>
              <path d="M16 6L22 16L16 26L10 16L16 6Z" fill="#00d4aa"/>
            </svg>
            <span className="chain-name">Autonity</span>
            <svg className="chain-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>

          {/* Wallet Section */}
          <div className="wallet-section">
            {isConnected ? (
              <div className="wallet-connected">
                {balance && (
                  <span className="balance">
                    {formatTokenBalance(balance.value, balance.decimals)} {balance.symbol}
                  </span>
                )}
                <button className="wallet-button connected" onClick={() => disconnect()}>
                  <span className="address">
                    {address?.slice(0, 6)}...{address?.slice(-4)}
                  </span>
                </button>
              </div>
            ) : (
              <button 
                className="wallet-button"
                onClick={() => setShowWalletModal(true)}
                disabled={isPending}
              >
                {isPending ? 'Connecting...' : 'Connect Wallet'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Wallet Selection Modal */}
      {showWalletModal && !isConnected && (
        <div className="modal-overlay" onClick={() => setShowWalletModal(false)}>
          <div className="modal-content wallet-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Connect Wallet</h3>
              <button className="modal-close" onClick={() => setShowWalletModal(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="wallet-list">
              {connectors.map((connector) => (
                <button
                  key={connector.uid}
                  className="wallet-option"
                  onClick={() => {
                    connect({ connector })
                    setShowWalletModal(false)
                  }}
                  disabled={isPending}
                >
                  <span className="wallet-icon">{getConnectorIcon(connector.name)}</span>
                  <span className="wallet-name">{getConnectorLabel(connector.name)}</span>
                  {connector.name.toLowerCase().includes('injected') && (
                    <span className="wallet-tag">Detected</span>
                  )}
                </button>
              ))}
            </div>
            <div className="wallet-modal-footer">
              <p>New to Ethereum wallets?</p>
              <a href="https://ethereum.org/wallets" target="_blank" rel="noopener noreferrer">
                Learn more →
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
