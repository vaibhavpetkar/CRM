'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import PageHeader from '@/components/ui/page-header';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { documentTemplatesApi, DocumentTemplate, DocTypeOption, MergeField } from '@/lib/api';
import { PlusIcon, XMarkIcon, PencilSquareIcon, TrashIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';
import { useToast } from '@/components/ui/toast';

const DEFAULT_STARTER_HTML = `<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1e293b;">
  <p>Hi,</p>
  <p>Please find attached <strong>{{quote_number}}</strong> for your review.</p>
  <p>Total: <strong>{{total_amount}}</strong><br/>
  Valid until: {{valid_until}}</p>
  <p>Thanks,<br/>{{company_name}}</p>
</div>`;

/** Client-side mirror of the backend's renderTemplate() — used for instant preview without a round-trip on every keystroke. */
function renderClientSide(template: string, data: Record<string, string>): string {
  if (!template) return '';
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => (data[key] !== undefined ? data[key] : ''));
}

export default function DocumentTemplatesPage() {
  const toast = useToast();
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [docTypes, setDocTypes] = useState<DocTypeOption[]>([]);
  const [filterDocType, setFilterDocType] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<DocumentTemplate | 'new' | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tRes, dtRes] = await Promise.all([documentTemplatesApi.getTemplates(), documentTemplatesApi.getDocTypes()]);
      setTemplates(tRes.templates || []);
      setDocTypes(dtRes.docTypes || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load templates. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const visibleTemplates = filterDocType === 'all' ? templates : templates.filter((t) => t.docType === filterDocType);

  const docTypeLabel = (value: string) => docTypes.find((d) => d.value === value)?.label || value;

  const handleDelete = async (template: DocumentTemplate) => {
    if (!confirm(`Delete template "${template.name}"?`)) return;
    try {
      await documentTemplatesApi.deleteTemplate(template.id);
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete template');
    }
  };

  return (
    <>
      <PageHeader
        title="Document Templates"
        description="HTML+CSS templates with {{field}} placeholders for automatic document emails. The default template for a document type is what actually gets used when it's sent — e.g. Quotes use the default 'quote' template when you click Send."
        actions={<Button size="sm" onClick={() => setEditingTemplate('new')}><PlusIcon className="h-4 w-4" /> New Template</Button>}
      />

      <div className="mb-4 flex items-center gap-3">
        <select
          value={filterDocType}
          onChange={(e) => setFilterDocType(e.target.value)}
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea]"
        >
          <option value="all">All document types</option>
          {docTypes.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
        <span className="text-sm text-slate-500">{visibleTemplates.length} template{visibleTemplates.length === 1 ? '' : 's'}</span>
      </div>

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="flex h-48 items-center justify-center"><LoadingSpinner size="md" /></div>
      ) : visibleTemplates.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-slate-400">No templates yet. Click &quot;New Template&quot; to create one.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleTemplates.map((template) => (
            <Card key={template.id} className="!border-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <DocumentTextIcon className="h-5 w-5 text-[#168eea]" />
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{docTypeLabel(template.docType)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setEditingTemplate(template)} className="text-slate-400 hover:text-[var(--primary)]" aria-label="Edit">
                    <PencilSquareIcon className="h-4 w-4" />
                  </button>
                  <button onClick={() => handleDelete(template)} className="text-slate-300 hover:text-red-600" aria-label="Delete">
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <h3 className="mt-3 flex items-center gap-1.5 text-sm font-medium text-slate-900">
                {template.name}
                {template.isDefault && <StarIconSolid className="h-3.5 w-3.5 text-amber-400" title="Default template" />}
              </h3>
              <p className="mt-1 truncate text-xs text-slate-500">{template.subject || 'No subject set'}</p>
              {template.isDefault && <p className="mt-2 text-[11px] font-medium text-amber-600">In use — this is the default for {docTypeLabel(template.docType)}</p>}
            </Card>
          ))}
        </div>
      )}

      {editingTemplate && (
        <TemplateEditorModal
          template={editingTemplate === 'new' ? null : editingTemplate}
          docTypes={docTypes}
          onClose={() => setEditingTemplate(null)}
          onSaved={() => {
            setEditingTemplate(null);
            fetchAll();
          }}
        />
      )}
    </>
  );
}

function TemplateEditorModal({
  template,
  docTypes,
  onClose,
  onSaved,
}: {
  template: DocumentTemplate | null;
  docTypes: DocTypeOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(template?.name || '');
  const [docType, setDocType] = useState(template?.docType || docTypes[0]?.value || 'quote');
  const [subject, setSubject] = useState(template?.subject || '');
  const [htmlBody, setHtmlBody] = useState(template?.htmlBody || (template ? '' : DEFAULT_STARTER_HTML));
  const [isDefault, setIsDefault] = useState(template?.isDefault || false);
  const [mergeFields, setMergeFields] = useState<MergeField[]>([]);
  const [sampleData, setSampleData] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const htmlRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const [focusedField, setFocusedField] = useState<'subject' | 'html'>('html');

  useEffect(() => {
    documentTemplatesApi
      .getMergeFields(docType)
      .then((res) => {
        setMergeFields(res.fields);
        setSampleData(res.sample);
      })
      .catch(() => {
        setMergeFields([]);
        setSampleData({});
      });
  }, [docType]);

  const insertField = (key: string) => {
    const token = `{{${key}}}`;
    if (focusedField === 'subject' && subjectRef.current) {
      const el = subjectRef.current;
      const pos = el.selectionStart ?? subject.length;
      const next = subject.slice(0, pos) + token + subject.slice(pos);
      setSubject(next);
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(pos + token.length, pos + token.length); });
    } else if (htmlRef.current) {
      const el = htmlRef.current;
      const pos = el.selectionStart ?? htmlBody.length;
      const next = htmlBody.slice(0, pos) + token + htmlBody.slice(pos);
      setHtmlBody(next);
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(pos + token.length, pos + token.length); });
    }
  };

  const previewSubject = useMemo(() => renderClientSide(subject, sampleData), [subject, sampleData]);
  const previewHtml = useMemo(() => renderClientSide(htmlBody, sampleData), [htmlBody, sampleData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error('Name is required');

    setSubmitting(true);
    try {
      const payload = { name: name.trim(), docType, subject, htmlBody, isDefault };
      if (template) {
        await documentTemplatesApi.updateTemplate(template.id, payload);
      } else {
        await documentTemplatesApi.createTemplate(payload);
      }
      toast.success('Template saved.');
      onSaved();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save template');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-3">
          <h3 className="text-lg font-semibold text-slate-900">{template ? 'Edit Template' : 'New Template'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
            {/* Left: editor */}
            <div className="flex min-h-0 flex-col overflow-y-auto border-r border-slate-100 p-5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Template Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                    placeholder="e.g. Standard Quote Email"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Document Type</label>
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                    disabled={!!template}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    {docTypes.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="mt-3 flex items-center gap-2 text-xs text-slate-700">
                <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="rounded border-slate-300" />
                Use as the default template for {docTypes.find((d) => d.value === docType)?.label || docType} (this is what actually gets sent)
              </label>

              <div className="mt-4">
                <label className="block text-xs font-medium text-slate-700">Subject Line</label>
                <input
                  ref={subjectRef}
                  type="text"
                  value={subject}
                  onFocus={() => setFocusedField('subject')}
                  onChange={(e) => setSubject(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                  placeholder="e.g. Quotation {{quote_number}} from {{company_name}}"
                />
              </div>

              <div className="mt-4 flex min-h-0 flex-1 flex-col">
                <label className="block text-xs font-medium text-slate-700">HTML + CSS Body</label>
                <textarea
                  ref={htmlRef}
                  value={htmlBody}
                  onFocus={() => setFocusedField('html')}
                  onChange={(e) => setHtmlBody(e.target.value)}
                  className="mt-1 min-h-[220px] flex-1 rounded-md border border-slate-200 p-3 font-mono text-xs leading-relaxed focus:border-[#168eea] focus:outline-none"
                  spellCheck={false}
                />
              </div>

              <div className="mt-4">
                <p className="mb-1.5 text-xs font-medium text-slate-700">Insert Field</p>
                <div className="flex flex-wrap gap-1.5">
                  {mergeFields.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => insertField(f.key)}
                      className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-mono text-slate-600 hover:border-[#168eea] hover:text-[#168eea]"
                      title={f.label}
                    >
                      {`{{${f.key}}}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: live preview */}
            <div className="flex min-h-0 flex-col bg-slate-50 p-5">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Live Preview (sample data)</p>
              <div className="rounded-md border border-slate-200 bg-white p-3">
                <p className="mb-2 border-b border-slate-100 pb-2 text-sm font-medium text-slate-900">
                  {previewSubject || <span className="text-slate-300">Subject preview appears here</span>}
                </p>
                <iframe
                  title="Template preview"
                  className="h-[420px] w-full rounded border-0"
                  sandbox=""
                  srcDoc={previewHtml || '<p style="font-family:sans-serif;color:#94a3b8;padding:8px">Body preview appears here</p>'}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-3">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={submitting}>{submitting ? 'Saving...' : 'Save Template'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
