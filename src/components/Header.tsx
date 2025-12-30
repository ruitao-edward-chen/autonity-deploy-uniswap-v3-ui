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
          <span className="logo-text">Uniswap V3 on Autonity</span>
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
