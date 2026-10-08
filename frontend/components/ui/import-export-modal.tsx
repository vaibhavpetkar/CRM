'use client';

import { Fragment, useMemo, useRef, useState } from 'react';
import {
  XMarkIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  CloudArrowUpIcon,
  DocumentArrowDownIcon,
  TableCellsIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
  TrashIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import Button from './button';
import { cn } from '@/lib/utils';
import type { ImportExportConfig, ImportRow } from '@/lib/import-export/types';
import { runExport, downloadTemplate, type ExportFormat } from '@/lib/import-export/exporters';
import { parseImportFile } from '@/lib/import-export/parse';
import { validateCell } from '@/lib/import-export/validate';
import { useToast } from '@/components/ui/toast';

type Tab = 'export' | 'import';

type Props = {
  open: boolean;
  onClose: () => void;
  config: ImportExportConfig;
  initialTab?: Tab;
};

const FORMATS: { id: ExportFormat; label: string; icon: typeof TableCellsIcon; hint: string }[] = [
  { id: 'excel', label: 'Excel', icon: TableCellsIcon, hint: '.xlsx' },
  { id: 'csv', label: 'CSV', icon: DocumentTextIcon, hint: '.csv' },
  { id: 'pdf', label: 'PDF', icon: DocumentArrowDownIcon, hint: '.pdf' },
  { id: 'word', label: 'Word', icon: DocumentTextIcon, hint: '.docx' },
];

export default function ImportExportModal({ open, onClose, config, initialTab = 'export' }: Props) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>(initialTab);

  // ── Export state ──────────────────────────────────────────────────────────
  const [format, setFormat] = useState<ExportFormat>('excel');
  const childTable = config.childTable;
  const childKey = (key: string) => `${childTable?.key}.${key}`;
  const allFieldKeys = useMemo(
    () => [...config.fields.map((f) => f.key), ...(childTable?.fields ?? []).map((f) => `${childTable!.key}.${f.key}`)],
    [config.fields, childTable]
  );
  const [selectedFields, setSelectedFields] = useState<Set<string>>(
    () =>
      new Set([
        ...config.fields.filter((f) => f.defaultExport !== false).map((f) => f.key),
        ...(childTable?.fields ?? []).filter((f) => f.defaultExport !== false).map((f) => `${childTable!.key}.${f.key}`),
      ])
  );
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // ── Import state ───────────────────────────────────────────────────────────
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<{ done: number; total: number } | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const exportFields = useMemo(() => config.fields.filter((f) => selectedFields.has(f.key)), [config.fields, selectedFields]);
  const exportChildFields = useMemo(
    () => (childTable?.fields ?? []).filter((f) => selectedFields.has(`${childTable!.key}.${f.key}`)),
    [childTable, selectedFields]
  );
  const importFields = useMemo(() => config.fields.filter((f) => !f.exportOnly), [config.fields]);
  const importChildFields = useMemo(() => (childTable?.fields ?? []).filter((f) => !f.exportOnly), [childTable]);
  const exportColumnCount = exportFields.length + exportChildFields.length;

  const selectedCount = rows.filter((r) => r.__selected).length;
  const successCount = rows.filter((r) => r.__status === 'success').length;
  const errorCount = rows.filter((r) => r.__status === 'error').length;

  if (!open) return null;

  const toggleField = (key: string) => {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleExport = async () => {
    setExportError(null);
    setExporting(true);
    try {
      const data = await config.getExportData();
      await runExport(
        format,
        data,
        exportFields,
        config.entityNamePlural,
        childTable && exportChildFields.length ? { table: childTable, fields: exportChildFields } : undefined,
        config.groupKey
      );
    } catch (err: any) {
      setExportError(err.message || 'Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleFile = async (file: File) => {
    setImportSummary(null);
    try {
      const parsed = await parseImportFile(file, config.fields, childTable, config.groupKey);
      setRows(parsed);
      setExpandedRows(new Set());
    } catch (err: any) {
      toast.error(err.message || 'Could not read that file. Please upload an Excel or CSV file.');
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const updateCell = (rowId: string, key: string, value: string) => {
    setRows((prev) => prev.map((r) => (r.__rowId === rowId ? { ...r, [key]: value } : r)));
  };

  const updateChildCell = (rowId: string, childIdx: number, key: string, value: string) => {
    if (!childTable) return;
    setRows((prev) =>
      prev.map((r) =>
        r.__rowId === rowId
          ? { ...r, [childTable.key]: r[childTable.key].map((c: any, i: number) => (i === childIdx ? { ...c, [key]: value } : c)) }
          : r
      )
    );
  };

  const addChildRow = (rowId: string) => {
    if (!childTable) return;
    setRows((prev) => prev.map((r) => (r.__rowId === rowId ? { ...r, [childTable.key]: [...r[childTable.key], {}] } : r)));
  };

  const removeChildRow = (rowId: string, childIdx: number) => {
    if (!childTable) return;
    setRows((prev) =>
      prev.map((r) =>
        r.__rowId === rowId ? { ...r, [childTable.key]: r[childTable.key].filter((_: any, i: number) => i !== childIdx) } : r
      )
    );
  };

  const toggleExpanded = (rowId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const toggleRow = (rowId: string) => {
    setRows((prev) => prev.map((r) => (r.__rowId === rowId ? { ...r, __selected: !r.__selected } : r)));
  };

  const toggleAll = (checked: boolean) => {
    setRows((prev) => prev.map((r) => ({ ...r, __selected: checked })));
  };

  const removeRow = (rowId: string) => {
    setRows((prev) => prev.filter((r) => r.__rowId !== rowId));
  };

  const resetImport = () => {
    setRows([]);
    setExpandedRows(new Set());
    setImportSummary(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const validateRow = (row: ImportRow): string | null => {
    for (const field of importFields) {
      const error = validateCell(field, row[field.key]);
      if (error) return error;
    }
    if (childTable) {
      const children: any[] = row[childTable.key] || [];
      for (let i = 0; i < children.length; i += 1) {
        for (const field of importChildFields) {
          const error = validateCell(field, children[i][field.key]);
          if (error) return `${childTable.label} line ${i + 1}: ${error}`;
        }
      }
    }
    return null;
  };

  const handleImport = async () => {
    const targets = rows.filter((r) => r.__selected && r.__status !== 'success');
    if (targets.length === 0) return;
    setImporting(true);
    setImportSummary({ done: 0, total: targets.length });

    for (let i = 0; i < targets.length; i += 1) {
      const row = targets[i];
      const validationError = validateRow(row);
      if (validationError) {
        setRows((prev) =>
          prev.map((r) => (r.__rowId === row.__rowId ? { ...r, __status: 'error', __error: validationError } : r))
        );
        setImportSummary({ done: i + 1, total: targets.length });
        continue;
      }
      try {
        const { __rowId, __status, __error, __selected, ...record } = row;
        await config.onImportRow(record);
        setRows((prev) =>
          prev.map((r) => (r.__rowId === row.__rowId ? { ...r, __status: 'success', __error: undefined } : r))
        );
      } catch (err: any) {
        setRows((prev) =>
          prev.map((r) =>
            r.__rowId === row.__rowId ? { ...r, __status: 'error', __error: err.message || 'Import failed' } : r
          )
        );
      }
      setImportSummary({ done: i + 1, total: targets.length });
    }

    setImporting(false);
    config.onImportComplete?.();
  };

  const previewColumns = importFields.slice(0, 6);
  // checkbox + preview columns + (items) + status + remove
  const previewColSpan = previewColumns.length + (childTable ? 4 : 3);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Import &amp; Export {config.entityNamePlural[0].toUpperCase()}
              {config.entityNamePlural.slice(1)}
            </h3>
            <p className="text-xs text-slate-500">Move data in and out in a few clicks</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-100 px-6 pt-3">
          {(['export', 'import'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex items-center gap-1.5 rounded-t-md px-4 py-2 text-sm font-medium transition-colors',
                tab === t
                  ? 'border-b-2 border-[var(--primary)] text-[var(--primary)]'
                  : 'text-slate-500 hover:text-slate-700'
              )}
            >
              {t === 'export' ? <ArrowDownTrayIcon className="h-4 w-4" /> : <ArrowUpTrayIcon className="h-4 w-4" />}
              {t === 'export' ? 'Export' : 'Import'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === 'export' && (
            <div className="space-y-6">
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Choose a format</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {FORMATS.map(({ id, label, icon: Icon, hint }) => (
                    <button
                      key={id}
                      onClick={() => setFormat(id)}
                      className={cn(
                        'flex flex-col items-center gap-1.5 rounded-lg border p-3 text-sm transition-colors',
                        format === id
                          ? 'border-[var(--primary)] bg-[var(--primary)]/5 text-[var(--primary)]'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      )}
                    >
                      <Icon className="h-6 w-6" />
                      <span className="font-medium">{label}</span>
                      <span className="text-[10px] text-slate-400">{hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-700">Choose fields to include</p>
                  <div className="flex gap-3 text-xs">
                    <button
                      className="text-[var(--primary)] hover:underline"
                      onClick={() => setSelectedFields(new Set(allFieldKeys))}
                    >
                      Select all
                    </button>
                    <button className="text-slate-400 hover:underline" onClick={() => setSelectedFields(new Set())}>
                      Clear
                    </button>
                  </div>
                </div>
                <div className="grid max-h-48 grid-cols-2 gap-x-4 gap-y-2 overflow-y-auto rounded-lg border border-slate-100 p-3 sm:grid-cols-3">
                  {config.fields.map((field) => (
                    <label key={field.key} className="flex items-center gap-2 text-sm text-slate-600">
                      <input
                        type="checkbox"
                        checked={selectedFields.has(field.key)}
                        onChange={() => toggleField(field.key)}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-[var(--primary)] focus:ring-[var(--primary)]"
                      />
                      {field.label}
                    </label>
                  ))}
                </div>
                {childTable && (
                  <>
                    <p className="mb-2 mt-4 text-sm font-medium text-slate-700">
                      {childTable.label} <span className="font-normal text-slate-400">(one line per {childTable.label.toLowerCase().replace(/s$/, '')})</span>
                    </p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-slate-100 p-3 sm:grid-cols-3">
                      {childTable.fields.map((field) => (
                        <label key={field.key} className="flex items-center gap-2 text-sm text-slate-600">
                          <input
                            type="checkbox"
                            checked={selectedFields.has(childKey(field.key))}
                            onChange={() => toggleField(childKey(field.key))}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-[var(--primary)] focus:ring-[var(--primary)]"
                          />
                          {field.label}
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {exportError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{exportError}</div>
              )}
            </div>
          )}

          {tab === 'import' && (
            <div className="space-y-5">
              {rows.length === 0 ? (
                <>
                  <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center sm:flex-row sm:justify-between sm:text-left">
                    <div>
                      <p className="text-sm font-medium text-slate-700">1. Don&apos;t have a file yet?</p>
                      <p className="text-xs text-slate-500">Download a ready-made template with the correct columns.</p>
                      {childTable && (
                        <p className="mt-1 text-xs text-slate-500">
                          Put each {childTable.label.toLowerCase().replace(/s$/, '')} on its own line. Extra lines for the same{' '}
                          {config.entityName.toLowerCase()} leave the other columns blank
                          {config.groupKey ? ` or repeat its ${config.fields.find((f) => f.key === config.groupKey)?.label}` : ''}.
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" onClick={() => downloadTemplate(config.fields, config.entityNamePlural, 'excel', childTable)}>
                        <TableCellsIcon className="h-4 w-4" /> Excel template
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => downloadTemplate(config.fields, config.entityNamePlural, 'csv', childTable)}>
                        <DocumentTextIcon className="h-4 w-4" /> CSV template
                      </Button>
                    </div>
                  </div>

                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      'flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition-colors',
                      dragOver ? 'border-[var(--primary)] bg-[var(--primary)]/5' : 'border-slate-200 hover:border-slate-300'
                    )}
                  >
                    <CloudArrowUpIcon className="h-9 w-9 text-slate-400" />
                    <p className="text-sm font-medium text-slate-700">2. Upload your file</p>
                    <p className="text-xs text-slate-500">Drag &amp; drop, or click to browse · .xlsx, .xls or .csv</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFile(file);
                      }}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3">
                    <div className="flex items-center gap-4 text-xs text-slate-600">
                      <span>
                        <strong className="text-slate-900">{rows.length}</strong> rows found
                      </span>
                      {successCount > 0 && (
                        <span className="flex items-center gap-1 text-emerald-600">
                          <CheckCircleIcon className="h-4 w-4" /> {successCount} imported
                        </span>
                      )}
                      {errorCount > 0 && (
                        <span className="flex items-center gap-1 text-red-600">
                          <XCircleIcon className="h-4 w-4" /> {errorCount} failed
                        </span>
                      )}
                    </div>
                    <button
                      onClick={resetImport}
                      className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
                    >
                      <ArrowPathIcon className="h-3.5 w-3.5" /> Start over
                    </button>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-slate-100">
                    <table className="min-w-full divide-y divide-slate-100 text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="w-8 px-3 py-2">
                            <input
                              type="checkbox"
                              checked={rows.length > 0 && rows.every((r) => r.__selected)}
                              onChange={(e) => toggleAll(e.target.checked)}
                              className="h-3.5 w-3.5 rounded border-slate-300 text-[var(--primary)] focus:ring-[var(--primary)]"
                            />
                          </th>
                          {previewColumns.map((field) => (
                            <th key={field.key} className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-slate-500">
                              {field.label}
                              {field.required && <span className="text-red-400"> *</span>}
                            </th>
                          ))}
                          {childTable && (
                            <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-slate-500">{childTable.label}</th>
                          )}
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Status</th>
                          <th className="w-8 px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {rows.map((row) => (
                          <Fragment key={row.__rowId}>
                            <tr
                              className={cn(
                                row.__status === 'success' && 'bg-emerald-50',
                                row.__status === 'error' && 'bg-red-50'
                              )}
                            >
                              <td className="px-3 py-1.5">
                                <input
                                  type="checkbox"
                                  checked={row.__selected}
                                  disabled={row.__status === 'success'}
                                  onChange={() => toggleRow(row.__rowId)}
                                  className="h-3.5 w-3.5 rounded border-slate-300 text-[var(--primary)] focus:ring-[var(--primary)]"
                                />
                              </td>
                              {previewColumns.map((field) => (
                                <td key={field.key} className="px-3 py-1.5">
                                  <input
                                    value={row[field.key] ?? ''}
                                    disabled={row.__status === 'success'}
                                    onChange={(e) => updateCell(row.__rowId, field.key, e.target.value)}
                                    className="w-full min-w-[90px] rounded border border-transparent bg-transparent px-1.5 py-1 text-xs focus:border-[var(--primary)] focus:bg-white focus:outline-none disabled:text-slate-400"
                                  />
                                </td>
                              ))}
                              {childTable && (
                                <td className="px-3 py-1.5 text-xs">
                                  <button
                                    onClick={() => toggleExpanded(row.__rowId)}
                                    className="flex items-center gap-1 whitespace-nowrap font-medium text-[var(--primary)] hover:underline"
                                  >
                                    {expandedRows.has(row.__rowId) ? (
                                      <ChevronDownIcon className="h-3.5 w-3.5" />
                                    ) : (
                                      <ChevronRightIcon className="h-3.5 w-3.5" />
                                    )}
                                    {(row[childTable.key] || []).length} {childTable.label.toLowerCase()}
                                  </button>
                                </td>
                              )}
                              <td className="px-3 py-1.5 text-xs">
                                {row.__status === 'success' && (
                                  <span className="flex items-center gap-1 text-emerald-600">
                                    <CheckCircleIcon className="h-4 w-4" /> Imported
                                  </span>
                                )}
                                {row.__status === 'error' && (
                                  <span className="flex items-center gap-1 text-red-600" title={row.__error}>
                                    <XCircleIcon className="h-4 w-4" /> {row.__error || 'Failed'}
                                  </span>
                                )}
                                {row.__status === 'pending' && <span className="text-slate-400">Pending</span>}
                              </td>
                              <td className="px-3 py-1.5">
                                {row.__status !== 'success' && (
                                  <button onClick={() => removeRow(row.__rowId)} className="text-slate-300 hover:text-red-500">
                                    <TrashIcon className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </td>
                            </tr>
                            {childTable && expandedRows.has(row.__rowId) && (
                              <tr className="bg-slate-50/60">
                                <td />
                                <td colSpan={previewColSpan - 1} className="px-3 py-2">
                                  <table className="min-w-full text-xs">
                                    <thead>
                                      <tr>
                                        <th className="w-6 px-1.5 py-1 text-left font-semibold text-slate-400">#</th>
                                        {importChildFields.map((field) => (
                                          <th key={field.key} className="whitespace-nowrap px-1.5 py-1 text-left font-semibold text-slate-500">
                                            {field.label}
                                            {field.required && <span className="text-red-400"> *</span>}
                                          </th>
                                        ))}
                                        <th className="w-6" />
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(row[childTable.key] || []).map((childRow: any, idx: number) => (
                                        <tr key={idx}>
                                          <td className="px-1.5 py-1 text-slate-400">{idx + 1}</td>
                                          {importChildFields.map((field) => (
                                            <td key={field.key} className="px-1.5 py-1">
                                              <input
                                                value={childRow[field.key] ?? ''}
                                                disabled={row.__status === 'success'}
                                                onChange={(e) => updateChildCell(row.__rowId, idx, field.key, e.target.value)}
                                                className="w-full min-w-[80px] rounded border border-slate-200 bg-white px-1.5 py-1 text-xs focus:border-[var(--primary)] focus:outline-none disabled:text-slate-400"
                                              />
                                            </td>
                                          ))}
                                          <td className="px-1.5 py-1">
                                            {row.__status !== 'success' && (
                                              <button onClick={() => removeChildRow(row.__rowId, idx)} className="text-slate-300 hover:text-red-500">
                                                <TrashIcon className="h-3.5 w-3.5" />
                                              </button>
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                  {row.__status !== 'success' && (
                                    <button
                                      onClick={() => addChildRow(row.__rowId)}
                                      className="mt-1.5 flex items-center gap-1 text-xs font-medium text-[var(--primary)] hover:underline"
                                    >
                                      <PlusIcon className="h-3.5 w-3.5" /> Add {childTable.label.toLowerCase().replace(/s$/, '')}
                                    </button>
                                  )}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {importFields.length > previewColumns.length && (
                    <p className="text-xs text-slate-400">
                      Showing the first {previewColumns.length} of {importFields.length} columns in the preview — every
                      column is still imported.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          {tab === 'export' ? (
            <>
              <span className="text-xs text-slate-400">{exportColumnCount} field{exportColumnCount === 1 ? '' : 's'} selected</span>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={onClose}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleExport} disabled={exporting || exportColumnCount === 0}>
                  {exporting ? 'Exporting…' : `Export ${format.toUpperCase()}`}
                </Button>
              </div>
            </>
          ) : (
            <>
              <span className="text-xs text-slate-400">
                {rows.length === 0
                  ? 'No file uploaded yet'
                  : importSummary
                  ? `Imported ${importSummary.done} of ${importSummary.total}`
                  : `${selectedCount} of ${rows.length} selected`}
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={onClose}>
                  Close
                </Button>
                {rows.length > 0 && (
                  <Button size="sm" onClick={handleImport} disabled={importing || selectedCount === 0}>
                    {importing ? 'Importing…' : `Import ${selectedCount} selected`}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
