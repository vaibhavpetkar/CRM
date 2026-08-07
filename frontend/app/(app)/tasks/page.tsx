'use client';

import { useCallback, useEffect, useState } from 'react';
import PageHeader from '@/components/ui/page-header';
import StatusBadge from '@/components/ui/status-badge';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { tasksApi, usersApi } from '@/lib/api';
import { getStoredUser } from '@/lib/api';
import { useRouter, useSearchParams } from 'next/navigation';
import { PlusIcon, XMarkIcon, TrashIcon, CheckCircleIcon, ClockIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useToast } from '@/components/ui/toast';

const emptyForm = {
  title: '',
  type: 'task',
  priority: 'medium',
  dueDate: '',
  status: 'pending',
  relatedTo: '',
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
  const currentUser = getStoredUser();
  const isMgrOrAdmin = ['Administrator', 'Sales Manager'].includes(currentUser?.role?.name);

  // Support deep-linking from the topbar's Quick Create menu (/tasks?quickCreate=1)
  useEffect(() => {
    if (searchParams.get('quickCreate')) {
      setFormData(emptyForm);
      setIsModalOpen(true);
      router.replace('/tasks');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await tasksApi.getTasks({ status: filter });
      setTasks(res.tasks || []);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await tasksApi.createTask({
        ...formData,
        assignedToId: formData.assignedToId ? Number(formData.assignedToId) : undefined,
      });
      setIsModalOpen(false);
      setFormData(emptyForm);
      fetchTasks();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create task');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleComplete = async (task: any) => {
    try {
      await tasksApi.updateTask(task.id, {
        status: task.status === 'completed' ? 'pending' : 'completed',
      });
      fetchTasks();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update task');
    }
  };

  const handleDelete = async (task: any) => {
    if (!confirm(`Delete task "${task.title}"?`)) return;
    try {
      await tasksApi.deleteTask(task.id);
      fetchTasks();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete task');
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

      {/* Filter Tabs */}
      <div className="mb-4 flex gap-2">
        {['all', 'pending', 'in-progress', 'completed'].map((status) => (
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
                <div className="flex items-center gap-4">
                  <input
                    type="checkbox"
                    checked={task.status === 'completed'}
                    onChange={() => toggleComplete(task)}
                    className="h-4 w-4 cursor-pointer rounded border-2 border-slate-400 text-[#168eea]"
                  />
                  <div>
                    <p className={`text-sm font-medium ${task.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                      {task.title}
                    </p>
                    <p className="text-xs text-slate-500">
                      {task.type && <span className="capitalize">{task.type}</span>}
                      {task.relatedTo && ` · ${task.relatedTo}`}
                      {task.dueDate && ` · Due ${String(task.dueDate).split('T')[0]}`}
                      {task.assignedTo && ` · 👤 ${task.assignedTo}`}
                      {isOverdue && <span className="ml-1 font-medium text-red-500">· OVERDUE</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={task.priority} />
                  <StatusBadge status={task.status} />
                  <button onClick={() => handleDelete(task)} className="text-slate-300 hover:text-red-600" aria-label="Delete task">
                    <TrashIcon className="h-4 w-4" />
                  </button>
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
                <label className="block text-xs font-medium text-slate-700">Title *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Related To</label>
                <input
                  type="text"
                  placeholder="e.g. TechCorp Inc"
                  value={formData.relatedTo}
                  onChange={(e) => setFormData({ ...formData, relatedTo: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  >
                    <option value="task">Task</option>
                    <option value="call">Call</option>
                    <option value="email">Email</option>
                    <option value="meeting">Meeting</option>
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

              <div>
                <label className="block text-xs font-medium text-slate-700">Due Date</label>
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                />
              </div>

              {/* Assign to user — only for Managers/Admins */}
              {isMgrOrAdmin && (
                <div>
                  <label className="block text-xs font-medium text-slate-700">Assign To</label>
                  <select
                    value={formData.assignedToId}
                    onChange={(e) => setFormData({ ...formData, assignedToId: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  >
                    <option value="">Unassigned (myself)</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.firstName} {u.lastName} — {u.role?.name || u.email}
                      </option>
                    ))}
                  </select>
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
