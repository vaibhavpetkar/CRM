'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import StatCard from '@/components/ui/stat-card';
import DataTable, { DataTableColumn } from '@/components/ui/data-table';
import StatusBadge from '@/components/ui/status-badge';
import { itemsApi, itemCategoriesApi, taxesApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import {
  PlusIcon,
  XMarkIcon,
  PencilSquareIcon,
  TrashIcon,
  CubeIcon,
  TagIcon,
  ReceiptRefundIcon,
} from '@heroicons/react/24/outline';
import { useToast } from '@/components/ui/toast';

const UNITS = ['Nos', 'Kg', 'Gram', 'Litre', 'ML', 'Box', 'Piece', 'Hour', 'Day', 'Meter', 'Dozen'];

const emptyForm = {
  itemName: '',
  categoryId: '',
  taxId: '',
  unit: 'Nos',
  hsnCode: '',
  sku: '',
  sellingPrice: '',
  purchasePrice: '',
  description: '',
};

export default function ItemsPage() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [taxes, setTaxes] = useState<any[]>([]);
  const [stats, setStats] = useState<{ totalItems: number; activeItems: number; totalCategories: number; totalTaxes: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [itemsRes, catRes, taxRes, statsRes] = await Promise.all([
        itemsApi.getItems({ search, limit: 100 }),
        itemCategoriesApi.getCategories(),
        taxesApi.getTaxes(),
        itemsApi.getStats().catch(() => null),
      ]);
      setItems(itemsRes.items || []);
      setCategories(catRes.categories || []);
      setTaxes(taxRes.taxes || []);
      if (statsRes) setStats(statsRes);
    } catch (err: any) {
      setError(err.message || 'Failed to load items. Is the backend running?');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const openCreate = () => {
    setEditingId(null);
    setFormData(emptyForm);
    setIsModalOpen(true);
  };

  const openEdit = (item: any) => {
    setEditingId(item.id);
    setFormData({
      itemName: item.itemName || '',
      categoryId: item.categoryId ? String(item.categoryId) : '',
      taxId: item.taxId ? String(item.taxId) : '',
      unit: item.unit || 'Nos',
      hsnCode: item.hsnCode || '',
      sku: item.sku || '',
      sellingPrice: String(item.sellingPrice ?? ''),
      purchasePrice: item.purchasePrice !== null && item.purchasePrice !== undefined ? String(item.purchasePrice) : '',
      description: item.description || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        ...formData,
        categoryId: formData.categoryId ? Number(formData.categoryId) : null,
        taxId: formData.taxId ? Number(formData.taxId) : null,
        sellingPrice: formData.sellingPrice ? Number(formData.sellingPrice) : 0,
        purchasePrice: formData.purchasePrice ? Number(formData.purchasePrice) : null,
      };
      if (editingId) {
        await itemsApi.updateItem(editingId, payload);
      } else {
        await itemsApi.createItem(payload);
      }
      setIsModalOpen(false);
      setFormData(emptyForm);
      setEditingId(null);
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save item');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (item: any) => {
    if (!confirm(`Delete item "${item.itemName}"?`)) return;
    try {
      await itemsApi.deleteItem(item.id);
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete item');
    }
  };

  const columns: DataTableColumn<any>[] = [
    { header: 'Item Code', accessor: (i) => <span className="font-mono text-xs text-slate-500">{i.itemCode}</span> },
    { header: 'Item Name', accessor: (i) => <span className="font-medium text-slate-900">{i.itemName}</span> },
    { header: 'Category', accessor: (i) => <span className="text-slate-600">{i.categoryName || '—'}</span> },
    { header: 'Unit', accessor: (i) => <span className="text-slate-600">{i.unit}</span> },
    { header: 'HSN/SAC', accessor: (i) => <span className="text-slate-600">{i.hsnCode || '—'}</span> },
    {
      header: 'Tax',
      accessor: (i) => <span className="text-slate-600">{i.taxName ? `${i.taxName} (${Number(i.taxRate).toFixed(2)}%)` : '—'}</span>,
    },
    {
      header: 'Selling Price',
      accessor: (i) => <span className="font-medium text-slate-900">{formatCurrency(Number(i.sellingPrice) || 0)}</span>,
    },
    {
      header: 'Status',
      accessor: (i) => <StatusBadge status={i.isActive ? 'active' : 'inactive'} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Items"
        description="Master list of products & services, linked to categories and tax rates"
        actions={
          <>
            <Link href="/items/categories">
              <Button size="sm" variant="secondary"><TagIcon className="h-4 w-4" /> Categories</Button>
            </Link>
            <Link href="/items/taxes">
              <Button size="sm" variant="secondary"><ReceiptRefundIcon className="h-4 w-4" /> Tax Master</Button>
            </Link>
            <Button size="sm" onClick={openCreate}><PlusIcon className="h-4 w-4" /> Add Item</Button>
          </>
        }
      />

      {stats && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Items" value={stats.totalItems} icon={<CubeIcon className="h-5 w-5" />} />
          <StatCard label="Active Items" value={stats.activeItems} icon={<CubeIcon className="h-5 w-5" />} />
          <StatCard label="Categories" value={stats.totalCategories} icon={<TagIcon className="h-5 w-5" />} />
          <StatCard label="Tax Rates" value={stats.totalTaxes} icon={<ReceiptRefundIcon className="h-5 w-5" />} />
        </div>
      )}

      <div className="mb-4 flex items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search items by name, code, SKU, HSN..." className="sm:max-w-xs" />
        <span className="text-sm text-slate-500">{items.length} item{items.length === 1 ? '' : 's'}</span>
      </div>

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <Card>
        <DataTable
          columns={columns}
          data={items}
          rowKey={(i) => i.id}
          loading={loading}
          showToolbar
          totalEntries={items.length}
          emptyMessage='No items found. Click "Add Item" to create one.'
          actions={(item) => (
            <div className="flex justify-end gap-3">
              <button onClick={() => openEdit(item)} className="text-slate-400 hover:text-[#168eea]" aria-label="Edit">
                <PencilSquareIcon className="h-4 w-4" />
              </button>
              <button onClick={() => handleDelete(item)} className="text-slate-400 hover:text-red-600" aria-label="Delete">
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          )}
        />
      </Card>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-semibold text-slate-900">{editingId ? 'Edit Item' : 'Add New Item'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700">Item Name</label>
                <input
                  type="text"
                  required
                  value={formData.itemName}
                  onChange={(e) => setFormData({ ...formData, itemName: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Category</label>
                  <select
                    value={formData.categoryId}
                    onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  >
                    <option value="">Uncategorized</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Unit</label>
                  <select
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Tax</label>
                  <select
                    value={formData.taxId}
                    onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  >
                    <option value="">No tax</option>
                    {taxes.map((t) => (
                      <option key={t.id} value={t.id}>{t.name} ({Number(t.rate).toFixed(2)}%)</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">HSN/SAC Code</label>
                  <input
                    type="text"
                    value={formData.hsnCode}
                    onChange={(e) => setFormData({ ...formData, hsnCode: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Selling Price</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    value={formData.sellingPrice}
                    onChange={(e) => setFormData({ ...formData, sellingPrice: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Purchase Price</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={formData.purchasePrice}
                    onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">SKU</label>
                <input
                  type="text"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Description</label>
                <textarea
                  rows={2}
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
                  {submitting ? 'Saving...' : editingId ? 'Update Item' : 'Save Item'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
