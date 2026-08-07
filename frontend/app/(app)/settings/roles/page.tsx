'use client';

import { useState, useEffect, useCallback } from 'react';
import PageHeader from '@/components/ui/page-header';
import Card from '@/components/ui/card';
import Button from '@/components/ui/button';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { rolesApi } from '@/lib/api';
import { PlusIcon, XMarkIcon, PencilSquareIcon, TrashIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { useToast } from '@/components/ui/toast';

type PermissionGroup = { module: string; label: string; permissions: { key: string; label: string }[] };

export default function RolesPage() {
  const toast = useToast();
  const [roles, setRoles] = useState<any[]>([]);
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<any | null>(null);
  const [form, setForm] = useState({ name: '', description: '', permissions: [] as string[] });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rolesRes, permsRes] = await Promise.all([
        rolesApi.getRoles(),
        rolesApi.getPermissionCatalog().catch(() => ({ groups: [] })),
      ]);
      setRoles(rolesRes.roles || []);
      setGroups(permsRes.groups || []);
    } catch (err: any) {
      setError(err.message || 'Could not load roles. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openCreate = () => {
    setEditingRole(null);
    setForm({ name: '', description: '', permissions: [] });
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEdit = (role: any) => {
    setEditingRole(role);
    setForm({
      name: role.name,
      description: role.description || '',
      permissions: role.permissions ? (typeof role.permissions === 'string' ? JSON.parse(role.permissions) : role.permissions) : [],
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingRole(null);
  };

  const isFullAccess = form.permissions.includes('*');

  const togglePermission = (key: string) => {
    setForm((prev) => {
      if (prev.permissions.includes(key)) {
        return { ...prev, permissions: prev.permissions.filter((p) => p !== key) };
      }
      return { ...prev, permissions: [...prev.permissions, key] };
    });
  };

  const toggleFullAccess = () => {
    setForm((prev) => ({ ...prev, permissions: isFullAccess ? [] : ['*'] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      if (editingRole) {
        await rolesApi.updateRole(editingRole.id, {
          name: form.name,
          description: form.description,
          permissions: form.permissions,
        });
      } else {
        await rolesApi.createRole({
          name: form.name,
          description: form.description,
          permissions: form.permissions,
        });
      }
      closeModal();
      fetchData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save role.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (role: any) => {
    if (!window.confirm(`Delete the "${role.name}" role? This cannot be undone.`)) return;
    try {
      await rolesApi.deleteRole(role.id);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete role.');
    }
  };

  return (
    <>
      <PageHeader
        title="Roles & Permissions"
        description="Configure access control for your team"
        actions={
          <Button size="sm" onClick={openCreate}>
            <PlusIcon className="h-4 w-4" /> New Role
          </Button>
        }
      />

      {loading ? (
        <Card>
          <div className="flex h-48 items-center justify-center">
            <LoadingSpinner size="md" />
          </div>
        </Card>
      ) : error ? (
        <Card>
          <div className="py-8 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <Button size="sm" variant="secondary" className="mt-3" onClick={fetchData}>Retry</Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {roles.map((role) => {
            const rolePerms: string[] = Array.isArray(role.permissions)
              ? role.permissions
              : typeof role.permissions === 'string'
              ? JSON.parse(role.permissions || '[]')
              : [];

            return (
              <Card key={role.id}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-sm font-semibold text-slate-900">{role.name}</h3>
                      <span className="text-xs text-slate-500">{role.users ?? 0} user{role.users === 1 ? '' : 's'}</span>
                      {role.isActive === false && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-500">
                          Disabled
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{role.description || 'No description'}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {rolePerms.includes('*') ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-[#168eea]">
                          <ShieldCheckIcon className="h-3.5 w-3.5" /> Full system access
                        </span>
                      ) : rolePerms.length === 0 ? (
                        <span className="text-xs text-slate-400">No permissions assigned</span>
                      ) : (
                        rolePerms.map((perm: string) => (
                          <span key={perm} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium capitalize text-slate-600">
                            {perm.replace(':', ' · ')}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => openEdit(role)}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-[#168eea]"
                      title="Edit role"
                    >
                      <PencilSquareIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(role)}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      title="Delete role"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit Role Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-semibold text-slate-900">{editingRole ? 'Edit Role' : 'New Role'}</h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {formError && (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-red-600">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700">Role Name</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Support Agent"
                  className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="What can people with this role do?"
                  rows={2}
                  className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 rounded-md border border-blue-100 bg-blue-50/60 p-3 text-sm font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={isFullAccess}
                    onChange={toggleFullAccess}
                    className="h-4 w-4 rounded border-slate-300 text-[#168eea] focus:ring-[#168eea]"
                  />
                  <ShieldCheckIcon className="h-4 w-4 text-[#168eea]" />
                  Full system access (all current and future permissions)
                </label>
              </div>

              {!isFullAccess && (
                <div className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Permissions</p>
                  {groups.map((group) => (
                    <div key={group.module} className="rounded-md border border-slate-200 p-3">
                      <p className="text-sm font-semibold text-slate-800">{group.label}</p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {group.permissions.map((perm) => (
                          <label key={perm.key} className="flex items-center gap-2 text-sm text-slate-600">
                            <input
                              type="checkbox"
                              checked={form.permissions.includes(perm.key)}
                              onChange={() => togglePermission(perm.key)}
                              className="h-4 w-4 rounded border-slate-300 text-[#168eea] focus:ring-[#168eea]"
                            />
                            {perm.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
                <Button type="button" variant="secondary" size="sm" onClick={closeModal}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={submitting}>
                  {submitting ? 'Saving...' : editingRole ? 'Save Changes' : 'Create Role'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
