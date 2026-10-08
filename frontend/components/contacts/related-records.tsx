'use client';

import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';

/** Link to the company page that gathers every contact, lead and deal for a company name. */
export const companyHref = (name: string) => `/contacts/company?name=${encodeURIComponent(name.trim())}`;

const initials = (c: any) => `${(c.firstName || 'C').charAt(0)}${(c.lastName || '').charAt(0)}`.toUpperCase();

export function ContactRows({ contacts, onSelect, showCompany = false }: { contacts: any[]; onSelect?: (c: any) => void; showCompany?: boolean }) {
  return (
    <div className="space-y-2">
      {contacts.map((c) => {
        const body = (
          <>
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">
              {initials(c)}
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-900">
                {c.firstName} {c.lastName}
              </p>
              <p className="truncate text-xs text-slate-500">
                {[c.title || c.jobTitle, showCompany ? c.company : null, c.email, c.phone].filter(Boolean).join(' · ') || '—'}
              </p>
            </div>
          </>
        );
        const cls = 'flex w-full items-center gap-2 rounded-lg border border-slate-100 p-2 text-left text-sm hover:bg-slate-50';
        return onSelect ? (
          <button key={c.id} type="button" onClick={() => onSelect(c)} className={cls}>
            {body}
          </button>
        ) : (
          <Link key={c.id} href={`/contacts?open=${c.id}`} className={cls}>
            {body}
          </Link>
        );
      })}
    </div>
  );
}

export function LeadRows({ leads }: { leads: any[] }) {
  return (
    <div className="space-y-2">
      {leads.map((l) => (
        <Link
          key={l.id}
          href={`/leads/${l.id}`}
          className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 p-2 text-sm hover:bg-slate-50"
        >
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">
              {l.firstName} {l.lastName}
            </p>
            <p className="truncate text-xs text-slate-500">{[l.leadNumber, l.email, l.mobile].filter(Boolean).join(' · ')}</p>
          </div>
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium capitalize text-slate-600">{l.status}</span>
        </Link>
      ))}
    </div>
  );
}

export function DealRows({ deals }: { deals: any[] }) {
  return (
    <div className="space-y-2">
      {deals.map((d) => (
        <Link
          key={d.id}
          href={`/deals?search=${encodeURIComponent(d.title)}`}
          className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 p-2 text-sm hover:bg-slate-50"
        >
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">{d.title}</p>
            <p className="truncate text-xs text-slate-500">{formatCurrency(Number(d.value) || 0, d.currency)}</p>
          </div>
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium capitalize text-slate-600">
            {String(d.stage || '').replace('-', ' ')}
          </span>
        </Link>
      ))}
    </div>
  );
}

export function RelatedSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title} <span className="text-slate-400">({count})</span>
      </h5>
      {children}
    </div>
  );
}
