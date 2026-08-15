'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { quotesApi } from '@/lib/api';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import StatusBadge from '@/components/ui/status-badge';
import LoadingSpinner from '@/components/ui/loading-spinner';
import CompanyAutocomplete from '@/components/ui/company-autocomplete';
import ItemAutocomplete, { ItemSuggestion } from '@/components/ui/item-autocomplete';
import { formatCurrency } from '@/lib/utils';
import { ArrowLeftIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useToast } from '@/components/ui/toast';
import { useKeyboardShortcuts } from '@/lib/hooks/useKeyboardShortcuts';

type LineItem = { itemId: number | ''; productName: string; quantity: number; unit: string; rate: number };
type TaxLine = { taxId: number | null; taxType: string; percentage: number };

export default function QuoteDetailPage() {
  const toast = useToast();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const quoteId = params.id as string;

  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<any>({});
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [taxLines, setTaxLines] = useState<TaxLine[]>([]);

  // Handle company selection from autocomplete
  const handleCompanySelect = (company: any) => {
    setFormData((prev: any) => ({
      ...prev,
      client: company.name,
      customerEmail: company.email || '',
      customerPhone: company.phone || '',
      customerAddress: company.address || '',
    }));
  };

  const fetchQuote = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await quotesApi.getQuote(quoteId);
      setQuote(data);
      setFormData(data);
      setLineItems((data.products || []).map((p: any) => ({ itemId: p.itemId || '', productName: p.productName, quantity: Number(p.quantity) || 1, unit: p.unit || 'Nos', rate: Number(p.rate) || 0 })));
      setTaxLines((data.taxes || []).map((t: any) => ({ taxId: t.taxId ?? null, taxType: t.taxType, percentage: Number(t.percentage) || 0 })));
    } catch (err: any) {
      setError(err.message || 'Failed to load quotation. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }, [quoteId]);

  useEffect(() => {
    fetchQuote();
  }, [fetchQuote]);

  // Task 3.1: "Print Format" action links here with ?print=1 — auto-open the
  // browser print dialog once the quote data has actually loaded.
  useEffect(() => {
    if (!loading && quote && searchParams.get('print') === '1') {
      const t = setTimeout(() => window.print(), 300);
      return () => clearTimeout(t);
    }
  }, [loading, quote, searchParams]);

  // Live client-side preview of totals — mirrors QuoteService.recalculateTotals on
  // the backend (subtotal -> discount -> +shipping -> tax on discounted subtotal).
  const totals = useMemo(() => {
    const subtotal = lineItems.reduce((sum, l) => sum + Number(l.quantity) * Number(l.rate), 0);
    const discountValue = Number(formData.discountValue) || 0;
    const discountAmount = formData.discountType === 'percentage' ? (subtotal * discountValue) / 100 : discountValue;
    const discountedSubtotal = Math.max(0, subtotal - discountAmount);
    const taxTotal = taxLines.reduce((sum, t) => sum + (discountedSubtotal * Number(t.percentage)) / 100, 0);
    const shipping = Number(formData.shippingCharges) || 0;
    return { subtotal, discountAmount, taxTotal, shipping, grandTotal: discountedSubtotal + taxTotal + shipping };
  }, [lineItems, taxLines, formData.discountType, formData.discountValue, formData.shippingCharges]);

  const addTaxFromItem = (item: ItemSuggestion) => {
    if (item.taxId == null) return;
    setTaxLines((prev) => (prev.some((t) => t.taxId === item.taxId) ? prev : [...prev, { taxId: item.taxId, taxType: item.taxType || 'Tax', percentage: item.taxRate || 0 }]));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await quotesApi.updateQuote(quoteId, {
        client: formData.client,
        customerEmail: formData.customerEmail,
        customerPhone: formData.customerPhone,
        customerAddress: formData.customerAddress,
        quotationDate: formData.quotationDate,
        validUntil: formData.validUntil,
        discountType: formData.discountType || 'percentage',
        discountValue: formData.discountValue || 0,
        shippingCharges: formData.shippingCharges || 0,
        terms: formData.terms,
        paymentTerms: formData.paymentTerms,
        products: lineItems.filter((l) => l.productName).map((l) => ({ itemId: l.itemId || null, productName: l.productName, quantity: l.quantity, unit: l.unit, rate: l.rate })),
        taxes: taxLines.map((t) => ({ taxId: t.taxId, taxType: t.taxType, percentage: t.percentage })),
      });
      toast.success('Quotation saved.');
      fetchQuote();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save quotation');
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (action: 'send' | 'accept' | 'approve' | 'reject') => {
    setBusyAction(action);
    try {
      if (action === 'send') {
        if (!formData.customerEmail) {
          toast.warning('Add a customer email before sending.');
          return;
        }
        const res = await quotesApi.sendQuote(quoteId, { method: 'email', email: formData.customerEmail });
        toast[res.sent ? 'success' : 'warning'](res.sent ? 'Quotation emailed.' : 'Email logged but not sent — SMTP is not configured.');
      } else if (action === 'accept') {
        await quotesApi.acceptQuote(quoteId);
        toast.success('Quotation accepted and converted to a deal.');
      } else if (action === 'approve') {
        const res = await quotesApi.approveQuote(quoteId);
        toast.success(`Approved — Invoice ${res.invoice?.invoiceNumber || ''} created.`);
      } else if (action === 'reject') {
        await quotesApi.rejectQuote(quoteId);
        toast.success('Quotation rejected.');
      }
      fetchQuote();
    } catch (err: any) {
      toast.error(err.message || `Failed to ${action} quotation`);
    } finally {
      setBusyAction(null);
    }
  };

  useKeyboardShortcuts({
    onEscape: () => router.push('/quotes'),
    onSave: () => {
      if (quote?.status !== 'accepted') handleSave();
    },
  });

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <LoadingSpinner size="md" />
      </div>
    );
  }
  if (error || !quote) {
    return <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error || 'Quotation not found.'}</div>;
  }

  const isLocked = quote.status === 'accepted';

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center gap-3 no-print">
        <button onClick={() => router.push('/quotes')} className="text-slate-400 hover:text-slate-600">
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold text-slate-900">{quote.quoteNumber}</h1>
        <StatusBadge status={quote.status} />
        {quote.leadId && (
          <Link href={`/leads/${quote.leadId}`} className="text-xs font-medium text-[#168eea] hover:underline">
            View Lead →
          </Link>
        )}
        {quote.dealId && (
          <Link href="/pipeline" className="text-xs font-medium text-[#168eea] hover:underline">
            View Deal →
          </Link>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => window.print()}>
            Print
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => runAction('send')} disabled={!!busyAction}>
            {busyAction === 'send' ? 'Sending...' : 'Send'}
          </Button>
          {quote.status !== 'accepted' && quote.status !== 'rejected' && (
            <Button type="button" variant="secondary" size="sm" onClick={() => runAction('accept')} disabled={!!busyAction}>
              {busyAction === 'accept' ? 'Accepting...' : 'Accept (Customer)'}
            </Button>
          )}
          {quote.status === 'accepted' && !quote.approvedAt && (
            <Button type="button" variant="secondary" size="sm" onClick={() => runAction('approve')} disabled={!!busyAction}>
              {busyAction === 'approve' ? 'Approving...' : 'Approve → Create Invoice'}
            </Button>
          )}
          {quote.approvedAt && <span className="self-center text-xs font-medium text-emerald-600">Invoice generated ✓</span>}
          <Button type="button" onClick={handleSave} disabled={saving || isLocked}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
      {/* Plain header shown only when printing, since the interactive toolbar above is hidden */}
      <div className="hidden print:flex items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-900">{quote.quoteNumber}</h1>
        <StatusBadge status={quote.status} />
      </div>
      {isLocked && (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
          This quotation has been accepted and can no longer be edited directly — create a revision instead.
        </p>
      )}

      <Card title="Client Details">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700">Client</label>
            <CompanyAutocomplete
              value={formData.client || ''}
              onChange={(val) => setFormData({ ...formData, client: val })}
              onSelect={handleCompanySelect}
              placeholder="Type client name to search..."
              disabled={isLocked}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Customer Email</label>
            <input
              type="email"
              disabled={isLocked}
              value={formData.customerEmail || ''}
              onChange={(e) => setFormData({ ...formData, customerEmail: e.target.value })}
              className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none disabled:bg-slate-50"
            />
          </div>
<div>
              <label className="block text-sm font-medium text-slate-700">Customer Phone</label>
              <input
                type="tel"
                disabled={isLocked}
                maxLength={10}
                value={formData.customerPhone || ''}
                onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value.replace(/\D/g, '') })}
                placeholder="10-digit number"
                className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none disabled:bg-slate-50"
              />
            </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Valid Until</label>
            <input
              type="date"
              disabled={isLocked}
              value={formData.validUntil ? String(formData.validUntil).slice(0, 10) : ''}
              onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
              className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none disabled:bg-slate-50"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700">Customer Address</label>
            <textarea
              disabled={isLocked}
              value={formData.customerAddress || ''}
              onChange={(e) => setFormData({ ...formData, customerAddress: e.target.value })}
              rows={2}
              className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none disabled:bg-slate-50"
            />
          </div>
        </div>
      </Card>

      <Card
        title="Line Items"
        action={
          !isLocked && (
            <button
              type="button"
              onClick={() => setLineItems([...lineItems, { itemId: '', productName: '', quantity: 1, unit: 'Nos', rate: 0 }])}
              className="flex items-center gap-1 text-xs font-medium text-[#168eea] hover:underline"
            >
              <PlusIcon className="h-3.5 w-3.5" /> Add Item
            </button>
          )
        }
      >
        {lineItems.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No line items yet.</p>
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
                  {!isLocked && <th className="p-2"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lineItems.map((row, idx) => (
                  <tr key={idx}>
                    <td className="p-2">
                      {isLocked ? (
                        row.productName
                      ) : (
                        <ItemAutocomplete
                          value={row.productName}
                          onChange={(text) => {
                            const next = [...lineItems];
                            // Typing clears any prior match — itemId is only
                            // ever set from an actual onSelect below, never
                            // guessed from typed text.
                            next[idx] = { ...next[idx], productName: text, itemId: '' };
                            setLineItems(next);
                          }}
                          onSelect={(item) => {
                            const next = [...lineItems];
                            next[idx] = { ...next[idx], itemId: item.id, productName: item.itemName, unit: item.unit, rate: item.sellingPrice };
                            setLineItems(next);
                            addTaxFromItem(item);
                          }}
                          placeholder="Type item name..."
                        />
                      )}
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        min={1}
                        disabled={isLocked}
                        value={row.quantity}
                        onChange={(e) => {
                          const next = [...lineItems];
                          next[idx] = { ...next[idx], quantity: Number(e.target.value) };
                          setLineItems(next);
                        }}
                        className="w-20 rounded-md border border-slate-200 p-1.5 text-sm focus:border-[#168eea] focus:outline-none disabled:bg-slate-50"
                      />
                    </td>
                    <td className="p-2 text-slate-500">{row.unit}</td>
                    <td className="p-2">
                      <input
                        type="number"
                        disabled={isLocked}
                        value={row.rate}
                        onChange={(e) => {
                          const next = [...lineItems];
                          next[idx] = { ...next[idx], rate: Number(e.target.value) };
                          setLineItems(next);
                        }}
                        className="w-28 rounded-md border border-slate-200 p-1.5 text-sm focus:border-[#168eea] focus:outline-none disabled:bg-slate-50"
                      />
                    </td>
                    <td className="p-2 font-medium text-slate-900">{formatCurrency(row.quantity * row.rate)}</td>
                    {!isLocked && (
                      <td className="p-2 text-right">
                        <button type="button" onClick={() => setLineItems(lineItems.filter((_, i) => i !== idx))} className="text-slate-400 hover:text-red-600">
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {taxLines.length > 0 && (
          <p className="mt-3 text-xs text-slate-500">Tax auto-applied from items: {taxLines.map((t) => `${t.taxType} (${t.percentage}%)`).join(', ')}</p>
        )}
      </Card>

      <Card title="Totals">
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700">Discount Type</label>
              <select
                disabled={isLocked}
                value={formData.discountType || 'percentage'}
                onChange={(e) => setFormData({ ...formData, discountType: e.target.value })}
                className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none disabled:bg-slate-50"
              >
                <option value="percentage">Percentage</option>
                <option value="fixed">Fixed Amount</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Discount Value</label>
              <input
                type="number"
                disabled={isLocked}
                value={formData.discountValue || 0}
                onChange={(e) => setFormData({ ...formData, discountValue: Number(e.target.value) })}
                className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Shipping Charges</label>
              <input
                type="number"
                disabled={isLocked}
                value={formData.shippingCharges || 0}
                onChange={(e) => setFormData({ ...formData, shippingCharges: Number(e.target.value) })}
                className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none disabled:bg-slate-50"
              />
            </div>
          </div>
          <div className="space-y-2 rounded-md bg-slate-50 p-4 text-sm">
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
              <span className="font-bold text-[#168eea]">{formatCurrency(totals.grandTotal)}</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
