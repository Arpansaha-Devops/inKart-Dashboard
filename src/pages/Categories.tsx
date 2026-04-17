import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Edit2, Trash2, ChevronLeft, ChevronRight, Tag } from 'lucide-react';
import { toast } from 'sonner';
import type { Category } from '../types';
import { getCategories } from '../services/categoryService';
import { formatDate } from '../lib/utils';
import CreateCategoryModal from '../components/CreateCategoryModal';
import EditCategoryModal from '../components/EditCategoryModal';
import DeleteCategoryModal from '../components/DeleteCategoryModal';

const Categories: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);

  const limit = 10;

  const fetchCategoriesData = async () => {
    setIsLoading(true);
    try {
      const list = await getCategories();
      const normalized = [...list].sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      });
      setCategories(normalized);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to load categories');
      setCategories([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCategoriesData();
  }, []);

  const totalPages = Math.max(1, Math.ceil(categories.length / limit));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const paginatedCategories = useMemo(() => {
    const start = (page - 1) * limit;
    return categories.slice(start, start + limit);
  }, [categories, page]);

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Categories</h2>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="btn-primary flex items-center justify-center gap-2 w-full sm:w-auto py-2.5 sm:py-2 text-sm sm:text-base min-h-[44px] sm:min-h-auto"
        >
          <Plus size={20} />
          Add category
        </button>
      </div>

      <div className="card overflow-hidden !p-0 border-0 shadow-sm">
        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
          <div className="inline-block min-w-full">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Name</th>
                  <th className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Description</th>
                  <th className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-center">Status</th>
                  <th className="hidden md:table-cell px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Created</th>
                  <th className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <tr key={index} className="animate-pulse">
                      <td colSpan={5} className="px-3 sm:px-4 md:px-6 py-4">
                        <div className="h-12 bg-gray-100 rounded w-full" />
                      </td>
                    </tr>
                  ))
                ) : categories.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 sm:px-4 md:px-6 py-10 text-center text-gray-500">
                      <div className="flex flex-col items-center gap-3">
                        <Tag size={36} className="text-gray-300" />
                        <p className="text-base font-medium">No categories yet</p>
                        <button
                          onClick={() => setIsCreateModalOpen(true)}
                          className="btn-primary px-4 py-2 text-sm"
                        >
                          Create your first category
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedCategories.map((category) => (
                    <tr key={category._id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-sm font-medium text-gray-900">
                        {category.name}
                      </td>
                      <td className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-sm text-gray-600 max-w-xs truncate">
                        {category.description?.trim() || 'N/A'}
                      </td>
                      <td className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-center">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium inline-block ${
                            category.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                          }`}
                        >
                          {category.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="hidden md:table-cell px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-sm text-gray-600">
                        {category.createdAt ? formatDate(category.createdAt) : 'N/A'}
                      </td>
                      <td className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-right">
                        <div className="flex items-center justify-end gap-1 sm:gap-2">
                          <button
                            onClick={() => setEditingCategory(category)}
                            className="p-2 text-gray-400 hover:text-blue-500 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center sm:min-h-auto sm:min-w-auto"
                            aria-label="Edit category"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button
                            onClick={() => setDeletingCategory(category)}
                            className="p-2 text-gray-400 hover:text-red-500 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center sm:min-h-auto sm:min-w-auto"
                            aria-label="Delete category"
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

        {categories.length > 0 && totalPages > 1 && (
          <div className="px-3 sm:px-4 md:px-6 py-3 md:py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-2 overflow-x-auto">
            <button
              disabled={page === 1}
              onClick={() => setPage((prev) => prev - 1)}
              className="flex items-center gap-1 text-xs sm:text-sm font-medium text-gray-600 disabled:opacity-50 hover:text-accent whitespace-nowrap"
            >
              <ChevronLeft size={16} className="sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Previous</span>
            </button>
            <div className="flex items-center gap-1 flex-shrink-0">
              {Array.from({ length: Math.min(totalPages, 5) }).map((_, index) => {
                const pageNum = totalPages > 5 ? (page > 3 ? page - 2 + index : index + 1) : index + 1;
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
              onClick={() => setPage((prev) => prev + 1)}
              className="flex items-center gap-1 text-xs sm:text-sm font-medium text-gray-600 disabled:opacity-50 hover:text-accent whitespace-nowrap"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight size={16} className="sm:w-4 sm:h-4" />
            </button>
          </div>
        )}
      </div>

      <CreateCategoryModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={fetchCategoriesData}
      />

      <EditCategoryModal
        isOpen={Boolean(editingCategory)}
        category={editingCategory}
        onClose={() => setEditingCategory(null)}
        onSuccess={fetchCategoriesData}
      />

      <DeleteCategoryModal
        isOpen={Boolean(deletingCategory)}
        category={deletingCategory}
        onClose={() => setDeletingCategory(null)}
        onSuccess={fetchCategoriesData}
      />
    </div>
  );
};

export default Categories;
