'use client';

import { cn } from '@/lib/utils';
import { LEAD_SOURCE_OPTIONS, LEAD_STATUS_OPTIONS, leadSourceLabel, leadStatusColor, leadStatusLabel } from '@/lib/lead-options';
import TypeaheadSelect, { type TypeaheadOption } from '@/components/ui/typeahead-select';
import { useLeadStatusColors } from './lead-status-colors';

/** Coloured pill showing a lead's status by its label. */
export function LeadStatusBadge({ status, className }: { status?: string | null; className?: string }) {
  useLeadStatusColors();
  return (
    <span
      className={cn('lead-status-badge inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', className)}
      style={{ '--tone': leadStatusColor(status) } as React.CSSProperties}
    >
      {leadStatusLabel(status || 'new')}
    </span>
  );
}

/**
 * Status picker the user can type into: typing filters the list, arrow keys
 * and Enter pick, a click picks. Only the current statuses are offered; a
 * lead still on an older status shows it until it is changed.
 *
 * `extraOptions` go first (e.g. "All statuses" on a filter).
 */
export function LeadStatusSelect({
  value,
  onChange,
  extraOptions = [],
  className,
  placeholder = 'Type to search status...',
}: {
  value: string;
  onChange: (value: string) => void;
  extraOptions?: TypeaheadOption[];
  className?: string;
  placeholder?: string;
}) {
  useLeadStatusColors();
  return (
    <TypeaheadSelect
      value={value}
      onChange={onChange}
      options={LEAD_STATUS_OPTIONS}
      extraOptions={extraOptions}
      className={className}
      placeholder={placeholder}
      emptyText="No status matches"
      labelFor={leadStatusLabel}
      dotColor={leadStatusColor}
    />
  );
}

/** Lead source picker the user can type into ("fb", "insta", "cp" find theirs too). */
export function LeadSourceSelect({
  value,
  onChange,
  extraOptions = [],
  className,
  placeholder = 'Type to search source...',
}: {
  value: string;
  onChange: (value: string) => void;
  extraOptions?: TypeaheadOption[];
  className?: string;
  placeholder?: string;
}) {
  return (
    <TypeaheadSelect
      value={value}
      onChange={onChange}
      options={LEAD_SOURCE_OPTIONS}
      extraOptions={extraOptions}
      className={className}
      placeholder={placeholder}
      emptyText="No source matches"
      labelFor={leadSourceLabel}
    />
  );
}
