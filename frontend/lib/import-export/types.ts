// Generic Import / Export types shared by every module (Leads, Contacts, Deals, ...)
// Any list page can plug into <ImportExportButtons /> by describing its fields
// and handing over a create/update function — nothing else needs to change.

export type FieldType = 'text' | 'number' | 'email' | 'date' | 'boolean' | 'select';

export type ImportExportField = {
  /** key used in the record object (e.g. "firstName") */
  key: string;
  /** human friendly column header (e.g. "First Name") */
  label: string;
  /** shown as required in the template + validated before import */
  required?: boolean;
  type?: FieldType;
  /** options for select-type fields, used for template hints only */
  options?: string[];
  /** included in export by default */
  defaultExport?: boolean;
  /** computed/system values: exported, but left out of the import template and preview */
  exportOnly?: boolean;
};

/** A child table (e.g. a Quote's line items). In a spreadsheet each child row
 * is its own line: the first line of a record carries the parent columns, and
 * the following lines either leave them blank or repeat the same `groupKey`. */
export type ImportExportChildTable = {
  /** key of the array on the parent record (e.g. "products") */
  key: string;
  /** human friendly name (e.g. "Items") */
  label: string;
  fields: ImportExportField[];
};

export type ImportRowStatus = 'pending' | 'success' | 'error';

export type ImportRow = {
  __rowId: string;
  __status: ImportRowStatus;
  __error?: string;
  __selected: boolean;
  [key: string]: any;
};

export type ImportExportConfig = {
  /** e.g. "Lead", used in headings/messages */
  entityName: string;
  /** e.g. "leads", used for filenames */
  entityNamePlural: string;
  fields: ImportExportField[];
  /** optional child table exported/imported as extra lines per record */
  childTable?: ImportExportChildTable;
  /** parent field that ties a record's lines together (e.g. "quoteNumber") */
  groupKey?: string;
  /** rows currently visible in the table, used for Export */
  getExportData: () => any[] | Promise<any[]>;
  /** called once per row when the user clicks Import — should create the record */
  onImportRow: (row: Record<string, any>) => Promise<any>;
  /** called after an import batch finishes so the parent list can refresh */
  onImportComplete?: () => void;
};
