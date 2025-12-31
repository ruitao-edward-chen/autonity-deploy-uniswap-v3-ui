import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

interface Tree {
  id: number
  x: number
  baseY: number
  height: number
  targetHeight: number
  delay: number
  nodes: { pos: number; dir: number; length: number }[]
}

function generateTree(id: number, x: number): Tree {
  const nodeCount = 2 + Math.floor(Math.random() * 2)
  const nodes = Array.from({ length: nodeCount }, (_, i) => ({
    pos: 0.25 + (i / nodeCount) * 0.5 + Math.random() * 0.15,
    dir: Math.random() > 0.5 ? 1 : -1,
    length: 3 + Math.random() * 2
  })).sort((a, b) => a.pos - b.pos)
  
  return {
    id,
    x,
    baseY: 98,
    height: 0,
    targetHeight: 35 + Math.random() * 25,
    delay: Math.random() * 500,
    nodes
  }
}

export function HomePage() {
  const [trees, setTrees] = useState<Tree[]>([])
  const [mounted, setMounted] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const stored = localStorage.getItem('theme')
    if (stored) return stored === 'dark'
    return false
  })
  const animationRef = useRef<number | null>(null)
  
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light')
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light')
  }, [isDarkMode])
  
  const toggleTheme = () => setIsDarkMode(prev => !prev)
  
  useEffect(() => {
    setMounted(true)
    
    const treePositions = [6, 14, 86, 94]
    const newTrees = treePositions.map((x, i) => generateTree(i, x))
    setTrees(newTrees)
  }, [])
  
  useEffect(() => {
    if (!mounted || trees.length === 0) return
    
    let startTime = Date.now()
    
    const animate = () => {
      const elapsed = Date.now() - startTime
      
      setTrees(prev => 
        prev.map(tree => {
          if (elapsed > tree.delay && tree.height < tree.targetHeight) {
            return {
              ...tree,
              height: Math.min(tree.height + 0.35, tree.targetHeight)
            }
          }
          return tree
        })
      )
      
      animationRef.current = requestAnimationFrame(animate)
    }
    
    animationRef.current = requestAnimationFrame(animate)
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [mounted, trees.length])

  const lineColor = isDarkMode ? '#334155' : '#cbd5e1'
  const nodeColor = isDarkMode ? '#475569' : '#94a3b8'
  
  return (
    <div className="home-page-jp" data-theme={isDarkMode ? 'dark' : 'light'}>
      <svg 
        className="ink-background"
        viewBox="0 0 100 100" 
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="bgGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={isDarkMode ? '#0f0f14' : '#f8fafc'} />
            <stop offset="100%" stopColor={isDarkMode ? '#1a1a24' : '#f1f5f9'} />
          </linearGradient>
        </defs>
        
        <rect x="0" y="0" width="100" height="100" fill="url(#bgGradient)" />
        
        {trees.map(tree => {
          const h = tree.height
          const progress = h / tree.targetHeight
          const opacity = Math.min(progress * 0.8, 0.5)
          
          return (
            <g key={tree.id} transform={`translate(${tree.x}, ${tree.baseY})`} opacity={opacity}>
              <line 
                x1="0" y1="0" 
                x2="0" y2={-h} 
                stroke={lineColor} 
                strokeWidth="0.5"
              />
              
              {tree.nodes.map((node, i) => {
                const nodeY = -h * node.pos
                const nodeVisible = progress > node.pos
                if (!nodeVisible) return null
                
                return (
                  <g key={i}>
                    <line 
                      x1="0" y1={nodeY}
                      x2={node.dir * node.length} y2={nodeY}
                      stroke={lineColor}
                      strokeWidth="0.4"
                    />
                    <circle 
                      cx={node.dir * node.length} 
                      cy={nodeY} 
                      r="0.5" 
                      fill={nodeColor}
                    />
                  </g>
                )
              })}
              
              {progress > 0.9 && (
                <circle 
                  cx="0" 
                  cy={-h} 
                  r="0.6" 
                  fill={nodeColor}
                />
              )}
            </g>
          )
        })}
      </svg>
      
      {/* Theme toggle */}
      <button 
        className="home-theme-toggle" 
        onClick={toggleTheme}
        title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {isDarkMode ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        )}
      </button>
      
      <div className="home-content-jp">
        <div className="home-hero-jp">
          <div className="logo-container-jp">
            <div className="logo-jp">森</div>
          </div>
          
          <h1 className="home-title-jp">m o r i</h1>
          
          <p className="home-meaning-jp">
            森  [mori]  —  forest
          </p>
          
          <div className="home-description-jp">
            <p>
              We identify emerging protocols and become part of their
              communities before they reach the mainstream.
            </p>
          </div>
          
          <Link to="/autonity" className="enter-link-jp">
            Enter
          </Link>
        </div>
        
        <footer className="home-footer-jp">
          <span>mori.fi</span>
        </footer>
      </div>
    </div>
  )
}
