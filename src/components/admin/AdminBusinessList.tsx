import React, { useState, useEffect, useCallback } from 'react'
import { supabase, Business } from '../../supabase'
import { AdminBusinessEdit } from './AdminBusinessEdit'
import { AdminSubscription } from './AdminSubscription'
import { AdminListingStats } from './AdminListingStats'

const PAGE_SIZE = 20

interface Props {
  onNavigateToCreate: () => void
}

export const AdminBusinessList: React.FC<Props> = ({ onNavigateToCreate }) => {
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all')
  const [editTarget, setEditTarget] = useState<Business | null>(null)
  const [savingFeatured, setSavingFeatured] = useState<Set<string>>(new Set())
  const [featuredError, setFeaturedError] = useState<string | null>(null)
  const [statsTarget, setStatsTarget] = useState<Business | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const fetchBusinesses = useCallback(async () => {
    setLoading(true)
    setError(null)

    let query = supabase
      .from('businesses')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    if (search.trim()) {
      query = query.ilike('name', `%${search.trim()}%`)
    }
    if (filterActive === 'active') {
      query = query.eq('is_active', true)
    } else if (filterActive === 'inactive') {
      query = query.eq('is_active', false)
    }

    const { data, error: fetchError, count } = await query

    if (fetchError) {
      setError(fetchError.message)
    } else {
      setBusinesses((data as Business[]) || [])
      setTotal(count ?? 0)
    }
    setLoading(false)
  }, [page, search, filterActive])

  useEffect(() => {
    fetchBusinesses()
  }, [fetchBusinesses])

  // Reset page when filters change
  useEffect(() => {
    setPage(0)
  }, [search, filterActive])

  const handleToggleActive = async (biz: Business) => {
    const newStatus = !biz.is_active
    const { error: updateError } = await supabase
      .from('businesses')
      .update({ is_active: newStatus, updated_at: new Date().toISOString() })
      .eq('id', biz.id)

    if (updateError) {
      alert('Failed to update status: ' + updateError.message)
    } else {
      setBusinesses(prev => prev.map(b => b.id === biz.id ? { ...b, is_active: newStatus } : b))
    }
  }

  const handleDelete = async (biz: Business) => {
    if (deletingId) return
    if (!window.confirm(`Permanently delete "${biz.name}"? This cannot be undone.`)) return
    setDeletingId(biz.id)
    setDeleteError(null)
    try {
      const { data, error: requestError } = await supabase
        .from('businesses')
        .delete()
        .eq('id', biz.id)
        .select('id')
        .single()
      if (requestError) throw requestError
      if (data?.id !== biz.id) throw new Error('The listing was not deleted. Check your permissions and try again.')
      if (businesses.length === 1 && page > 0) {
        setPage(current => current - 1)
      } else {
        await fetchBusinesses()
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : (err as { message?: string })?.message
      setDeleteError(`Could not delete "${biz.name}": ${message || 'Please try again.'}`)
    } finally {
      setDeletingId(null)
    }
  }

  const handleToggleFeatured = async (biz: Business) => {
    if (savingFeatured.has(biz.id)) return
    setSavingFeatured(prev => new Set(prev).add(biz.id))
    setFeaturedError(null)
    try {
      const { data, error: updateError } = await supabase
        .from('businesses')
        .update({ is_featured: !biz.is_featured, updated_at: new Date().toISOString() })
        .eq('id', biz.id)
        .select('id, is_featured')
        .single()
      if (updateError) throw updateError
      setBusinesses(prev => prev.map(b => b.id === data.id ? { ...b, is_featured: data.is_featured } : b))
    } catch (err) {
      const message = err instanceof Error ? err.message : (err as { message?: string })?.message
      setFeaturedError(`Could not update featured status for ${biz.name}: ${message || 'Please try again.'}`)
    } finally {
      setSavingFeatured(prev => {
        const next = new Set(prev)
        next.delete(biz.id)
        return next
      })
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <>
      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="label">Total Listings</div>
          <div className="value">{total}</div>
        </div>
        <div className="stat-card">
          <div className="label">Showing</div>
          <div className="value">{businesses.length}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Listings</h2>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Search */}
            <div className="search-bar">
              <input
                type="text"
                placeholder="Search by name…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            {/* Filter */}
            <select
              className="search-bar"
              value={filterActive}
              onChange={e => setFilterActive(e.target.value as any)}
              style={{ padding: '0.5rem 0.85rem', borderRadius: 8, border: '1px solid var(--gray-300)', fontFamily: 'inherit', fontSize: '0.875rem' }}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <button className="btn btn-primary btn-sm" onClick={onNavigateToCreate}>
              ➕ New Listing
            </button>
          </div>
        </div>

        {error && <div className="alert alert-error" style={{ margin: '1rem' }}>{error}</div>}
        {deleteError && <div role="alert" className="alert alert-error" style={{ margin: '1rem' }}>{deleteError}</div>}
        <p style={{ margin: '1rem', color: 'var(--gray-600)', fontSize: '0.875rem' }}>
          Turn Featured on to include a business in the featured strip. Only active businesses appear. Changes save automatically.
        </p>
        {featuredError && <div role="alert" className="alert alert-error" style={{ margin: '1rem' }}>{featuredError}</div>}
        {businesses.some(b => b.is_featured === undefined) && (
          <div role="status" className="alert alert-error" style={{ margin: '1rem' }}>
            Featured controls need the database setup installed before they can be used.
          </div>
        )}

        {loading ? (
          <div className="loading-overlay"><div className="spinner" />Loading listings…</div>
        ) : businesses.length === 0 ? (
          <div className="empty-state">
            <div className="icon">🏢</div>
            <p>No listings found.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Logo</th>
                  <th>Name</th>
                  <th>Owner Email</th>
                  <th>Categories</th>
                  <th>Address</th>
                  <th>Status</th>
                  <th>Featured</th>
                  <th>Created</th>
                  <th>Renewal &amp; trial</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {businesses.map(biz => (
                  <tr key={biz.id}>
                    <td>
                      {biz.logo_url
                        ? <img src={biz.logo_url} alt="" className="logo-thumb" />
                        : <div className="logo-placeholder">🏢</div>
                      }
                    </td>
                    <td>
                      <strong style={{ color: 'var(--gray-900)' }}>{biz.name}</strong>
                      {biz.contact_email && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--gray-400)', marginTop: 2 }}>
                          {biz.contact_email}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>{biz.owner_id}</td>
                    <td>
                      {(biz.categories || []).slice(0, 3).map(c => (
                        <span key={c} className="cat-pill">{c}</span>
                      ))}
                      {(biz.categories || []).length > 3 && (
                        <span className="cat-pill">+{biz.categories.length - 3}</span>
                      )}
                    </td>
                    <td style={{ fontSize: '0.8rem', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {biz.address || '—'}
                    </td>
                    <td>
                      <label className="toggle-switch" title={biz.is_active ? 'Active — click to deactivate' : 'Inactive — click to activate'}>
                        <input
                          type="checkbox"
                          checked={biz.is_active}
                          onChange={() => handleToggleActive(biz)}
                        />
                        <div className="toggle-track">
                          <div className="toggle-thumb" />
                        </div>
                        <span style={{ fontSize: '0.78rem', color: biz.is_active ? 'var(--success)' : 'var(--gray-400)' }}>
                          {biz.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </label>
                    </td>
                    <td>
                      <label className="toggle-switch" title="Include this business in the featured strip">
                        <input
                          type="checkbox"
                          role="switch"
                          aria-label={`Feature ${biz.name}`}
                          checked={biz.is_featured === true}
                          disabled={savingFeatured.has(biz.id) || biz.is_featured === undefined}
                          onChange={() => handleToggleFeatured(biz)}
                        />
                        <div className="toggle-track"><div className="toggle-thumb" /></div>
                        <span style={{ fontSize: '0.78rem' }}>
                          {savingFeatured.has(biz.id) ? 'Saving...' : biz.is_featured ? 'Featured' : 'Off'}
                        </span>
                      </label>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--gray-400)' }}>
                      {new Date(biz.created_at).toLocaleDateString()}
                    </td>
                    <td><AdminSubscription key={biz.owner_id} ownerId={biz.owner_id} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setStatsTarget(biz)}>Stats</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditTarget(biz)}>
                          ✏️ Edit
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          aria-label={`Delete ${biz.name}`}
                          disabled={deletingId !== null || savingFeatured.has(biz.id)}
                          onClick={() => handleDelete(biz)}
                        >
                          {deletingId === biz.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pagination">
            <button className="page-btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹</button>
            <div className="pages">
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  className={`page-btn${page === i ? ' active' : ''}`}
                  onClick={() => setPage(i)}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <button className="page-btn" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>›</button>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {statsTarget && <AdminListingStats key={statsTarget.id} business={statsTarget} onClose={() => setStatsTarget(null)} />}
      {editTarget && (
        <AdminBusinessEdit
          business={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={updated => {
            setBusinesses(prev => prev.map(b => b.id === updated.id ? updated : b))
            setEditTarget(null)
          }}
        />
      )}
    </>
  )
}
