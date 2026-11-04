'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowDownTrayIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import Button from './button';
import { useToast } from './toast';
import { runExport, type ExportFormat } from '@/lib/import-export/exporters';
import type { ImportExportField } from '@/lib/import-export/types';

// One-click export for report pages: pick CSV, Excel or PDF and the rows the
// page hands over (already matching its filters) are downloaded.

const FORMATS: { key: ExportFormat; label: string }[] = [
  { key: 'excel', label: 'Excel (.xlsx)' },
  { key: 'csv', label: 'CSV (.csv)' },
  { key: 'pdf', label: 'PDF (.pdf)' },
];

type Props = {
  /** Used for the file name, e.g. "site-visits". */
  fileName: string;
  columns: ImportExportField[];
  getRows: () => Record<string, unknown>[] | Promise<Record<string, unknown>[]>;
  disabled?: boolean;
  label?: string;
};

export default function ExportMenu({ fileName, columns, getRows, disabled, label = 'Export' }: Props) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const go = async (format: ExportFormat) => {
    setOpen(false);
    setBusy(true);
    try {
      const rows = await getRows();
      await runExport(format, rows, columns, fileName);
      toast.success(`Exported ${rows.length} row${rows.length === 1 ? '' : 's'}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not export.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <Button size="sm" variant="secondary" disabled={disabled || busy} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <ArrowDownTrayIcon className="h-4 w-4" /> {busy ? 'Exporting…' : label} <ChevronDownIcon className="h-3.5 w-3.5" />
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {FORMATS.map((f) => (
            <button key={f.key} role="menuitem" onClick={() => go(f.key)} className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
