import { useState, useEffect } from 'react'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { wagmiConfig } from './config/wagmi'
import { Header } from './components/Header'
import { Swap } from './components/Swap'
import { Liquidity } from './components/Pool'
import './App.css'

const queryClient = new QueryClient()

type Tab = 'swap' | 'liquidity'

function AppContent() {
  const [activeTab, setActiveTab] = useState<Tab>('swap')

  // Handle hash navigation
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1)
      if (hash === 'liquidity' || hash === 'pool') {
        setActiveTab('liquidity')
      } else {
        setActiveTab('swap')
      }
    }

    handleHashChange()
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  return (
    <div className="app">
      <Header />
      <main className="main-content">
        <nav className="tab-nav">
          <button 
            className={`tab-button ${activeTab === 'swap' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('swap')
              window.location.hash = 'swap'
            }}
          >
            Swap
          </button>
          <button 
            className={`tab-button ${activeTab === 'liquidity' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('liquidity')
              window.location.hash = 'liquidity'
            }}
          >
            Liquidity
          </button>
        </nav>

        <div className="tab-content">
          {activeTab === 'swap' && <Swap />}
          {activeTab === 'liquidity' && <Liquidity />}
        </div>
      </main>

      <footer className="footer">
        <div className="footer-content">
          <div className="footer-links">
            <a href="https://autonityscan.org" target="_blank" rel="noopener noreferrer">
              Explorer
            </a>
            <a href="https://docs.autonity.org" target="_blank" rel="noopener noreferrer">
              Docs
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <AppContent />
      </QueryClientProvider>
    </WagmiProvider>
  )
}
