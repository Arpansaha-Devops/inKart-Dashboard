import React, { useEffect, useRef, useState } from 'react';
import apiClient from '../lib/apiClient';
import { User } from '../types';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { formatDate } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

const isUserLike = (item: any): item is User => {
  return Boolean(
    item &&
      typeof item === 'object' &&
      typeof item._id === 'string' &&
      (typeof item.email === 'string' || typeof item.name === 'string')
  );
};

const collectArrays = (node: unknown, arrays: any[][] = []): any[][] => {
  if (Array.isArray(node)) {
    arrays.push(node);
    return arrays;
  }

  if (!node || typeof node !== 'object') {
    return arrays;
  }

  Object.values(node as Record<string, unknown>).forEach((value) => collectArrays(value, arrays));
  return arrays;
};

const extractUsers = (payload: any): User[] => {
  const directCandidates = [
    payload?.users,
    payload?.data?.users,
    payload?.data?.data?.users,
    payload?.data?.items,
    payload?.data,
  ];

  for (const candidate of directCandidates) {
    if (Array.isArray(candidate) && candidate.some(isUserLike)) {
      return candidate.filter(isUserLike);
    }
  }

  const deepCandidates = collectArrays(payload);
  const best = deepCandidates
    .map((arr) => arr.filter(isUserLike))
    .sort((a, b) => b.length - a.length)[0];

  return best || [];
};

const extractTotalUsers = (payload: any, fallback = 0): number => {
  const countKeys = [
    'total',
    'totalCount',
    'count',
    'totalUsers',
    'totalResults',
    'totalItems',
  ];

  const visit = (node: any): number | null => {
    if (!node || typeof node !== 'object') return null;

    for (const key of countKeys) {
      if (typeof node[key] === 'number') {
        return node[key];
      }
    }

    for (const value of Object.values(node)) {
      const found = visit(value);
      if (found !== null) return found;
    }

    return null;
  };

  return visit(payload) ?? fallback;
};

const Customers: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const limit = 10;

  const deleteModalOverlayRef = useRef<HTMLDivElement>(null);
  const deleteModalContentRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const params: any = { page, limit };
      if (search.trim()) {
        params.search = search;
      }

      const response = await apiClient.get<any>(`/users/all`, { params });

      const usersList = extractUsers(response.data);
      const count = extractTotalUsers(response.data, usersList.length);

      setUsers(usersList);
      setTotalCount(count);
    } catch (error: any) {
      console.error('Error fetching users', error);
      toast.error(error?.response?.data?.message || 'Failed to load customers');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers();
    }, 300);
    return () => clearTimeout(timer);
  }, [page, search]);

  const getFocusableElements = (container: HTMLElement): HTMLElement[] => {
    const selector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    return Array.from(container.querySelectorAll(selector)).filter(
      (el: any) => !el.hasAttribute('disabled')
    ) as HTMLElement[];
  };

  useEffect(() => {
    if (!isDeleteModalOpen) return;

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDeleteModalOpen(false);
        setDeletingUser(null);
      }
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (deleteModalOverlayRef.current && event.target === deleteModalOverlayRef.current) {
        setIsDeleteModalOpen(false);
        setDeletingUser(null);
      }
    };

    const handleTabKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !deleteModalContentRef.current) return;

      const focusableElements = getFocusableElements(deleteModalContentRef.current);
      if (focusableElements.length === 0) return;

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    previouslyFocusedElementRef.current = document.activeElement as HTMLElement;
    const focusable = deleteModalContentRef.current ? getFocusableElements(deleteModalContentRef.current) : [];
    focusable[0]?.focus();

    document.addEventListener('keydown', handleEscapeKey);
    document.addEventListener('keydown', handleTabKey);
    const overlay = deleteModalOverlayRef.current;
    overlay?.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
      document.removeEventListener('keydown', handleTabKey);
      overlay?.removeEventListener('mousedown', handleClickOutside);
      previouslyFocusedElementRef.current?.focus();
    };
  }, [isDeleteModalOpen]);

  useEffect(() => {
    if (!selectedUser) return;

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedUser(null);
      }
    };

    document.addEventListener('keydown', handleEscapeKey);
    return () => document.removeEventListener('keydown', handleEscapeKey);
  }, [selectedUser]);

  const handleOpenDeleteModal = (user: User) => {
    setDeletingUser(user);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteUser = async () => {
    if (!deletingUser?._id) return;

    setIsDeletingUser(true);
    try {
      await apiClient.delete(`/admin/users/${deletingUser._id}`);
      toast.success('User deleted');
      setIsDeleteModalOpen(false);
      setDeletingUser(null);
      await fetchUsers();
    } catch {
      toast.error('Failed to delete user');
    } finally {
      setIsDeletingUser(false);
    }
  };

  const totalPages = Math.ceil(totalCount / limit);

  return (
    <div className="page-wrapper">
      <div style={{ display: 'grid', gap: '24px' }}>
        <div style={{ display: 'grid', gap: '6px' }}>
          <h1 className="page-title">Customers</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px' }}>
            Manage registered users and review customer details.
          </p>
        </div>

        <div className="toolbar-row">
          <div style={{ position: 'relative', width: '100%', maxWidth: '400px' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              type="text"
              className="input-field"
              style={{ paddingLeft: '40px' }}
              placeholder="Search by name or email..."
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>

          <p
            style={{
              margin: 0,
              fontSize: '13px',
              color: 'var(--text-muted)',
              whiteSpace: 'nowrap',
            }}
          >
            Showing {users.length} of {totalCount}
          </p>
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div className="table-container" style={{ border: 'none', borderRadius: 'inherit' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Role</th>
                  <th>Joined</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, index) => (
                    <tr key={index}>
                      <td colSpan={7}>
                        <div className="skeleton" style={{ height: 48 }} />
                      </td>
                    </tr>
                  ))
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div
                        style={{
                          textAlign: 'center',
                          padding: '56px 20px',
                          color: 'var(--text-muted)',
                        }}
                      >
                        No customers found matching your search.
                      </div>
                    </td>
                  </tr>
                ) : (
                  users.map((user, index) => (
                    <tr key={user._id} className="group">
                      <td style={{ color: 'var(--text-secondary)' }}>{(page - 1) * limit + index + 1}</td>
                      <td style={{ fontWeight: 600 }}>{user.name || 'N/A'}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{user.email || 'N/A'}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{user.phone || 'N/A'}</td>
                      <td>
                        <span className={user.role === 'admin' ? 'badge-warning' : 'badge-info'}>
                          {user.role || 'user'}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {user.createdAt ? formatDate(user.createdAt) : 'N/A'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div
                          style={{
                            display: 'inline-flex',
                            gap: '8px',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedUser(user)}
                            className="action-icon-button"
                            aria-label="View customer"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenDeleteModal(user)}
                            className="action-icon-button danger opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                            aria-label="Delete customer"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px 16px',
                borderTop: '1px solid var(--border)',
                gap: '12px',
                flexWrap: 'wrap',
              }}
            >
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                Page {page} of {totalPages}
              </p>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setPage((previous) => previous - 1)}
                  disabled={page === 1}
                >
                  <ChevronLeft size={15} /> Prev
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setPage((previous) => previous + 1)}
                  disabled={page >= totalPages}
                >
                  Next <ChevronRight size={15} />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <AnimatePresence>
        {isDeleteModalOpen && deletingUser ? (
          <div
            ref={deleteModalOverlayRef}
            className="modal-backdrop"
            role="presentation"
          >
            <motion.div
              ref={deleteModalContentRef}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="modal-box"
              style={{ maxWidth: '400px' }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-user-title"
            >
              <div style={{ textAlign: 'center', padding: '8px 0 20px' }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    background: 'var(--danger-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px',
                  }}
                >
                  <AlertTriangle size={24} color="var(--danger)" />
                </div>
                <h2
                  id="delete-user-title"
                  style={{
                    fontSize: '18px',
                    fontWeight: 600,
                    margin: '0 0 8px',
                    color: 'var(--text-primary)',
                  }}
                >
                  Delete user?
                </h2>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>
                  This will permanently delete {deletingUser.name || deletingUser.email}. This action cannot be undone.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ flex: 1 }}
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setDeletingUser(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  style={{ flex: 1 }}
                  onClick={handleDeleteUser}
                  disabled={isDeletingUser}
                >
                  {isDeletingUser ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {selectedUser ? (
          <div className="modal-backdrop" onClick={() => setSelectedUser(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="modal-box"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="customer-details-title"
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '20px',
                  gap: '12px',
                }}
              >
                <h2
                  id="customer-details-title"
                  style={{
                    fontSize: '18px',
                    fontWeight: 600,
                    margin: 0,
                    color: 'var(--text-primary)',
                  }}
                >
                  Customer details
                </h2>
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  className="action-icon-button"
                  aria-label="Close customer details"
                >
                  <X size={20} />
                </button>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '20px',
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    background: 'var(--accent-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--accent)',
                    fontWeight: 600,
                    fontSize: 18,
                    flexShrink: 0,
                  }}
                >
                  {selectedUser.name?.[0]?.toUpperCase() || 'U'}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p
                    style={{
                      fontWeight: 600,
                      margin: 0,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {selectedUser.name || 'Unnamed user'}
                  </p>
                  <p
                    style={{
                      fontSize: '13px',
                      color: 'var(--text-muted)',
                      margin: 0,
                      textTransform: 'capitalize',
                    }}
                  >
                    {selectedUser.role || 'user'}
                  </p>
                </div>
              </div>

              <div style={{ display: 'grid', gap: '4px' }}>
                <div className="detail-row">
                  <div>
                    <p className="form-label" style={{ marginBottom: 0 }}>
                      Email
                    </p>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-primary)' }}>
                      {selectedUser.email || 'N/A'}
                    </p>
                  </div>
                </div>
                <div className="detail-row">
                  <div>
                    <p className="form-label" style={{ marginBottom: 0 }}>
                      Phone
                    </p>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-primary)' }}>
                      {selectedUser.phone || 'Not provided'}
                    </p>
                  </div>
                </div>
                <div className="detail-row">
                  <div>
                    <p className="form-label" style={{ marginBottom: 0 }}>
                      Joined
                    </p>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-primary)' }}>
                      {selectedUser.createdAt ? formatDate(selectedUser.createdAt) : 'N/A'}
                    </p>
                  </div>
                </div>
                <div className="detail-row">
                  <div>
                    <p className="form-label" style={{ marginBottom: 0 }}>
                      User ID
                    </p>
                    <p
                      style={{
                        margin: '4px 0 0',
                        color: 'var(--text-secondary)',
                        fontFamily: "'SFMono-Regular', Consolas, monospace",
                        wordBreak: 'break-all',
                      }}
                    >
                      {selectedUser._id}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

export default Customers;
