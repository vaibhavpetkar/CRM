'use client';

import { useCallback, useEffect, useState } from 'react';
import PageHeader from '@/components/ui/page-header';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { templatesApi } from '@/lib/api';
import { PlusIcon, EnvelopeIcon, DevicePhoneMobileIcon, XMarkIcon, TrashIcon } from '@heroicons/react/24/outline';
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
      await templatesApi.createTemplate(formData);
      setIsModalOpen(false);
      setFormData(emptyForm);
      fetchTemplates();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create template');
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

  const handleUse = async (template: any) => {
    try {
      await templatesApi.useTemplate(template.id);
      fetchTemplates();
    } catch (err: any) {
      toast.error(err.message || 'Failed to record template use');
    }
  };

  return (
    <>
      <PageHeader
        title="Templates"
        description="Reusable email and SMS templates for your campaigns"
        actions={<Button size="sm" onClick={() => setIsModalOpen(true)}><PlusIcon className="h-4 w-4" /> New Template</Button>}
      />

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="flex h-48 items-center justify-center"><LoadingSpinner size="md" /></div>
      ) : templates.length === 0 ? (
        <Card><p className="py-6 text-center text-slate-400">No templates yet. Click &quot;New Template&quot; to create one.</p></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Card
              key={template.id}
              onClick={() => handleUse(template)}
              className="cursor-pointer !border-2 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                {template.type === 'email' ? (
                  <EnvelopeIcon className="h-5 w-5 text-[#168eea]" />
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
              <p className="mt-1 text-xs text-slate-500">
                Used {template.usageCount} times
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
              <h3 className="text-lg font-semibold text-slate-900">New Template</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
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
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
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
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-700">Content</label>
                <textarea
                  rows={4}
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                />
              </div>

              <div className="mt-4 flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={submitting}>{submitting ? 'Saving...' : 'Save Template'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
