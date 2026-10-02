'use client';

import { useParams, useSearchParams } from 'next/navigation';
import InvoiceEditor from '@/components/invoices/invoice-editor';

export default function InvoiceDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  return <InvoiceEditor key={params.id as string} invoiceId={params.id as string} autoPrint={searchParams.get('print') === '1'} />;
}
