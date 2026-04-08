import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { PaginatedResponse, User } from '../types';
import { Search, ChevronLeft, ChevronRight, Eye, X } from 'lucide-react';
import { formatDate } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

const Customers: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const limit = 10;

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const params: any = { page, limit };
      if (search.trim()) {
        params.search = search;
      }
      
      const response = await api.get<any>(`/users/all`, { params });
      console.log('Users response raw:', response.data);
      
      let usersList: User[] = [];
      let count = 0;

      if (Array.isArray(response.data)) {
        usersList = response.data;
        count = response.data.length;
      } else if (response.data && typeof response.data === 'object') {
        // Deep search for arrays in the response
        const findArray = (obj: any): any[] | null => {
          if (Array.isArray(obj)) return obj;
          if (!obj || typeof obj !== 'object') return null;
          
          // Check common keys first
          const commonKeys = ['data', 'users', 'results', 'items', 'list', 'customers', 'allUsers'];
          for (const key of commonKeys) {
            if (Array.isArray(obj[key])) return obj[key];
          }
          
          // Recursive search for any array
          for (const key in obj) {
            const result = findArray(obj[key]);
            if (result) return result;
          }
          return null;
        };

        usersList = findArray(response.data) || [];
        
        // Extract count from various possible locations
        const findCount = (obj: any): number | null => {
          if (!obj || typeof obj !== 'object') return null;
          const countKeys = ['totalCount', 'total', 'count', 'totalResults', 'length'];
          for (const key of countKeys) {
            if (typeof obj[key] === 'number') return obj[key];
          }
          for (const key in obj) {
            const result = findCount(obj[key]);
            if (result !== null) return result;
          }
          return null;
        };

        count = findCount(response.data) ?? usersList.length;
      }

      setUsers(usersList);
      setTotalCount(count);
    } catch (error) {
      console.error('Error fetching users', error);
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
                    <tr key={user._id} className="hover:bg-gray-50 transition-colors">
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
                        <button
                          onClick={() => setSelectedUser(user)}
                          className="inline-flex p-2 text-gray-400 hover:text-accent transition-colors min-h-[40px] min-w-[40px] items-center justify-center sm:min-h-auto sm:min-w-auto"
                          aria-label="View details"
                        >
                          <Eye size={18} />
                        </button>
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
