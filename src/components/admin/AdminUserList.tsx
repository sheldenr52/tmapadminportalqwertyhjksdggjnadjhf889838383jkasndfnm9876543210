import React, { useState, useEffect, useCallback } from 'react'
import { supabase, UserProfile } from '../../supabase'
import { AdminSubscription } from './AdminSubscription'
import { AdminUserEdit } from './AdminUserEdit'

const PAGE_SIZE = 20

interface Props {
  onNavigateToCreate: () => void
}

export const AdminUserList: React.FC<Props> = ({ onNavigateToCreate }) => {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError(null)

    let query = supabase
      .from('user_profiles')
      .select('id, email, first_name, last_name, full_name, created_at, last_sign_in_at, confirmed_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    if (search.trim()) {
      query = query.ilike('email', `%${search.trim()}%`)
    }

    const { data, error: fetchError, count } = await query

    if (fetchError) {
      setError(fetchError.message)
    } else {
      setUsers((data as UserProfile[]) || [])
      setTotal(count ?? 0)
    }
    setLoading(false)
  }, [page, search])

  useEffect(() => { fetchUsers() }, [fetchUsers])
  useEffect(() => { setPage(0) }, [search])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString() : '—'

  return (
    <>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="label">Total Users</div>
          <div className="value">{total}</div>
        </div>
        <div className="stat-card">
          <div className="label">Showing</div>
          <div className="value">{users.length}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Users</h2>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="search-bar">
              <input
                type="text"
                placeholder="Search by email…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <button className="btn btn-primary btn-sm" onClick={onNavigateToCreate}>
              👤 New User
            </button>
          </div>
        </div>

        {error && <div className="alert alert-error" style={{ margin: '1rem' }}>{error}</div>}
        {success && <div className="alert alert-success" role="status" style={{ margin: '1rem' }}>{success}</div>}

        {loading ? (
          <div className="loading-overlay"><div className="spinner" />Loading users…</div>
        ) : users.length === 0 ? (
          <div className="empty-state">
            <div className="icon">👥</div>
            <p>No users found.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Actions</th>
                  <th>Verified</th>
                  <th>Registered</th>
                  <th>Last Sign In</th>
                  <th>Renewal &amp; trial</th>
                  <th>User ID</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id}>
                    <td>
                      <strong style={{ color: 'var(--gray-900)' }}>{user.email}</strong>
                    </td>
                    <td>
                      {user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' ') || (
                        <span style={{ color: 'var(--gray-300)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" aria-label={`Edit details for ${user.email}`}
                        onClick={() => { setSuccess(null); setEditingUser(user) }}>Edit details</button>
                    </td>
                    <td>
                      {user.confirmed_at
                        ? <span className="badge badge-success">✓ Verified</span>
                        : <span className="badge badge-warning">Pending</span>
                      }
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>
                      {formatDate(user.created_at)}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>
                      {formatDate(user.last_sign_in_at)}
                    </td>
                    <td><AdminSubscription ownerId={user.id} /></td>
                    <td style={{ fontSize: '0.72rem', color: 'var(--gray-300)', fontFamily: 'monospace' }}>
                      {user.id}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

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
      {editingUser && <AdminUserEdit key={editingUser.id} user={editingUser}
        onClose={() => setEditingUser(null)}
        onSaved={updated => {
          setUsers(previous => previous.map(user => user.id === updated.id ? updated : user))
          setEditingUser(null)
          setSuccess(`Details saved for ${updated.email}.`)
          void fetchUsers()
        }} />}
    </>
  )
}
