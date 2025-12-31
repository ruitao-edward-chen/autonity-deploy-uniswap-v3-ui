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
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="32" height="32" rx="6" fill="white"/>
            <rect x="0.5" y="0.5" width="31" height="31" rx="5.5" stroke="#0052ff" strokeOpacity="0.2"/>
            <text x="16" y="24" fontFamily="Arial, sans-serif" fontSize="20" fontWeight="bold" fill="#0052ff" textAnchor="middle">森</text>
          </svg>
          <span className="logo-text">Mori</span>
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
