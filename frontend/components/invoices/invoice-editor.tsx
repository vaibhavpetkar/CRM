'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { invoicesApi, documentTemplatesApi, openPrintWindow } from '@/lib/api';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import StatusBadge from '@/components/ui/status-badge';
import LoadingSpinner from '@/components/ui/loading-spinner';
import CompanyAutocomplete from '@/components/ui/company-autocomplete';
import ItemAutocomplete, { ItemSuggestion } from '@/components/ui/item-autocomplete';
import { formatCurrency } from '@/lib/utils';
import { ArrowLeftIcon, PlusIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useToast } from '@/components/ui/toast';
import PrintButton from '@/components/ui/print-button';
import { useKeyboardShortcuts } from '@/lib/hooks/useKeyboardShortcuts';

type LineItem = { itemId: number | ''; productName: string; quantity: number; unit: string; rate: number };
type TaxLine = { taxId: number | null; taxType: string; percentage: number };

const INVOICE_STATUSES = ['draft', 'pending', 'partial', 'paid', 'overdue', 'cancelled'];

const inputClass = 'mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm focus:border-[var(--primary)] focus:outline-none';

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const emptyForm = () => ({
  client: '',
  customerEmail: '',
  customerPhone: '',
  customerAddress: '',
  companyAddress: '',
  status: 'draft',
  issuedDate: today(),
  dueDate: inDays(30),
  amount: 0,
  discountType: 'percentage',
  discountValue: 0,
  shippingCharges: 0,
  terms: '',
  paymentTerms: '',
  notes: '',
});

/**
 * Full-page invoice editor, modeled on the quotation page: client details,
 * line items with taxes picked up from the item master, discount, shipping,
 * terms and a live totals preview. `invoiceId` omitted = create mode.
 */
export default function InvoiceEditor({ invoiceId, autoPrint = false }: { invoiceId?: string; autoPrint?: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const isNew = !invoiceId;

  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<any>(emptyForm);
  const [lineItems, setLineItems] = useState<LineItem[]>(isNew ? [{ itemId: '', productName: '', quantity: 1, unit: 'Nos', rate: 0 }] : []);
  const [taxLines, setTaxLines] = useState<TaxLine[]>([]);

  const loadInvoice = useCallback((data: any) => {
    setInvoice(data);
    setFormData({
      ...emptyForm(),
      ...data,
      customerEmail: data.customerEmail || '',
      customerPhone: data.customerPhone || '',
      customerAddress: data.customerAddress || '',
      companyAddress: data.companyAddress || '',
      issuedDate: data.issuedDate ? String(data.issuedDate).slice(0, 10) : '',
      dueDate: data.dueDate ? String(data.dueDate).slice(0, 10) : '',
      amount: Number(data.amount) || 0,
      discountType: data.discountType === 'percentage' ? 'percentage' : 'fixed',
      discountValue: Number(data.discountValue) || 0,
      shippingCharges: Number(data.shippingCharges) || 0,
      terms: data.terms || '',
      paymentTerms: data.paymentTerms || '',
      notes: data.notes || '',
    });
    setLineItems((data.products || []).map((p: any) => ({ itemId: p.itemId || '', productName: p.productName, quantity: Number(p.quantity) || 1, unit: p.unit || 'Nos', rate: Number(p.rate) || 0 })));
    setTaxLines((data.taxes || []).map((t: any) => ({ taxId: t.taxId ?? null, taxType: t.taxType, percentage: Number(t.percentage) || 0 })));
  }, []);

  const fetchInvoice = useCallback(async () => {
    if (!invoiceId) return;
    setLoading(true);
    setError(null);
    try {
      loadInvoice(await invoicesApi.getInvoice(invoiceId));
    } catch (err: any) {
      setError(err.message || 'Failed to load invoice. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }, [invoiceId, loadInvoice]);

  useEffect(() => {
    fetchInvoice();
  }, [fetchInvoice]);

  // "?print=1" links open the invoice's real print format once, instead of
  // printing this edit form. Runs without a click, so a blocked pop-up is
  // expected; the Print button still works.
  const printedFromLink = useRef(false);
  useEffect(() => {
    if (autoPrint && !loading && invoice && !printedFromLink.current) {
      printedFromLink.current = true;
      openPrintWindow(documentTemplatesApi.getPrintHtml('invoice', invoice.id)).catch(() => {});
    }
  }, [autoPrint, loading, invoice]);

  const handleCompanySelect = (company: any) => {
    setFormData((prev: any) => ({
      ...prev,
      client: company.name,
      customerEmail: company.email || '',
      customerPhone: company.phone || '',
      customerAddress: company.address || '',
    }));
  };

  const filledLines = lineItems.filter((l) => l.productName);
  // With no line items the invoice is a lump sum and the amount is typed in
  // directly (how invoices worked before, and how imported ones arrive).
  const isLumpSum = filledLines.length === 0;

  // Live preview — mirrors recalculateInvoiceTotals on the backend.
  const totals = useMemo(() => {
    if (isLumpSum) {
      const amount = Number(formData.amount) || 0;
      return { subtotal: amount, discountAmount: 0, taxTotal: 0, shipping: 0, grandTotal: amount };
    }
    const subtotal = filledLines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.rate), 0);
    const discountValue = Number(formData.discountValue) || 0;
    const discountAmount = formData.discountType === 'percentage' ? (subtotal * discountValue) / 100 : discountValue;
    const discountedSubtotal = Math.max(0, subtotal - discountAmount);
    const taxTotal = taxLines.reduce((sum, t) => sum + (discountedSubtotal * Number(t.percentage)) / 100, 0);
    const shipping = Number(formData.shippingCharges) || 0;
    return { subtotal, discountAmount, taxTotal, shipping, grandTotal: discountedSubtotal + taxTotal + shipping };
  }, [isLumpSum, filledLines, taxLines, formData.amount, formData.discountType, formData.discountValue, formData.shippingCharges]);

  const addTaxFromItem = (item: ItemSuggestion) => {
    if (item.taxId == null) return;
    setTaxLines((prev) => (prev.some((t) => t.taxId === item.taxId) ? prev : [...prev, { taxId: item.taxId, taxType: item.taxType || 'Tax', percentage: item.taxRate || 0 }]));
  };

  const updateLine = (idx: number, patch: Partial<LineItem>) => {
    setLineItems((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const handleSave = async () => {
    if (!formData.client?.trim()) {
      toast.warning('Client is required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        client: formData.client,
        customerEmail: formData.customerEmail,
        customerPhone: formData.customerPhone,
        customerAddress: formData.customerAddress,
        companyAddress: formData.companyAddress,
        status: formData.status,
        issuedDate: formData.issuedDate || null,
        dueDate: formData.dueDate || null,
        amount: isLumpSum ? Number(formData.amount) || 0 : undefined,
        discountType: formData.discountType,
        discountValue: Number(formData.discountValue) || 0,
        shippingCharges: Number(formData.shippingCharges) || 0,
        terms: formData.terms,
        paymentTerms: formData.paymentTerms,
        notes: formData.notes,
        products: filledLines.map((l) => ({ itemId: l.itemId || null, productName: l.productName, quantity: l.quantity, unit: l.unit, rate: l.rate })),
        taxes: isLumpSum ? [] : taxLines.map((t) => ({ taxId: t.taxId, taxType: t.taxType, percentage: t.percentage })),
      };
      if (isNew) {
        const res = await invoicesApi.createInvoice(payload);
        toast.success(`Invoice ${res.invoice?.invoiceNumber || ''} created.`);
        router.replace(`/invoices/${res.invoice.id}`);
      } else {
        const res = await invoicesApi.updateInvoice(invoiceId, payload);
        toast.success('Invoice saved.');
        loadInvoice(res.invoice);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to save invoice');
    } finally {
      setSaving(false);
    }
  };

  useKeyboardShortcuts({
    onEscape: () => router.push('/invoices'),
    onSave: () => {
      if (!saving) handleSave();
    },
  });

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <LoadingSpinner size="md" />
      </div>
    );
  }
  if (error || (!isNew && !invoice)) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error || 'Invoice not found.'}</div>;
  }

  const title = isNew ? 'New Invoice' : invoice.invoiceNumber;

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center gap-3 no-print">
        <button onClick={() => router.push('/invoices')} className="text-slate-400 hover:text-slate-600" aria-label="Back to invoices">
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {!isNew && <StatusBadge status={invoice.status} />}
        {invoice?.quoteRef && (
          <Link href={`/quotes/${invoice.quoteRef.id}`} className="text-xs font-medium text-[var(--primary)] hover:underline">
            From {invoice.quoteRef.quoteNumber} →
          </Link>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {!isNew && invoice && <PrintButton docType="invoice" id={invoice.id} />}
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : isNew ? 'Create Invoice' : 'Save'}
          </Button>
        </div>
      </div>
      {/* Plain header shown only when printing, since the toolbar above is hidden */}
      <div className="hidden print:flex items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {!isNew && <StatusBadge status={invoice.status} />}
      </div>

      <Card title="Client Details">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700">Client *</label>
            <CompanyAutocomplete
              value={formData.client || ''}
              onChange={(val) => setFormData({ ...formData, client: val })}
              onSelect={handleCompanySelect}
              placeholder="Type client name to search..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Customer Email</label>
            <input type="email" value={formData.customerEmail} onChange={(e) => setFormData({ ...formData, customerEmail: e.target.value })} placeholder="client@example.com" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Customer Phone</label>
            <input
              type="tel"
              maxLength={10}
              value={formData.customerPhone}
              onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value.replace(/\D/g, '') })}
              placeholder="10-digit number"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Status</label>
            <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} className={inputClass}>
              {INVOICE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Issued Date</label>
            <input type="date" value={formData.issuedDate} onChange={(e) => setFormData({ ...formData, issuedDate: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Due Date</label>
            <input type="date" value={formData.dueDate} onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Customer Address</label>
            <textarea value={formData.customerAddress} onChange={(e) => setFormData({ ...formData, customerAddress: e.target.value })} rows={2} placeholder="Client billing address..." className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Company Address</label>
            <textarea value={formData.companyAddress} onChange={(e) => setFormData({ ...formData, companyAddress: e.target.value })} rows={2} placeholder="Your company address..." className={inputClass} />
          </div>
        </div>
      </Card>

      <Card
        title="Line Items"
        action={
          <button
            type="button"
            onClick={() => setLineItems([...lineItems, { itemId: '', productName: '', quantity: 1, unit: 'Nos', rate: 0 }])}
            className="no-print flex items-center gap-1 text-xs font-medium text-[var(--primary)] hover:underline"
          >
            <PlusIcon className="h-3.5 w-3.5" /> Add Item
          </button>
        }
      >
        {lineItems.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No line items. Add items, or enter a lump-sum amount under Totals.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="p-2 text-left">Item</th>
                  <th className="p-2 text-left">Qty</th>
                  <th className="p-2 text-left">Unit</th>
                  <th className="p-2 text-left">Rate</th>
                  <th className="p-2 text-left">Amount</th>
                  <th className="p-2 no-print"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lineItems.map((row, idx) => (
                  <tr key={idx}>
                    <td className="p-2">
                      <ItemAutocomplete
                        value={row.productName}
                        // Typing clears any prior match — itemId only comes from onSelect.
                        onChange={(text) => updateLine(idx, { productName: text, itemId: '' })}
                        onSelect={(item) => {
                          updateLine(idx, { itemId: item.id, productName: item.itemName, unit: item.unit, rate: item.sellingPrice });
                          addTaxFromItem(item);
                        }}
                        placeholder="Type item name..."
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        min={0}
                        value={row.quantity}
                        onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) })}
                        className="w-20 rounded-lg border border-slate-200 p-1.5 text-sm focus:border-[var(--primary)] focus:outline-none"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        value={row.unit}
                        onChange={(e) => updateLine(idx, { unit: e.target.value })}
                        className="w-20 rounded-lg border border-slate-200 p-1.5 text-sm focus:border-[var(--primary)] focus:outline-none"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        min={0}
                        value={row.rate}
                        onChange={(e) => updateLine(idx, { rate: Number(e.target.value) })}
                        className="w-28 rounded-lg border border-slate-200 p-1.5 text-sm focus:border-[var(--primary)] focus:outline-none"
                      />
                    </td>
                    <td className="p-2 font-medium text-slate-900">{formatCurrency(row.quantity * row.rate)}</td>
                    <td className="p-2 text-right no-print">
                      <button type="button" onClick={() => setLineItems(lineItems.filter((_, i) => i !== idx))} className="text-slate-400 hover:text-red-600" aria-label="Remove item">
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {taxLines.length > 0 && !isLumpSum && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Taxes:</span>
            {taxLines.map((t, idx) => (
              <span key={`${t.taxId}-${idx}`} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
                {t.taxType} ({t.percentage}%)
                <button type="button" onClick={() => setTaxLines(taxLines.filter((_, i) => i !== idx))} className="no-print text-slate-400 hover:text-red-600" aria-label={`Remove ${t.taxType}`}>
                  <XMarkIcon className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </Card>

      <Card title="Totals">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="space-y-3">
            {isLumpSum ? (
              <div>
                <label className="block text-sm font-medium text-slate-700">Amount *</label>
                <input type="number" min={0} value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} className={inputClass} />
                <p className="mt-1 text-xs text-slate-400">Add line items to have the total calculated automatically.</p>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Discount Type</label>
                  <select value={formData.discountType} onChange={(e) => setFormData({ ...formData, discountType: e.target.value })} className={inputClass}>
                    <option value="percentage">Percentage</option>
                    <option value="fixed">Fixed Amount</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Discount Value</label>
                  <input type="number" min={0} value={formData.discountValue} onChange={(e) => setFormData({ ...formData, discountValue: Number(e.target.value) })} className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Shipping Charges</label>
                  <input type="number" min={0} value={formData.shippingCharges} onChange={(e) => setFormData({ ...formData, shippingCharges: Number(e.target.value) })} className={inputClass} />
                </div>
              </>
            )}
          </div>
          <div className="space-y-2 rounded-lg bg-slate-50 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Subtotal</span>
              <span className="font-medium text-slate-900">{formatCurrency(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Discount</span>
              <span className="font-medium text-slate-900">-{formatCurrency(totals.discountAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Tax</span>
              <span className="font-medium text-slate-900">{formatCurrency(totals.taxTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Shipping</span>
              <span className="font-medium text-slate-900">{formatCurrency(totals.shipping)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base">
              <span className="font-semibold text-slate-900">Grand Total</span>
              <span className="font-bold text-[var(--primary)]">{formatCurrency(totals.grandTotal)}</span>
            </div>
            {!isNew && (
              <>
                <div className="flex justify-between pt-2">
                  <span className="text-slate-500">Paid</span>
                  <span className="font-medium text-emerald-600">{formatCurrency(invoice.totalPaid || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Balance Due</span>
                  <span className="font-medium text-slate-900">{formatCurrency(totals.grandTotal - (invoice.totalPaid || 0))}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </Card>

      <Card title="Terms & Notes">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700">Payment Terms</label>
            <textarea value={formData.paymentTerms} onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })} rows={3} placeholder="e.g. 100% within 30 days of invoice" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Terms & Conditions</label>
            <textarea value={formData.terms} onChange={(e) => setFormData({ ...formData, terms: e.target.value })} rows={3} className={inputClass} />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700">Notes</label>
            <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} placeholder="Internal or customer-facing notes..." className={inputClass} />
          </div>
        </div>
      </Card>
    </div>
  );
}
