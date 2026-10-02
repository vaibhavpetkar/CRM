import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  WidthType,
  HeadingLevel,
} from 'docx';
import { saveAs } from 'file-saver';
import type { ImportExportChildTable, ImportExportField } from './types';

export type ExportFormat = 'csv' | 'excel' | 'pdf' | 'word';

/** Child table columns picked for an export (e.g. a Quote's items). */
export type ChildExport = {
  table: ImportExportChildTable;
  fields: ImportExportField[];
};

type ExportTable = { headers: string[]; rows: string[][]; recordCount: number };

function formatCell(value: any) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

/** Flattens records into one sheet. Without a child table that is one line per
 * record; with one, every child row gets its own line. The first line of a
 * record carries all parent columns, the following lines only repeat the
 * group key, so the file reads cleanly and imports back as the same records. */
function buildTable(data: any[], fields: ImportExportField[], child?: ChildExport, groupKey?: string): ExportTable {
  const childFields = child?.fields ?? [];
  const headers = [...fields.map((f) => f.label), ...childFields.map((f) => f.label)];
  if (!child || childFields.length === 0) {
    return { headers, rows: data.map((record) => fields.map((f) => formatCell(record[f.key]))), recordCount: data.length };
  }

  const rows: string[][] = [];
  data.forEach((record) => {
    const children: any[] = Array.isArray(record[child.table.key]) ? record[child.table.key] : [];
    const lines = children.length ? children : [null];
    lines.forEach((childRow, idx) => {
      const parentCells = fields.map((f) =>
        idx === 0 || f.key === groupKey ? formatCell(record[f.key]) : ''
      );
      const childCells = childFields.map((f) => (childRow ? formatCell(childRow[f.key]) : ''));
      rows.push([...parentCells, ...childCells]);
    });
  });
  return { headers, rows, recordCount: data.length };
}

function timestampedName(base: string, ext: string) {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${base}-${stamp}.${ext}`;
}

function exportToCSV({ headers, rows }: ExportTable, entityNamePlural: string) {
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  saveAs(blob, timestampedName(entityNamePlural, 'csv'));
}

function exportToExcel({ headers, rows }: ExportTable, entityNamePlural: string) {
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  worksheet['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 2, 14) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, entityNamePlural.slice(0, 31));
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  saveAs(blob, timestampedName(entityNamePlural, 'xlsx'));
}

function exportToPDF({ headers, rows, recordCount }: ExportTable, entityNamePlural: string) {
  const doc = new jsPDF({ orientation: headers.length > 6 ? 'landscape' : 'portrait' });
  doc.setFontSize(14);
  doc.text(`${entityNamePlural[0].toUpperCase()}${entityNamePlural.slice(1)} Export`, 14, 15);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generated ${new Date().toLocaleString()} · ${recordCount} records`, 14, 21);

  autoTable(doc, {
    startY: 26,
    head: [headers],
    body: rows,
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [22, 142, 234] },
    theme: 'grid',
  });

  doc.save(timestampedName(entityNamePlural, 'pdf'));
}

async function exportToWord({ headers, rows, recordCount }: ExportTable, entityNamePlural: string) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(
      (label) =>
        new TableCell({
          shading: { fill: '168EEA' },
          children: [new Paragraph({ text: label, heading: HeadingLevel.HEADING_6 })],
        })
    ),
  });

  const dataRows = rows.map(
    (row) =>
      new TableRow({
        children: row.map((cell) => new TableCell({ children: [new Paragraph(cell)] })),
      })
  );

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: `${entityNamePlural[0].toUpperCase()}${entityNamePlural.slice(1)} Export`,
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            text: `Generated ${new Date().toLocaleString()} · ${recordCount} records`,
          }),
          new Paragraph({ text: '' }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [headerRow, ...dataRows],
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, timestampedName(entityNamePlural, 'docx'));
}

export async function runExport(
  format: ExportFormat,
  data: any[],
  fields: ImportExportField[],
  entityNamePlural: string,
  child?: ChildExport,
  groupKey?: string
) {
  if (data.length === 0) throw new Error('There is no data to export.');
  const table = buildTable(data, fields, child, groupKey);
  switch (format) {
    case 'csv':
      return exportToCSV(table, entityNamePlural);
    case 'excel':
      return exportToExcel(table, entityNamePlural);
    case 'pdf':
      return exportToPDF(table, entityNamePlural);
    case 'word':
      return exportToWord(table, entityNamePlural);
  }
}

/** Download a blank template (Excel or CSV) containing just the header row.
 * Format hints go on a separate "Instructions" sheet (Excel only) rather than
 * in a data row, so a hint can never be imported as a value by mistake. */
export function downloadTemplate(
  allFields: ImportExportField[],
  entityNamePlural: string,
  format: 'excel' | 'csv' = 'excel',
  childTable?: ImportExportChildTable
) {
  const fields = [...allFields, ...(childTable?.fields ?? [])].filter((f) => !f.exportOnly);
  const headers = fields.map((f) => `${f.label}${f.required ? ' *' : ''}`);
  const hintRow = fields.map((f) => {
    if (f.options && f.options.length) return f.options.join(' / ');
    switch (f.type) {
      case 'email':
        return 'name@example.com';
      case 'date':
        return 'YYYY-MM-DD';
      case 'number':
        return '0';
      case 'boolean':
        return 'Yes / No';
      default:
        return '';
    }
  });

  const worksheet = XLSX.utils.aoa_to_sheet([headers]);
  worksheet['!cols'] = fields.map((f) => ({ wch: Math.max(f.label.length + 2, 16) }));

  if (format === 'csv') {
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, `${entityNamePlural}-import-template.csv`);
    return;
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');
  const instructions = XLSX.utils.aoa_to_sheet([
    ['Column', 'Required', 'What to enter'],
    ...fields.map((f, i) => [f.label, f.required ? 'Yes' : '', hintRow[i]]),
    ...(childTable
      ? [[], [`Put each ${childTable.label.toLowerCase().replace(/s$/, '')} on its own line. Extra lines for the same record leave the other columns blank.`]]
      : []),
  ]);
  instructions['!cols'] = [{ wch: 24 }, { wch: 10 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(workbook, instructions, 'Instructions');
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  saveAs(blob, `${entityNamePlural}-import-template.xlsx`);
}
