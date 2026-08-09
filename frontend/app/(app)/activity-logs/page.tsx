'use client';

import { useState, useEffect } from 'react';
import PageHeader from '@/components/ui/page-header';
import Card from '@/components/ui/card';
import DataTable, { DataTableColumn } from '@/components/ui/data-table';
import { activityLogsApi } from '@/lib/api';
import { ClockIcon } from '@heroicons/react/24/outline';

export default function ActivityLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await activityLogsApi.getLogs({ limit: 50 });
      setLogs(res.logs);
    } catch (err: any) {
      setError(err.message || 'Failed to load activity logs.');
    } finally {
      setLoading(false);
    }
  };

  const columns: DataTableColumn<any>[] = [
    {
      header: 'User',
      accessor: (log) => (
        <span className="font-medium text-slate-900">
          {log.performedBy ? `${log.performedBy.firstName} ${log.performedBy.lastName}` : 'System'}
        </span>
      ),
    },
    {
      header: 'Action',
      accessor: (log) => (
        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-800 capitalize">
          {log.action}
        </span>
      ),
    },
    {
      header: 'Entity',
      accessor: (log) => (
        <span className="text-sm text-slate-600">
          {log.entityType} #{log.entityId}
        </span>
      ),
    },
    {
      header: 'Details',
      accessor: (log) => <span className="text-sm text-slate-500">{log.details}</span>,
    },
    {
      header: 'Time',
      accessor: (log) => (
        <div className="flex items-center gap-1 text-slate-500 text-sm">
          <ClockIcon className="h-4 w-4" />
          {new Date(log.createdAt).toLocaleString()}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Activity Logs"
        description="Global system activity and audit trail."
      />
      
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <Card>
        <DataTable
          showToolbar
          tableId="activity_logs_table"
          columns={columns}
          data={logs}
          rowKey={(l) => l.id}
          loading={loading}
          emptyMessage="No activity logs found."
        />
      </Card>
    </>
  );
}
