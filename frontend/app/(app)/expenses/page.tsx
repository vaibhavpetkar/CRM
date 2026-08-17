'use client';

import { useState, useEffect, useCallback } from 'react';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import StatCard from '@/components/ui/stat-card';
import DataTable, { DataTableColumn } from '@/components/ui/data-table';
import { expensesApi, Expense } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { PlusIcon, XMarkIcon, PencilSquareIcon, TrashIcon, BanknotesIcon } from '@heroicons/react/24/outline';
import { useToast } from '@/components/ui/toast';
import FormField, { getInputClassName } from '@/components/ui/form-field';

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'online', label: 'Online' },
  { value: 'other', label: 'Other' },
];

const COMMON_CATEGORIES = ['Rent', 'Salaries', 'Software & Subscriptions', 'Marketing', 'Utilities', 'Travel', 'Office Supplies', 'Other'];

const todayISO = () => new Date().toISOString().slice(0, 10);

const emptyForm = {
  category: '',
  description: '',
  amount: '',
  expenseDate: todayISO(),
  paymentMethod: 'bank_transfer',
  vendor: '',
  notes: '',
};

export default function ExpensesPage() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
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
      const [expRes, catRes] = await Promise.all([
        expensesApi.getExpenses({ search, category, limit: 100 }),
        expensesApi.getCategories(),
      ]);
      setExpenses(expRes.expenses || []);
      setTotal(expRes.total || 0);
      setCategories(catRes.categories || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load expenses. Is the backend running?');
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  }, [search, category]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const totalThisPage = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  const openCreate = () => {
    setEditingId(null);
    setFormData(emptyForm);
    setIsModalOpen(true);
  };

  const openEdit = (expense: Expense) => {
    setEditingId(expense.id);
    setFormData({
      category: expense.category,
      description: expense.description,
      amount: String(expense.amount),
      expenseDate: expense.expenseDate?.slice(0, 10) || todayISO(),
      paymentMethod: expense.paymentMethod || 'bank_transfer',
      vendor: expense.vendor || '',
      notes: expense.notes || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.category.trim()) return toast.error('Category is required');
    if (!formData.description.trim()) return toast.error('Description is required');
    const amountNum = Number(formData.amount);
    if (!amountNum || amountNum <= 0) return toast.error('Enter a valid amount');

    setSubmitting(true);
    try {
      const payload = { ...formData, amount: amountNum };
      if (editingId) {
        await expensesApi.updateExpense(editingId, payload);
      } else {
        await expensesApi.createExpense(payload);
      }
      setIsModalOpen(false);
      setFormData(emptyForm);
      setEditingId(null);
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save expense');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (expense: Expense) => {
    if (!confirm(`Delete this expense: "${expense.description}"?`)) return;
    try {
      await expensesApi.deleteExpense(expense.id);
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete expense');
    }
  };

  const columns: DataTableColumn<Expense>[] = [
    { header: 'Date', accessor: (e) => <span className="text-slate-600">{formatDate(e.expenseDate)}</span> },
    { header: 'Category', accessor: (e) => <span className="font-medium text-slate-900">{e.category}</span> },
    { header: 'Description', accessor: (e) => <span className="text-slate-600">{e.description}</span> },
    { header: 'Vendor', accessor: (e) => <span className="text-slate-600">{e.vendor || '—'}</span> },
    {
      header: 'Payment Method',
      accessor: (e) => (
        <span className="text-slate-600 capitalize">{(e.paymentMethod || '').replace('_', ' ')}</span>
      ),
    },
    {
      header: 'Amount',
      accessor: (e) => <span className="font-medium text-slate-900">{formatCurrency(Number(e.amount))}</span>,
    },
    { header: 'Recorded By', accessor: (e) => <span className="text-slate-500">{e.recordedBy || '—'}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Track business costs — feeds the Profit & Loss report under Reports"
        actions={<Button size="sm" onClick={openCreate}><PlusIcon className="h-4 w-4" /> Add Expense</Button>}
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Expenses (this view)" value={formatCurrency(totalThisPage)} icon={<BanknotesIcon className="h-5 w-5" />} />
        <StatCard label="Total Records" value={total} icon={<BanknotesIcon className="h-5 w-5" />} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by description, vendor, category..." className="sm:max-w-xs" />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea]"
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <span className="text-sm text-slate-500">{expenses.length} expense{expenses.length === 1 ? '' : 's'}</span>
      </div>

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <Card>
        <DataTable
          tableId="expenses_table"
          columns={columns}
          data={expenses}
          rowKey={(e) => e.id}
          loading={loading}
          showToolbar
          totalEntries={expenses.length}
          emptyMessage='No expenses found. Click "Add Expense" to record one.'
          actions={(expense) => (
            <div className="flex justify-end gap-3">
              <button onClick={() => openEdit(expense)} className="text-slate-400 hover:text-[var(--primary)]" aria-label="Edit">
                <PencilSquareIcon className="h-4 w-4" />
              </button>
              <button onClick={() => handleDelete(expense)} className="text-slate-400 hover:text-red-600" aria-label="Delete">
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
              <h3 className="text-lg font-semibold text-slate-900">{editingId ? 'Edit Expense' : 'Add Expense'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Category" required>
                  <input
                    type="text"
                    list="expense-category-suggestions"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className={getInputClassName()}
                    placeholder="e.g. Rent"
                  />
                  <datalist id="expense-category-suggestions">
                    {Array.from(new Set([...COMMON_CATEGORIES, ...categories])).map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </FormField>

                <FormField label="Amount" required>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className={getInputClassName()}
                    placeholder="0.00"
                  />
                </FormField>
              </div>

              <FormField label="Description" required>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className={getInputClassName()}
                  placeholder="What was this expense for?"
                />
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Date" required>
                  <input
                    type="date"
                    value={formData.expenseDate}
                    onChange={(e) => setFormData({ ...formData, expenseDate: e.target.value })}
                    className={getInputClassName()}
                  />
                </FormField>

                <FormField label="Payment Method">
                  <select
                    value={formData.paymentMethod}
                    onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                    className={getInputClassName()}
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </FormField>
              </div>

              <FormField label="Vendor">
                <input
                  type="text"
                  value={formData.vendor}
                  onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                  className={getInputClassName()}
                  placeholder="Who was paid"
                />
              </FormField>

              <FormField label="Notes">
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className={getInputClassName()}
                  placeholder="Optional notes"
                />
              </FormField>

              <div className="mt-4 flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={submitting}>
                  {submitting ? 'Saving...' : editingId ? 'Update Expense' : 'Save Expense'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
