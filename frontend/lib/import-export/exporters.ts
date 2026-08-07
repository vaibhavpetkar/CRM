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
import type { ImportExportField } from './types';

export type ExportFormat = 'csv' | 'excel' | 'pdf' | 'word';

function buildRows(data: any[], fields: ImportExportField[]) {
  return data.map((record) =>
    fields.map((f) => {
      const value = record[f.key];
      if (value === null || value === undefined) return '';
      if (typeof value === 'boolean') return value ? 'Yes' : 'No';
      return String(value);
    })
  );
}

function timestampedName(base: string, ext: string) {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${base}-${stamp}.${ext}`;
}

export function exportToCSV(data: any[], fields: ImportExportField[], entityNamePlural: string) {
  const headers = fields.map((f) => f.label);
  const rows = buildRows(data, fields);
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  saveAs(blob, timestampedName(entityNamePlural, 'csv'));
}

export function exportToExcel(data: any[], fields: ImportExportField[], entityNamePlural: string) {
  const headers = fields.map((f) => f.label);
  const rows = buildRows(data, fields);
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  worksheet['!cols'] = fields.map((f) => ({ wch: Math.max(f.label.length + 2, 14) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, entityNamePlural.slice(0, 31));
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  saveAs(blob, timestampedName(entityNamePlural, 'xlsx'));
}

export function exportToPDF(data: any[], fields: ImportExportField[], entityNamePlural: string) {
  const doc = new jsPDF({ orientation: fields.length > 6 ? 'landscape' : 'portrait' });
  doc.setFontSize(14);
  doc.text(`${entityNamePlural[0].toUpperCase()}${entityNamePlural.slice(1)} Export`, 14, 15);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generated ${new Date().toLocaleString()} · ${data.length} records`, 14, 21);

  autoTable(doc, {
    startY: 26,
    head: [fields.map((f) => f.label)],
    body: buildRows(data, fields),
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [22, 142, 234] },
    theme: 'grid',
  });

  doc.save(timestampedName(entityNamePlural, 'pdf'));
}

export async function exportToWord(data: any[], fields: ImportExportField[], entityNamePlural: string) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: fields.map(
      (f) =>
        new TableCell({
          shading: { fill: '168EEA' },
          children: [new Paragraph({ text: f.label, heading: HeadingLevel.HEADING_6 })],
        })
    ),
  });

  const dataRows = buildRows(data, fields).map(
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
            text: `Generated ${new Date().toLocaleString()} · ${data.length} records`,
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
  entityNamePlural: string
) {
  if (data.length === 0) throw new Error('There is no data to export.');
  switch (format) {
    case 'csv':
      return exportToCSV(data, fields, entityNamePlural);
    case 'excel':
      return exportToExcel(data, fields, entityNamePlural);
    case 'pdf':
      return exportToPDF(data, fields, entityNamePlural);
    case 'word':
      return exportToWord(data, fields, entityNamePlural);
  }
}

/** Download a blank template (Excel or CSV) containing just the header row,
 * plus one example row of hints, so users know exactly what to fill in. */
export function downloadTemplate(fields: ImportExportField[], entityNamePlural: string, format: 'excel' | 'csv' = 'excel') {
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

  const worksheet = XLSX.utils.aoa_to_sheet([headers, hintRow]);
  worksheet['!cols'] = fields.map((f) => ({ wch: Math.max(f.label.length + 2, 16) }));

  if (format === 'csv') {
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, `${entityNamePlural}-import-template.csv`);
    return;
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  saveAs(blob, `${entityNamePlural}-import-template.xlsx`);
}
