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
import { leadsApi, usersApi, salesApi, getStoredUser, PresenceState } from '@/lib/api';
import { TERRITORY_OPTIONS, LEAD_SOURCE_OPTIONS, CONFIGURATION_OPTIONS, PROPERTY_TYPE_OPTIONS, BUDGET_OPTIONS, leadSourceLabel, budgetRange } from '@/lib/lead-options';
import { AgentStatusDot } from '@/components/sales/agent-status';
import { hasPermission } from '@/lib/permissions';
import { useKeyboardShortcuts } from '@/lib/hooks/useKeyboardShortcuts';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { PlusIcon, FunnelIcon, PencilSquareIcon, TrashIcon, EyeIcon, Squares2X2Icon, ListBulletIcon } from '@heroicons/react/24/outline';
import { useToast } from '@/components/ui/toast';

export default function LeadsPage() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [territoryFilter, setTerritoryFilter] = useState('all');
  // Real-estate filters ("More filters" panel). 'all' / '' means no filter.
  const [sourceFilter, setSourceFilter] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [configFilter, setConfigFilter] = useState<string[]>([]);
  const [propertyTypeFilter, setPropertyTypeFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('');
  const [budgetFilter, setBudgetFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  // Typed text waits a moment before searching, so each key press doesn't reload every lead.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [debouncedLocation, setDebouncedLocation] = useState('');
  // Live green/red status of each sales person, for the Assigned To column.
  const [agentStates, setAgentStates] = useState<Map<number, PresenceState>>(new Map());
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
  // Users available to assign leads to (name typeahead datalist)
  const [assignableUsers, setAssignableUsers] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    usersApi
      .getAssignableUsers()
      .then((res) => setAssignableUsers(res.users.map((u) => ({ id: u.id, name: u.name }))))
      .catch(() => setAssignableUsers([]));
    salesApi
      .getActivity()
      .then((res) => setAgentStates(new Map(res.agents.map((a) => [a.userId, a.state]))))
      .catch(() => {});
  }, []);

  // Deep links from Lead Sources / Sales Activity: /leads?leadSource=99acres&dateFrom=...
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    let any = false;
    const take = (key: string, set: (v: string) => void) => {
      const v = q.get(key);
      if (v) {
        set(v);
        any = true;
      }
    };
    take('leadSource', setSourceFilter);
    take('assignedToId', setAssigneeFilter);
    take('dateFrom', setDateFrom);
    take('dateTo', setDateTo);
    take('location', setLocationFilter);
    if (any) setShowFilters(true);
    // Dashboard pipeline stages link here with ?status=..., a top-level filter.
    const status = q.get('status');
    if (status) setFilter(status);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedLocation(locationFilter), 300);
    return () => clearTimeout(t);
  }, [locationFilter]);

  // The topbar's Quick Create menu links here with ?quickCreate=1; Add Lead is a full page now.
  useEffect(() => {
    if (searchParams.get('quickCreate')) router.replace('/leads/new');
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
      const budget = BUDGET_OPTIONS[Number(budgetFilter)];
      const rows = await leadsApi.getAllLeads({
        search: debouncedSearch,
        status: filter,
        territory: territoryFilter,
        leadSource: sourceFilter,
        assignedToId: assigneeFilter,
        configuration: configFilter.join(','),
        propertyType: propertyTypeFilter,
        location: debouncedLocation,
        budgetFrom: budgetFilter !== '' ? budget?.from : undefined,
        budgetTo: budgetFilter !== '' ? budget?.to : undefined,
        dateFrom,
        dateTo,
      });
      setLeads(rows);
    } catch (err: any) {
      setError(err.message || 'Failed to load leads. Is the backend running?');
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filter, territoryFilter, sourceFilter, assigneeFilter, configFilter, propertyTypeFilter, debouncedLocation, budgetFilter, dateFrom, dateTo]);

  const activeFilterCount = [
    sourceFilter !== 'all',
    assigneeFilter !== 'all',
    configFilter.length > 0,
    propertyTypeFilter !== 'all',
    !!locationFilter.trim(),
    budgetFilter !== '',
    !!dateFrom || !!dateTo,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSourceFilter('all');
    setAssigneeFilter('all');
    setConfigFilter([]);
    setPropertyTypeFilter('all');
    setLocationFilter('');
    setBudgetFilter('');
    setDateFrom('');
    setDateTo('');
  };

  const toggleConfig = (c: string) => setConfigFilter((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const openEdit = (lead: any) => {
    router.push(`/leads/${lead.id}`);
  };

  const importPayload = (row: Record<string, any>) => {
    const payload: Record<string, any> = { ...row };
    if (payload.leadSource) payload.leadSource = String(payload.leadSource).toLowerCase().trim().replace(/\s+/g, '-');
    if (payload.status) payload.status = String(payload.status).toLowerCase().trim();
    ['score', 'value', 'noOfEmployees', 'latitude', 'longitude', 'budgetMin', 'budgetMax'].forEach((key) => {
      if (payload[key] !== undefined && payload[key] !== '') payload[key] = Number(payload[key]);
      else delete payload[key];
    });
    return payload;
  };

  const handleImportRow = async (row: Record<string, any>) => leadsApi.createLead(importPayload(row));

  // Large files (tens of thousands of leads) go up in batches of 500 rows.
  const handleImportBatch = async (rows: Record<string, any>[]) => (await leadsApi.importLeads(rows.map(importPayload))).results;

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
    onDelete: () => {
      if (selectedLeadIds.length === 1) {
        const lead = leads.find((l) => l.id === selectedLeadIds[0]);
        if (lead) handleDelete(lead);
      }
    },
  });

  // Task 2.16: Leads table trimmed to 5 columns total (Checkbox is the built-in
  // DataTable `selectable` column, handled separately) — Series ID, Company
  // Name, Contact Person, Status. Everything else (Phone, Email, Title,
  // Source, Industry, Score, Value, Assigned To, Last Contact, Next Follow Up)
  // moved off the main table; still editable from the Lead detail page.
  const filterField =
    'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]';

  const columns: DataTableColumn<any>[] = [
    {
      header: 'Series ID',
      accessor: (lead) => (
        <Link
          href={`/leads/${lead.id}`}
          className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-600 hover:text-[var(--primary)] hover:underline"
        >
          {lead.leadNumber || `#${lead.id}`}
        </Link>
      ),
    },
    {
      header: 'Company Name',
      accessor: (lead) => <span className="font-medium text-slate-900">{lead.company || '—'}</span>,
      editValue: (lead) => lead.company || '',
      onEdit: (lead, val) => patchLead(lead, 'company', val),
    },
    {
      header: 'Contact Person',
      accessor: (lead) => {
        const leadName = lead.name || `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Unnamed';
        return (
          <Link href={`/leads/${lead.id}`} className="text-slate-600 hover:text-[var(--primary)] hover:underline">
            {leadName}
          </Link>
        );
      },
    },
    { header: 'Status', accessor: (lead) => <StatusBadge status={lead.status} /> },
    {
      header: 'Requirement',
      id: 'requirement',
      accessor: (lead) => {
        const parts = [lead.configuration, lead.propertyType].filter(Boolean).join(' ');
        const budget = budgetRange(lead.budgetMin, lead.budgetMax);
        if (!parts && !budget) return <span className="text-slate-400">—</span>;
        return (
          <span className="text-slate-600">
            {parts}
            {budget && <span className="block text-xs text-slate-400">{budget}</span>}
          </span>
        );
      },
    },
    {
      header: 'Area',
      id: 'preferredLocation',
      accessor: (lead) => <span className="text-slate-600">{lead.preferredLocation || lead.city || '—'}</span>,
    },
    {
      header: 'Project',
      id: 'projectName',
      optional: true,
      accessor: (lead) => <span className="text-slate-600">{lead.projectName || '—'}</span>,
    },
    // Task 2.16 removed these from the default view, but they're still real
    // lead fields — available on request via "Arrange & Hide Columns" -> Add.
    {
      header: 'Phone',
      id: 'phone',
      optional: true,
      accessor: (lead) => <span className="text-slate-600">{lead.phone || '—'}</span>,
    },
    {
      header: 'Mobile',
      id: 'mobile',
      optional: true,
      accessor: (lead) => <span className="text-slate-600">{lead.mobile || '—'}</span>,
    },
    {
      header: 'Email',
      id: 'email',
      optional: true,
      accessor: (lead) => <span className="text-slate-600">{lead.email || '—'}</span>,
    },
    {
      header: 'Title',
      id: 'jobTitle',
      optional: true,
      accessor: (lead) => <span className="text-slate-600">{lead.designation || lead.jobTitle || '—'}</span>,
    },
    {
      header: 'Source',
      id: 'leadSource',
      optional: true,
      accessor: (lead) => <span className="text-slate-600">{lead.source || lead.leadSource ? leadSourceLabel(lead.source || lead.leadSource) : '—'}</span>,
    },
    {
      header: 'Sub Source',
      id: 'subSource',
      optional: true,
      accessor: (lead) => <span className="text-slate-600">{lead.subSource || '—'}</span>,
    },
    {
      header: 'Industry',
      id: 'industry',
      optional: true,
      accessor: (lead) => <span className="text-slate-600">{lead.industry || '—'}</span>,
    },
    {
      header: 'Score',
      id: 'score',
      optional: true,
      sortKey: (lead) => lead.score ?? 0,
      accessor: (lead) => <span className="text-slate-600">{lead.score ?? '—'}</span>,
    },
    {
      header: 'Value',
      id: 'value',
      optional: true,
      sortKey: (lead) => lead.value ?? 0,
      accessor: (lead) => <span className="text-slate-600">{lead.value ? formatCurrency(lead.value) : '—'}</span>,
    },
    {
      header: 'Assigned To',
      id: 'assignedTo',
      optional: true,
      accessor: (lead) =>
        lead.assignedTo ? (
          <span className="flex items-center gap-2 text-slate-600">
            <AgentStatusDot state={agentStates.get(Number(lead.assignedToId)) || 'offline'} />
            {lead.assignedTo}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        ),
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
                onImportBatch: handleImportBatch,
                importBatchSize: 500,
                uniqueKey: 'mobile',
                onImportComplete: fetchLeads,
              }}
            />
            <Button size="sm" onClick={() => router.push('/leads/new')}><PlusIcon className="h-4 w-4" /> Add Lead</Button>
          </>
        }
      />

      <div className="mb-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, number, area, 2 BHK..." className="sm:max-w-xs" />
        <div className="flex items-center gap-2">
          <select
            value={territoryFilter}
            onChange={(e) => setTerritoryFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
          >
            <option value="all">All Territories</option>
            {TERRITORY_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <FunnelIcon className="h-4 w-4 text-slate-400" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
          >
            <option value="all">All Statuses</option>
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="working">Working / In Progress</option>
            <option value="qualified">Qualified</option>
            <option value="unqualified">Unqualified / Disqualified</option>
            <option value="converted">Converted</option>
            <option value="lost">Lost</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-medium ${
            showFilters || activeFilterCount ? 'border-[var(--primary)] text-[var(--primary)]' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <FunnelIcon className="h-4 w-4" /> More filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
        </button>
        <span className="whitespace-nowrap text-sm text-slate-500">{leads.length} lead{leads.length === 1 ? '' : 's'}</span>
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
          <button
            onClick={() => setView('list')}
            className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${
              view === 'list' ? 'bg-[var(--primary)] text-white' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <ListBulletIcon className="h-4 w-4" /> List
          </button>
          <button
            onClick={() => setView('kanban')}
            className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${
              view === 'kanban' ? 'bg-[var(--primary)] text-white' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Squares2X2Icon className="h-4 w-4" /> Kanban
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="mb-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-slate-500">Lead source</label>
              <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className={filterField}>
                <option value="all">All sources</option>
                {LEAD_SOURCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500">Sales person</label>
              <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} className={filterField}>
                <option value="all">Everyone</option>
                <option value="unassigned">Unassigned</option>
                {assignableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {agentStates.size ? (agentStates.get(u.id) && agentStates.get(u.id) !== 'offline' ? '🟢 ' : '🔴 ') : ''}
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500">Property type</label>
              <select value={propertyTypeFilter} onChange={(e) => setPropertyTypeFilter(e.target.value)} className={filterField}>
                <option value="all">Any type</option>
                {PROPERTY_TYPE_OPTIONS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500">Budget</label>
              <select value={budgetFilter} onChange={(e) => setBudgetFilter(e.target.value)} className={filterField}>
                <option value="">Any budget</option>
                {BUDGET_OPTIONS.map((o, i) => (
                  <option key={o.label} value={i}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500">Area / locality</label>
              <input value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} placeholder="e.g. Baner, Wakad" className={filterField} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500">Lead date from</label>
              <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} className={filterField} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500">Lead date to</label>
              <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} className={filterField} />
            </div>
            <div className="flex items-end">
              <button type="button" onClick={clearFilters} disabled={!activeFilterCount} className="text-sm font-medium text-[var(--primary)] hover:underline disabled:text-slate-300 disabled:no-underline">
                Clear filters
              </button>
            </div>
          </div>
          <div className="mt-3">
            <span className="block text-xs font-medium text-slate-500">Configuration</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {CONFIGURATION_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleConfig(c)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    configFilter.includes(c) ? 'border-[var(--primary)] bg-[var(--primary)] text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

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
          tableId="leads_table"
          columns={columns}
          data={leads}
          rowKey={(l) => l.id}
          loading={loading}
          bulkDelete={{
            deleteRow: (l) => leadsApi.deleteLead(l.id),
            onComplete: fetchLeads,
            entityName: 'leads',
            restorable: true,
          }}
          showToolbar
          canEdit={canEditLeads}
          onSelectionChange={setSelectedLeadIds}
          totalEntries={leads.length}
          emptyMessage='No leads found. Click "Add Lead" to create one.'
          onRowClick={(lead) => router.push(`/leads/${lead.id}`)}
          actions={(lead) => (
            <div className="flex justify-end gap-3">
              <button onClick={() => router.push(`/leads/${lead.id}`)} className="text-slate-400 hover:text-[var(--primary)]" aria-label="View Details">
                <EyeIcon className="h-4 w-4" />
              </button>
              <button onClick={() => openEdit(lead)} className="text-slate-400 hover:text-[var(--primary)]" aria-label="Edit">
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

    </>
  );
}

const LEAD_STATUSES = ['new', 'contacted', 'working', 'qualified', 'unqualified', 'converted', 'lost'];

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
              dragOverStatus === status ? 'bg-blue-50 ring-2 ring-[var(--primary)]/30' : ''
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
                    <span className="text-sm font-semibold text-[var(--primary)]">{formatCurrency(lead.value || 0)}</span>
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
