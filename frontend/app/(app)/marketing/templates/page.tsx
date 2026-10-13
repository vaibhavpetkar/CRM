'use client';

import { useCallback, useEffect, useState } from 'react';
import PageHeader from '@/components/ui/page-header';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { templatesApi } from '@/lib/api';
import { PlusIcon, EnvelopeIcon, DevicePhoneMobileIcon, XMarkIcon, TrashIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import { useToast } from '@/components/ui/toast';

const emptyForm = { name: '', type: 'email', category: '', subject: '', content: '' };

export default function TemplatesPage() {
  const toast = useToast();
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | string | null>(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await templatesApi.getTemplates();
      setTemplates(res.templates || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load templates. Is the backend running?');
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingId) {
        await templatesApi.updateTemplate(editingId, formData);
        toast.success('Template saved');
      } else {
        await templatesApi.createTemplate(formData);
      }
      closeModal();
      fetchTemplates();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save template');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (template: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete template "${template.name}"?`)) return;
    try {
      await templatesApi.deleteTemplate(template.id);
      fetchTemplates();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete template');
    }
  };

  const openNew = () => {
    setEditingId(null);
    setFormData(emptyForm);
    setIsModalOpen(true);
  };

  // Clicking a card opens the template to read or edit. It no longer counts
  // as a use: that inflated "Used N times" on every look.
  const openTemplate = (template: any) => {
    setEditingId(template.id);
    setFormData({
      name: template.name || '',
      type: template.type || 'email',
      category: template.category || '',
      subject: template.subject || '',
      content: template.content || '',
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setFormData(emptyForm);
  };

  // Copying the text out to send it is an actual use, so that is what the
  // usage counter records.
  const handleCopy = async () => {
    const text = formData.type === 'email' && formData.subject ? `${formData.subject}\n\n${formData.content}` : formData.content;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      toast.error('Could not copy. Select the text and copy it instead.');
      return;
    }
    toast.success('Template copied');
    if (!editingId) return;
    try {
      await templatesApi.useTemplate(editingId);
      fetchTemplates();
    } catch {
      // The copy worked; a missed counter bump is not worth an error.
    }
  };

  return (
    <>
      <PageHeader
        title="Templates"
        description="Reusable email and SMS templates for your campaigns"
        actions={<Button size="sm" onClick={openNew}><PlusIcon className="h-4 w-4" /> New Template</Button>}
      />

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="flex h-48 items-center justify-center"><LoadingSpinner size="md" /></div>
      ) : templates.length === 0 ? (
        <Card><p className="py-6 text-center text-slate-400">No templates yet. Click &quot;New Template&quot; to create one.</p></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Card
              key={template.id}
              onClick={() => openTemplate(template)}
              className="cursor-pointer !border-2 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                {template.type === 'email' ? (
                  <EnvelopeIcon className="h-5 w-5 text-[var(--primary)]" />
                ) : (
                  <DevicePhoneMobileIcon className="h-5 w-5 text-emerald-500" />
                )}
                <div className="flex items-center gap-2">
                  {template.category && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{template.category}</span>
                  )}
                  <button onClick={(e) => handleDelete(template, e)} className="text-slate-300 hover:text-red-600" aria-label="Delete">
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <h3 className="mt-3 text-sm font-medium text-slate-900">{template.name}</h3>
              {(template.subject || template.content) && (
                <p className="mt-1 line-clamp-2 text-xs text-slate-500">{template.subject || template.content}</p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                Used {template.usageCount || 0} {template.usageCount === 1 ? 'time' : 'times'}
                {template.lastUsed ? ` \u00b7 Last used ${String(template.lastUsed).split('T')[0]}` : ''}
              </p>
            </Card>
          ))}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-semibold text-slate-900">{editingId ? 'Template' : 'New Template'}</h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700">Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm focus:border-[var(--primary)] focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm focus:border-[var(--primary)] focus:outline-none"
                  >
                    <option value="email">Email</option>
                    <option value="sms">SMS</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Category</label>
                  <input
                    type="text"
                    placeholder="e.g. Onboarding"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm focus:border-[var(--primary)] focus:outline-none"
                  />
                </div>
              </div>
              {formData.type === 'email' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700">Subject Line</label>
                  <input
                    type="text"
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm focus:border-[var(--primary)] focus:outline-none"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-700">Content</label>
                <textarea
                  rows={editingId ? 8 : 4}
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm focus:border-[var(--primary)] focus:outline-none"
                />
              </div>

              <div className="mt-4 flex items-center justify-end gap-2 pt-2">
                {formData.content && (
                  <Button type="button" variant="secondary" size="sm" onClick={handleCopy} className="mr-auto">
                    <ClipboardDocumentIcon className="h-4 w-4" /> Copy
                  </Button>
                )}
                <Button type="button" variant="secondary" size="sm" onClick={closeModal}>Cancel</Button>
                <Button type="submit" size="sm" disabled={submitting}>{submitting ? 'Saving...' : 'Save Template'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
