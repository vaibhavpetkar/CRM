'use client';

import { useState } from 'react';
import { ArrowDownTrayIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import Button from './button';
import ImportExportModal from './import-export-modal';
import type { ImportExportConfig } from '@/lib/import-export/types';

type Props = {
  config: ImportExportConfig;
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
export default function ImportExportButtons({ config }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'export' | 'import'>('import');

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setTab('import');
          setOpen(true);
        }}
      >
        <ArrowUpTrayIcon className="h-4 w-4" /> Import
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setTab('export');
          setOpen(true);
        }}
      >
        <ArrowDownTrayIcon className="h-4 w-4" /> Export
      </Button>
      {open && <ImportExportModal open={open} onClose={() => setOpen(false)} config={config} initialTab={tab} />}
    </>
  );
}
