'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  Cog6ToothIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ArrowsUpDownIcon,
  PencilSquareIcon,
  LockClosedIcon,
  EyeIcon,
  XMarkIcon,
  ArrowPathIcon,
  MapPinIcon,
} from '@heroicons/react/24/outline';
import { MapPinIcon as MapPinIconSolid } from '@heroicons/react/24/solid';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type DataTableColumn<T> = {
  header: string;
  /** Unique ID for column visibility & ordering persistence */
  id?: string;
  /** Accessor function to render read-only cell content */
  accessor: (row: T, index: number) => React.ReactNode;
  /** Optional function to extract primitive value for auto-sorting */
  sortKey?: (row: T) => string | number | boolean | Date | null | undefined;
  /** If provided, enables inline text editing */
  editValue?: (row: T) => string;
  /** Called when inline edit is committed */
  onEdit?: (row: T, newValue: string) => void;
  /** Optional <datalist> to back the inline-edit input with typeahead suggestions (e.g. assignee names) */
  editDatalist?: { id: string; options: string[] };
  /** Input type for the inline-edit control. Defaults to 'text'. Use 'date' for date fields so double-click / right-click edit opens a native date picker. */
  editType?: 'text' | 'date';
  className?: string;
  headerClassName?: string;
  /**
   * Marks a column as hidden by default, only appearing in the table once the
   * user explicitly adds it from the "Arrange & Hide Columns" panel. Use this
   * for fields that exist on the record but were deliberately trimmed off the
   * default table view (e.g. Task 2.16 removed Phone/Email/Industry/etc. from
   * the main Leads table) — they stay available on request instead of being
   * gone entirely. Ignored if the user's saved column settings already say
   * otherwise (so once added, it stays added).
   */
  optional?: boolean;
};

type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  data: T[];
  rowKey: (row: T) => string | number;
  loading?: boolean;
  emptyMessage?: string;
  selectable?: boolean;
  onSelectionChange?: (selectedIds: (string | number)[]) => void;
  actions?: (row: T) => React.ReactNode;
  onRowClick?: (row: T) => void;
  /** Optional full-width expansion panel underneath the row */
  expandedRowContent?: (row: T) => React.ReactNode;
  /** Enable top-right toolbar (density, total entries badge, settings cog) */
  showToolbar?: boolean;
  /** Total count override for backend pagination */
  totalEntries?: number;
  /** Unique identifier for persisting column order & visibility per user/table */
  tableId?: string;
  /** User permission flag: controls if right-click inline edit is unlocked */
  canEdit?: boolean;
};

const ALL_SENTINEL = 'all';

const PAGE_SIZE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '2 Rows',  value: '2'          },
  { label: '5 Rows',  value: '5'          },
  { label: '10 Rows', value: '10'         },
  { label: 'All',     value: ALL_SENTINEL },
];

// ─────────────────────────────────────────────────────────────────────────────
// EditableCell — Inline double-click & context-menu edit controller
// ─────────────────────────────────────────────────────────────────────────────

type EditableCellProps<T> = {
  row: T;
  col: DataTableColumn<T>;
  index: number;
  isEditingFromContext?: boolean;
  onEndContextEdit?: () => void;
};

function EditableCell<T>({
  row,
  col,
  index,
  isEditingFromContext,
  onEndContextEdit,
}: EditableCellProps<T>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState('');
  const inputRef             = useRef<HTMLInputElement>(null);
  const wrapperRef           = useRef<HTMLDivElement>(null);

  // Trigger edit mode when context menu requests edit
  useEffect(() => {
    if (isEditingFromContext && col.editValue && col.onEdit) {
      setDraft(col.editValue(row));
      setEditing(true);
    }
  }, [isEditingFromContext, col, row]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    const onMouseDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setEditing(false);
        onEndContextEdit?.();
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [editing, onEndContextEdit]);

  const enterEdit = useCallback(
    (e: React.MouseEvent) => {
      if (!col.editValue || !col.onEdit) return;
      e.stopPropagation();
      setDraft(col.editValue(row));
      setEditing(true);
    },
    [col, row]
  );

  const commit = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      col.onEdit?.(row, draft);
      setEditing(false);
      onEndContextEdit?.();
    },
    [col, row, draft, onEndContextEdit]
  );

  const cancel = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setEditing(false);
      onEndContextEdit?.();
    },
    [onEndContextEdit]
  );

  if (editing) {
    return (
      <div
        ref={wrapperRef}
        className="flex items-center gap-1.5"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type={col.editType || 'text'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          list={col.editDatalist?.id}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              col.onEdit?.(row, draft);
              setEditing(false);
              onEndContextEdit?.();
            }
            if (e.key === 'Escape') {
              setEditing(false);
              onEndContextEdit?.();
            }
          }}
          className="min-w-0 flex-1 rounded-md border-2 border-[#168eea] bg-white px-2 py-1 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#168eea]/20"
        />
        {col.editDatalist && (
          <datalist id={col.editDatalist.id}>
            {col.editDatalist.options.map((opt) => (
              <option key={opt} value={opt} />
            ))}
          </datalist>
        )}

        <button
          onClick={commit}
          title="Save (Enter)"
          className="flex shrink-0 items-center gap-1 rounded-md bg-emerald-500 px-2 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-600 active:scale-95"
        >
          <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
            <path d="M17.414 2.586A2 2 0 0016 2H4a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V4a2 2 0 00-.586-1.414zM10 16a3 3 0 110-6 3 3 0 010 6zm4-10H6V3h8v3z" />
          </svg>
          Save
        </button>

        <button
          onClick={cancel}
          title="Cancel (Esc)"
          className="flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-100 active:scale-95"
        >
          <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div
      onDoubleClick={col.editValue && col.onEdit ? enterEdit : undefined}
      title={col.editValue && col.onEdit ? 'Double-click or Right-click to edit' : undefined}
      className={cn(
        'select-text',
        col.editValue && col.onEdit && 'cursor-text rounded px-0.5 hover:bg-slate-100/80'
      )}
    >
      {col.accessor(row, index)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DataTable Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function DataTable<T>({
  columns: initialColumns,
  data,
  rowKey,
  loading           = false,
  emptyMessage      = 'No records found.',
  selectable        = true,
  onSelectionChange,
  actions,
  onRowClick,
  expandedRowContent,
  showToolbar       = false,
  totalEntries,
  tableId           = 'default_datatable',
  canEdit           = true,
}: DataTableProps<T>) {
  const [selected,    setSelected]    = useState<Set<string | number>>(new Set());
  const [expandedId,  setExpandedId]  = useState<string | number | null>(null);
  const [pageSizeStr, setPageSizeStr] = useState<string>('10');

  // ── 1. Column Reordering & Visibility State ──
  const [orderedColumns, setOrderedColumns] = useState<DataTableColumn<T>[]>(initialColumns);
  const [hiddenColumnIds, setHiddenColumnIds] = useState<Set<string>>(
    () => new Set(initialColumns.filter((c) => c.optional).map((c, idx) => c.id || c.header || String(idx)))
  );
  // Which columns are individually pinned/frozen. Any column can be pinned on
  // its own (or several at once) — this is NOT a contiguous "freeze everything
  // up to here" range.
  const [frozenColumnIds, setFrozenColumnIds] = useState<Set<string>>(new Set());
  const [isSettingsOpen, setIsSettingsOpen]  = useState(false);
  const settingsModalRef = useRef<HTMLDivElement>(null);

  // Initialize and load saved column preferences from localStorage
  useEffect(() => {
    const defaultHidden = new Set(
      initialColumns.filter((c) => c.optional).map((c, idx) => c.id || c.header || String(idx))
    );
    try {
      const savedKey = `crm_table_settings_${tableId}`;
      const savedData = localStorage.getItem(savedKey);
      if (savedData) {
        const { order, hidden, frozenColumnIds: savedFrozen, frozenUpToId: legacyFrozen } = JSON.parse(savedData);
        setHiddenColumnIds(Array.isArray(hidden) ? new Set(hidden) : defaultHidden);
        if (Array.isArray(savedFrozen)) {
          setFrozenColumnIds(new Set(savedFrozen));
        } else if (typeof legacyFrozen === 'string' && legacyFrozen) {
          // Back-compat: older saved settings used a single "freeze up to"
          // pin point. Migrate it to the new per-column set on first load.
          setFrozenColumnIds(new Set([legacyFrozen]));
        } else {
          setFrozenColumnIds(new Set());
        }
        if (Array.isArray(order)) {
          const colMap = new Map(initialColumns.map((col, idx) => [col.id || col.header || String(idx), col]));
          const reordered: DataTableColumn<T>[] = [];
          order.forEach((id: string) => {
            if (colMap.has(id)) {
              reordered.push(colMap.get(id)!);
              colMap.delete(id);
            }
          });
          colMap.forEach((col) => reordered.push(col));
          setOrderedColumns(reordered);
          return;
        }
      } else {
        setHiddenColumnIds(defaultHidden);
      }
    } catch {
      setHiddenColumnIds(defaultHidden);
    }
    setOrderedColumns(initialColumns);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialColumns, tableId]);

  // Save column preferences to localStorage
  const saveColumnSettings = (
    newOrder: DataTableColumn<T>[],
    newHidden: Set<string>,
    newFrozenColumnIds: Set<string> = frozenColumnIds
  ) => {
    try {
      const savedKey = `crm_table_settings_${tableId}`;
      const order = newOrder.map((col, idx) => col.id || col.header || String(idx));
      const hidden = Array.from(newHidden);
      const frozenColumnIds = Array.from(newFrozenColumnIds);
      localStorage.setItem(savedKey, JSON.stringify({ order, hidden, frozenColumnIds }));
    } catch {
      // Ignore
    }
  };

  const toggleColumnVisibility = (colId: string) => {
    setHiddenColumnIds((prev) => {
      const next = new Set(prev);
      if (next.has(colId)) next.delete(colId);
      else next.add(colId);
      saveColumnSettings(orderedColumns, next);
      return next;
    });
  };

  const moveColumn = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= orderedColumns.length) return;
    const next = [...orderedColumns];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setOrderedColumns(next);
    saveColumnSettings(next, hiddenColumnIds);
  };

  // Freeze columns: pins any individual column (or several independently) so
  // it stays in view while the rest of the table scrolls horizontally
  // (Excel/Sheets-style "freeze panes"), plus the checkbox/Sr.No columns
  // whenever at least one column is pinned. Toggling a pinned column again
  // un-freezes just that column — it does NOT touch any other pin.
  const toggleFreezeColumn = (colId: string) => {
    setFrozenColumnIds((prev) => {
      const next = new Set(prev);
      if (next.has(colId)) next.delete(colId);
      else next.add(colId);
      saveColumnSettings(orderedColumns, hiddenColumnIds, next);
      return next;
    });
  };

  const resetColumnSettings = () => {
    setOrderedColumns(initialColumns);
    setHiddenColumnIds(new Set(initialColumns.filter((c) => c.optional).map((c, idx) => c.id || c.header || String(idx))));
    setFrozenColumnIds(new Set());
    try {
      localStorage.removeItem(`crm_table_settings_${tableId}`);
    } catch {
      // Ignore
    }
  };

  // Visible columns filtered out
  const visibleColumns = orderedColumns.filter(
    (col, idx) => !hiddenColumnIds.has(col.id || col.header || String(idx))
  );

  // ── 2. Automatic Header Sorting State ──
  const [sortColIndex, setSortColIndex] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null);

  const handleHeaderClick = (colIndex: number) => {
    if (sortColIndex === colIndex) {
      if (sortDirection === 'asc') setSortDirection('desc');
      else if (sortDirection === 'desc') {
        setSortDirection(null);
        setSortColIndex(null);
      }
    } else {
      setSortColIndex(colIndex);
      setSortDirection('asc');
    }
  };

  // ── 3. Right-Click Context Menu State ──
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    row: T;
    colIndex: number;
  } | null>(null);

  const [activeContextEditRowId, setActiveContextEditRowId] = useState<string | number | null>(null);

  const handleContextMenu = (e: React.MouseEvent, row: T, colIndex: number) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, input, select, textarea, a, label')) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      row,
      colIndex,
    });
  };

  // Close context menu on outside click
  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  // ── 4. Frozen (sticky) Columns — Excel/Sheets-style "freeze panes" ──
  // Pins the checkbox + Sr. No. columns (whenever any freeze is active) plus
  // any individual column(s) the user picked in `frozenColumnIds` — these do
  // NOT need to be contiguous or start from the left edge. Offsets are
  // measured from the actual rendered header cell widths (rather than
  // assumed/fixed widths) so this keeps working regardless of column content
  // or screen size.
  //
  // IMPORTANT: only keys that are actually frozen get an entry in
  // `stickyLefts` — this was the bug in the old "freeze up to" implementation,
  // which built an offset for every single column (frozen or not), so
  // `position: sticky` ended up applied to the whole table and nothing
  // behaved like a freeze at all.
  const headerCellRefs = useRef<Map<string, HTMLTableCellElement>>(new Map());
  const [stickyLefts, setStickyLefts] = useState<Map<string, number>>(new Map());

  const isFreezeActive = frozenColumnIds.size > 0;

  // Order in which frozen columns should stack from the left: utility
  // columns first, then whichever data columns are frozen, in their normal
  // visible order (not the order they were pinned in).
  const frozenKeysInOrder = isFreezeActive
    ? [
        '__checkbox',
        '__srno',
        ...visibleColumns
          .map((c, i) => c.id || c.header || String(i))
          .filter((key) => frozenColumnIds.has(key)),
      ]
    : [];

  const recomputeStickyOffsets = useCallback(() => {
    if (!isFreezeActive) {
      setStickyLefts(new Map());
      return;
    }
    const next = new Map<string, number>();
    let cumulative = 0;
    for (const key of frozenKeysInOrder) {
      const el = headerCellRefs.current.get(key);
      next.set(key, cumulative);
      if (el) cumulative += el.offsetWidth;
    }
    setStickyLefts(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFreezeActive, frozenKeysInOrder.join('|')]);

  useLayoutEffect(() => {
    recomputeStickyOffsets();
    if (!isFreezeActive) return;
    window.addEventListener('resize', recomputeStickyOffsets);
    return () => window.removeEventListener('resize', recomputeStickyOffsets);
  }, [recomputeStickyOffsets, isFreezeActive, data]);

  // Sticky style helper — applied to both header <th> and body <td>, but only
  // for columns that are actually frozen (stickyLefts only contains frozen
  // keys now). `isLastFrozen` gets a shadow divider so the freeze boundary
  // reads clearly against the scrollable columns behind it.
  const getStickyStyle = (key: string, bg: string): React.CSSProperties | undefined => {
    if (!isFreezeActive || !stickyLefts.has(key)) return undefined;
    return {
      position: 'sticky',
      left: stickyLefts.get(key),
      zIndex: 15,
      backgroundColor: bg,
    };
  };

  const isLastFrozenKey = (key: string) => {
    if (!isFreezeActive) return false;
    return frozenKeysInOrder[frozenKeysInOrder.length - 1] === key;
  };

  // Reset selection when dataset changes
  useEffect(() => {
    setSelected(new Set());
  }, [data]);

  useEffect(() => {
    onSelectionChange?.(Array.from(selected));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // Selection helpers
  const allSelected  = data.length > 0 && selected.size === data.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(data.map(rowKey)));

  const toggleRow = (id: string | number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleExpand = (id: string | number) =>
    setExpandedId((prev) => (prev === id ? null : id));

  // ── Apply Sorting ──
  const sortedData = React.useMemo(() => {
    if (sortColIndex === null || !sortDirection || !visibleColumns[sortColIndex]) {
      return data;
    }
    const targetCol = visibleColumns[sortColIndex];
    return [...data].sort((a, b) => {
      let valA: any;
      let valB: any;

      if (targetCol.sortKey) {
        valA = targetCol.sortKey(a);
        valB = targetCol.sortKey(b);
      } else if (targetCol.editValue) {
        valA = targetCol.editValue(a);
        valB = targetCol.editValue(b);
      } else {
        // Fallback string conversion
        valA = String(a);
        valB = String(b);
      }

      if (valA == null) return 1;
      if (valB == null) return -1;

      let result = 0;
      if (typeof valA === 'number' && typeof valB === 'number') {
        result = valA - valB;
      } else {
        result = String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' });
      }

      return sortDirection === 'asc' ? result : -result;
    });
  }, [data, sortColIndex, sortDirection, visibleColumns]);

  // Apply Density Slicing
  const displayData =
    pageSizeStr === ALL_SENTINEL
      ? sortedData
      : sortedData.slice(0, Number(pageSizeStr));

  const shownCount =
    pageSizeStr === ALL_SENTINEL ? data.length : Math.min(Number(pageSizeStr), data.length);

  const colSpanTotal =
    visibleColumns.length +
    (selectable         ? 1 : 0) +
    (actions            ? 1 : 0) +
    1 +
    (expandedRowContent ? 1 : 0);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-[#168eea]" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ══════════════════════════════════════════════════════════════
          TOP TOOLBAR: Showing X of Y | Total Entries | Density | Cog Settings
          ══════════════════════════════════════════════════════════════ */}
      {showToolbar && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-500">
            Showing <span className="font-semibold text-slate-700">{shownCount}</span> of{' '}
            <span className="font-semibold text-slate-700">{totalEntries ?? data.length}</span> entries
          </p>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-[#168eea]" />
              Total Entries:&nbsp;
              <strong>{totalEntries ?? data.length}</strong>
            </span>

            {/* Density Picker */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-slate-500">Show:</span>
              <select
                value={pageSizeStr}
                onChange={(e) => setPageSizeStr(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea]/30"
              >
                {PAGE_SIZE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Column Customization Settings Cog Button */}
            <div className="relative">
              <button
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                title="Arrange & Hide Columns"
                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none"
              >
                <Cog6ToothIcon className="h-4 w-4 text-slate-500" />
                <span>Columns</span>
              </button>

              {/* Column Rearrange & Visibility Modal / Popover */}
              {isSettingsOpen && (
                <div
                  ref={settingsModalRef}
                  className="absolute right-0 top-9 z-50 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-xl animate-fadeIn"
                >
                  <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Arrange & Hide Columns
                    </h4>
                    <button
                      onClick={() => setIsSettingsOpen(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </div>

                  <p className="mb-2 text-[11px] leading-snug text-slate-400">
                    Check a column to show it. Pin <MapPinIcon className="inline h-3 w-3 -translate-y-px" /> a column to freeze just that column while scrolling — pin as many as you like.
                  </p>

                  <div className="max-h-60 space-y-1.5 overflow-y-auto pr-1">
                    {orderedColumns.map((col, idx) => {
                      const colId = col.id || col.header || String(idx);
                      const isHidden = hiddenColumnIds.has(colId);
                      const isFrozenHere = frozenColumnIds.has(colId);

                      return (
                        <div
                          key={colId}
                          className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/70 p-2 text-xs"
                        >
                          <label className="flex cursor-pointer items-center gap-2 font-medium text-slate-700">
                            <input
                              type="checkbox"
                              checked={!isHidden}
                              onChange={() => toggleColumnVisibility(colId)}
                              className="h-3.5 w-3.5 rounded border-slate-300 text-[#168eea] focus:ring-[#168eea]"
                            />
                            <span className={cn(isHidden && 'line-through text-slate-400')}>
                              {col.header}
                            </span>
                            {col.optional && (
                              <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#168eea]">
                                Add
                              </span>
                            )}
                          </label>

                          <div className="flex items-center gap-1">
                            <button
                              disabled={isHidden}
                              onClick={() => toggleFreezeColumn(colId)}
                              className={cn(
                                'rounded p-0.5 disabled:opacity-30',
                                isFrozenHere ? 'text-[#168eea]' : 'text-slate-400 hover:bg-slate-200 hover:text-slate-700'
                              )}
                              title={isFrozenHere ? 'Unfreeze this column' : 'Freeze this column'}
                            >
                              {isFrozenHere ? (
                                <MapPinIconSolid className="h-3 w-3" />
                              ) : (
                                <MapPinIcon className="h-3 w-3" />
                              )}
                            </button>
                            <button
                              disabled={idx === 0}
                              onClick={() => moveColumn(idx, idx - 1)}
                              className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-30"
                              title="Move Up"
                            >
                              <ArrowUpIcon className="h-3 w-3" />
                            </button>
                            <button
                              disabled={idx === orderedColumns.length - 1}
                              onClick={() => moveColumn(idx, idx + 1)}
                              className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-30"
                              title="Move Down"
                            >
                              <ArrowDownIcon className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex justify-between border-t border-slate-100 pt-2 text-xs">
                    <button
                      onClick={resetColumnSettings}
                      className="flex items-center gap-1 text-slate-500 hover:text-slate-700 hover:underline"
                    >
                      <ArrowPathIcon className="h-3 w-3" /> Reset
                    </button>
                    <button
                      onClick={() => setIsSettingsOpen(false)}
                      className="rounded bg-[#168eea] px-2.5 py-1 text-xs font-semibold text-white shadow hover:bg-[#1278cc]"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TABLE WITH SORTABLE HEADERS & RIGHT-CLICK CONTEXT MENU
          ══════════════════════════════════════════════════════════════ */}
      <div className="overflow-x-auto rounded-lg border-2 border-slate-800/10">
        <table className="w-full border-collapse text-sm">
          {/* Header */}
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {selectable && (
                <th
                  ref={(el) => { if (el) headerCellRefs.current.set('__checkbox', el); }}
                  className={cn('w-10 px-4 py-3', isLastFrozenKey('__checkbox') && 'shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]')}
                  style={getStickyStyle('__checkbox', 'rgb(248 250 252 / 0.8)')}
                >
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={toggleAll}
                    className="h-4 w-4 cursor-pointer rounded border-2 border-slate-400 text-[#168eea] focus:ring-[#168eea]"
                    aria-label="Select all rows"
                  />
                </th>
              )}
              <th
                ref={(el) => { if (el) headerCellRefs.current.set('__srno', el); }}
                className={cn('w-14 px-4 py-3 text-center', isLastFrozenKey('__srno') && 'shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]')}
                style={getStickyStyle('__srno', 'rgb(248 250 252 / 0.8)')}
              >
                Sr.&nbsp;No.
              </th>

              {/* Dynamic Header Columns with Auto Sort */}
              {visibleColumns.map((col, i) => {
                const isSorted = sortColIndex === i;
                const key = col.id || col.header || String(i);
                return (
                  <th
                    key={i}
                    ref={(el) => { if (el) headerCellRefs.current.set(key, el); }}
                    onClick={() => handleHeaderClick(i)}
                    className={cn(
                      'group cursor-pointer select-none px-4 py-3 transition hover:bg-slate-100',
                      col.headerClassName,
                      isLastFrozenKey(key) && 'shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]'
                    )}
                    style={getStickyStyle(key, 'rgb(248 250 252 / 0.8)')}
                    title="Click to sort Ascending / Descending"
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span>{col.header}</span>
                      <span className="text-slate-300">
                        {isSorted ? (
                          sortDirection === 'asc' ? (
                            <ArrowUpIcon className="h-3.5 w-3.5 text-[#168eea]" />
                          ) : (
                            <ArrowDownIcon className="h-3.5 w-3.5 text-[#168eea]" />
                          )
                        ) : (
                          <ArrowsUpDownIcon className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100 text-slate-400" />
                        )}
                      </span>
                    </div>
                  </th>
                );
              })}

              {actions && (
                <th className="px-4 py-3 text-right">Actions</th>
              )}
              {expandedRowContent && <th className="w-10 px-3 py-3" />}
            </tr>
          </thead>

          {/* Body */}
          <tbody className="divide-y divide-slate-100">
            {displayData.length === 0 ? (
              <tr>
                <td colSpan={colSpanTotal} className="py-10 text-center text-slate-400">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              displayData.map((row, index) => {
                const id         = rowKey(row);
                const isSelected = selected.has(id);
                const isExpanded = expandedId === id;
                const isEven     = index % 2 === 0;

                return (
                  <React.Fragment key={id}>
                    {/* Row */}
                    <tr
                      onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest('button, input, select, textarea, a, label')) return;
                        onRowClick?.(row);
                        if (expandedRowContent) toggleExpand(id);
                      }}
                      onContextMenu={(e) => handleContextMenu(e, row, 0)}
                      className={cn(
                        'transition-colors duration-150',
                        isSelected
                          ? 'bg-[var(--sidebar-active-bg)]'
                          : isEven
                          ? 'bg-white hover:bg-slate-50/50'
                          : 'bg-white hover:bg-slate-50/50',
                        (onRowClick || expandedRowContent) && 'cursor-pointer'
                      )}
                    >
                      {/* Checkbox */}
                      {selectable && (
                        <td
                          className={cn('px-4 py-3', isLastFrozenKey('__checkbox') && 'shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]')}
                          style={getStickyStyle('__checkbox', isSelected ? 'var(--sidebar-active-bg)' : '#fff')}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleRow(id)}
                            className="h-4 w-4 cursor-pointer rounded border-2 border-slate-400 text-[#168eea] focus:ring-[#168eea]"
                            aria-label={`Select row ${index + 1}`}
                          />
                        </td>
                      )}

                      {/* Sr. No. */}
                      <td
                        className={cn('px-4 py-3 text-center text-sm text-slate-400', isLastFrozenKey('__srno') && 'shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]')}
                        style={getStickyStyle('__srno', isSelected ? 'var(--sidebar-active-bg)' : '#fff')}
                      >
                        {index + 1}
                      </td>

                      {/* Visible Data Cells */}
                      {visibleColumns.map((col, i) => {
                        const key = col.id || col.header || String(i);
                        return (
                        <td
                          key={i}
                          onContextMenu={(e) => handleContextMenu(e, row, i)}
                          className={cn(
                            'px-4 py-3',
                            col.className,
                            isLastFrozenKey(key) && 'shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]'
                          )}
                          style={getStickyStyle(key, isSelected ? 'var(--sidebar-active-bg)' : '#fff')}
                        >
                          {col.editValue && col.onEdit ? (
                            <EditableCell
                              row={row}
                              col={col}
                              index={index}
                              isEditingFromContext={
                                activeContextEditRowId === id &&
                                visibleColumns[contextMenu?.colIndex ?? -1]?.header === col.header
                              }
                              onEndContextEdit={() => setActiveContextEditRowId(null)}
                            />
                          ) : (
                            col.accessor(row, index)
                          )}
                        </td>
                        );
                      })}

                      {/* Actions */}
                      {actions && (
                        <td
                          className="px-4 py-3 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {actions(row)}
                        </td>
                      )}

                      {/* Chevron */}
                      {expandedRowContent && (
                        <td className="px-3 py-3 text-center text-slate-400">
                          {isExpanded ? (
                            <ChevronUpIcon className="inline-block h-4 w-4 transition-transform duration-200" />
                          ) : (
                            <ChevronDownIcon className="inline-block h-4 w-4 transition-transform duration-200" />
                          )}
                        </td>
                      )}
                    </tr>

                    {/* Expansion Panel */}
                    {expandedRowContent && isExpanded && (
                      <tr>
                        <td
                          colSpan={colSpanTotal}
                          className="border-b border-blue-100 bg-blue-50/70 px-6 py-4"
                        >
                          <div className="animate-fadeIn">{expandedRowContent(row)}</div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          RIGHT-CLICK CONTEXT MENU (PERMISSION-CHECKED)
          ══════════════════════════════════════════════════════════════ */}
      {contextMenu && (
        <div
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          className="fixed z-50 w-56 rounded-xl border border-slate-200 bg-white py-1.5 shadow-2xl animate-fadeIn"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-slate-100 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Row Options
          </div>

          {/* Quick Edit option (checks user permission & column editable status) */}
          {canEdit && visibleColumns[contextMenu.colIndex]?.onEdit ? (
            <button
              onClick={() => {
                setActiveContextEditRowId(rowKey(contextMenu.row));
                setContextMenu(null);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-blue-50 hover:text-[#168eea]"
            >
              <PencilSquareIcon className="h-4 w-4 text-[#168eea]" />
              <span>Edit "{visibleColumns[contextMenu.colIndex]?.header}" Field</span>
            </button>
          ) : (
            <div className="flex w-full items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-400 cursor-not-allowed bg-slate-50">
              <LockClosedIcon className="h-4 w-4 text-slate-400" />
              <span>Edit Disabled (No Permission)</span>
            </div>
          )}

          {/* View Details option */}
          {onRowClick && (
            <button
              onClick={() => {
                onRowClick(contextMenu.row);
                setContextMenu(null);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              <EyeIcon className="h-4 w-4 text-slate-500" />
              <span>Open Details Entry</span>
            </button>
          )}

          {/* Copy Cell Value */}
          <button
            onClick={() => {
              const col = visibleColumns[contextMenu.colIndex];
              const val = col?.editValue ? col.editValue(contextMenu.row) : '';
              if (val) navigator.clipboard.writeText(val);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
          >
            <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span>Copy Cell Value</span>
          </button>
        </div>
      )}
    </div>
  );
}
