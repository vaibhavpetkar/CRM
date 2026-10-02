import * as XLSX from 'xlsx';
import type { ImportExportChildTable, ImportExportField, ImportRow } from './types';

function normalize(str: string) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Match an uploaded column header back to a known field, tolerating the
 * "Label *" required-marker, different casing, spacing, punctuation, etc. */
function matchField(header: string, fields: ImportExportField[]): ImportExportField | undefined {
  const cleanHeader = normalize(header.replace('*', ''));
  return fields.find((f) => normalize(f.label) === cleanHeader || normalize(f.key) === cleanHeader);
}

/** Child columns are matched by label only, so a child "Amount" key can never
 * steal the parent's "Amount" column. */
function matchChildField(header: string, fields: ImportExportField[]): ImportExportField | undefined {
  const cleanHeader = normalize(header.replace('*', ''));
  return fields.find((f) => normalize(f.label) === cleanHeader);
}

let rowCounter = 0;
function nextRowId() {
  rowCounter += 1;
  return `row-${Date.now()}-${rowCounter}`;
}

const cellText = (cell: any) => (cell === undefined || cell === null ? '' : String(cell).trim());

export async function parseImportFile(
  file: File,
  allFields: ImportExportField[],
  childTable?: ImportExportChildTable,
  groupKey?: string
): Promise<ImportRow[]> {
  const fields = allFields.filter((f) => !f.exportOnly);
  const childFields = (childTable?.fields ?? []).filter((f) => !f.exportOnly);

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });

  if (raw.length === 0) return [];

  const headerRow = raw[0].map((h) => String(h ?? '').trim());
  const columnMap = headerRow.map((h) => {
    const parent = matchField(h, fields);
    if (parent) return { field: parent, child: false };
    const child = childTable ? matchChildField(h, childFields) : undefined;
    return child ? { field: child, child: true } : undefined;
  });

  // The hint row that downloadTemplate() adds is not filtered here — users can
  // simply delete it in the preview if it slips through.
  const dataRows = raw.slice(1).filter((row) => row.some((cell) => cellText(cell) !== ''));

  const records: ImportRow[] = [];
  for (const row of dataRows) {
    const parent: Record<string, string> = {};
    const child: Record<string, string> = {};
    columnMap.forEach((col, idx) => {
      if (!col) return;
      (col.child ? child : parent)[col.field.key] = cellText(row[idx]);
    });

    const hasParentValues = Object.values(parent).some((v) => v !== '');
    const hasChildValues = Object.values(child).some((v) => v !== '');
    const previous = records[records.length - 1];

    // A line continues the previous record when it leaves every parent column
    // blank, or repeats the previous record's group key (e.g. the Quote No).
    const continuesPrevious =
      !!childTable &&
      !!previous &&
      (!hasParentValues || (!!groupKey && parent[groupKey] !== '' && parent[groupKey] === previous[groupKey]));

    if (continuesPrevious) {
      if (hasChildValues) previous[childTable.key].push(child);
      continue;
    }

    const record = {
      __rowId: nextRowId(),
      __status: 'pending',
      __selected: true,
      ...parent,
    } as ImportRow;
    if (childTable) record[childTable.key] = hasChildValues ? [child] : [];
    records.push(record);
  }
  return records;
}
