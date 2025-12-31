import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { wagmiConfig } from './config/wagmi'
import { Header } from './components/Header'
import { Swap } from './components/Swap'
import { Liquidity } from './components/Pool'
import { HomePage } from './components/HomePage'
import './App.css'
import './components/HomePage.css'

const queryClient = new QueryClient()

function Bridge() {
  return (
    <div className="bridge-card">
      <div className="bridge-header">
        <h2>Bridge USDC to Autonity</h2>
      </div>
      <div className="bridge-content">
        <div className="bridge-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M13 5H1v14h12M17 9l4 4-4 4M6 12h15" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <p className="bridge-description">
          Bridge USDC from <strong>Polygon</strong> to <strong>Autonity</strong> using the ProtoUSD bridge powered by VIA Labs.
        </p>
        <div className="bridge-steps">
          <div className="bridge-step">
            <span className="step-number">1</span>
            <span>Connect your wallet on the bridge</span>
          </div>
          <div className="bridge-step">
            <span className="step-number">2</span>
            <span>Select Polygon as source chain</span>
          </div>
          <div className="bridge-step">
            <span className="step-number">3</span>
            <span>Select Autonity as destination chain</span>
          </div>
          <div className="bridge-step">
            <span className="step-number">4</span>
            <span>Enter amount and bridge your USDC</span>
          </div>
        </div>
        <a 
          href="https://autonity.protousd.com/" 
          target="_blank" 
          rel="noopener noreferrer"
          className="bridge-button"
        >
          <span>Go to ProtoUSD Bridge</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
        <p className="bridge-note">
          The bridge supports USDC transfers between multiple chains including Polygon, Ethereum, Arbitrum, Base, and more.
        </p>
      </div>
    </div>
  )
}

type Tab = 'swap' | 'liquidity' | 'bridge'

function AutonityApp() {
  const [activeTab, setActiveTab] = useState<Tab>('swap')

  // Handle hash navigation
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1)
      if (hash === 'liquidity' || hash === 'pool') {
        setActiveTab('liquidity')
      } else if (hash === 'bridge') {
        setActiveTab('bridge')
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
          <button 
            className={`tab-button ${activeTab === 'bridge' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('bridge')
              window.location.hash = 'bridge'
            }}
          >
            Bridge
          </button>
        </nav>

        <div className="tab-content">
          {activeTab === 'swap' && <Swap />}
          {activeTab === 'liquidity' && <Liquidity />}
          {activeTab === 'bridge' && <Bridge />}
        </div>
      </main>

      <footer className="footer">
        <div className="footer-content">
          <div className="footer-links">
            <a href="https://autonityscan.org" target="_blank" rel="noopener noreferrer">
              Explorer
            </a>
            <a href="https://docs.autonity.org/networks/mainnet/" target="_blank" rel="noopener noreferrer">
              Docs
            </a>
            <a href="https://chainlist.org/?search=autonity" target="_blank" rel="noopener noreferrer">
              ChainList
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
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/autonity" element={<AutonityApp />} />
            <Route path="/autonity/*" element={<AutonityApp />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
