import * as XLSX from 'xlsx';
import type { ImportExportField, ImportRow } from './types';

function normalize(str: string) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Match an uploaded column header back to a known field, tolerating the
 * "Label *" required-marker, different casing, spacing, punctuation, etc. */
function matchField(header: string, fields: ImportExportField[]): ImportExportField | undefined {
  const cleanHeader = normalize(header.replace('*', ''));
  return fields.find((f) => normalize(f.label) === cleanHeader || normalize(f.key) === cleanHeader);
}

let rowCounter = 0;
function nextRowId() {
  rowCounter += 1;
  return `row-${Date.now()}-${rowCounter}`;
}

export async function parseImportFile(file: File, fields: ImportExportField[]): Promise<ImportRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });

  if (raw.length === 0) return [];

  const headerRow = raw[0].map((h) => String(h ?? '').trim());
  const columnMap = headerRow.map((h) => matchField(h, fields));

  // Skip the optional hint row that downloadTemplate() adds (e.g. "name@example.com")
  // by detecting it as a second row where no cell looks like real data — we simply
  // let users delete it in the preview if it slips through, so we don't over-filter here.
  const dataRows = raw.slice(1);

  return dataRows
    .filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''))
    .map((row) => {
      const record: Record<string, any> = {};
      columnMap.forEach((field, idx) => {
        if (!field) return;
        const cell = row[idx];
        record[field.key] = cell === undefined || cell === null ? '' : String(cell).trim();
      });
      return {
        __rowId: nextRowId(),
        __status: 'pending',
        __selected: true,
        ...record,
      } as ImportRow;
    });
}
