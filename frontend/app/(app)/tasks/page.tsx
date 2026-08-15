'use client';

import { useCallback, useEffect, useState } from 'react';
import PageHeader from '@/components/ui/page-header';
import StatusBadge from '@/components/ui/status-badge';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import LoadingSpinner from '@/components/ui/loading-spinner';
import CompanyAutocomplete from '@/components/ui/company-autocomplete';
import SearchableSelect from '@/components/ui/searchable-select';
import { tasksApi, usersApi, leadsApi } from '@/lib/api';
import { getStoredUser } from '@/lib/api';
import { useRouter, useSearchParams } from 'next/navigation';
import { PlusIcon, XMarkIcon, ClockIcon, ExclamationTriangleIcon, CheckCircleIcon, EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import { useToast } from '@/components/ui/toast';

// Task 4.8: Task Type dropdown, reordered — Call, Email, Online Meeting, In
// Person Meeting, Field Visit.
const TASK_TYPES = [
  { value: 'call', label: 'Call' },
  { value: 'email', label: 'Email' },
  { value: 'online-meeting', label: 'Online Meeting' },
  { value: 'in-person-meeting', label: 'In Person Meeting' },
  { value: 'field-visit', label: 'Field Visit' },
];

const emptyForm = {
  title: '',
  type: 'call',
  priority: 'medium',
  dueDate: '',
  dueTime: '',
  status: 'pending',
  relatedTo: '',
  leadId: '',
  description: '',
  assignedToId: '',
};

export default function TasksPage() {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState('pending');
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [assignToName, setAssignToName] = useState('');
  const [companyOptions, setCompanyOptions] = useState<string[]>([]);
  const [leadOptions, setLeadOptions] = useState<{ id: number; label: string }[]>([]);
  const [openMenuId, setOpenMenuId] = useState<number | string | null>(null);
  const currentUser = getStoredUser();
  const isMgrOrAdmin = ['Administrator', 'Sales Manager'].includes(currentUser?.role?.name);

  // Handle company selection from autocomplete
  const handleCompanySelect = (company: any) => {
    // Find the matching lead to get the leadId
    const matched = leadOptions.find((l) => l.label.includes(company.name));
    setFormData((prev: any) => ({
      ...prev,
      relatedTo: company.name,
      leadId: matched ? String(matched.id) : '',
    }));
  };

  // Support deep-linking from the topbar's Quick Create menu (/tasks?quickCreate=1)
  useEffect(() => {
    if (searchParams.get('quickCreate')) {
      setFormData(emptyForm);
      setAssignToName('');
      setIsModalOpen(true);
      router.replace('/tasks');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Task 4.1: Overdue is now its own tab, computed from all non-completed
      // tasks rather than being folded into "Pending". The backend has no
      // distinct "overdue" status (it's date-derived), so for that tab we
      // fetch everything not completed and filter client-side.
      const res = await tasksApi.getTasks({ status: filter === 'overdue' ? 'all' : filter });
      let list = res.tasks || [];
      if (filter === 'overdue') {
        list = list.filter((t: any) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'completed');
      } else if (filter === 'pending') {
        // Pending tab now excludes overdue ones, since those live under Overdue.
        list = list.filter((t: any) => !(t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'completed'));
      }
      setTasks(list);
    } catch (err: any) {
      setError(err.message || 'Failed to load tasks. Is the backend running?');
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    if (isMgrOrAdmin) {
      usersApi.getUsers().then((res) => setUsers(res.users || [])).catch(() => {});
    }
  }, [isMgrOrAdmin]);

  // Task 4.5: Company Name search/typeahead sourced from existing Leads (company + contact person).
  // Also build a real Lead picker (id-backed) so a task can be linked to an
  // actual Lead record instead of only a free-typed company name — this is
  // what actually gives Lead -> Task a real relation (leadId), not just text
  // that happens to match.
  useEffect(() => {
    leadsApi
      .getLeads({ limit: 200 } as any)
      .then((res) => {
        const opts = new Set<string>();
        const leads: { id: number; label: string }[] = [];
        (res.leads || []).forEach((l: any) => {
          if (l.company) opts.add(l.company);
          const contact = l.name || `${l.firstName || ''} ${l.lastName || ''}`.trim();
          if (l.company && contact) opts.add(`${l.company} — ${contact}`);
          leads.push({ id: l.id, label: contact ? `${l.company || 'Unnamed'} — ${contact}` : (l.company || `Lead #${l.id}`) });
        });
        setCompanyOptions(Array.from(opts));
        setLeadOptions(leads);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const closeMenu = () => setOpenMenuId(null);
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await tasksApi.createTask({
        ...formData,
        leadId: formData.leadId ? Number(formData.leadId) : undefined,
        // Task 4.6: "Assign to Me" explicitly assigns to the current user
        // rather than leaving assignedToId empty/unassigned.
        assignedToId: formData.assignedToId ? Number(formData.assignedToId) : currentUser?.id || undefined,
      });
      setIsModalOpen(false);
      setFormData(emptyForm);
      setAssignToName('');
      fetchTasks();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create task');
    } finally {
      setSubmitting(false);
    }
  };

  // Task 4.2 / 4.3: task status is now managed entirely through the ⋮ action
  // menu instead of a checkbox. "Note" appends a timestamped line to the
  // task's description rather than opening a whole separate notes system.
  const applyAction = async (task: any, action: 'done' | 'in-progress' | 'rescheduled' | 'disconnect-call' | 'delete' | 'note') => {
    setOpenMenuId(null);
    try {
      if (action === 'delete') {
        if (!confirm(`Delete task "${task.title}"?`)) return;
        await tasksApi.deleteTask(task.id);
      } else if (action === 'note') {
        const note = prompt('Add a note to this task:');
        if (!note) return;
        const stamp = new Date().toLocaleString();
        const nextDescription = `${task.description ? task.description + '\n' : ''}[${stamp}] ${note}`;
        await tasksApi.updateTask(task.id, { description: nextDescription });
      } else {
        const statusMap: Record<string, string> = {
          done: 'completed',
          'in-progress': 'in-progress',
          rescheduled: 'rescheduled',
          'disconnect-call': 'disconnected-call',
        };
        await tasksApi.updateTask(task.id, { status: statusMap[action] });
      }
      fetchTasks();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update task');
    }
  };

  const pendingCount = tasks.filter((t) => t.status === 'pending' || t.status === 'in-progress').length;
  const overdueCount = tasks.filter((t) => {
    if (!t.dueDate) return false;
    return new Date(t.dueDate) < new Date() && t.status !== 'completed';
  }).length;

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Manage follow-ups and to-dos"
        actions={<Button size="sm" onClick={() => setIsModalOpen(true)}><PlusIcon className="h-4 w-4" /> Add Task</Button>}
      />

      {/* Summary Cards */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <Card className="flex items-center gap-4 !p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
            <ClockIcon className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{pendingCount}</p>
            <p className="text-xs text-slate-500">Pending Tasks</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4 !p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{overdueCount}</p>
            <p className="text-xs text-slate-500">Overdue</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4 !p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
            <CheckCircleIcon className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{tasks.filter((t) => t.status === 'completed').length}</p>
            <p className="text-xs text-slate-500">Completed</p>
          </div>
        </Card>
      </div>

      {/* Filter Tabs — Task 4.1: Overdue is now separate from Pending */}
      <div className="mb-4 flex gap-2">
        {['all', 'pending', 'overdue', 'in-progress', 'completed'].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === status
                ? 'bg-[#168eea] text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50 border-2 border-slate-200'
            }`}
          >
            {status === 'all' ? 'All' : status.replace('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="flex h-48 items-center justify-center"><LoadingSpinner size="md" /></div>
      ) : tasks.length === 0 ? (
        <Card><p className="py-6 text-center text-slate-400">No tasks found. Click &quot;Add Task&quot; to create one.</p></Card>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => {
            const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'completed';
            return (
              <Card key={task.id} className={`flex items-center justify-between !p-4 ${isOverdue ? '!border-red-200 bg-red-50/30' : '!border-slate-200'}`}>
                <div>
                  <p className={`text-sm font-medium ${task.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                    {task.title}
                  </p>
                  <p className="text-xs text-slate-500">
                    {task.type && <span className="capitalize">{TASK_TYPES.find((t) => t.value === task.type)?.label || task.type}</span>}
                    {task.lead ? (
                      <>
                        {' · '}
                        <a
                          href={`/leads/${task.leadId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[#168eea] hover:underline"
                          title="Linked Lead — opens Lead record"
                        >
                          🔗 {task.lead.company || `${task.lead.firstName || ''} ${task.lead.lastName || ''}`.trim()}
                        </a>
                      </>
                    ) : (
                      task.relatedTo && ` · ${task.relatedTo}`
                    )}
                    {task.dueDate && ` · Due ${String(task.dueDate).split('T')[0]}`}
                    {task.dueTime && ` ${task.dueTime}`}
                    {task.assignedTo && ` · 👤 ${task.assignedTo}`}
                    {isOverdue && <span className="ml-1 font-medium text-red-500">· OVERDUE</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={task.priority} />
                  <StatusBadge status={task.status} />
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === task.id ? null : task.id);
                      }}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      aria-label="Task actions"
                    >
                      <EllipsisVerticalIcon className="h-5 w-5" />
                    </button>
                    {openMenuId === task.id && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 top-7 z-10 w-44 rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg"
                      >
                        <button onClick={() => applyAction(task, 'done')} className="block w-full px-3 py-1.5 text-left hover:bg-slate-50">Done</button>
                        <button onClick={() => applyAction(task, 'in-progress')} className="block w-full px-3 py-1.5 text-left hover:bg-slate-50">In Progress</button>
                        <button onClick={() => applyAction(task, 'rescheduled')} className="block w-full px-3 py-1.5 text-left hover:bg-slate-50">Rescheduled</button>
                        <button onClick={() => applyAction(task, 'disconnect-call')} className="block w-full px-3 py-1.5 text-left hover:bg-slate-50">Disconnect Call</button>
                        <button onClick={() => applyAction(task, 'note')} className="block w-full px-3 py-1.5 text-left hover:bg-slate-50">Note</button>
                        <div className="my-1 border-t border-slate-100" />
                        <button onClick={() => applyAction(task, 'delete')} className="block w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50">Delete</button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-semibold text-slate-900">Add New Task</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700">Task Name *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Client {formData.leadId && <span className="font-normal text-[#168eea]">(linked to Lead — details auto-filled)</span>}
                </label>
                <CompanyAutocomplete
                  value={formData.relatedTo}
                  onChange={(val) => setFormData({ ...formData, relatedTo: val })}
                  onSelect={handleCompanySelect}
                  placeholder="Start typing a client, company, or contact…"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  {formData.leadId
                    ? 'This task will show up on that Lead\'s timeline.'
                    : 'Pick a suggestion to link this task to an existing Lead, or type freely for a one-off client.'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  >
                    {TASK_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Due Date</label>
                  <input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Due Time</label>
                  <input
                    type="time"
                    value={formData.dueTime}
                    onChange={(e) => setFormData({ ...formData, dueTime: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>
              </div>

              {/* Assign to user — only for Managers/Admins */}
              {isMgrOrAdmin && (
                <div>
                  <label className="block text-xs font-medium text-slate-700">Assign To</label>
                  <SearchableSelect
                    value={assignToName}
                    onChange={(v) => {
                      setAssignToName(v);
                      const match = users.find((u) => `${u.firstName} ${u.lastName}`.trim() === v.trim());
                      setFormData({ ...formData, assignedToId: match ? String(match.id) : '' });
                    }}
                    options={users.map((u) => ({ value: `${u.firstName} ${u.lastName}`.trim(), sublabel: u.role?.name || u.email }))}
                    placeholder="Assign to me (default) or search a name..."
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                />
              </div>

              <div className="mt-4 flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={submitting}>{submitting ? 'Saving...' : 'Save Task'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
