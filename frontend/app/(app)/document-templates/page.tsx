'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/ui/page-header';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { documentTemplatesApi, openPrintWindow, DocumentTemplate, DocTypeOption, MergeField, MergeList, TemplatePurpose } from '@/lib/api';
import { renderTemplate, wrapPrintPreview } from '@/lib/template-render';
import { PlusIcon, XMarkIcon, PencilSquareIcon, TrashIcon, DocumentTextIcon, PrinterIcon, EnvelopeIcon, DocumentDuplicateIcon, Squares2X2Icon, CodeBracketIcon } from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

const PURPOSE_TABS: { value: TemplatePurpose; label: string; icon: typeof PrinterIcon; help: string }[] = [
  {
    value: 'print',
    label: 'Print Formats',
    icon: PrinterIcon,
    help: "The layout used when you click Print on a quote, invoice, task or meeting (and the customer's quote link). The default format for each type is used unless you pick another from the Print menu.",
  },
  {
    value: 'email',
    label: 'Emails',
    icon: EnvelopeIcon,
    help: "The email body sent with a document. Quotes use the default quote email when you click Send.",
  },
];

export default function DocumentTemplatesPage() {
  const toast = useToast();
  const router = useRouter();
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [docTypes, setDocTypes] = useState<DocTypeOption[]>([]);
  const [purpose, setPurpose] = useState<TemplatePurpose>('print');
  const [filterDocType, setFilterDocType] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ template: DocumentTemplate | null; copyOf?: DocumentTemplate } | null>(null);

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

  const visibleTemplates = templates.filter(
    (t) => (t.purpose || 'email') === purpose && (filterDocType === 'all' || t.docType === filterDocType)
  );

  const docTypeLabel = (value: string) => docTypes.find((d) => d.value === value)?.label || value;
  const activeTab = PURPOSE_TABS.find((t) => t.value === purpose)!;

  const handleDelete = async (template: DocumentTemplate) => {
    if (!confirm(`Delete template "${template.name}"?`)) return;
    try {
      await documentTemplatesApi.deleteTemplate(template.id);
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete template');
    }
  };

  const makeDefault = async (template: DocumentTemplate) => {
    try {
      await documentTemplatesApi.updateTemplate(template.id, { isDefault: true });
      toast.success(`"${template.name}" is now the default ${docTypeLabel(template.docType)} ${template.purpose === 'print' ? 'print format' : 'email'}.`);
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update template');
    }
  };

  return (
    <>
      <PageHeader
        title="Document Templates"
        description="HTML+CSS templates with {{field}} placeholders for printing and emailing your documents."
        actions={
          purpose === 'print' ? (
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setEditing({ template: null })}><CodeBracketIcon className="h-4 w-4" /> New in HTML</Button>
              <Button size="sm" onClick={() => router.push(`/document-templates/builder${filterDocType !== 'all' ? `?docType=${filterDocType}` : ''}`)}>
                <Squares2X2Icon className="h-4 w-4" /> New Print Format
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={() => setEditing({ template: null })}><PlusIcon className="h-4 w-4" /> New Email Template</Button>
          )
        }
      />

      <div className="mb-3 flex gap-1 border-b border-slate-200">
        {PURPOSE_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setPurpose(tab.value)}
            className={cn(
              '-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium',
              purpose === tab.value ? 'border-[#168eea] text-[#168eea]' : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
          >
            <tab.icon className="h-4 w-4" /> {tab.label}
          </button>
        ))}
      </div>
      <p className="mb-4 text-xs text-slate-500">{activeTab.help}</p>

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
          <p className="py-6 text-center text-slate-400">
            {purpose === 'print'
              ? 'No print formats yet, so documents print with the standard layout. Click "New Print Format" to design one with drag and drop.'
              : 'No email templates yet. Click "New Email Template" to create one.'}
          </p>
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
                  <button
                    onClick={() => (template.layout ? router.push(`/document-templates/builder?id=${template.id}`) : setEditing({ template }))}
                    className="text-slate-400 hover:text-[var(--primary)]"
                    aria-label="Edit"
                    title={template.layout ? 'Edit in the drag and drop builder' : 'Edit'}
                  >
                    <PencilSquareIcon className="h-4 w-4" />
                  </button>
                  <button onClick={() => setEditing({ template: null, copyOf: template })} className="text-slate-400 hover:text-[var(--primary)]" aria-label="Duplicate" title="Duplicate">
                    <DocumentDuplicateIcon className="h-4 w-4" />
                  </button>
                  <button onClick={() => handleDelete(template)} className="text-slate-300 hover:text-red-600" aria-label="Delete" title="Delete">
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <h3 className="mt-3 flex items-center gap-1.5 text-sm font-medium text-slate-900">
                {template.name}
                {template.isDefault && <StarIconSolid className="h-3.5 w-3.5 text-amber-400" title="Default template" />}
              </h3>
              {template.purpose !== 'print' && <p className="mt-1 truncate text-xs text-slate-500">{template.subject || 'No subject set'}</p>}
              {template.purpose === 'print' && (
                <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                  {template.layout ? 'Drag and drop design' : 'HTML template'}
                  {template.layout && (
                    <button onClick={() => setEditing({ template })} className="text-[11px] text-slate-400 hover:text-[#168eea]">Edit HTML</button>
                  )}
                </p>
              )}
              {template.isDefault ? (
                <p className="mt-2 text-[11px] font-medium text-amber-600">In use: the default for {docTypeLabel(template.docType)}</p>
              ) : (
                <button onClick={() => makeDefault(template)} className="mt-2 text-[11px] font-medium text-[#168eea] hover:underline">
                  Make default
                </button>
              )}
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <TemplateEditorModal
          template={editing.template}
          copyOf={editing.copyOf}
          initialPurpose={purpose}
          initialDocType={filterDocType !== 'all' ? filterDocType : undefined}
          docTypes={docTypes}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            fetchAll();
          }}
        />
      )}
    </>
  );
}

function TemplateEditorModal({
  template,
  copyOf,
  initialPurpose,
  initialDocType,
  docTypes,
  onClose,
  onSaved,
}: {
  template: DocumentTemplate | null;
  copyOf?: DocumentTemplate;
  initialPurpose: TemplatePurpose;
  initialDocType?: string;
  docTypes: DocTypeOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const source = template || copyOf;
  const [name, setName] = useState(template?.name || (copyOf ? `${copyOf.name} (copy)` : ''));
  const [purpose, setPurpose] = useState<TemplatePurpose>(source?.purpose || initialPurpose);
  const [docType, setDocType] = useState(source?.docType || initialDocType || docTypes[0]?.value || 'quote');
  const [subject, setSubject] = useState(source?.subject || '');
  const [htmlBody, setHtmlBody] = useState(source?.htmlBody || '');
  const [isDefault, setIsDefault] = useState(template?.isDefault || false);
  const [mergeFields, setMergeFields] = useState<MergeField[]>([]);
  const [mergeLists, setMergeLists] = useState<MergeList[]>([]);
  const [sampleData, setSampleData] = useState<Record<string, unknown>>({});
  const [recordId, setRecordId] = useState('');
  const [recordResult, setRecordResult] = useState<{ key: string; subject: string; html: string } | null>(null);
  const [unknownFields, setUnknownFields] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  // A brand-new template follows the starter for its type until the user edits it.
  const [touched, setTouched] = useState(!!source);
  const htmlRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const [focusedField, setFocusedField] = useState<'subject' | 'html'>('html');

  useEffect(() => {
    documentTemplatesApi
      .getMergeFields(docType)
      .then((res) => {
        setMergeFields(res.fields);
        setMergeLists(res.lists || []);
        setSampleData(res.sample);
      })
      .catch(() => {
        setMergeFields([]);
        setMergeLists([]);
        setSampleData({});
      });
  }, [docType]);

  useEffect(() => {
    if (touched) return;
    documentTemplatesApi
      .getStarter(docType, purpose)
      .then((res) => {
        setSubject(res.subject);
        setHtmlBody(res.htmlBody);
      })
      .catch(() => {});
  }, [docType, purpose, touched]);

  const insertAtCursor = (token: string) => {
    setTouched(true);
    if (purpose === 'email' && focusedField === 'subject' && subjectRef.current) {
      const el = subjectRef.current;
      const pos = el.selectionStart ?? subject.length;
      setSubject(subject.slice(0, pos) + token + subject.slice(pos));
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(pos + token.length, pos + token.length); });
    } else if (htmlRef.current) {
      const el = htmlRef.current;
      const pos = el.selectionStart ?? htmlBody.length;
      setHtmlBody(htmlBody.slice(0, pos) + token + htmlBody.slice(pos));
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(pos + token.length, pos + token.length); });
    }
  };

  const insertList = (list: MergeList) => {
    const cells = list.fields.map((f) => `<td>{{${f.key}}}</td>`).join('');
    insertAtCursor(`<table>\n  <tr>${list.fields.map((f) => `<th>${f.label}</th>`).join('')}</tr>\n  {{#${list.key}}}<tr>${cells}</tr>{{/${list.key}}}\n</table>`);
  };

  const groupedFields = useMemo(() => {
    const groups: Record<string, MergeField[]> = {};
    for (const f of mergeFields) (groups[f.group || 'Fields'] ||= []).push(f);
    return Object.entries(groups);
  }, [mergeFields]);

  // Real-record previews are fetched on demand; any edit makes them stale, so they only apply while the inputs match.
  const previewKey = `${docType}\u0000${subject}\u0000${htmlBody}`;
  const recordPreview = recordResult && recordResult.key === previewKey ? recordResult : null;
  const previewSubject = recordPreview ? recordPreview.subject : renderTemplate(subject, sampleData);
  const previewBody = recordPreview ? recordPreview.html : renderTemplate(htmlBody, sampleData, { escapeHtml: true });
  const previewDoc = purpose === 'print' ? wrapPrintPreview(previewBody) : previewBody;

  const loadRecordPreview = async () => {
    if (!recordId.trim()) {
      setRecordResult(null);
      return;
    }
    try {
      const res = await documentTemplatesApi.preview({ docType, subject, htmlBody, recordId: recordId.trim() });
      setRecordResult({ key: previewKey, subject: res.subject, html: res.html });
      setUnknownFields(res.unknownFields);
    } catch (err: any) {
      toast.error(err.message || 'Could not load that record');
    }
  };

  const testPrint = () => {
    openPrintWindow(documentTemplatesApi.previewPage({ docType, htmlBody, recordId: recordId.trim() || undefined, autoPrint: true })).catch((err) =>
      toast.error(err.message || 'Could not open the print preview')
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error('Name is required');

    setSubmitting(true);
    try {
      // A duplicate of a builder design stays a builder design as long as its HTML wasn't hand-edited.
      const keepLayout = !template && copyOf?.layout && htmlBody === copyOf.htmlBody ? copyOf.layout : undefined;
      const payload = { name: name.trim(), docType, purpose, subject: purpose === 'print' ? '' : subject, htmlBody, isDefault, layout: keepLayout };
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

  const docLabel = docTypes.find((d) => d.value === docType)?.label || docType;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-3">
          <h3 className="text-lg font-semibold text-slate-900">
            {template ? 'Edit' : 'New'} {purpose === 'print' ? 'Print Format' : 'Email Template'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
            {/* Left: editor */}
            <div className="flex min-h-0 flex-col overflow-y-auto border-r border-slate-100 p-5">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Template Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                    placeholder={purpose === 'print' ? 'e.g. Quotation with logo' : 'e.g. Standard Quote Email'}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Used For</label>
                  <select
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value as TemplatePurpose)}
                    disabled={!!template}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    <option value="print">Print Format</option>
                    <option value="email">Email</option>
                  </select>
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
                {purpose === 'print'
                  ? `Use as the default print format for ${docLabel}`
                  : `Use as the default email for ${docLabel} (this is what actually gets sent)`}
              </label>

              {template?.layout && (
                <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-700">
                  This format was designed with drag and drop. Saving changes to its HTML here turns it into a plain HTML template, and it will no longer open in the builder.
                </p>
              )}

              {purpose === 'email' && (
                <div className="mt-4">
                  <label className="block text-xs font-medium text-slate-700">Subject Line</label>
                  <input
                    ref={subjectRef}
                    type="text"
                    value={subject}
                    onFocus={() => setFocusedField('subject')}
                    onChange={(e) => {
                      setTouched(true);
                      setSubject(e.target.value);
                    }}
                    className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                    placeholder="e.g. Quotation {{quote_number}} from {{company_name}}"
                  />
                </div>
              )}

              <div className="mt-4 flex shrink-0 flex-col">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-slate-700">HTML + CSS</label>
                  {!template && (
                    <button
                      type="button"
                      onClick={() => {
                        if (touched && !confirm('Replace your changes with the standard layout?')) return;
                        setTouched(false);
                      }}
                      className="text-[11px] text-[#168eea] hover:underline"
                    >
                      Reset to standard layout
                    </button>
                  )}
                </div>
                <textarea
                  ref={htmlRef}
                  value={htmlBody}
                  onFocus={() => setFocusedField('html')}
                  onChange={(e) => {
                    setTouched(true);
                    setHtmlBody(e.target.value);
                  }}
                  className="mt-1 h-80 resize-y rounded-md border border-slate-200 p-3 font-mono text-xs leading-relaxed focus:border-[#168eea] focus:outline-none"
                  spellCheck={false}
                />
              </div>

              <div className="mt-4 space-y-2">
                <p className="text-xs font-medium text-slate-700">Insert Field</p>
                {groupedFields.map(([group, fields]) => (
                  <div key={group}>
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">{group}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {fields.map((f) => (
                        <button
                          key={f.key}
                          type="button"
                          onClick={() => insertAtCursor(`{{${f.key}}}`)}
                          className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-600 hover:border-[#168eea] hover:text-[#168eea]"
                          title={f.label}
                        >
                          {`{{${f.key}}}`}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {mergeLists.length > 0 && (
                  <div>
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">Child tables (one row per entry)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {mergeLists.map((list) => (
                        <button
                          key={list.key}
                          type="button"
                          onClick={() => insertList(list)}
                          className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 font-mono text-[11px] text-emerald-700 hover:border-emerald-400"
                          title={`Inserts a table that repeats for every ${list.label.toLowerCase()} row. Fields: ${list.fields.map((f) => f.key).join(', ')}`}
                        >
                          {`{{#${list.key}}} … {{/${list.key}}}`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right: live preview */}
            <div className="flex min-h-0 flex-col bg-slate-50 p-5">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Live Preview ({recordPreview ? `${docLabel} #${recordId}` : 'sample data'})
                </p>
                <div className="ml-auto flex items-center gap-1.5">
                  <input
                    value={recordId}
                    onChange={(e) => setRecordId(e.target.value)}
                    placeholder={`${docLabel} ID`}
                    className="w-24 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs focus:border-[#168eea] focus:outline-none"
                    title="Preview with a real record by its ID (the number in its page address)"
                  />
                  <Button type="button" variant="secondary" size="sm" onClick={loadRecordPreview}>
                    {recordId.trim() ? 'Use record' : 'Sample'}
                  </Button>
                  {purpose === 'print' && (
                    <Button type="button" variant="secondary" size="sm" onClick={testPrint}>
                      <PrinterIcon className="h-4 w-4" /> Test print
                    </Button>
                  )}
                </div>
              </div>
              {unknownFields.length > 0 && recordPreview && (
                <p className="mb-2 text-[11px] text-amber-600">Unknown fields (print blank): {unknownFields.map((f) => `{{${f}}}`).join(', ')}</p>
              )}
              <div className="flex min-h-0 flex-1 flex-col rounded-md border border-slate-200 bg-white p-3">
                {purpose === 'email' && (
                  <p className="mb-2 border-b border-slate-100 pb-2 text-sm font-medium text-slate-900">
                    {previewSubject || <span className="text-slate-300">Subject preview appears here</span>}
                  </p>
                )}
                <iframe
                  title="Template preview"
                  className="min-h-[420px] w-full flex-1 rounded border-0"
                  sandbox=""
                  srcDoc={previewDoc || '<p style="font-family:sans-serif;color:#94a3b8;padding:8px">Preview appears here</p>'}
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
