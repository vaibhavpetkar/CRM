'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { SwatchIcon, XMarkIcon } from '@heroicons/react/24/outline';
import Button from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { preferencesApi, LeadStatusColorLevels, PreferenceScope } from '@/lib/api';
import {
  LEAD_STATUS_OPTIONS,
  VISIT_STATUS_COLOR_OPTIONS,
  defaultLeadStatusColor,
  leadStatusColor,
  leadStatusColorVersion,
  setLeadStatusColorOverrides,
  subscribeLeadStatusColors,
} from '@/lib/lead-options';

// Lead status colours at three levels: the super admin's default for every
// company, the company default (company admins), and each user's own. The
// effective colour of a status is the user's, else the company's, else the
// super admin's, else the built-in one.

let levels: LeadStatusColorLevels | null = null;
let loading: Promise<void> | null = null;

const applyLevels = (next: LeadStatusColorLevels) => {
  levels = next;
  setLeadStatusColorOverrides({ ...(next.global || {}), ...(next.company || {}), ...(next.user || {}) });
};

const loadLevels = (force = false) => {
  if (!loading || force) {
    loading = preferencesApi
      .getLeadStatusColors()
      .then(applyLevels)
      .catch(() => {
        loading = null;
      });
  }
  return loading;
};

/**
 * Makes the calling component re-render when status colours change, and
 * loads the saved colours the first time any component asks.
 */
export function useLeadStatusColors() {
  useEffect(() => {
    loadLevels();
  }, []);
  return useSyncExternalStore(subscribeLeadStatusColors, leadStatusColorVersion, () => 0);
}

const LEVEL_LABEL: Record<PreferenceScope, string> = {
  user: 'Only for me',
  company: 'Company default (all users of this company)',
  global: 'Default for all companies',
};

type ColorOption = { value: string; label: string };

/**
 * "Colours" button; opens the colour editor for lead statuses, or with
 * `kind="visit"` for site visit statuses (stored as "visit:<status>").
 */
export function LeadStatusColorsButton({ kind = 'lead' }: { kind?: 'lead' | 'visit' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        title="Choose status colours"
      >
        <SwatchIcon className="h-4 w-4" /> Colours
      </button>
      {open && (
        <LeadStatusColorsModal
          options={kind === 'visit' ? VISIT_STATUS_COLOR_OPTIONS : LEAD_STATUS_OPTIONS}
          title={kind === 'visit' ? 'Site visit status colours' : 'Status colours'}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function LeadStatusColorsModal({ options, title, onClose }: { options: ColorOption[]; title: string; onClose: () => void }) {
  const toast = useToast();
  useLeadStatusColors();
  const [scope, setScope] = useState<PreferenceScope>('user');
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(options.map((o) => [o.value, leadStatusColor(o.value)]))
  );
  const [saving, setSaving] = useState(false);
  const [canSetCompany, setCanSetCompany] = useState(!!levels?.canSetCompany);
  const [canSetGlobal, setCanSetGlobal] = useState(!!levels?.canSetGlobal);

  useEffect(() => {
    loadLevels(true).then(() => {
      setCanSetCompany(!!levels?.canSetCompany);
      setCanSetGlobal(!!levels?.canSetGlobal);
    });
  }, []);

  // What a status shows for this scope with nothing saved at it: the levels
  // below it (built-in < global < company).
  const inheritedFor = (s: PreferenceScope, status: string) => {
    const l = levels;
    if (s === 'user') return l?.company?.[status] || l?.global?.[status] || defaultLeadStatusColor(status);
    if (s === 'company') return l?.global?.[status] || defaultLeadStatusColor(status);
    return defaultLeadStatusColor(status);
  };

  // Colours saved at a level for statuses not in this editor's list.
  const othersAt = (s: PreferenceScope) => {
    const keys = new Set(options.map((o) => o.value));
    return Object.fromEntries(Object.entries((levels?.[s] || {}) as Record<string, string>).filter(([k]) => !keys.has(k)));
  };

  const pickScope = (s: PreferenceScope) => {
    setScope(s);
    const saved = (levels?.[s] || {}) as Record<string, string>;
    setDraft(Object.fromEntries(options.map((o) => [o.value, saved[o.value] || inheritedFor(s, o.value)])));
  };

  const save = async () => {
    setSaving(true);
    try {
      // Only keep colours that differ from what this level would inherit, so
      // later changes to a lower default still show through.
      // later changes to a lower default still show through. Colours saved
      // for the other list (lead vs visit statuses) at this level are kept.
      const changed = Object.fromEntries(Object.entries(draft).filter(([status, c]) => c.toLowerCase() !== inheritedFor(scope, status).toLowerCase()));
      await preferencesApi.setLeadStatusColors(scope, { ...othersAt(scope), ...changed });
      await loadLevels(true);
      toast.success(scope === 'user' ? 'Your colours are saved.' : 'Default colours saved.');
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Could not save the colours.');
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    try {
      const others = othersAt(scope);
      if (Object.keys(others).length) await preferencesApi.setLeadStatusColors(scope, others);
      else await preferencesApi.resetLeadStatusColors(scope);
      await loadLevels(true);
      pickScope(scope);
      toast.success('Colours reset.');
    } catch (err: any) {
      toast.error(err.message || 'Could not reset the colours.');
    } finally {
      setSaving(false);
    }
  };

  const scopes: PreferenceScope[] = ['user', ...(canSetCompany ? (['company'] as const) : []), ...(canSetGlobal ? (['global'] as const) : [])];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {scopes.length > 1 && (
          <div className="border-b border-slate-100 px-6 py-3">
            <label className="block text-xs font-medium text-slate-500">Apply to</label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {scopes.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => pickScope(s)}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                    scope === s ? 'border-[var(--primary)] bg-[var(--primary)] text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {LEVEL_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        )}

        <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto px-6">
          {options.map((o) => (
            <li key={o.value} className="flex items-center gap-3 py-2">
              <input
                type="color"
                value={draft[o.value]}
                onChange={(e) => setDraft((d) => ({ ...d, [o.value]: e.target.value }))}
                className="h-8 w-10 cursor-pointer rounded border border-slate-200 bg-white p-0.5"
                aria-label={`Colour for ${o.label}`}
              />
              <span className="flex-1 text-sm text-slate-700">{o.label}</span>
              <span
                className="lead-status-badge rounded-full px-2.5 py-0.5 text-xs font-medium"
                style={{ '--tone': draft[o.value] } as React.CSSProperties}
              >
                Preview
              </span>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={reset} disabled={saving} className="text-xs font-semibold text-slate-500 hover:text-red-600 disabled:opacity-50">
            {scope === 'user' ? 'Reset to default' : 'Remove this default'}
          </button>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="button" size="sm" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
