'use client';

import { useState, useEffect, useCallback } from 'react';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import DataTable, { DataTableColumn } from '@/components/ui/data-table';
import StatusBadge from '@/components/ui/status-badge';
import { itemCategoriesApi } from '@/lib/api';
import { PlusIcon, XMarkIcon, PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useToast } from '@/components/ui/toast';

const emptyForm = {
  name: '',
  description: '',
  parentCategoryId: '',
};

export default function ItemCategoriesPage() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await itemCategoriesApi.getCategories({ search });
      setCategories(res.categories || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load categories. Is the backend running?');
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const openCreate = () => {
    setEditingId(null);
    setFormData(emptyForm);
    setIsModalOpen(true);
  };

  const openEdit = (category: any) => {
    setEditingId(category.id);
    setFormData({
      name: category.name || '',
      description: category.description || '',
      parentCategoryId: category.parentCategoryId ? String(category.parentCategoryId) : '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        ...formData,
        parentCategoryId: formData.parentCategoryId ? Number(formData.parentCategoryId) : null,
      };
      if (editingId) {
        await itemCategoriesApi.updateCategory(editingId, payload);
      } else {
        await itemCategoriesApi.createCategory(payload);
      }
      setIsModalOpen(false);
      setFormData(emptyForm);
      setEditingId(null);
      fetchCategories();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save category');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (category: any) => {
    if (!confirm(`Delete category "${category.name}"?`)) return;
    try {
      await itemCategoriesApi.deleteCategory(category.id);
      fetchCategories();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete category');
    }
  };

  const columns: DataTableColumn<any>[] = [
    { header: 'Code', accessor: (c) => <span className="font-mono text-xs text-slate-500">{c.code}</span> },
    { header: 'Name', accessor: (c) => <span className="font-medium text-slate-900">{c.name}</span> },
    { header: 'Description', accessor: (c) => <span className="text-slate-600">{c.description || '—'}</span> },
    {
      header: 'Status',
      accessor: (c) => <StatusBadge status={c.isActive ? 'active' : 'inactive'} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Item Categories"
        description="Group your items into categories for reporting and filtering"
        actions={
          <Button size="sm" onClick={openCreate}>
            <PlusIcon className="h-4 w-4" /> Add Category
          </Button>
        }
      />

      <div className="mb-4 flex items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search categories..." className="sm:max-w-xs" />
        <span className="text-sm text-slate-500">{categories.length} categor{categories.length === 1 ? 'y' : 'ies'}</span>
      </div>

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <Card>
        <DataTable
          columns={columns}
          data={categories}
          rowKey={(c) => c.id}
          loading={loading}
          showToolbar
          totalEntries={categories.length}
          emptyMessage='No categories found. Click "Add Category" to create one.'
          actions={(category) => (
            <div className="flex justify-end gap-3">
              <button onClick={() => openEdit(category)} className="text-slate-400 hover:text-[#168eea]" aria-label="Edit">
                <PencilSquareIcon className="h-4 w-4" />
              </button>
              <button onClick={() => handleDelete(category)} className="text-slate-400 hover:text-red-600" aria-label="Delete">
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          )}
        />
      </Card>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-semibold text-slate-900">{editingId ? 'Edit Category' : 'Add New Category'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700">Category Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Parent Category</label>
                <select
                  value={formData.parentCategoryId}
                  onChange={(e) => setFormData({ ...formData, parentCategoryId: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                >
                  <option value="">None (top-level category)</option>
                  {categories
                    .filter((c) => c.id !== editingId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Description</label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                />
              </div>

              <div className="mt-4 flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={submitting}>
                  {submitting ? 'Saving...' : editingId ? 'Update Category' : 'Save Category'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
