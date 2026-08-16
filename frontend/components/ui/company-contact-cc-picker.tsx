'use client';

import { useEffect, useState } from 'react';
import { contactsApi } from '@/lib/api';

interface CompanyContactCcPickerProps {
  companyName: string;
  value: string[];
  onChange: (emails: string[]) => void;
}

/**
 * Meetings CC picker (item #7): given the meeting's client/company name,
 * looks up other contacts at that same company and lets the user tick which
 * ones to CC. Nothing shows until there's a company name to search for, and
 * contacts with no email on file are shown but can't be picked.
 */
export default function CompanyContactCcPicker({ companyName, value, onChange }: CompanyContactCcPickerProps) {
  const [contacts, setContacts] = useState<{ id: number; name: string; email: string | null; jobTitle?: string | null }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const term = companyName.trim();
    if (term.length < 2) {
      setContacts([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      contactsApi
        .getContacts({ search: term, limit: 20 })
        .then((res) => {
          const list = (res.contacts || [])
            .filter((c: any) => (c.company || '').toLowerCase().includes(term.toLowerCase()))
            .map((c: any) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`.trim(), email: c.email || null, jobTitle: c.jobTitle }));
          setContacts(list);
        })
        .catch(() => setContacts([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [companyName]);

  if (companyName.trim().length < 2) return null;
  if (!loading && contacts.length === 0) return null;

  const toggle = (email: string) => {
    onChange(value.includes(email) ? value.filter((e) => e !== email) : [...value, email]);
  };

  return (
    <div>
      <label className="block text-xs font-medium text-slate-700">CC (other contacts at this company)</label>
      {loading ? (
        <p className="mt-1 text-xs text-slate-400">Looking for other contacts...</p>
      ) : (
        <div className="mt-1 max-h-32 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
          {contacts.map((c) => (
            <label
              key={c.id}
              className={`flex items-center gap-2 rounded px-1.5 py-1 text-xs ${c.email ? 'cursor-pointer hover:bg-slate-50' : 'cursor-not-allowed opacity-50'}`}
            >
              <input
                type="checkbox"
                disabled={!c.email}
                checked={!!c.email && value.includes(c.email)}
                onChange={() => c.email && toggle(c.email)}
                className="rounded border-slate-300 text-[#168eea] focus:ring-[#168eea]"
              />
              <span className="text-slate-700">{c.name}</span>
              {c.jobTitle && <span className="text-slate-400">— {c.jobTitle}</span>}
              <span className="ml-auto text-slate-400">{c.email || 'no email on file'}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
