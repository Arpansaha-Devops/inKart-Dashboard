import React, { useCallback, useEffect, useMemo, useReducer } from 'react';
import { Plus, Edit2, Trash2, ChevronLeft, ChevronRight, Tag } from 'lucide-react';
import { toast } from 'sonner';
import type { Category } from '../types';
import { getCategories } from '../services/categoryService';
import { formatDate } from '../lib/utils';
import CreateCategoryModal from '../components/CreateCategoryModal';
import EditCategoryModal from '../components/EditCategoryModal';
import DeleteCategoryModal from '../components/DeleteCategoryModal';

const DELETED_CATEGORIES_STORAGE_KEY = 'inkart-dashboard-deleted-categories';

const readDeletedCategoryIds = (): string[] => {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const storedIds = window.localStorage.getItem(DELETED_CATEGORIES_STORAGE_KEY);
    const parsedIds = storedIds ? JSON.parse(storedIds) : [];

    return Array.isArray(parsedIds)
      ? parsedIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : [];
  } catch {
    return [];
  }
};

const saveDeletedCategoryIds = (categoryIds: string[]) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      DELETED_CATEGORIES_STORAGE_KEY,
      JSON.stringify(Array.from(new Set(categoryIds)))
    );
  } catch {
    // Keep the API delete flow unaffected if browser storage is unavailable.
  }
};

const rememberDeletedCategoryId = (categoryId: string) => {
  const deletedCategoryIds = readDeletedCategoryIds();

  if (!deletedCategoryIds.includes(categoryId)) {
    saveDeletedCategoryIds([...deletedCategoryIds, categoryId]);
  }
};

type CategoriesState = {
  categories: Category[];
  page: number;
  isLoading: boolean;
  isCreateModalOpen: boolean;
  editingCategory: Category | null;
  deletingCategory: Category | null;
};

type CategoriesAction =
  | { type: 'SET_CATEGORIES'; payload: Category[] }
  | { type: 'SET_PAGE'; payload: number | ((previous: number) => number) }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'OPEN_CREATE_MODAL' }
  | { type: 'CLOSE_CREATE_MODAL' }
  | { type: 'SET_EDITING_CATEGORY'; payload: Category | null }
  | { type: 'SET_DELETING_CATEGORY'; payload: Category | null };

const categoriesInitialState: CategoriesState = {
  categories: [],
  page: 1,
  isLoading: true,
  isCreateModalOpen: false,
  editingCategory: null,
  deletingCategory: null,
};

function categoriesReducer(state: CategoriesState, action: CategoriesAction): CategoriesState {
  switch (action.type) {
    case 'SET_CATEGORIES':
      return { ...state, categories: action.payload };
    case 'SET_PAGE':
      return {
        ...state,
        page:
          typeof action.payload === 'function'
            ? action.payload(state.page)
            : action.payload,
      };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'OPEN_CREATE_MODAL':
      return { ...state, isCreateModalOpen: true };
    case 'CLOSE_CREATE_MODAL':
      return { ...state, isCreateModalOpen: false };
    case 'SET_EDITING_CATEGORY':
      return { ...state, editingCategory: action.payload };
    case 'SET_DELETING_CATEGORY':
      return { ...state, deletingCategory: action.payload };
    default:
      return state;
  }
}

const Categories: React.FC = () => {
  const [state, dispatch] = useReducer(categoriesReducer, categoriesInitialState);
  const {
    categories,
    page,
    isLoading,
    isCreateModalOpen,
    editingCategory,
    deletingCategory,
  } = state;

  const limit = 10;

  const fetchCategoriesData = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const list = await getCategories();
      const deletedCategoryIds = new Set(readDeletedCategoryIds());
      const visibleCategoriesList = list.filter(
        (category) => !deletedCategoryIds.has(category._id)
      );
      const normalized = [...visibleCategoriesList].sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      });
      dispatch({ type: 'SET_CATEGORIES', payload: normalized });
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to load categories');
      dispatch({ type: 'SET_CATEGORIES', payload: [] });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  useEffect(() => {
    fetchCategoriesData();
  }, [fetchCategoriesData]);

  const totalPages = Math.max(1, Math.ceil(categories.length / limit));

  useEffect(() => {
    if (page > totalPages) {
      dispatch({ type: 'SET_PAGE', payload: totalPages });
    }
  }, [page, totalPages]);

  const paginatedCategories = useMemo(() => {
    const start = (page - 1) * limit;
    return categories.slice(start, start + limit);
  }, [categories, page]);

  const handleCreateClose = useCallback(() => {
    dispatch({ type: 'CLOSE_CREATE_MODAL' });
  }, []);

  const handleEditClose = useCallback(() => {
    dispatch({ type: 'SET_EDITING_CATEGORY', payload: null });
  }, []);

  const handleDeleteClose = useCallback(() => {
    dispatch({ type: 'SET_DELETING_CATEGORY', payload: null });
  }, []);

  return (
    <div className="page-wrapper">
      <div style={{ display: 'grid', gap: '24px' }}>
        <div style={{ display: 'grid', gap: '6px' }}>
          <h1 className="page-title">Categories</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px' }}>
            Organize products and control whether each category is visible to the store.
          </p>
        </div>

        <div className="toolbar-row" style={{ marginBottom: 0 }}>
          <h2 className="section-title" style={{ marginBottom: 0 }}>
            Categories
          </h2>

          <button
            type="button"
            onClick={() => dispatch({ type: 'OPEN_CREATE_MODAL' })}
            className="btn-primary"
          >
            <Plus size={18} />
            <span>Add Category</span>
          </button>
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div className="table-container" style={{ border: 'none', borderRadius: 'inherit' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, index) => (
                    <tr key={index}>
                      <td colSpan={5}>
                        <div className="skeleton" style={{ height: 48 }} />
                      </td>
                    </tr>
                  ))
                ) : categories.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <div
                        style={{
                          textAlign: 'center',
                          padding: '60px 20px',
                          color: 'var(--text-muted)',
                        }}
                      >
                        <Tag size={40} style={{ margin: '0 auto 12px', opacity: 0.35 }} />
                        <p style={{ fontSize: '15px', margin: '0 0 4px', color: 'var(--text-primary)' }}>
                          No categories yet
                        </p>
                        <p style={{ fontSize: '13px', margin: 0 }}>
                          Create your first category to start organizing the catalog.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedCategories.map((category) => (
                    <tr key={category._id} className="group">
                      <td style={{ fontWeight: 500 }}>{category.name}</td>
                      <td
                        style={{
                          color: 'var(--text-secondary)',
                          maxWidth: 200,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {category.description?.trim() || 'N/A'}
                      </td>
                      <td>
                        <span className={category.isActive ? 'badge-active' : 'badge-inactive'}>
                          {category.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {category.createdAt ? formatDate(category.createdAt) : 'N/A'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: '8px',
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => dispatch({ type: 'SET_EDITING_CATEGORY', payload: category })}
                            className="action-icon-button"
                            aria-label="Edit category"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => dispatch({ type: 'SET_DELETING_CATEGORY', payload: category })}
                            className="action-icon-button danger"
                            aria-label="Delete category"
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

          {categories.length > 0 && totalPages > 1 ? (
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
                  disabled={page === 1}
                  onClick={() => dispatch({ type: 'SET_PAGE', payload: (previous) => previous - 1 })}
                >
                  <ChevronLeft size={15} /> Prev
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={page === totalPages}
                  onClick={() => dispatch({ type: 'SET_PAGE', payload: (previous) => previous + 1 })}
                >
                  Next <ChevronRight size={15} />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <CreateCategoryModal
        isOpen={isCreateModalOpen}
        onClose={handleCreateClose}
        onSuccess={fetchCategoriesData}
      />

      <EditCategoryModal
        isOpen={Boolean(editingCategory)}
        category={editingCategory}
        onClose={handleEditClose}
        onSuccess={fetchCategoriesData}
      />

      <DeleteCategoryModal
        isOpen={Boolean(deletingCategory)}
        category={deletingCategory}
        onClose={handleDeleteClose}
        onDeleteSuccess={rememberDeletedCategoryId}
        onSuccess={fetchCategoriesData}
      />
    </div>
  );
};

export default Categories;
