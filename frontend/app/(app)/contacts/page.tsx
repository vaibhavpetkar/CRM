'use client';

import { useState, useEffect, useCallback } from 'react';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import DataTable, { DataTableColumn } from '@/components/ui/data-table';
import ImportExportButtons from '@/components/ui/import-export-buttons';
import { CONTACT_FIELDS } from '@/lib/import-export/field-configs';
import { contactsApi, getStoredUser } from '@/lib/api';
import { hasPermission } from '@/lib/permissions';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { PlusIcon, XMarkIcon, PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useToast } from '@/components/ui/toast';

const emptyForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  company: '',
  title: '',
  leadSource: 'website',
};

export default function ContactsPage() {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | number | null>(null);

  const [formData, setFormData] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  // Right-side detail panel — click a row to open it.
  const [panelContact, setPanelContact] = useState<any | null>(null);
  const [panelEditing, setPanelEditing] = useState(false);
  const [panelForm, setPanelForm] = useState<any>({});
  const [panelSaving, setPanelSaving] = useState(false);
  const canEditContacts = hasPermission(getStoredUser(), 'contacts:update');

  // Support deep-linking from the topbar's Quick Create menu (/contacts?quickCreate=1)
  useEffect(() => {
    if (searchParams.get('quickCreate')) {
      setEditingId(null);
      setFormData(emptyForm);
      setIsModalOpen(true);
      router.replace('/contacts');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await contactsApi.getContacts({ search });
      setContacts(res.contacts || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load contacts. Is the backend running?');
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const openCreate = () => {
    setEditingId(null);
    setFormData(emptyForm);
    setIsModalOpen(true);
  };

  const openEdit = (contact: any) => {
    setEditingId(contact.id);
    setFormData({
      firstName: contact.firstName || '',
      lastName: contact.lastName || '',
      email: contact.email || '',
      phone: contact.phone || '',
      company: contact.company || '',
      title: contact.title || contact.jobTitle || '',
      leadSource: contact.leadSource || 'website',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingId) {
        await contactsApi.updateContact(editingId, formData);
      } else {
        await contactsApi.createContact(formData);
      }
      setIsModalOpen(false);
      setFormData(emptyForm);
      setEditingId(null);
      fetchContacts();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save contact');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (contact: any) => {
    if (!confirm(`Delete contact "${contact.firstName} ${contact.lastName}"?`)) return;
    try {
      await contactsApi.deleteContact(contact.id);
      fetchContacts();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete contact');
    }
  };

  const openPanel = (contact: any) => {
    setPanelContact(contact);
    setPanelForm({
      firstName: contact.firstName || '',
      lastName: contact.lastName || '',
      email: contact.email || '',
      phone: contact.phone || '',
      company: contact.company || '',
      title: contact.title || contact.jobTitle || '',
    });
    setPanelEditing(false);
  };

  const handlePanelSave = async () => {
    if (!panelContact) return;
    setPanelSaving(true);
    try {
      await contactsApi.updateContact(panelContact.id, panelForm);
      toast.success('Contact updated.');
      setPanelEditing(false);
      setPanelContact({ ...panelContact, ...panelForm });
      fetchContacts();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update contact');
    } finally {
      setPanelSaving(false);
    }
  };

  // Other contacts sharing the same company — shown below the selected
  // contact's details in the side panel.
  const relatedContacts = panelContact?.company
    ? contacts.filter((c) => c.id !== panelContact.id && c.company && c.company.toLowerCase() === panelContact.company.toLowerCase())
    : [];

  const columns: DataTableColumn<any>[] = [
    {
      header: 'Name',
      accessor: (contact) => {
        const initials = `${(contact.firstName || 'C').charAt(0)}${(contact.lastName || '').charAt(0)}`.toUpperCase();
        return (
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
              {initials}
            </div>
            <span className="font-medium text-slate-900">{contact.firstName} {contact.lastName}</span>
          </div>
        );
      },
    },
    { header: 'Email', accessor: (c) => <span className="text-slate-600">{c.email || '—'}</span> },
    { header: 'Phone', accessor: (c) => <span className="text-slate-600">{c.phone || '—'}</span> },
    { header: 'Company', accessor: (c) => <span className="text-slate-600">{c.company || '—'}</span> },
    { header: 'Title', accessor: (c) => <span className="text-slate-600">{c.title || c.jobTitle || '—'}</span> },
    {
      header: 'Source',
      accessor: (c) => <span className="capitalize text-slate-600">{c.leadSource ? String(c.leadSource).replace('-', ' ') : '—'}</span>,
    },
    {
      header: 'Last Contact',
      accessor: (c) => {
        const raw = c.lastContact || c.lastContacted;
        return <span className="text-slate-500">{raw ? String(raw).split('T')[0] : 'N/A'}</span>;
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Contacts"
        description="Manage your customer and prospect relationships"
        actions={
          <>
            <ImportExportButtons
              config={{
                entityName: 'Contact',
                entityNamePlural: 'contacts',
                fields: CONTACT_FIELDS,
                getExportData: () => contacts,
                onImportRow: (row) => contactsApi.createContact(row),
                onImportComplete: fetchContacts,
              }}
            />
            <Button size="sm" onClick={openCreate}><PlusIcon className="h-4 w-4" /> Add Contact</Button>
          </>
        }
      />

      <div className="mb-4 flex items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search contacts..." className="sm:max-w-xs" />
        <span className="text-sm text-slate-500">{contacts.length} contact{contacts.length === 1 ? '' : 's'}</span>
      </div>

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <Card>
        <DataTable
          tableId="contacts_table"
          columns={columns}
          data={contacts}
          rowKey={(c) => c.id}
          loading={loading}
          showToolbar
          onRowClick={openPanel}
          totalEntries={contacts.length}
          emptyMessage='No contacts found. Click "Add Contact" to create one.'
          actions={(contact) => (
            <div className="flex justify-end gap-3">
              <button onClick={(e) => { e.stopPropagation(); openEdit(contact); }} className="text-slate-400 hover:text-[#168eea]" aria-label="Edit">
                <PencilSquareIcon className="h-4 w-4" />
              </button>
              <button onClick={(e) => { e.stopPropagation(); handleDelete(contact); }} className="text-slate-400 hover:text-red-600" aria-label="Delete">
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          )}
        />
      </Card>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-semibold text-slate-900">{editingId ? 'Edit Contact' : 'Add New Contact'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">First Name</label>
                  <input
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Last Name</label>
                  <input
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Email Address</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Phone</label>
                  <input
                    type="tel"
                    maxLength={10}
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '') })}
                    placeholder="10-digit number"
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Job Title</label>
                  <input
                    type="text"
                    placeholder="e.g. VP Sales"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Company</label>
                  <input
                    type="text"
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Source</label>
                  <select
                    value={formData.leadSource}
                    onChange={(e) => setFormData({ ...formData, leadSource: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  >
                    <option value="website">Website</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="referral">Referral</option>
                    <option value="event">Event</option>
                    <option value="social-media">Social Media</option>
                  </select>
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={submitting}>
                  {submitting ? 'Saving...' : editingId ? 'Update Contact' : 'Save Contact'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
      {panelContact && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={() => setPanelContact(null)}>
          <div className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-semibold text-slate-900">Contact Details</h3>
              <button onClick={() => setPanelContact(null)} className="text-slate-400 hover:text-slate-600">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
                {`${(panelContact.firstName || 'C').charAt(0)}${(panelContact.lastName || '').charAt(0)}`.toUpperCase()}
              </div>
              <div>
                <p className="text-base font-semibold text-slate-900">
                  {panelContact.firstName} {panelContact.lastName}
                </p>
                {panelContact.leadId && (
                  <Link href={`/leads/${panelContact.leadId}`} className="text-xs font-medium text-[#168eea] hover:underline">
                    View source Lead {panelContact.leadNumber || `#${panelContact.leadId}`} →
                  </Link>
                )}
              </div>
              {canEditContacts && !panelEditing && (
                <button
                  onClick={() => setPanelEditing(true)}
                  className="ml-auto flex items-center gap-1 text-xs font-medium text-[#168eea] hover:underline"
                >
                  <PencilSquareIcon className="h-3.5 w-3.5" /> Edit
                </button>
              )}
            </div>

            {panelEditing ? (
              <div className="mt-5 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">First Name</label>
                    <input
                      value={panelForm.firstName}
                      onChange={(e) => setPanelForm({ ...panelForm, firstName: e.target.value })}
                      className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Last Name</label>
                    <input
                      value={panelForm.lastName}
                      onChange={(e) => setPanelForm({ ...panelForm, lastName: e.target.value })}
                      className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Email</label>
                  <input
                    type="email"
                    value={panelForm.email}
                    onChange={(e) => setPanelForm({ ...panelForm, email: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Phone</label>
                    <input
                      type="tel"
                      maxLength={10}
                      value={panelForm.phone}
                      onChange={(e) => setPanelForm({ ...panelForm, phone: e.target.value.replace(/\D/g, '') })}
                      placeholder="10-digit number"
                      className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Job Title</label>
                    <input
                      value={panelForm.title}
                      onChange={(e) => setPanelForm({ ...panelForm, title: e.target.value })}
                      className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Company</label>
                  <input
                    value={panelForm.company}
                    onChange={(e) => setPanelForm({ ...panelForm, company: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => setPanelEditing(false)}>
                    Cancel
                  </Button>
                  <Button type="button" size="sm" onClick={handlePanelSave} disabled={panelSaving}>
                    {panelSaving ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              </div>
            ) : (
              <dl className="mt-5 space-y-3 text-sm">
                <div>
                  <dt className="text-xs font-medium uppercase text-slate-400">Email</dt>
                  <dd className="text-slate-700">{panelContact.email || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase text-slate-400">Phone</dt>
                  <dd className="text-slate-700">{panelContact.phone || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase text-slate-400">Job Title</dt>
                  <dd className="text-slate-700">{panelContact.title || panelContact.jobTitle || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase text-slate-400">Company</dt>
                  <dd className="text-slate-700">{panelContact.company || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase text-slate-400">Source</dt>
                  <dd className="capitalize text-slate-700">{panelContact.leadSource ? String(panelContact.leadSource).replace('-', ' ') : '—'}</dd>
                </div>
              </dl>
            )}

            {panelContact.company && (
              <div className="mt-6 border-t border-slate-100 pt-4">
                <h4 className="text-sm font-semibold text-slate-900">Other contacts at {panelContact.company}</h4>
                {relatedContacts.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-400">No other contacts found for this company.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {relatedContacts.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => openPanel(c)}
                        className="flex w-full items-center gap-2 rounded-md border border-slate-100 p-2 text-left text-sm hover:bg-slate-50"
                      >
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">
                          {`${(c.firstName || 'C').charAt(0)}${(c.lastName || '').charAt(0)}`.toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{c.firstName} {c.lastName}</p>
                          <p className="text-xs text-slate-500">{c.title || c.jobTitle || '—'}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
