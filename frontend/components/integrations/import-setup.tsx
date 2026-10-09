'use client';

import { useRef, useState } from 'react';
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import Button from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { PortalImportCounts, salesApi } from '@/lib/api';
import { LEAD_SOURCE_OPTIONS } from '@/lib/lead-options';

type Row = Record<string, unknown>;

/** Excel / CSV import: read the sheet in the browser, preview it, send the rows. */
export default function ImportSetup({ onImported }: { onImported: () => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [leadSource, setLeadSource] = useState('other');
  const [subSource, setSubSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PortalImportCounts | null>(null);

  const read = async (file: File) => {
    setResult(null);
    try {
      const XLSX = await import('xlsx');
      const book = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const sheet = book.Sheets[book.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<Row>(sheet, { defval: '', raw: false });
      const filled = data.filter((r) => Object.values(r).some((v) => String(v).trim()));
      if (!filled.length) throw new Error('No rows found in the first sheet.');
      setRows(filled);
      setFileName(file.name);
    } catch (err) {
      setRows([]);
      toast.error((err as Error).message || 'Could not read the file.');
    }
  };

  const doImport = async () => {
    setBusy(true);
    try {
      const res = await salesApi.importLeads({ rows, leadSource, subSource: subSource.trim() || undefined, fileName });
      setResult(res);
      toast.success(`${res.created} new lead${res.created === 1 ? '' : 's'} imported.`);
      onImported();
    } catch (err) {
      toast.error((err as Error).message || 'Import failed.');
    } finally {
      setBusy(false);
    }
  };

  const headers = rows.length ? Object.keys(rows[0]).slice(0, 8) : [];
  const select = 'rounded-lg border border-slate-200 bg-white p-2 text-xs focus:border-[var(--primary)] focus:outline-none';

  return (
    <div className="space-y-4">
      <input
        ref={input}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) read(f);
          e.target.value = '';
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => input.current?.click()}>
          <ArrowUpTrayIcon className="mr-1 h-4 w-4" /> Choose file
        </Button>
        <span className="text-xs text-slate-500">{fileName ? `${fileName}: ${rows.length} row${rows.length === 1 ? '' : 's'}` : '.xlsx, .xls or .csv with a heading row'}</span>
      </div>

      {rows.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>{headers.map((h) => <th key={h} className="whitespace-nowrap px-2 py-1.5 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.slice(0, 5).map((r, i) => (
                  <tr key={i}>{headers.map((h) => <td key={h} className="max-w-[12rem] truncate px-2 py-1.5 text-slate-700">{String(r[h] ?? '')}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-slate-600">
              <span className="mb-1 block">Source for rows without a Lead Source column</span>
              <select value={leadSource} onChange={(e) => setLeadSource(e.target.value)} className={select}>
                {LEAD_SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-600">
              <span className="mb-1 block">Sub source (optional)</span>
              <input value={subSource} onChange={(e) => setSubSource(e.target.value)} placeholder={fileName || 'e.g. Property expo Sept'} className={`${select} w-56`} />
            </label>
            <Button size="sm" disabled={busy} onClick={doImport}>
              {busy ? 'Importing...' : `Import ${rows.length} row${rows.length === 1 ? '' : 's'}`}
            </Button>
          </div>
        </>
      )}

      {result && (
        <p className="rounded-lg bg-emerald-50 p-2 text-xs text-emerald-700">
          {result.created} new · {result.duplicate} already leads (note added) · {result.skipped} skipped (no mobile/email, or already imported) · {result.failed} failed
        </p>
      )}
    </div>
  );
}
