import React, { useEffect, useRef, useState } from 'react';
import apiClient from '../lib/apiClient';
import { User } from '../types';
import { Search, ChevronLeft, ChevronRight, Eye, X, Trash2, AlertTriangle } from 'lucide-react';
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
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 flex-shrink-0" size={18} />
          <input
            type="text"
            placeholder="Search by name or email..."
            className="input-field pl-10 w-full text-sm sm:text-base"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="text-xs sm:text-sm text-gray-500 whitespace-nowrap">
          Showing {users.length} of {totalCount}
        </div>
      </div>

      <div className="card overflow-hidden !p-0 border-0 shadow-sm">
        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
          <div className="inline-block min-w-full">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">#</th>
                  <th className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Name</th>
                  <th className="hidden sm:table-cell px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Email</th>
                  <th className="hidden md:table-cell px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Phone</th>
                  <th className="hidden lg:table-cell px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Role</th>
                  <th className="hidden lg:table-cell px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Joined</th>
                  <th className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center sm:text-right whitespace-nowrap w-14 sm:w-auto">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={7} className="px-3 sm:px-4 md:px-6 py-4">
                        <div className="h-12 bg-gray-100 rounded w-full"></div>
                      </td>
                    </tr>
                  ))
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 sm:px-4 md:px-6 py-8 sm:py-12 text-center text-gray-500 text-sm sm:text-base">
                      No customers found matching your search.
                    </td>
                  </tr>
                ) : (
                  users.map((user, index) => (
                    <tr key={user._id} className="group hover:bg-gray-50 transition-colors">
                      <td className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs sm:text-sm text-gray-500">{(page - 1) * limit + index + 1}</td>
                      <td className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium text-gray-900 truncate">
                        {user.name}
                      </td>
                      <td className="hidden sm:table-cell px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs sm:text-sm text-gray-600 truncate">
                        {user.email}
                      </td>
                      <td className="hidden md:table-cell px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs sm:text-sm text-gray-600">
                        {user.phone || 'N/A'}
                      </td>
                      <td className="hidden lg:table-cell px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs sm:text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium inline-block ${
                          user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="hidden lg:table-cell px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs sm:text-sm text-gray-600">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-center sm:text-right w-14 sm:w-auto">
                        <div className="inline-flex items-center justify-end gap-1 sm:gap-2">
                          <button
                            onClick={() => setSelectedUser(user)}
                            className="inline-flex p-2 text-gray-400 hover:text-accent transition-colors min-h-[40px] min-w-[40px] items-center justify-center sm:min-h-auto sm:min-w-auto"
                            aria-label="View details"
                          >
                            <Eye size={18} />
                          </button>
                          <button
                            onClick={() => handleOpenDeleteModal(user)}
                            className="inline-flex p-2 text-gray-400 hover:text-red-500 transition-all min-h-[40px] min-w-[40px] items-center justify-center sm:min-h-auto sm:min-w-auto opacity-0 group-hover:opacity-100 focus:opacity-100"
                            aria-label="Delete user"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {totalPages > 1 && (
          <div className="px-3 sm:px-4 md:px-6 py-3 md:py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-2 overflow-x-auto">
            <button
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="flex items-center gap-1 text-xs sm:text-sm font-medium text-gray-600 disabled:opacity-50 hover:text-accent whitespace-nowrap"
            >
              <ChevronLeft size={16} className="sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Previous</span>
            </button>
            <div className="flex items-center gap-1 flex-shrink-0">
              {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                const pageNum = totalPages > 5 ? (page > 3 ? page - 2 + i : i + 1) : i + 1;
                if (pageNum > totalPages) return null;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg text-xs font-medium transition-all flex items-center justify-center ${
                      page === pageNum ? 'bg-accent text-white' : 'text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <button
              disabled={page === totalPages}
              onClick={() => setPage(p => p + 1)}
              className="flex items-center gap-1 text-xs sm:text-sm font-medium text-gray-600 disabled:opacity-50 hover:text-accent whitespace-nowrap"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight size={16} className="sm:w-4 sm:h-4" />
            </button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isDeleteModalOpen && deletingUser && (
          <div
            ref={deleteModalOverlayRef}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            role="presentation"
          >
            <motion.div
              ref={deleteModalContentRef}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 sm:mx-0 overflow-hidden"
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-user-title"
            >
              <div className="p-6">
                <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
                  <AlertTriangle className="w-6 h-6 text-red-600" aria-hidden="true" />
                </div>
                <h3 id="delete-user-title" className="text-lg sm:text-xl font-semibold text-center text-gray-900 mb-2">
                  Delete user
                </h3>
                <p className="text-center text-gray-500 text-sm mb-6">
                  This will permanently delete <strong>{deletingUser.name}</strong> ({deletingUser.email}). This cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setIsDeleteModalOpen(false);
                      setDeletingUser(null);
                    }}
                    className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteUser}
                    disabled={isDeletingUser}
                    className="flex-1 px-4 py-2 text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg font-medium transition-colors text-sm flex items-center justify-center gap-2"
                  >
                    {isDeletingUser && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                    Delete
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="p-4 sm:p-6 border-b border-gray-100 flex items-center justify-between bg-primary text-white">
                <h3 className="text-base sm:text-xl font-bold truncate">Customer Details</h3>
                <button onClick={() => setSelectedUser(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center sm:min-h-auto sm:min-w-auto">
                  <X size={20} />
                </button>
              </div>
              <div className="p-4 sm:p-8 space-y-4 sm:space-y-6 max-h-[70vh] overflow-y-auto">
                <div className="flex items-center gap-3 sm:gap-6">
                  <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-accent flex items-center justify-center text-white text-2xl sm:text-3xl font-bold flex-shrink-0">
                    {selectedUser.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-lg sm:text-2xl font-bold text-gray-900 truncate">{selectedUser.name}</h4>
                    <p className="text-xs sm:text-base text-gray-500 truncate">{selectedUser.email}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 pt-4 sm:pt-6 border-t border-gray-100">
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Phone</p>
                    <p className="text-sm sm:text-base font-medium">{selectedUser.phone || 'Not provided'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Role</p>
                    <p className="text-sm sm:text-base font-medium capitalize">{selectedUser.role}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Joined Date</p>
                    <p className="text-sm sm:text-base font-medium">{formatDate(selectedUser.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">User ID</p>
                    <p className="text-xs sm:text-sm font-medium font-mono break-all">{selectedUser._id}</p>
                  </div>
                </div>
              </div>
              <div className="p-4 sm:p-6 bg-gray-50 text-right border-t border-gray-100">
                <button
                  onClick={() => setSelectedUser(null)}
                  className="px-4 py-2.5 sm:py-2 text-sm sm:text-base font-medium rounded-lg hover:bg-gray-200 transition-colors min-h-[44px] sm:min-h-auto"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Customers;
