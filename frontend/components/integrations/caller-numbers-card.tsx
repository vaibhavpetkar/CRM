'use client';

import { useCallback, useEffect, useState } from 'react';
import Card from '@/components/ui/card';
import Button from '@/components/ui/button';
import { callsApi, usersApi, type CallerNumberRow } from '@/lib/api';
import { useToast } from '@/components/ui/toast';

// While the card is open, refresh who is calling from which number.
const LIVE_REFRESH_MS = 10000;

type TeamMember = { id: number; firstName?: string | null; lastName?: string | null; email?: string | null };

const userName = (u: TeamMember) => `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || `User ${u.id}`;

/**
 * The company's calling numbers (Exotel ExoPhones). Each can be given to one
 * sales person, or left in the shared pool that the CRM hands out per call so
 * people calling at the same time show different numbers.
 */
export default function CallerNumbersCard({ bare = false }: { bare?: boolean } = {}) {
  // Inside Settings > Integrations' detail view the card's frame is dropped.
  const Box = bare ? 'div' : Card;
  const toast = useToast();
  const [rows, setRows] = useState<CallerNumberRow[] | null>(null);
  const [users, setUsers] = useState<TeamMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [number, setNumber] = useState('');
  const [label, setLabel] = useState('');
  const [userId, setUserId] = useState('');

  const load = useCallback(() => {
    callsApi
      .listNumbers()
      .then((r) => {
        setRows(r);
        setError(null);
      })
      .catch((err) => setError(err.message || 'Could not load calling numbers.'));
  }, []);

  useEffect(() => {
    load();
    usersApi
      .getUsers()
      .then((res) => setUsers(res.users || []))
      .catch(() => setUsers([]));
    const t = setInterval(load, LIVE_REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const run = async (key: string, fn: () => Promise<CallerNumberRow[]>, done?: string) => {
    setActing(key);
    try {
      setRows(await fn());
      if (done) toast.success(done);
      return true;
    } catch (err) {
      toast.error((err as Error).message || 'Something went wrong.');
      return false;
    } finally {
      setActing(null);
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run('add', () => callsApi.addNumber({ number, label, userId: userId ? Number(userId) : null }), 'Number added.');
    if (ok) {
      setNumber('');
      setLabel('');
      setUserId('');
    }
  };

  const liveCount = rows?.reduce((n, r) => n + r.liveCalls.length, 0) || 0;
  const poolCount = rows?.filter((r) => r.isActive && !r.userId).length || 0;

  return (
    <Box className={bare ? "" : "sm:col-span-2 lg:col-span-3"}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Calling</p>
          <h3 className="mt-0.5 text-sm font-semibold text-slate-900">Calling numbers</h3>
        </div>
        {rows && rows.length > 0 && (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${liveCount ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
            {liveCount ? `${liveCount} on a call now` : 'No calls right now'}
          </span>
        )}
      </div>

      <p className="mt-3 text-xs text-slate-500">
        The company numbers customers see when your team calls from the CRM. Give a number to one person, or leave it in the shared pool: the CRM
        then picks a free pool number for every call, so people calling at the same time show different numbers, and a customer is called back
        from the number they saw before. Add each number in your calling provider first (an ExoPhone in Exotel).
      </p>

      {error && <p className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-600">{error}</p>}

      {rows && rows.length === 0 && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-700">
          No numbers added yet, so every call uses the single number set on the server (EXOTEL_CALLER_ID).
        </p>
      )}

      {rows && rows.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] uppercase tracking-wide text-slate-400">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Number</th>
                <th className="py-1.5 pr-3 font-medium">Used by</th>
                <th className="py-1.5 pr-3 font-medium">Right now</th>
                <th className="py-1.5 pr-3 font-medium">On</th>
                <th className="py-1.5 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className={r.isActive ? '' : 'opacity-50'}>
                  <td className="py-2 pr-3">
                    <p className="font-medium text-slate-800">{r.number}</p>
                    {r.label && <p className="text-[11px] text-slate-400">{r.label}</p>}
                  </td>
                  <td className="py-2 pr-3">
                    <select
                      value={r.userId ?? ''}
                      disabled={acting === `user-${r.id}`}
                      onChange={(e) =>
                        run(`user-${r.id}`, () => callsApi.updateNumber(r.id, { userId: e.target.value ? Number(e.target.value) : null }))
                      }
                      className="w-full max-w-[12rem] rounded-lg border border-slate-200 p-1 text-xs"
                    >
                      <option value="">Shared pool</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {userName(u)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-3 text-slate-600">
                    {r.liveCalls.length === 0 ? (
                      <span className="text-slate-400">Free</span>
                    ) : (
                      r.liveCalls.map((c) => (
                        <p key={c.callId}>
                          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 align-middle" />
                          {c.by || 'Someone'} calling {c.to}
                        </p>
                      ))
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="checkbox"
                      checked={r.isActive}
                      disabled={acting === `active-${r.id}`}
                      onChange={(e) => run(`active-${r.id}`, () => callsApi.updateNumber(r.id, { isActive: e.target.checked }))}
                      aria-label="Use this number"
                    />
                  </td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      className="text-[11px] text-red-500 hover:text-red-700 disabled:opacity-40"
                      disabled={acting === `remove-${r.id}`}
                      onClick={() => {
                        if (window.confirm(`Remove ${r.number}? Past calls keep their history.`)) run(`remove-${r.id}`, () => callsApi.removeNumber(r.id), 'Number removed.');
                      }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {poolCount > 0 && <p className="mt-2 text-[11px] text-slate-400">{poolCount} number{poolCount === 1 ? '' : 's'} in the shared pool.</p>}
        </div>
      )}

      <form onSubmit={add} className="mt-4 flex flex-wrap items-end gap-2">
        <input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="Number, e.g. 080 4711 2345"
          className="min-w-[10rem] flex-1 rounded-lg border border-slate-200 p-2 text-xs focus:border-[var(--primary)] focus:outline-none"
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (optional)"
          className="min-w-[8rem] flex-1 rounded-lg border border-slate-200 p-2 text-xs focus:border-[var(--primary)] focus:outline-none"
        />
        <select value={userId} onChange={(e) => setUserId(e.target.value)} className="rounded-lg border border-slate-200 p-2 text-xs">
          <option value="">Shared pool</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {userName(u)}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" disabled={acting === 'add' || !number.trim()}>
          {acting === 'add' ? 'Adding...' : 'Add number'}
        </Button>
      </form>
    </Box>
  );
}
