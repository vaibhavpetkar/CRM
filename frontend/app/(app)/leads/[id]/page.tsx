'use client';

import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { leadsApi, contactsApi, usersApi, quotesApi, itemsApi, aiApi, getStoredUser } from '@/lib/api';
import { hasPermission } from '@/lib/permissions';
import { ANNUAL_TURNOVER_OPTIONS, INDUSTRY_OPTIONS, DESIGNATION_OPTIONS, TERRITORY_OPTIONS } from '@/lib/lead-options';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import DataTable from '@/components/ui/data-table';
import CompanyAutocomplete from '@/components/ui/company-autocomplete';
import AISummaryPanel from '@/components/ui/ai-summary-panel';
import { ArrowLeftIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useToast } from '@/components/ui/toast';
import { useKeyboardShortcuts } from '@/lib/hooks/useKeyboardShortcuts';

export default function LeadDetailsPage() {
  const toast = useToast();
  const params = useParams();
  const router = useRouter();
  const leadId = params.id as string;

  const [lead, setLead] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<any>({});
  const [activeTab, setActiveTab] = useState('lead-form');
  const [timeline, setTimeline] = useState<any[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [revertingId, setRevertingId] = useState<number | string | null>(null);

  // Assign To — name typeahead datalist, resolved back to a user ID on save.
  const [assignableUsers, setAssignableUsers] = useState<{ id: number; name: string }[]>([]);
  const [assignedToName, setAssignedToName] = useState('');
  // Qualified By — same pattern as Assign To, used on the RFQ Details tab.
  const [qualifiedByName, setQualifiedByName] = useState('');

  // Interested Items (RFQ Details tab) — backed by LeadProduct rows. Whatever is
  // saved here automatically flows into any Quote generated from this lead via
  // "Send Quotation" (see QuoteService.createFromLead on the backend).
  const [interestedItems, setInterestedItems] = useState<
    { itemId: number | ''; productName: string; quantity: number; unit: string; expectedPrice: number }[]
  >([]);
  const [itemCatalog, setItemCatalog] = useState<
    { id: number; itemName: string; unit: string; sellingPrice: number; taxId: number | null; taxType: string | null; taxRate: number | null }[]
  >([]);

  // Handle company selection from autocomplete
  const handleCompanySelect = (company: any) => {
    // Auto-populate related fields
    if (company.email) setFormData({ ...formData, email: company.email });
    if (company.phone) setFormData({ ...formData, phone: company.phone });
    if (company.address) setFormData({ ...formData, street: company.address });
    if (company.website) setFormData({ ...formData, website: company.website });
    if (company.industry) setFormData({ ...formData, industry: company.industry });
    // If it's a contact, also populate contact person fields
    if (company.contactName) {
      const [firstName, ...lastNameParts] = company.contactName.split(' ');
      setFormData({ ...formData, firstName, lastName: lastNameParts.join(' ') });
      if (company.contactTitle) setFormData({ ...formData, jobTitle: company.contactTitle });
    }
  };

  useEffect(() => {
    itemsApi
      .getItems({ limit: 500, isActive: true })
      .then((res) =>
        setItemCatalog(
          (res.items || []).map((i: any) => ({
            id: i.id,
            itemName: i.itemName,
            unit: i.unit,
            sellingPrice: Number(i.sellingPrice) || 0,
            taxId: i.tax?.id ?? null,
            taxType: i.tax?.taxType ?? null,
            taxRate: i.tax ? Number(i.tax.rate) : null,
          }))
        )
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    usersApi
      .getAssignableUsers()
      .then((res) => setAssignableUsers(res.users.map((u) => ({ id: u.id, name: u.name }))))
      .catch(() => setAssignableUsers([]));
  }, []);

  useEffect(() => {
    if (leadId) {
      fetchLead();
    }
  }, [leadId]);

  const fetchLead = async () => {
    setLoading(true);
    try {
      const data = await leadsApi.getLead(leadId); // Need to make sure this API method exists
      setLead(data);
      setFormData(data);
      setAssignedToName(data.assignedTo || '');
      setQualifiedByName(data.qualifiedBy || '');
      setInterestedItems(
        (data.products || []).map((p: any) => ({
          itemId: p.itemId || '',
          productName: p.productName,
          quantity: Number(p.quantity) || 1,
          unit: p.unit || 'Nos',
          expectedPrice: Number(p.expectedPrice) || 0,
        }))
      );
    } catch (err: any) {
      setError(err.message || 'Failed to fetch lead details');
    } finally {
      setLoading(false);
    }
  };

  const fetchTimeline = async () => {
    setTimelineLoading(true);
    try {
      const res = await leadsApi.getLeadTimeline(leadId);
      setTimeline(res.timeline || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setTimelineLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'activity') fetchTimeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handleRevert = async (logId: number | string) => {
    if (!confirm('Revert this change? This creates a new timeline entry restoring the previous values.')) return;
    setRevertingId(logId);
    try {
      await leadsApi.revertLeadChange(leadId, logId);
      toast.success('Change reverted.');
      fetchLead();
      fetchTimeline();
    } catch (err: any) {
      toast.error(err.message || 'Failed to revert change');
    } finally {
      setRevertingId(null);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    // Task 2.7: Mobile Number is mandatory. The bottom form-submit button also
    // gets this for free via the input's `required` attribute + native HTML5
    // validation, but the toolbar "Save" button above calls handleSave directly
    // (not a real form submit), so it needs its own explicit check too.
    if (!String(formData.mobile || '').trim()) {
      toast.warning('Mobile Number is required.');
      return;
    }

    // Resolve the typed "Assign To" name into a user ID via the datalist options.
    let resolvedAssignedToId: number | null = formData.assignedToId ?? null;
    const typedAssignee = assignedToName.trim();
    if (typedAssignee) {
      const match = assignableUsers.find((u) => u.name.toLowerCase() === typedAssignee.toLowerCase());
      if (!match) {
        toast.warning(`No user found named "${typedAssignee}". Please pick a name from the suggestions.`);
        return;
      }
      resolvedAssignedToId = match.id;
    } else {
      resolvedAssignedToId = null;
    }

    // Resolve the typed "Qualified By" name the same way.
    let resolvedQualifiedById: number | null = formData.qualifiedById ?? null;
    const typedQualifier = qualifiedByName.trim();
    if (typedQualifier) {
      const match = assignableUsers.find((u) => u.name.toLowerCase() === typedQualifier.toLowerCase());
      if (!match) {
        toast.warning(`No user found named "${typedQualifier}". Please pick a name from the suggestions.`);
        return;
      }
      resolvedQualifiedById = match.id;
    } else {
      resolvedQualifiedById = null;
    }

    setSaving(true);
    try {
      await leadsApi.updateLead(leadId, {
        ...formData,
        assignedToId: resolvedAssignedToId,
        qualifiedById: resolvedQualifiedById,
        products: interestedItems
          .filter((p) => p.productName)
          .map((p) => ({
            itemId: p.itemId || null,
            productName: p.productName,
            quantity: p.quantity,
            unit: p.unit,
            expectedPrice: p.expectedPrice,
          })),
        taxes: Array.from(
          new Map(
            interestedItems
              .map((p) => itemCatalog.find((c) => c.id === p.itemId))
              .filter((c): c is (typeof itemCatalog)[number] => !!c && c.taxId != null)
              .map((c) => [c.taxId, { taxId: c.taxId, taxType: c.taxType || 'Tax', percentage: c.taxRate || 0 }])
          ).values()
        ),
      });
      toast.success('Lead updated successfully');
      fetchLead();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update lead');
    } finally {
      setSaving(false);
    }
  };

  useKeyboardShortcuts({
    enabled: !loading && !error && !!lead,
    onEscape: () => {
      router.push('/leads');
    },
    onSave: () => {
      handleSave({ preventDefault: () => {} } as FormEvent);
    },
  });

  if (loading) return <div className="p-8 text-center text-slate-500">Loading lead details...</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;
  if (!lead) return <div className="p-8 text-center text-slate-500">Lead not found</div>;

  const handleConvertToDeal = async () => {
    if (lead?.isConverted) {
      toast.warning('This lead has already been converted.');
      return;
    }
    setSaving(true);
    try {
      const result = await leadsApi.convertLead(leadId, { createDeal: true });
      toast.success('Lead converted to a deal.');
      if (result.deal?.id) {
        router.push('/pipeline');
      } else {
        fetchLead();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to convert lead');
    } finally {
      setSaving(false);
    }
  };

  const handleSendQuotation = async () => {
    setSaving(true);
    try {
      const res = await quotesApi.createQuoteFromLead(leadId);
      toast.success(`Quotation ${res.quote?.quoteNumber || ''} created.`);
      router.push(`/quotes/${res.quote.id}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create quotation');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center gap-4">
        <button onClick={() => router.push('/leads')} className="text-slate-400 hover:text-slate-600">
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold text-slate-900 flex-1">
          {lead.firstName} {lead.lastName}
        </h1>
        <Button type="button" variant="secondary" size="sm" onClick={handleSendQuotation} disabled={saving}>
          Create Quotation
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={handleConvertToDeal} disabled={saving || lead?.isConverted}>
          {lead?.isConverted ? 'Converted to Deal' : 'Convert to Deal'}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={saving}
          onClick={() => handleSave({ preventDefault: () => {} } as FormEvent)}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>

      <div className="flex gap-4 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('lead-form')}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${
            activeTab === 'lead-form' ? 'border-[#168eea] text-[#168eea]' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Lead Form
        </button>
        <button
          onClick={() => setActiveTab('rfq')}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${
            activeTab === 'rfq' ? 'border-[#168eea] text-[#168eea]' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          RFQ Details
        </button>
        <button
          onClick={() => setActiveTab('activity')}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${
            activeTab === 'activity' ? 'border-[#168eea] text-[#168eea]' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Activity
        </button>
      </div>

      {activeTab === 'lead-form' && (
        <Card>
          <form onSubmit={handleSave} className="space-y-8">
            {/* Top row: Date / Series / Status */}
            <div className="grid grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700">Date</label>
                <input
                  type="date"
                  value={formData.date ? String(formData.date).slice(0, 10) : ''}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Series ID</label>
                <input
                  type="text"
                  readOnly
                  value={formData.leadNumber || ''}
                  className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 p-2 text-sm text-slate-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Status</label>
                <select
                  value={formData.status || ''}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                >
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="working">Working / In Progress</option>
                  <option value="qualified">Qualified</option>
                  <option value="unqualified">Unqualified / Disqualified</option>
                  <option value="converted">Converted</option>
                  <option value="lost">Lost</option>
                </select>
              </div>
            </div>

            {/* Company Details */}
            <div>
              <h4 className="mb-3 border-b border-slate-100 pb-2 text-sm font-semibold text-slate-900">Company Details</h4>
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Company Name</label>
                  <CompanyAutocomplete
                    value={formData.company || ''}
                    onChange={(val) => setFormData({ ...formData, company: val })}
                    onSelect={handleCompanySelect}
                    placeholder="Type company name to search..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Website</label>
                  <input
                    type="text"
                    value={formData.website || ''}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Annual Turnover</label>
                  <select
                    value={formData.annualRevenue || ''}
                    onChange={(e) => setFormData({ ...formData, annualRevenue: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  >
                    <option value="">— Select —</option>
                    {ANNUAL_TURNOVER_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Source</label>
                  <select
                    value={formData.leadSource || ''}
                    onChange={(e) => setFormData({ ...formData, leadSource: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  >
                    <option value="website">Website</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="referral">Referral</option>
                    <option value="event">Event</option>
                    <option value="social-media">Social Media</option>
                    <option value="cold-call">Cold Call</option>
                    <option value="email">Email</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Industry</label>
                  <select
                    value={formData.industry || ''}
                    onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  >
                    <option value="">— Select —</option>
                    {INDUSTRY_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Next Follow-up Schedule</label>
                  <input
                    type="date"
                    value={formData.nextFollowUp ? String(formData.nextFollowUp).slice(0, 10) : ''}
                    onChange={(e) => setFormData({ ...formData, nextFollowUp: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">Saving a new date auto-creates a follow-up task for the lead owner.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Territory</label>
                  <input
                    type="text"
                    list="territory-options"
                    placeholder="Search district..."
                    value={formData.territory || ''}
                    onChange={(e) => setFormData({ ...formData, territory: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                  <datalist id="territory-options">
                    {TERRITORY_OPTIONS.map((opt) => (
                      <option key={opt} value={opt} />
                    ))}
                  </datalist>
                </div>
              </div>
            </div>

            {/* Personal Details */}
            <div>
              <h4 className="mb-3 border-b border-slate-100 pb-2 text-sm font-semibold text-slate-900">Personal Details</h4>
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Salutation</label>
                  <select
                    value={formData.prefix || ''}
                    onChange={(e) => setFormData({ ...formData, prefix: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  >
                    <option value="">—</option>
                    <option value="Mr.">Mr.</option>
                    <option value="Mrs.">Mrs.</option>
                    <option value="Ms.">Ms.</option>
                    <option value="Miss">Miss</option>
                    <option value="Dr.">Dr.</option>
                    <option value="Prof.">Prof.</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">First Name</label>
                  <input
                    type="text"
                    value={formData.firstName || ''}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Last Name</label>
                  <input
                    type="text"
                    value={formData.lastName || ''}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Email</label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Designation</label>
                  <select
                    value={formData.jobTitle || ''}
                    onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  >
                    <option value="">— Select —</option>
                    {DESIGNATION_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Telephone</label>
                  <input
                    type="tel"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>
<div>
                      <label className="block text-sm font-medium text-slate-700">Mobile Number <span className="text-red-500">*</span></label>
                      <input
                        type="tel"
                        required
                        maxLength={10}
                        value={formData.mobile || ''}
                        onChange={(e) => setFormData({ ...formData, mobile: e.target.value.replace(/\D/g, '') })}
                        placeholder="10-digit number"
                        className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Alternate Mobile</label>
                      <input
                        type="tel"
                        maxLength={10}
                        value={formData.alternateMobile || ''}
                        onChange={(e) => setFormData({ ...formData, alternateMobile: e.target.value.replace(/\D/g, '') })}
                        placeholder="10-digit number"
                        className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                      />
                    </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Assigned To (Lead Owner)</label>
                  <input
                    type="text"
                    list="assignable-users-list-detail"
                    value={assignedToName}
                    onChange={(e) => setAssignedToName(e.target.value)}
                    placeholder="Start typing a name..."
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                  <datalist id="assignable-users-list-detail">
                    {assignableUsers.map((u) => (
                      <option key={u.id} value={u.name} />
                    ))}
                  </datalist>
                  <p className="mt-1 text-[11px] text-slate-400">The owner is notified automatically when assigned or follow-up tasks are created.</p>
                </div>
                <div className="col-span-3">
                  <label className="block text-sm font-medium text-slate-700">Address (Multi-line)</label>
                  <textarea
                    value={formData.street || ''}
                    onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                    rows={2}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">City</label>
                  <input
                    type="text"
                    value={formData.city || ''}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">State</label>
                  <input
                    type="text"
                    value={formData.state || ''}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Pincode</label>
                  <input
                    type="text"
                    value={formData.zipCode || ''}
                    onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Country</label>
                  <input
                    type="text"
                    value={formData.country || ''}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {activeTab === 'rfq' && (
        <Card>
          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700">Interested In — Our Services</label>
                <input
                  type="text"
                  value={formData.interestedInServices || ''}
                  onChange={(e) => setFormData({ ...formData, interestedInServices: e.target.value })}
                  placeholder="e.g. Implementation, Support, Consulting"
                  className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Interested In — Our Products</label>
                <input
                  type="text"
                  value={formData.interestedInProducts || ''}
                  onChange={(e) => setFormData({ ...formData, interestedInProducts: e.target.value })}
                  placeholder="e.g. Product names or SKUs"
                  className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Timeline to Purchase</label>
                <select
                  value={formData.timelineToPurchase || ''}
                  onChange={(e) => setFormData({ ...formData, timelineToPurchase: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                >
                  <option value="">—</option>
                  <option value="immediate">Immediate</option>
                  <option value="1-3-months">1–3 Months</option>
                  <option value="3-6-months">3–6 Months</option>
                  <option value="6-12-months">6–12 Months</option>
                  <option value="unspecified">Unspecified</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Qualified By</label>
                <input
                  type="text"
                  list="qualified-by-list-detail"
                  value={qualifiedByName}
                  onChange={(e) => setQualifiedByName(e.target.value)}
                  placeholder="Start typing a name..."
                  className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                />
                <datalist id="qualified-by-list-detail">
                  {assignableUsers.map((u) => (
                    <option key={u.id} value={u.name} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Meeting Status</label>
                <select
                  value={formData.meetingStatus || ''}
                  onChange={(e) => setFormData({ ...formData, meetingStatus: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                >
                  <option value="">—</option>
                  <option value="unassigned">Default / Unassigned</option>
                  <option value="pending">Pending / Requested</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="completed">Completed</option>
                  <option value="rescheduled">Rescheduled</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="no-show">No Show</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700">Notes</label>
                <textarea
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={4}
                  className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {activeTab === 'activity' && (
        <>
          {hasPermission(getStoredUser(), 'ai:use') && (
            <div className="mb-4">
              <AISummaryPanel onGenerate={() => aiApi.summarizeLead(leadId)} />
            </div>
          )}
          <Card title="Activity Timeline">
          {timelineLoading ? (
            <p className="py-8 text-center text-sm text-slate-400">Loading...</p>
          ) : timeline.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No activity recorded yet.</p>
          ) : (
            <div className="space-y-4">
              {[...timeline].reverse().map((entry) => (
                <div key={entry.id} className="flex gap-3 border-b border-slate-100 pb-4 last:border-0">
                  <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#168eea]" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium capitalize text-slate-900">{entry.action.replace(/_/g, ' ')}</p>
                      <span className="text-xs text-slate-400">{new Date(entry.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-600">{entry.details}</p>
                    {entry.changes && Object.keys(entry.changes).length > 0 && (
                      <div className="mt-2 rounded-md bg-slate-50 p-2 text-xs">
                        {Object.entries(entry.changes as Record<string, { before: any; after: any }>).map(([field, diff]) => (
                          <div key={field} className="flex gap-2">
                            <span className="font-medium text-slate-500">{field}:</span>
                            <span className="text-slate-400 line-through">{String(diff.before ?? '—')}</span>
                            <span>→</span>
                            <span className="text-slate-700">{String(diff.after ?? '—')}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-3">
                      {entry.revertedAt ? (
                        <span className="text-xs font-medium text-slate-400">Reverted on {new Date(entry.revertedAt).toLocaleDateString()}</span>
                      ) : (
                        entry.changes &&
                        Object.keys(entry.changes).length > 0 && (
                          <button
                            onClick={() => handleRevert(entry.id)}
                            disabled={revertingId === entry.id}
                            className="text-xs font-medium text-[#168eea] hover:underline disabled:opacity-50"
                          >
                            {revertingId === entry.id ? 'Reverting...' : 'Revert this change'}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
        </>
      )}
    </div>
  );
}
