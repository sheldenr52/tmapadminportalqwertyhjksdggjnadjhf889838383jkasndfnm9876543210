import React, { useEffect, useState } from 'react'
import { AdminPanel } from './components/admin/AdminPanel'
import DemoProfile from './components/DemoProfile'

function App() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const change = () => setHash(window.location.hash)
    window.addEventListener('hashchange', change)
    return () => window.removeEventListener('hashchange', change)
  }, [])
  if (hash.startsWith('#demo/')) return <DemoProfile key={hash} token={hash.slice(6)} />
  return <AdminPanel />
}

export default App
