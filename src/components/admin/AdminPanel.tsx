import React, { useState, useEffect } from 'react'
import { supabase } from '../../supabase'
import { AdminBusinessList } from './AdminBusinessList'
import { AdminUserList } from './AdminUserList'
import { AdminCreateUser } from './AdminCreateUser'
import { AdminBusinessCreate } from './AdminBusinessCreate'
import { AdminVideos } from './AdminVideos'
import { AdminPictures } from './AdminPictures'
import { AdminHomeHero } from './AdminHomeHero'

type Tab = 'listings' | 'users' | 'create-listing' | 'create-user' | 'pictures' | 'home-hero' | 'videos'

interface AdminUser {
  id: string
  email: string
}

// ── Login Form ─────────────────────────────────────────────────────────────
const LoginForm: React.FC<{ onLogin: () => void }> = ({ onLogin }) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      setError(signInError.message)
    } else {
      onLogin()
    }
    setLoading(false)
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <h1>🗺️ The Map</h1>
          <p>Admin Panel — Sign In</p>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="admin@example.com"
              />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
              />
            </div>
          </div>
          <div style={{ marginTop: '1.25rem' }}>
            <button className="btn btn-primary" style={{ width: '100%' }} type="submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Access Denied ──────────────────────────────────────────────────────────
const AccessDenied: React.FC<{ onSignOut: () => void }> = ({ onSignOut }) => (
  <div className="login-page">
    <div className="login-card">
      <div className="access-denied">
        <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🚫</div>
        <strong>Access Denied</strong>
        <p style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
          Your account does not have admin privileges. Contact the system owner to be added to the admin list.
        </p>
      </div>
      <button className="btn btn-ghost" style={{ width: '100%', marginTop: '1rem' }} onClick={onSignOut}>
        Sign Out
      </button>
    </div>
  </div>
)

// ── Sidebar ────────────────────────────────────────────────────────────────
const Sidebar: React.FC<{
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  adminEmail: string
  onSignOut: () => void
}> = ({ activeTab, onTabChange, adminEmail, onSignOut }) => {
  const navItems: { tab: Tab; icon: string; label: string }[] = [
    { tab: 'videos', icon: '?', label: 'Promotional Videos' },
    { tab: 'home-hero', icon: '▣', label: 'Home Hero Banners' },
    { tab: 'pictures', icon: '▧', label: 'Pictures' },
    { tab: 'listings',       icon: '🏢', label: 'All Listings' },
    { tab: 'create-listing', icon: '➕', label: 'New Listing' },
    { tab: 'users',          icon: '👥', label: 'All Users' },
    { tab: 'create-user',    icon: '👤', label: 'New User' },
  ]

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <h2>🗺️ The Map</h2>
        <span>Admin Panel</span>
      </div>
      <nav className="sidebar-nav">
        {navItems.map(({ tab, icon, label }) => (
          <button
            key={tab}
            className={`nav-item${activeTab === tab ? ' active' : ''}`}
            onClick={() => onTabChange(tab)}
          >
            <span className="nav-icon">{icon}</span>
            {label}
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <strong>{adminEmail}</strong>
        <button className="btn btn-ghost btn-sm" onClick={onSignOut} style={{ width: '100%' }}>
          Sign Out
        </button>
      </div>
    </aside>
  )
}

// ── Tab titles ─────────────────────────────────────────────────────────────
const TAB_TITLES: Record<Tab, string> = {
  'home-hero': 'Home Hero Banners',
  videos: 'Promotional Videos',
  pictures: 'Pictures',
  listings: 'All Business Listings',
  users: 'All Users',
  'create-listing': 'Create New Listing',
  'create-user': 'Create New User',
}

// ── AdminPanel ─────────────────────────────────────────────────────────────
export const AdminPanel: React.FC = () => {
  const [session, setSession] = useState<any>(null)
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null)
  const [checking, setChecking] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('listings')

  // Listen to auth state
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (!session) setChecking(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (!session) {
        setIsAdmin(false)
        setAdminUser(null)
        setChecking(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Check admin status when session changes
  useEffect(() => {
    if (!session) return

    const checkAdmin = async () => {
      setChecking(true)
      const { data, error } = await supabase.rpc('is_admin')
      if (!error && data === true) {
        setIsAdmin(true)
        setAdminUser({ id: session.user.id, email: session.user.email ?? '' })
      } else {
        setIsAdmin(false)
      }
      setChecking(false)
    }

    checkAdmin()
  }, [session])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  // ── Render states
  if (checking) {
    return (
      <div className="loading-overlay" style={{ minHeight: '100vh' }}>
        <div className="spinner" />
        Checking credentials…
      </div>
    )
  }

  if (!session) {
    return <LoginForm onLogin={() => {}} />
  }

  if (!isAdmin) {
    return <AccessDenied onSignOut={handleSignOut} />
  }

  return (
    <div className="admin-shell">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        adminEmail={adminUser?.email ?? ''}
        onSignOut={handleSignOut}
      />
      <div className="main-content">
        <div className="top-bar">
          <h1>{TAB_TITLES[activeTab]}</h1>
        </div>
        <div className="page-body">
          {activeTab === 'home-hero' && <AdminHomeHero />}
          {activeTab === 'pictures' && <AdminPictures />}
          {activeTab === 'videos' && <AdminVideos />}
          {activeTab === 'listings'       && <AdminBusinessList onNavigateToCreate={() => setActiveTab('create-listing')} />}
          {activeTab === 'users'          && <AdminUserList onNavigateToCreate={() => setActiveTab('create-user')} />}
          {activeTab === 'create-listing' && <AdminBusinessCreate onCreated={() => setActiveTab('listings')} />}
          {activeTab === 'create-user'    && <AdminCreateUser onCreated={() => setActiveTab('users')} />}
        </div>
      </div>
    </div>
  )
}
