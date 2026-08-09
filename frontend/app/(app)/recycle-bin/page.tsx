'use client';

import { useState, useEffect } from 'react';
import PageHeader from '@/components/ui/page-header';
import Card from '@/components/ui/card';
import DataTable, { DataTableColumn } from '@/components/ui/data-table';
import { recycleBinApi } from '@/lib/api';
import { TrashIcon, ArrowUturnLeftIcon } from '@heroicons/react/24/outline';
import { useToast } from '@/components/ui/toast';

export default function RecycleBinPage() {
  const toast = useToast();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const res = await recycleBinApi.getDeletedRecords();
      setRecords(res.records);
    } catch (err: any) {
      setError(err.message || 'Failed to load recycle bin records.');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (type: string, id: string | number) => {
    if (!confirm(`Are you sure you want to restore this ${type}?`)) return;
    try {
      await recycleBinApi.restoreRecord(type, id);
      toast.success(`${type} restored successfully.`);
      fetchRecords(); // Refresh the list
    } catch (err: any) {
      toast.error(err.message || 'Failed to restore record.');
    }
  };

  const columns: DataTableColumn<any>[] = [
    {
      header: 'Type',
      accessor: (record) => (
        <span className="inline-flex items-center rounded-md bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20">
          {record.type}
        </span>
      ),
    },
    {
      header: 'Name / Title',
      accessor: (record) => (
        <span className="font-medium text-slate-900">{record.name}</span>
      ),
    },
    {
      header: 'Deleted At',
      accessor: (record) => (
        <div className="flex items-center gap-1 text-slate-500 text-sm">
          <TrashIcon className="h-4 w-4" />
          {new Date(record.deletedAt).toLocaleString()}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Recycle Bin"
        description="View and restore deleted records."
      />

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <Card>
        <DataTable
          showToolbar
          tableId="recycle_bin_table"
          columns={columns}
          data={records}
          rowKey={(r) => `${r.type}-${r.id}`}
          loading={loading}
          emptyMessage="No deleted records found."
          actions={(record) => (
            <button
              onClick={() => handleRestore(record.type, record.id)}
              className="flex items-center gap-1 text-sm text-[#168eea] hover:text-blue-700 font-medium"
            >
              <ArrowUturnLeftIcon className="h-4 w-4" />
              Restore
            </button>
          )}
        />
      </Card>
    </>
  );
}
