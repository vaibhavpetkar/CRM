'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import StatusBadge from '@/components/ui/status-badge';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import StatCard from '@/components/ui/stat-card';
import DataTable, { DataTableColumn } from '@/components/ui/data-table';
import { authApi, teamApi, rolesApi, getStoredUser } from '@/lib/api';
import { hasPermission } from '@/lib/permissions';
import {
  PlusIcon,
  XMarkIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  PencilSquareIcon,
  UserGroupIcon,
  UserMinusIcon,
  BuildingOfficeIcon,
} from '@heroicons/react/24/outline';
import { useToast } from '@/components/ui/toast';

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-purple-100 text-purple-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-indigo-100 text-indigo-700',
];

function avatarColor(id: number) {
  return AVATAR_COLORS[id % AVATAR_COLORS.length];
}

export default function TeamPage() {
  const toast = useToast();
  const currentUser = typeof window !== 'undefined' ? getStoredUser() : null;
  // Drives the "Edit Disabled (No Permission)" warning in the quick-edit context
  // menu — previously never computed, so DataTable's canEdit prop defaulted to
  // true and the warning never showed regardless of the user's actual role.
  const canEditTeam = hasPermission(currentUser, 'users:update');

  const [members, setMembers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');

  // Invite modal state
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFirstName, setInviteFirstName] = useState('');
  const [inviteLastName, setInviteLastName] = useState('');
  const [inviteRoleId, setInviteRoleId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ inviteUrl: string; emailSent: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Edit modal state
  const [editingMember, setEditingMember] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ department: '', position: '', roleId: '', isActive: true });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [teamRes, rolesRes] = await Promise.all([
        teamApi.getMembers({ search, status: statusFilter, department: departmentFilter }),
        rolesApi.getRoles().catch(() => ({ roles: [] })),
      ]);
      setMembers(teamRes.members || []);
      setRoles(rolesRes.roles || []);
    } catch (err: any) {
      setError(err.message || 'Could not load your team. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, departmentFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const departments = useMemo(() => {
    const set = new Set(members.map((m) => m.department).filter(Boolean));
    return Array.from(set);
  }, [members]);

  const stats = useMemo(() => {
    const active = members.filter((m) => m.isActive || m.status === 'active').length;
    return {
      total: members.length,
      active,
      inactive: members.length - active,
      departments: departments.length,
    };
  }, [members, departments]);

  // ─── Invite handlers ──────────────────────────────────────────────────────

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setInviteError(null);
    try {
      const res = await authApi.sendInvite({
        email: inviteEmail,
        firstName: inviteFirstName,
        lastName: inviteLastName,
        roleId: inviteRoleId ? Number(inviteRoleId) : undefined,
      });
      setInviteResult({ inviteUrl: res.inviteUrl, emailSent: (res as any).emailSent });
      fetchData();
    } catch (err: any) {
      setInviteError(err.message || 'Failed to send invitation.');
    } finally {
      setSubmitting(false);
    }
  };

  const copyToClipboard = () => {
    if (inviteResult?.inviteUrl) {
      navigator.clipboard.writeText(inviteResult.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const closeInviteModal = () => {
    setIsInviteOpen(false);
    setInviteEmail('');
    setInviteFirstName('');
    setInviteLastName('');
    setInviteRoleId('');
    setInviteResult(null);
    setInviteError(null);
  };

  // ─── Edit handlers ────────────────────────────────────────────────────────

  const openEdit = (member: any) => {
    setEditingMember(member);
    setEditForm({
      department: member.department === 'Unassigned' ? '' : member.department || '',
      position: member.position || '',
      roleId: member.roleId ? String(member.roleId) : '',
      isActive: member.isActive ?? member.status === 'active',
    });
    setEditError(null);
  };

  const closeEdit = () => setEditingMember(null);

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;
    setEditSubmitting(true);
    setEditError(null);
    try {
      await teamApi.updateMember(editingMember.id, {
        department: editForm.department || null,
        position: editForm.position || null,
        roleId: editForm.roleId ? Number(editForm.roleId) : null,
        isActive: editForm.isActive,
      });
      closeEdit();
      fetchData();
    } catch (err: any) {
      setEditError(err.message || 'Failed to update team member.');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleRemove = async (member: any) => {
    if (!window.confirm(`Remove ${member.name} from the team? They will be deactivated and lose access immediately.`)) {
      return;
    }
    try {
      await teamApi.removeMember(member.id);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove team member.');
    }
  };

  const isSelf = (member: any) => currentUser && String(currentUser.id) === String(member.id);

  // DataTable Columns
  const columns: DataTableColumn<any>[] = [
    {
      header: 'Member',
      accessor: (member) => (
        <div className="flex items-center gap-3">
          <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${avatarColor(member.id)}`}>
            {member.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-slate-900">
              {member.name}
              {member.isSuperAdmin && (
                <span className="ml-2 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[#168eea]">
                  Admin
                </span>
              )}
              {isSelf(member) && <span className="ml-2 text-xs font-normal text-slate-400">(you)</span>}
            </p>
            <p className="text-xs text-slate-500">{member.email}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Role',
      accessor: (member) => <span className="text-slate-600">{member.role || member.roleName || '—'}</span>,
      editValue: (member) => member.role || member.roleName || '',
      onEdit: (member, val) => {
        const matched = roles.find((r) => r.name.toLowerCase() === val.toLowerCase());
        if (matched) {
          teamApi.updateMember(member.id, { roleId: matched.id }).then(fetchData);
        }
      },
    },
    {
      header: 'Department',
      accessor: (member) => <span className="text-slate-600">{member.department || '—'}</span>,
      editValue: (member) => member.department || '',
      onEdit: (member, val) => {
        teamApi.updateMember(member.id, { department: val }).then(fetchData);
      },
    },
    {
      header: 'Position',
      accessor: (member) => <span className="text-slate-600">{member.position || '—'}</span>,
      editValue: (member) => member.position || '',
      onEdit: (member, val) => {
        teamApi.updateMember(member.id, { position: val }).then(fetchData);
      },
    },
    {
      header: 'Status',
      accessor: (member) => <StatusBadge status={member.status || (member.isActive ? 'active' : 'inactive')} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Team"
        description="Manage employees, departments, roles, and access"
        actions={
          <Button size="sm" onClick={() => setIsInviteOpen(true)}>
            <PlusIcon className="h-4 w-4" /> Invite Member
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Members" value={stats.total} icon={<UserGroupIcon className="h-5 w-5" />} />
        <StatCard label="Active" value={stats.active} changeType="positive" icon={<CheckIcon className="h-5 w-5" />} />
        <StatCard label="Inactive" value={stats.inactive} icon={<UserMinusIcon className="h-5 w-5" />} />
        <StatCard label="Departments" value={stats.departments} icon={<BuildingOfficeIcon className="h-5 w-5" />} />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search team members..." className="sm:max-w-xs" />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea]"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        {departments.length > 0 && (
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea]"
          >
            <option value="all">All Departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        )}
        <span className="text-sm text-slate-500">{members.length} member{members.length === 1 ? '' : 's'}</span>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <Card>
        <DataTable
          columns={columns}
          data={members}
          rowKey={(m) => m.id}
          loading={loading}
          showToolbar
          canEdit={canEditTeam}
          totalEntries={members.length}
          tableId="team_table"
          emptyMessage='No team members found. Click "Invite Member" to add one.'
          actions={(member) => (
            <div className="flex items-center justify-end gap-1">
              <button
                onClick={() => openEdit(member)}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-[#168eea]"
                title="Edit"
              >
                <PencilSquareIcon className="h-4 w-4" />
              </button>
              {!isSelf(member) && !member.isSuperAdmin && (
                <button
                  onClick={() => handleRemove(member)}
                  className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  title="Remove"
                >
                  <UserMinusIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        />
      </Card>

      {/* Invite Member Modal */}
      {isInviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-semibold text-slate-900">Invite Team Member</h3>
              <button onClick={closeInviteModal} className="text-slate-400 hover:text-slate-600">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {inviteError && (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-red-600">
                {inviteError}
              </div>
            )}

            {inviteResult ? (
              <div className="mt-4 space-y-3">
                <div className={`rounded-md border p-3 text-sm ${inviteResult.emailSent ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                  {inviteResult.emailSent
                    ? '✅ Invitation email sent! You can also share the link below directly.'
                    : '⚠️ Invite created, but the email could not be sent (SMTP not reachable). Share this link with them directly:'}
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Invitation Link</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={inviteResult.inviteUrl}
                      className="w-full rounded-md border border-slate-200 bg-slate-50 p-2 text-xs font-mono text-slate-700"
                    />
                    <Button size="sm" onClick={copyToClipboard} variant="secondary">
                      {copied ? (
                        <CheckIcon className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <ClipboardDocumentIcon className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="flex justify-end pt-3">
                  <Button size="sm" onClick={closeInviteModal}>Done</Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSendInvite} className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">First Name</label>
                    <input
                      type="text"
                      required
                      value={inviteFirstName}
                      onChange={(e) => setInviteFirstName(e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Last Name</label>
                    <input
                      type="text"
                      required
                      value={inviteLastName}
                      onChange={(e) => setInviteLastName(e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700">Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700">Role</label>
                  <select
                    value={inviteRoleId}
                    onChange={(e) => setInviteRoleId(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  >
                    <option value="">No role (assign later)</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>

                <div className="mt-4 flex justify-end gap-2 pt-2">
                  <Button type="button" variant="secondary" size="sm" onClick={closeInviteModal}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={submitting}>
                    {submitting ? 'Generating...' : 'Generate Invite Link'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Edit Member Modal */}
      {editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-semibold text-slate-900">Edit {editingMember.name}</h3>
              <button onClick={closeEdit} className="text-slate-400 hover:text-slate-600">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {editError && (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-red-600">
                {editError}
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700">Role</label>
                <select
                  value={editForm.roleId}
                  onChange={(e) => setEditForm({ ...editForm, roleId: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                >
                  <option value="">No role assigned</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Department</label>
                  <input
                    type="text"
                    value={editForm.department}
                    onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                    placeholder="e.g. Sales"
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Position</label>
                  <input
                    type="text"
                    value={editForm.position}
                    onChange={(e) => setEditForm({ ...editForm, position: e.target.value })}
                    placeholder="e.g. Account Executive"
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={editForm.isActive}
                    onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-[#168eea] focus:ring-[#168eea]"
                  />
                  Active account (uncheck to suspend access)
                </label>
              </div>

              <div className="mt-4 flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" size="sm" onClick={closeEdit}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={editSubmitting}>
                  {editSubmitting ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
