import { useAccount, useConnect, useDisconnect, useBalance } from 'wagmi'
import { formatTokenBalance } from '../utils/tokens'

export function Header() {
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const { data: balance } = useBalance({ address })

  return (
    <header className="header">
      <div className="header-content">
        <div className="logo">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="15" stroke="currentColor" strokeWidth="2"/>
            <path d="M10 16L14 20L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="logo-text">Autonity Swap</span>
        </div>

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
              onClick={() => connect({ connector: connectors[0] })}
            >
              Connect Wallet
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
