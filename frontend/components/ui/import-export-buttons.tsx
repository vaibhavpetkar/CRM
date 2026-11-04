'use client';

import { useState } from 'react';
import { ArrowDownTrayIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import Button from './button';
import ImportExportModal from './import-export-modal';
import type { ImportExportConfig } from '@/lib/import-export/types';

type Props = {
  config: ImportExportConfig;
  /** Hide a button the user has no permission for. Both show by default. */
  canImport?: boolean;
  canExport?: boolean;
};

/**
 * Usage on any list page:
 *
 *   <ImportExportButtons
 *     config={{
 *       entityName: 'Lead',
 *       entityNamePlural: 'leads',
 *       fields: LEAD_FIELDS,
 *       getExportData: () => leads,
 *       onImportRow: (row) => leadsApi.createLead(row),
 *       onImportComplete: fetchLeads,
 *     }}
 *   />
 */
export default function ImportExportButtons({ config, canImport = true, canExport = true }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'export' | 'import'>('import');

  return (
    <>
      {canImport && <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setTab('import');
          setOpen(true);
        }}
      >
        <ArrowUpTrayIcon className="h-4 w-4" /> Import
      </Button>}
      {canExport && <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setTab('export');
          setOpen(true);
        }}
      >
        <ArrowDownTrayIcon className="h-4 w-4" /> Export
      </Button>}
      {open && (
        <ImportExportModal
          open={open}
          onClose={() => setOpen(false)}
          config={config}
          initialTab={tab}
          tabs={[...(canExport ? (['export'] as const) : []), ...(canImport ? (['import'] as const) : [])]}
        />
      )}
    </>
  );
}
