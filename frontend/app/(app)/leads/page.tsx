'use client';

import { useState, useEffect, useCallback } from 'react';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import StatusBadge from '@/components/ui/status-badge';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import DataTable, { DataTableColumn } from '@/components/ui/data-table';
import ImportExportButtons from '@/components/ui/import-export-buttons';
import { LEAD_FIELDS } from '@/lib/import-export/field-configs';
import { formatCurrency } from '@/lib/utils';
import { leadsApi, usersApi, getStoredUser } from '@/lib/api';
import { hasPermission } from '@/lib/permissions';
import { useKeyboardShortcuts } from '@/lib/hooks/useKeyboardShortcuts';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { PlusIcon, FunnelIcon, XMarkIcon, PencilSquareIcon, TrashIcon, EyeIcon, Squares2X2Icon, ListBulletIcon } from '@heroicons/react/24/outline';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/components/ui/toast';

const emptyForm = {
  // Lead Information
  prefix: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  fax: '',
  mobile: '',
  company: '',
  website: '',
  jobTitle: '',
  leadSource: 'Website',
  status: 'new',
  industry: '',
  noOfEmployees: '',
  annualRevenue: '',
  rating: '',
  emailOptOut: false,
  skypeId: '',
  secondaryEmail: '',
  leadImage: '',
  leadOwnerId: '',
  // Address Information
  country: '',
  state: '',
  city: '',
  street: '',
  zipCode: '',
  latitude: '',
  longitude: '',
  // Description
  description: '',
  // Scoring & Value
  score: 50,
  value: 10000,
  // System fields
  notes: '',
  assignedToId: '',
  sourceDetails: '',
  lastContacted: '',
  nextFollowUp: '',
};

const leadSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Valid email is required'),
  company: z.string().optional(),
  leadSource: z.string().optional(),
  assignedToName: z.string().optional(),
});
type LeadFormValues = z.infer<typeof leadSchema>;

export default function LeadsPage() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  // Drives the "Edit Disabled (No Permission)" warning in the quick-edit context
  // menu. Was previously never computed, so DataTable's `canEdit` prop fell back
  // to its default of `true` and the permission check never actually ran.
  const canEditLeads = hasPermission(getStoredUser(), 'leads:update');
  const [view, setView] = useState<'list' | 'kanban'>('list');
  const [draggedLeadId, setDraggedLeadId] = useState<string | number | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<(string | number)[]>([]);

  const {
    register,
    handleSubmit: hookFormSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LeadFormValues>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      company: '',
      leadSource: 'Website',
      assignedToName: '',
    },
  });
  // Users available to assign leads to (name typeahead datalist)
  const [assignableUsers, setAssignableUsers] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    usersApi
      .getAssignableUsers()
      .then((res) => setAssignableUsers(res.users.map((u) => ({ id: u.id, name: u.name }))))
      .catch(() => setAssignableUsers([]));
  }, []);

  // Support deep-linking from the topbar's Quick Create menu (/leads?quickCreate=1)
  useEffect(() => {
    if (searchParams.get('quickCreate')) {
      setEditingId(null);
      reset({
        firstName: '',
        lastName: '',
        email: '',
        company: '',
        leadSource: 'Website',
        assignedToName: '',
      });
      setIsModalOpen(true);
      router.replace('/leads');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Local inline-edit updater — optimistically patches the leads array so
  // the cell reflects the new value immediately without a full refetch.
  const patchLead = useCallback((lead: any, field: string, value: string) => {
    setLeads((prev) =>
      prev.map((l) => (l.id === lead.id ? { ...l, [field]: value } : l))
    );
    // Persist to backend in the background
    leadsApi.updateLead(lead.id, { [field]: value }).catch(() => {
      // Silently ignore — a full refetch on next navigation will self-heal
    });
  }, []);

  // Resolve a typed name (from the "Assigned To" datalist) back to a user ID,
  // optimistically update the row, and persist — the backend will fire a
  // real notification to the assignee automatically.
  const assignLead = useCallback(
    (lead: any, typedName: string) => {
      const trimmed = typedName.trim();
      if (!trimmed) {
        // Unassign
        setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, assignedTo: null, assignedToId: null } : l)));
        leadsApi.updateLead(lead.id, { assignedToId: null }).catch(() => {});
        return;
      }
      const match = assignableUsers.find((u) => u.name.toLowerCase() === trimmed.toLowerCase());
      if (!match) {
        toast.warning(`No user found named "${trimmed}". Start typing to pick from the suggested list.`);
        return;
      }
      setLeads((prev) =>
        prev.map((l) => (l.id === lead.id ? { ...l, assignedTo: match.name, assignedToId: match.id } : l))
      );
      leadsApi.updateLead(lead.id, { assignedToId: match.id }).catch(() => {
        toast.error('Failed to assign lead. Please try again.');
      });
    },
    [assignableUsers]
  );

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await leadsApi.getLeads({ search, status: filter });
      setLeads(res.leads || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load leads. Is the backend running?');
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, [search, filter]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const openCreate = () => {
    setEditingId(null);
    reset({
      firstName: '',
      lastName: '',
      email: '',
      company: '',
      leadSource: 'Website',
      assignedToName: '',
    });
    setIsModalOpen(true);
  };

  const openEdit = (lead: any) => {
    router.push(`/leads/${lead.id}`);
  };

  const onSubmitForm = async (data: LeadFormValues) => {
    let resolvedAssignedToId: number | null = null;
    const typedAssignee = (data.assignedToName || '').trim();
    if (typedAssignee) {
      const match = assignableUsers.find((u) => u.name.toLowerCase() === typedAssignee.toLowerCase());
      if (!match) {
        toast.warning(`No user found named "${typedAssignee}". Please pick a name from the suggestions.`);
        return;
      }
      resolvedAssignedToId = match.id;
    }

    const payload = {
      ...emptyForm,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      company: data.company,
      leadSource: (data.leadSource || 'Website').toLowerCase().replace(/\s+/g, '-'),
      assignedToId: resolvedAssignedToId,
    };

    try {
      if (editingId) {
        await leadsApi.updateLead(editingId, payload);
      } else {
        await leadsApi.createLead(payload);
      }
      setIsModalOpen(false);
      reset();
      setEditingId(null);
      fetchLeads();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save lead');
    }
  };

  const handleImportRow = async (row: Record<string, any>) => {
    const payload: Record<string, any> = { ...row };
    if (payload.leadSource) payload.leadSource = String(payload.leadSource).toLowerCase().trim().replace(/\s+/g, '-');
    if (payload.status) payload.status = String(payload.status).toLowerCase().trim();
    ['score', 'value', 'noOfEmployees', 'annualRevenue', 'latitude', 'longitude'].forEach((key) => {
      if (payload[key] !== undefined && payload[key] !== '') payload[key] = Number(payload[key]);
      else delete payload[key];
    });
    return leadsApi.createLead(payload);
  };

  const handleDelete = async (lead: any) => {
    const name = lead.name || `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'this lead';
    if (!confirm(`Delete lead "${name}"?`)) return;
    try {
      await leadsApi.deleteLead(lead.id);
      fetchLeads();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete lead');
    }
  };

  useKeyboardShortcuts({
    onEscape: () => {
      if (isModalOpen) setIsModalOpen(false);
    },
    onSave: () => {
      if (isModalOpen) hookFormSubmit(onSubmitForm)();
    },
    onDelete: () => {
      if (isModalOpen) return;
      if (selectedLeadIds.length === 1) {
        const lead = leads.find((l) => l.id === selectedLeadIds[0]);
        if (lead) handleDelete(lead);
      }
    },
  });

  const columns: DataTableColumn<any>[] = [
    {
      header: 'Contact',
      accessor: (lead) => {
        const leadName = lead.name || `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Unnamed';
        return (
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#168eea]/10 text-xs font-semibold text-[#168eea]">
              {leadName.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <Link
                  href={`/leads/${lead.id}`}
                  className="font-semibold text-slate-900 hover:text-[#168eea] hover:underline"
                >
                  {leadName}
                </Link>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-500">
                  #{lead.id}
                </span>
              </div>
              <p className="text-xs text-slate-500">{lead.email || 'No email'}</p>
              {lead.phone && <p className="text-xs text-slate-400">📞 {lead.phone}</p>}
              {lead.mobile && <p className="text-xs text-slate-400">📱 {lead.mobile}</p>}
            </div>
          </div>
        );
      },
    },
    {
      header: 'Company',
      accessor: (lead) => <span className="text-slate-600">{lead.company || '—'}</span>,
      editValue: (lead) => lead.company || '',
      onEdit: (lead, val) => patchLead(lead, 'company', val),
    },
    {
      header: 'Title',
      accessor: (lead) => <span className="text-slate-500 text-sm">{lead.jobTitle || '—'}</span>,
      editValue: (lead) => lead.jobTitle || '',
      onEdit: (lead, val) => patchLead(lead, 'jobTitle', val),
    },
    { header: 'Source', accessor: (lead) => <span className="capitalize text-slate-600">{lead.source || lead.leadSource || 'Website'}</span> },
    { header: 'Status', accessor: (lead) => <StatusBadge status={lead.status} /> },
    { header: 'Industry', accessor: (lead) => <span className="text-slate-500 text-sm">{lead.industry || '—'}</span> },
    {
      header: 'Score',
      accessor: (lead) => (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-12 rounded-full bg-slate-100">
            <div className="h-1.5 rounded-full bg-[#168eea]" style={{ width: `${Math.min(100, lead.score || 0)}%` }} />
          </div>
          <span className="text-slate-600">{lead.score || 0}</span>
        </div>
      ),
    },
    { header: 'Value', accessor: (lead) => <span className="font-medium text-slate-900">{formatCurrency(lead.value || 0)}</span> },
    {
      header: 'Assigned To',
      accessor: (lead) => <span className="text-slate-600">{lead.assignedTo || 'Unassigned'}</span>,
      editValue: (lead) => lead.assignedTo || '',
      onEdit: (lead, val) => assignLead(lead, val),
      editDatalist: { id: 'assignable-users-list', options: assignableUsers.map((u) => u.name) },
    },
    {
      header: 'Last Contact',
      accessor: (lead) => {
        const raw = lead.lastContact || lead.lastContacted;
        return <span className="text-slate-500">{raw ? String(raw).split('T')[0] : 'N/A'}</span>;
      },
    },
    {
      header: 'Next Follow Up',
      accessor: (lead) => {
        const raw = lead.nextFollowUp;
        return <span className="text-slate-500">{raw ? String(raw).split('T')[0] : 'N/A'}</span>;
      },
      editValue: (lead) => (lead.nextFollowUp ? String(lead.nextFollowUp).split('T')[0] : ''),
      editType: 'date',
      onEdit: (lead, val) => patchLead(lead, 'nextFollowUp', val || null as any),
    },
  ];

  return (
    <>
      <PageHeader
        title="Leads"
        description="Track, score, and convert your sales leads"
        actions={
          <>
            <ImportExportButtons
              config={{
                entityName: 'Lead',
                entityNamePlural: 'leads',
                fields: LEAD_FIELDS,
                getExportData: () => leads,
                onImportRow: handleImportRow,
                onImportComplete: fetchLeads,
              }}
            />
            <Button size="sm" onClick={openCreate}><PlusIcon className="h-4 w-4" /> Add Lead</Button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search leads..." className="sm:max-w-xs" />
        <div className="flex items-center gap-2">
          <FunnelIcon className="h-4 w-4 text-slate-400" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea]"
          >
            <option value="all">All Statuses</option>
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="qualified">Qualified</option>
            <option value="proposal">Proposal</option>
            <option value="negotiation">Negotiation</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
          </select>
        </div>
        <span className="text-sm text-slate-500">{leads.length} lead{leads.length === 1 ? '' : 's'}</span>
        <div className="ml-auto flex items-center gap-1 rounded-md border border-slate-200 bg-white p-1">
          <button
            onClick={() => setView('list')}
            className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${
              view === 'list' ? 'bg-[#168eea] text-white' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <ListBulletIcon className="h-4 w-4" /> List
          </button>
          <button
            onClick={() => setView('kanban')}
            className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${
              view === 'kanban' ? 'bg-[#168eea] text-white' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Squares2X2Icon className="h-4 w-4" /> Kanban
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      {view === 'kanban' ? (
        <LeadsKanban
          leads={leads}
          canEdit={canEditLeads}
          draggedLeadId={draggedLeadId}
          setDraggedLeadId={setDraggedLeadId}
          dragOverStatus={dragOverStatus}
          setDragOverStatus={setDragOverStatus}
          onMove={async (leadId, newStatus) => {
            const lead = leads.find((l) => l.id === leadId);
            if (!lead || lead.status === newStatus) return;
            setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l)));
            try {
              await leadsApi.updateLead(leadId, { status: newStatus });
            } catch (err: any) {
              setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status: lead.status } : l)));
              toast.error(err.message || 'Failed to move lead. Please try again.');
            }
          }}
        />
      ) : (
      <Card>
        <DataTable
          columns={columns}
          data={leads}
          rowKey={(l) => l.id}
          loading={loading}
          showToolbar
          canEdit={canEditLeads}
          onSelectionChange={setSelectedLeadIds}
          totalEntries={leads.length}
          emptyMessage='No leads found. Click "Add Lead" to create one.'
          onRowClick={(lead) => router.push(`/leads/${lead.id}`)}
          actions={(lead) => (
            <div className="flex justify-end gap-3">
              <button onClick={() => router.push(`/leads/${lead.id}`)} className="text-slate-400 hover:text-[#168eea]" aria-label="View Details">
                <EyeIcon className="h-4 w-4" />
              </button>
              <button onClick={() => openEdit(lead)} className="text-slate-400 hover:text-[#168eea]" aria-label="Edit">
                <PencilSquareIcon className="h-4 w-4" />
              </button>
              <button onClick={() => handleDelete(lead)} className="text-slate-400 hover:text-red-600" aria-label="Delete">
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          )}
        />
      </Card>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-semibold text-slate-900">{editingId ? 'Edit Lead' : 'Add New Lead'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={hookFormSubmit(onSubmitForm)} className="mt-4 space-y-4">
              <div className="border-b border-slate-200 pb-4">
                <h4 className="text-sm font-medium text-slate-700 mb-3">Mandatory Lead Details</h4>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">First Name *</label>
                    <input
                      type="text"
                      {...register('firstName')}
                      className={`mt-1 w-full rounded-md border-0 bg-slate-100/50 p-2 text-sm focus:bg-white focus:outline-none focus:ring-1 focus:ring-[var(--primary)] ${errors.firstName ? 'ring-1 ring-red-500 bg-red-50' : ''}`}
                    />
                    {errors.firstName && <p className="mt-1 text-[10px] text-red-500">{errors.firstName.message}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Last Name *</label>
                    <input
                      type="text"
                      {...register('lastName')}
                      className={`mt-1 w-full rounded-md border-0 bg-slate-100/50 p-2 text-sm focus:bg-white focus:outline-none focus:ring-1 focus:ring-[var(--primary)] ${errors.lastName ? 'ring-1 ring-red-500 bg-red-50' : ''}`}
                    />
                    {errors.lastName && <p className="mt-1 text-[10px] text-red-500">{errors.lastName.message}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Email *</label>
                    <input
                      type="email"
                      {...register('email')}
                      className={`mt-1 w-full rounded-md border-0 bg-slate-100/50 p-2 text-sm focus:bg-white focus:outline-none focus:ring-1 focus:ring-[var(--primary)] ${errors.email ? 'ring-1 ring-red-500 bg-red-50' : ''}`}
                    />
                    {errors.email && <p className="mt-1 text-[10px] text-red-500">{errors.email.message}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Company</label>
                    <input
                      type="text"
                      {...register('company')}
                      className="mt-1 w-full rounded-md border-0 bg-slate-100/50 p-2 text-sm focus:bg-white focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Lead Source</label>
                    <select
                      {...register('leadSource')}
                      className="mt-1 w-full rounded-md border-0 bg-slate-100/50 p-2 text-sm focus:bg-white focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                    >
                      <option value="Website">Website</option>
                      <option value="LinkedIn">LinkedIn</option>
                      <option value="Referral">Referral</option>
                      <option value="Event">Event</option>
                      <option value="Social Media">Social Media</option>
                      <option value="Cold Call">Cold Call</option>
                      <option value="Email">Email</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Assign To</label>
                    <input
                      type="text"
                      list="assignable-users-list-modal"
                      {...register('assignedToName')}
                      placeholder="Start typing a name..."
                      className="mt-1 w-full rounded-md border-0 bg-slate-100/50 p-2 text-sm focus:bg-white focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                    />
                    <datalist id="assignable-users-list-modal">
                      {assignableUsers.map((u) => (
                        <option key={u.id} value={u.name} />
                      ))}
                    </datalist>
                    <p className="mt-1 text-[11px] text-slate-400">The assignee is notified automatically when assigned.</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : editingId ? 'Update Lead' : 'Save Lead'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];

function LeadsKanban({
  leads,
  canEdit,
  draggedLeadId,
  setDraggedLeadId,
  dragOverStatus,
  setDragOverStatus,
  onMove,
}: {
  leads: any[];
  canEdit: boolean;
  draggedLeadId: string | number | null;
  setDraggedLeadId: (id: string | number | null) => void;
  dragOverStatus: string | null;
  setDragOverStatus: (status: string | null) => void;
  onMove: (leadId: string | number, newStatus: string) => void;
}) {
  const router = useRouter();
  const leadsByStatus = LEAD_STATUSES.reduce((acc, status) => {
    acc[status] = leads.filter((l) => l.status === status);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {LEAD_STATUSES.map((status) => (
        <div
          key={status}
          className="w-72 shrink-0"
          onDragOver={(e) => {
            if (!canEdit) return;
            e.preventDefault();
            setDragOverStatus(status);
          }}
          onDragLeave={() => setDragOverStatus(null)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOverStatus(null);
            if (canEdit && draggedLeadId != null) onMove(draggedLeadId, status);
            setDraggedLeadId(null);
          }}
        >
          <div className="mb-3 flex items-center justify-between">
            <StatusBadge status={status} />
            <span className="text-xs text-slate-500">{leadsByStatus[status]?.length || 0}</span>
          </div>
          <div
            className={`min-h-[80px] space-y-3 rounded-lg p-1 transition-colors ${
              dragOverStatus === status ? 'bg-blue-50 ring-2 ring-[#168eea]/30' : ''
            }`}
          >
            {(leadsByStatus[status] || []).map((lead) => {
              const leadName = lead.name || `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Unnamed';
              return (
                <Card
                  key={lead.id}
                  draggable={canEdit}
                  onDragStart={() => canEdit && setDraggedLeadId(lead.id)}
                  onDragEnd={() => setDraggedLeadId(null)}
                  onClick={() => router.push(`/leads/${lead.id}`)}
                  className={`!border-2 transition-shadow hover:shadow-md ${canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${
                    draggedLeadId === lead.id ? 'opacity-40' : ''
                  }`}
                >
                  <p className="text-sm font-medium text-slate-900">{leadName}</p>
                  <p className="mt-1 text-xs text-slate-500">{lead.company || 'No company'}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-sm font-semibold text-[#168eea]">{formatCurrency(lead.value || 0)}</span>
                    <span className="text-xs text-slate-400">Score {lead.score || 0}</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">{lead.assignedTo || 'Unassigned'}</p>
                </Card>
              );
            })}
            {(!leadsByStatus[status] || leadsByStatus[status].length === 0) && (
              <div className="rounded-lg border-2 border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">
                {canEdit ? 'Drop here' : 'No leads'}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
