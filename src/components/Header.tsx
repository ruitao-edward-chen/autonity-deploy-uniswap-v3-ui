import { useState, useEffect } from 'react'
import { useAccount, useConnect, useDisconnect, useBalance } from 'wagmi'
import { formatTokenBalance } from '../utils/tokens'

export function Header() {
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { data: balance } = useBalance({ address })
  const [showWalletModal, setShowWalletModal] = useState(false)
  const [showChainDropdown, setShowChainDropdown] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const stored = localStorage.getItem('theme')
    if (stored) return stored === 'dark'
    return false // Default to light mode
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light')
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light')
  }, [isDarkMode])

  const toggleTheme = () => setIsDarkMode(prev => !prev)

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
          {/* Theme Toggle */}
          <button 
            className="theme-toggle" 
            onClick={toggleTheme}
            title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDarkMode ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/>
                <line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/>
                <line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </button>

          {/* Chain Selector */}
          <div className="chain-selector-wrapper">
            <button 
              className={`chain-selector ${showChainDropdown ? 'active' : ''}`}
              onClick={() => setShowChainDropdown(!showChainDropdown)}
            >
              <svg className="chain-icon" width="20" height="20" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="14" fill="#ffffff" stroke="#e0e0e0" strokeWidth="1"/>
                <path d="M20 12c-1-2-3-3-5-3-3 0-5 2-5 5s2 5 5 5c1.5 0 3-.5 4-1.5" stroke="#000" strokeWidth="2" fill="none" strokeLinecap="round"/>
                <path d="M20 12v10" stroke="#000" strokeWidth="2" strokeLinecap="round"/>
                <line x1="8" y1="17" x2="24" y2="17" stroke="#000" strokeWidth="1.5"/>
              </svg>
              <span className="chain-name">Autonity</span>
              <svg className={`chain-chevron ${showChainDropdown ? 'rotated' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
            
            {showChainDropdown && (
              <>
                <div className="chain-dropdown-backdrop" onClick={() => setShowChainDropdown(false)} />
                <div className="chain-dropdown">
                  <button className="chain-option selected" onClick={() => setShowChainDropdown(false)}>
                    <svg className="chain-icon" width="24" height="24" viewBox="0 0 32 32" fill="none">
                      <circle cx="16" cy="16" r="14" fill="#ffffff" stroke="#e0e0e0" strokeWidth="1"/>
                      <path d="M20 12c-1-2-3-3-5-3-3 0-5 2-5 5s2 5 5 5c1.5 0 3-.5 4-1.5" stroke="#000" strokeWidth="2" fill="none" strokeLinecap="round"/>
                      <path d="M20 12v10" stroke="#000" strokeWidth="2" strokeLinecap="round"/>
                      <line x1="8" y1="17" x2="24" y2="17" stroke="#000" strokeWidth="1.5"/>
                    </svg>
                    <div className="chain-option-info">
                      <span className="chain-option-name">Autonity</span>
                      <span className="chain-option-type">Mainnet</span>
                    </div>
                    <svg className="chain-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  </button>
                  <div className="chain-dropdown-footer">
                    <span>More chains coming soon</span>
                  </div>
                </div>
              </>
            )}
          </div>

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
