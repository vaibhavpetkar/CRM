'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import PageHeader from '@/components/ui/page-header';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import { contactsApi } from '@/lib/api';
import { ContactRows, LeadRows, DealRows } from '@/components/contacts/related-records';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

/**
 * Company page: every contact, lead and deal recorded against one company
 * name. Names are matched loosely on the server ("Acme Pvt Ltd" = "ACME"),
 * so spelling variants land on the same page.
 */
export default function CompanyPage() {
  const searchParams = useSearchParams();
  const name = searchParams.get('name') || '';
  const [data, setData] = useState<{ contacts: any[]; leads: any[]; deals: any[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!name) return;
    let cancelled = false;
    contactsApi
      .getCompanyProfile(name)
      .then((res) => !cancelled && setData(res))
      .catch((err) => !cancelled && setError(err.message || 'Failed to load company.'));
    return () => {
      cancelled = true;
    };
  }, [name]);

  return (
    <>
      <PageHeader
        title={name || 'Company'}
        description="All contacts, leads and deals linked to this company."
        actions={
          <Link href="/contacts">
            <Button type="button" variant="secondary" size="sm">
              <ArrowLeftIcon className="h-4 w-4" /> Back to Contacts
            </Button>
          </Link>
        }
      />

      {!name && <p className="text-sm text-slate-500">No company selected.</p>}
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}
      {name && !data && !error && <p className="text-sm text-slate-500">Loading...</p>}

      {data && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card title={`Contacts (${data.contacts.length})`}>
            {data.contacts.length ? <ContactRows contacts={data.contacts} /> : <p className="text-sm text-slate-400">No contacts at this company.</p>}
          </Card>
          <Card title={`Leads (${data.leads.length})`}>
            {data.leads.length ? <LeadRows leads={data.leads} /> : <p className="text-sm text-slate-400">No leads at this company.</p>}
          </Card>
          <Card title={`Deals (${data.deals.length})`}>
            {data.deals.length ? <DealRows deals={data.deals} /> : <p className="text-sm text-slate-400">No deals with this company.</p>}
          </Card>
        </div>
      )}
    </>
  );
}
