'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeftIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  DocumentDuplicateIcon,
  TrashIcon,
  PrinterIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  PlusIcon,
  XMarkIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import Button from '@/components/ui/button';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { useToast } from '@/components/ui/toast';
import { documentTemplatesApi, openPrintWindow, DocTypeOption, MergeField } from '@/lib/api';
import { renderTemplate } from '@/lib/template-render';
import {
  Block,
  BlockStyle,
  BlockType,
  BLOCK_LIBRARY,
  FONT_FAMILIES,
  PAGE_SIZES_MM,
  PageSettings,
  PrintLayout,
  blockPreviewHtml,
  createBlock,
  defaultLayout,
  layoutToHtml,
  parseLayout,
  widthPercent,
} from '@/lib/print-builder';
import { cn } from '@/lib/utils';

const NEW_BLOCK = 'application/x-pf-new';
const MOVE_BLOCK = 'application/x-pf-move';
const MM_TO_PX = 96 / 25.4;

export default function PrintBuilderPage() {
  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center"><LoadingSpinner size="md" /></div>}>
      <PrintBuilder />
    </Suspense>
  );
}

function PrintBuilder() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [templateId, setTemplateId] = useState<number | null>(searchParams.get('id') ? Number(searchParams.get('id')) : null);
  const [loading, setLoading] = useState(true);
  const [docTypes, setDocTypes] = useState<DocTypeOption[]>([]);
  const [name, setName] = useState('');
  const [docType, setDocType] = useState(searchParams.get('docType') || 'quote');
  const [isDefault, setIsDefault] = useState(false);
  // The design and its undo/redo stacks live in one state so every change is atomic.
  const [doc, setDoc] = useState<{ layout: PrintLayout; past: PrintLayout[]; future: PrintLayout[] }>(() => ({
    layout: defaultLayout(searchParams.get('docType') || 'quote'),
    past: [],
    future: [],
  }));
  const layout = doc.layout;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mergeFields, setMergeFields] = useState<MergeField[]>([]);
  const [sample, setSample] = useState<Record<string, unknown>>({});
  const [recordId, setRecordId] = useState('');
  const [dropTarget, setDropTarget] = useState<{ id: string | null; after: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  // 0 = fit the page to the available width.
  const [zoom, setZoom] = useState(0);
  const [canvasWidth, setCanvasWidth] = useState(0);
  const canvasObserver = useRef<ResizeObserver | null>(null);
  const canvasRef = useCallback((el: HTMLElement | null) => {
    canvasObserver.current?.disconnect();
    if (!el) return;
    canvasObserver.current = new ResizeObserver(([entry]) => setCanvasWidth(entry.contentRect.width));
    canvasObserver.current.observe(el);
  }, []);
  const [dirty, setDirty] = useState(false);

  // Every edit goes through here so undo/redo keeps working.
  const setLayout = useCallback((updater: (prev: PrintLayout) => PrintLayout) => {
    setDoc((d) => {
      const next = updater(d.layout);
      return next === d.layout ? d : { layout: next, past: [...d.past.slice(-49), d.layout], future: [] };
    });
    setDirty(true);
  }, []);
  const replaceLayout = (next: PrintLayout) => setDoc({ layout: next, past: [], future: [] });

  const undo = useCallback(() => {
    setDoc((d) => (d.past.length ? { layout: d.past[d.past.length - 1], past: d.past.slice(0, -1), future: [d.layout, ...d.future] } : d));
  }, []);

  const redo = useCallback(() => {
    setDoc((d) => (d.future.length ? { layout: d.future[0], past: [...d.past, d.layout], future: d.future.slice(1) } : d));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const dt = await documentTemplatesApi.getDocTypes();
        if (cancelled) return;
        setDocTypes(dt.docTypes || []);
        if (templateId) {
          const { template } = await documentTemplatesApi.getTemplate(templateId);
          if (cancelled) return;
          setName(template.name);
          setDocType(template.docType);
          setIsDefault(template.isDefault);
          const saved = parseLayout(template.layout);
          if (saved) replaceLayout(saved);
          else toast.warning('This print format was written in HTML, so the builder starts from a fresh design. Saving replaces its HTML.');
        }
      } catch (err: any) {
        toast.error(err.message || 'Failed to load the print format');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Loads once for the template in the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    documentTemplatesApi
      .getMergeFields(docType)
      .then((res) => {
        setMergeFields(res.fields);
        setSample(res.sample);
      })
      .catch(() => {});
  }, [docType]);

  // Real record data for the canvas, when an ID is entered.
  const [recordData, setRecordData] = useState<Record<string, unknown> | null>(null);
  const loadRecord = async () => {
    if (!recordId.trim()) {
      setRecordData(null);
      return;
    }
    try {
      const { data } = await documentTemplatesApi.getRecordData(docType, recordId.trim());
      setRecordData(data);
    } catch (err: any) {
      toast.error(err.message || 'Could not load that record');
    }
  };
  const data = recordData || sample;

  const selected = layout.blocks.find((b) => b.id === selectedId) || null;

  const updateBlock = useCallback(
    (id: string, patch: Partial<Block>) => setLayout((prev) => ({ ...prev, blocks: prev.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) })),
    [setLayout]
  );
  const updateStyle = (id: string, patch: Partial<BlockStyle>) =>
    setLayout((prev) => ({ ...prev, blocks: prev.blocks.map((b) => (b.id === id ? { ...b, style: { ...b.style, ...patch } } : b)) }));
  const updatePage = (patch: Partial<PageSettings>) => setLayout((prev) => ({ ...prev, page: { ...prev.page, ...patch } }));

  const insertBlock = (type: BlockType, targetId: string | null, after: boolean) => {
    const block = createBlock(type, docType);
    setLayout((prev) => {
      const blocks = [...prev.blocks];
      const idx = targetId ? blocks.findIndex((b) => b.id === targetId) : -1;
      blocks.splice(idx < 0 ? blocks.length : idx + (after ? 1 : 0), 0, block);
      return { ...prev, blocks };
    });
    setSelectedId(block.id);
  };

  const moveBlock = (id: string, targetId: string | null, after: boolean) => {
    if (id === targetId) return;
    setLayout((prev) => {
      const moving = prev.blocks.find((b) => b.id === id);
      if (!moving) return prev;
      const blocks = prev.blocks.filter((b) => b.id !== id);
      const idx = targetId ? blocks.findIndex((b) => b.id === targetId) : -1;
      blocks.splice(idx < 0 ? blocks.length : idx + (after ? 1 : 0), 0, moving);
      return { ...prev, blocks };
    });
  };

  const nudge = (id: string, dir: -1 | 1) =>
    setLayout((prev) => {
      const i = prev.blocks.findIndex((b) => b.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.blocks.length) return prev;
      const blocks = [...prev.blocks];
      [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
      return { ...prev, blocks };
    });

  const duplicate = (id: string) => {
    const original = layout.blocks.find((b) => b.id === id);
    if (!original) return;
    const copy: Block = { ...JSON.parse(JSON.stringify(original)), id: Math.random().toString(36).slice(2, 10) };
    setLayout((prev) => {
      const i = prev.blocks.findIndex((b) => b.id === id);
      const blocks = [...prev.blocks];
      blocks.splice(i + 1, 0, copy);
      return { ...prev, blocks };
    });
    setSelectedId(copy.id);
  };

  const remove = useCallback(
    (id: string) => {
      setLayout((prev) => ({ ...prev, blocks: prev.blocks.filter((b) => b.id !== id) }));
      setSelectedId(null);
    },
    [setLayout]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && !typing) {
        e.preventDefault();
        remove(selectedId);
      } else if (e.key === 'Escape') {
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, undo, redo, remove]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const html = useMemo(() => layoutToHtml(layout, docType), [layout, docType]);

  const save = async () => {
    if (!name.trim()) return toast.error('Give the print format a name first');
    setSaving(true);
    try {
      const payload = { name: name.trim(), docType, purpose: 'print' as const, subject: '', htmlBody: html, layout: JSON.stringify(layout), isDefault };
      if (templateId) {
        await documentTemplatesApi.updateTemplate(templateId, payload);
      } else {
        const { template } = await documentTemplatesApi.createTemplate(payload);
        setTemplateId(template.id);
        router.replace(`/document-templates/builder?id=${template.id}`);
      }
      setDirty(false);
      toast.success('Print format saved.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const testPrint = () =>
    openPrintWindow(documentTemplatesApi.previewPage({ docType, htmlBody: html, recordId: recordId.trim() || undefined, autoPrint: true })).catch((err) =>
      toast.error(err.message || 'Could not open the print preview')
    );

  const changeDocType = (next: string) => {
    if (layout.blocks.length && !confirm('Switch document type? The design is replaced with that type’s starting design.')) return;
    setDocType(next);
    setRecordData(null);
    setLayout(() => defaultLayout(next));
    setSelectedId(null);
  };

  if (loading) return <div className="flex h-64 items-center justify-center"><LoadingSpinner size="md" /></div>;

  const [pw, ph] = (() => {
    const [w, h] = PAGE_SIZES_MM[layout.page.size];
    return layout.page.orientation === 'landscape' ? [h, w] : [w, h];
  })();

  const fitScale = canvasWidth ? Math.min(1, canvasWidth / (pw * MM_TO_PX)) : 1;
  const scale = zoom || fitScale;

  const palette = BLOCK_LIBRARY.filter((b) => !b.docTypes || b.docTypes.includes(docType));
  const docLabel = docTypes.find((d) => d.value === docType)?.label || docType;

  const onBlockDragOver = (e: React.DragEvent, block: Block) => {
    if (!e.dataTransfer.types.includes(NEW_BLOCK) && !e.dataTransfer.types.includes(MOVE_BLOCK)) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // Side-by-side blocks split left/right; full-width ones split top/bottom.
    const after = block.style.width < 100 ? e.clientX > rect.left + rect.width / 2 : e.clientY > rect.top + rect.height / 2;
    if (dropTarget?.id !== block.id || dropTarget.after !== after) setDropTarget({ id: block.id, after });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const target = dropTarget || { id: null, after: true };
    const newType = e.dataTransfer.getData(NEW_BLOCK) as BlockType;
    const moveId = e.dataTransfer.getData(MOVE_BLOCK);
    if (newType) insertBlock(newType, target.id, target.after);
    else if (moveId) moveBlock(moveId, target.id, target.after);
    setDropTarget(null);
  };

  return (
    <div className="-m-4 flex h-[calc(100vh-3.5rem)] flex-col bg-slate-100 sm:-m-6">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
        <button
          onClick={() => {
            if (dirty && !confirm('Leave without saving your changes?')) return;
            router.push('/document-templates');
          }}
          className="text-slate-400 hover:text-slate-600"
          aria-label="Back"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
          placeholder="Print format name"
          className="w-56 rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-[var(--primary)] focus:outline-none"
        />
        <select
          value={docType}
          onChange={(e) => changeDocType(e.target.value)}
          disabled={!!templateId}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400"
          title="Document type"
        >
          {docTypes.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => {
              setIsDefault(e.target.checked);
              setDirty(true);
            }}
            className="rounded border-slate-300"
          />
          Default for {docLabel}
        </label>
        <div className="mx-2 h-5 w-px bg-slate-200" />
        <button onClick={undo} disabled={!doc.past.length} className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30" title="Undo (Ctrl+Z)">
          <ArrowUturnLeftIcon className="h-4 w-4" />
        </button>
        <button onClick={redo} disabled={!doc.future.length} className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30" title="Redo (Ctrl+Shift+Z)">
          <ArrowUturnRightIcon className="h-4 w-4" />
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          <input
            value={recordId}
            onChange={(e) => setRecordId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadRecord()}
            placeholder={`${docLabel} ID`}
            className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:border-[var(--primary)] focus:outline-none"
            title="Show a real record's data on the canvas (the number in its page address)"
          />
          <Button variant="secondary" size="sm" onClick={loadRecord}>{recordId.trim() ? 'Use record' : 'Sample data'}</Button>
          <Button variant="secondary" size="sm" onClick={testPrint}><PrinterIcon className="h-4 w-4" /> Test print</Button>
          <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Palette */}
        <aside className="w-52 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">Drag onto the page</p>
          <div className="space-y-1.5">
            {palette.map((item) => (
              <div
                key={item.type}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(NEW_BLOCK, item.type);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onDragEnd={() => setDropTarget(null)}
                className="group flex cursor-grab items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 hover:border-[var(--primary)] active:cursor-grabbing"
                data-block-type={item.type}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-700">{item.label}</p>
                  <p className="truncate text-[10px] text-slate-400">{item.hint}</p>
                </div>
                <button
                  onClick={() => insertBlock(item.type, selectedId, true)}
                  className="mt-0.5 text-slate-300 hover:text-[var(--primary)]"
                  title="Add after the selected block"
                  aria-label={`Add ${item.label}`}
                >
                  <PlusIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              if (confirm('Replace the whole design with the starting design?')) {
                setLayout(() => defaultLayout(docType));
                setSelectedId(null);
              }
            }}
            className="mt-4 text-[11px] text-slate-400 hover:text-red-600"
          >
            Reset design
          </button>
        </aside>

        {/* Canvas */}
        <section ref={canvasRef} data-canvas className="min-w-0 flex-1 overflow-auto p-6" onClick={() => setSelectedId(null)}>
          <div
            className="relative mx-auto bg-white shadow-md"
            style={{ width: pw * MM_TO_PX, minHeight: ph * MM_TO_PX, padding: layout.page.marginMm * MM_TO_PX, zoom: scale }}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes(NEW_BLOCK) || e.dataTransfer.types.includes(MOVE_BLOCK)) {
                e.preventDefault();
                if (dropTarget?.id !== null) setDropTarget({ id: null, after: true });
              }
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null);
            }}
            onDrop={onDrop}
          >
            {layout.page.watermark.trim() && (
              <div
                className="pointer-events-none absolute inset-x-0 top-[40%] text-center font-bold uppercase"
                style={{ fontSize: 96, color: layout.page.accentColor, opacity: 0.08, transform: 'rotate(-30deg)' }}
              >
                {renderTemplate(layout.page.watermark, data)}
              </div>
            )}
            <div
              className="pf-canvas relative flex flex-wrap items-start"
              style={{
                fontFamily: layout.page.fontFamily,
                fontSize: layout.page.fontSize,
                color: layout.page.textColor,
                border: layout.page.borderAroundPage ? `1px solid ${layout.page.accentColor}` : undefined,
                padding: layout.page.borderAroundPage ? 16 : undefined,
              }}
            >
              {layout.blocks.length === 0 && (
                <div className="w-full rounded-lg border-2 border-dashed border-slate-200 py-16 text-center text-sm text-slate-400">
                  Drag blocks here from the left
                </div>
              )}
              {layout.blocks.map((block) => {
                const isSel = block.id === selectedId;
                const indicator = dropTarget?.id === block.id;
                const side = block.style.width < 100;
                return (
                  <div
                    key={block.id}
                    draggable
                    data-block-id={block.id}
                    onDragStart={(e) => {
                      e.stopPropagation();
                      e.dataTransfer.setData(MOVE_BLOCK, block.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={() => setDropTarget(null)}
                    onDragOver={(e) => onBlockDragOver(e, block)}
                    onDrop={onDrop}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId(block.id);
                    }}
                    className={cn(
                      'relative min-h-[14px] cursor-move outline-offset-[-1px]',
                      isSel ? 'outline outline-2 outline-[var(--primary)]' : 'hover:outline hover:outline-1 hover:outline-dashed hover:outline-slate-300'
                    )}
                    style={{ flex: `0 0 ${widthPercent(block.style.width)}%`, maxWidth: `${widthPercent(block.style.width)}%` }}
                  >
                    {indicator && (
                      <div
                        className="pointer-events-none absolute z-10 bg-[var(--primary)]"
                        style={
                          side
                            ? { top: 0, bottom: 0, width: 3, [dropTarget!.after ? 'right' : 'left']: -2 }
                            : { left: 0, right: 0, height: 3, [dropTarget!.after ? 'bottom' : 'top']: -2 }
                        }
                      />
                    )}
                    {block.type === 'pageBreak' ? (
                      <div className="my-2 border-t-2 border-dashed border-slate-300 text-center text-[10px] uppercase tracking-wide text-slate-400">Page break</div>
                    ) : block.type === 'spacer' ? (
                      <div style={{ height: block.height || 24 }} className={isSel ? 'bg-sky-50' : ''} />
                    ) : (
                      <BlockPreview html={renderTemplate(blockPreviewHtml(block, layout.page, docType), data, { escapeHtml: true })} label={BLOCK_LIBRARY.find((b) => b.type === block.type)?.label || ''} />
                    )}
                    {isSel && (
                      <div className="absolute -top-7 right-0 z-20 flex items-center gap-0.5 rounded-lg bg-[var(--primary)] px-1 py-0.5 text-white shadow" onClick={(e) => e.stopPropagation()}>
                        <span className="px-1 text-[10px] font-medium">{BLOCK_LIBRARY.find((b) => b.type === block.type)?.label}</span>
                        <button onClick={() => nudge(block.id, -1)} className="rounded p-0.5 hover:bg-white/20" title="Move up"><ArrowUpIcon className="h-3.5 w-3.5" /></button>
                        <button onClick={() => nudge(block.id, 1)} className="rounded p-0.5 hover:bg-white/20" title="Move down"><ArrowDownIcon className="h-3.5 w-3.5" /></button>
                        <button onClick={() => duplicate(block.id)} className="rounded p-0.5 hover:bg-white/20" title="Duplicate"><DocumentDuplicateIcon className="h-3.5 w-3.5" /></button>
                        <button onClick={() => remove(block.id)} className="rounded p-0.5 hover:bg-white/20" title="Delete"><TrashIcon className="h-3.5 w-3.5" /></button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-3 flex items-center justify-center gap-2 text-[11px] text-slate-400">
            <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="rounded border border-slate-200 bg-white px-1 py-0.5" title="Zoom">
              <option value={0}>Fit width</option>
              <option value={0.5}>50%</option>
              <option value={0.75}>75%</option>
              <option value={1}>100%</option>
              <option value={1.25}>125%</option>
            </select>
            <span>
            {recordData ? `Showing ${docLabel} #${recordId}` : 'Showing sample data'} · Click a block to edit it, drag to move it, Delete to remove it
            </span>
          </div>
        </section>

        {/* Properties */}
        <aside className="w-80 shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-4" onClick={(e) => e.stopPropagation()}>
          {selected ? (
            <BlockProperties
              key={selected.id}
              block={selected}
              docType={docType}
              mergeFields={mergeFields}
              onChange={(patch) => updateBlock(selected.id, patch)}
              onStyle={(patch) => updateStyle(selected.id, patch)}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <PageProperties page={layout.page} onChange={updatePage} />
          )}
        </aside>
      </div>
    </div>
  );
}

/** A block on the canvas; shows a faint placeholder when it renders nothing for the current data (e.g. no logo set). */
function BlockPreview({ html, label }: { html: string; label: string }) {
  const empty = !/<(img|hr|table)\b/i.test(html) && !html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '').trim();
  if (empty) return <div className="rounded border border-dashed border-slate-200 px-2 py-3 text-center text-[11px] text-slate-300">{label} (empty for this record)</div>;
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

// ─── Property panels ────────────────────────────────────────────────────────

const inputCls = 'w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:border-[var(--primary)] focus:outline-none';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-600">
      <span className="w-24 shrink-0">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </label>
  );
}

function ColorInput({ value, onChange, allowEmpty = true }: { value: string; onChange: (v: string) => void; allowEmpty?: boolean }) {
  const isAccent = value === '{{accent}}';
  return (
    <div className="flex items-center gap-1.5">
      <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-slate-200" />
      <input value={isAccent ? 'Accent colour' : value} onChange={(e) => onChange(e.target.value)} placeholder="Default" className={inputCls} readOnly={isAccent} />
      {(allowEmpty || isAccent) && value && (
        <button type="button" onClick={() => onChange('')} className="text-slate-300 hover:text-slate-500" title="Clear"><XMarkIcon className="h-4 w-4" /></button>
      )}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-600">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="rounded border-slate-300" />
      {label}
    </label>
  );
}

function PageProperties({ page, onChange }: { page: PageSettings; onChange: (p: Partial<PageSettings>) => void }) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Cog6ToothIcon className="h-4 w-4 text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-800">Page settings</h3>
      </div>
      <p className="mb-4 text-[11px] text-slate-400">Select a block on the page to edit it.</p>
      <Section title="Paper">
        <Row label="Size">
          <select value={page.size} onChange={(e) => onChange({ size: e.target.value as PageSettings['size'] })} className={inputCls}>
            {Object.keys(PAGE_SIZES_MM).map((s) => <option key={s}>{s}</option>)}
          </select>
        </Row>
        <Row label="Orientation">
          <select value={page.orientation} onChange={(e) => onChange({ orientation: e.target.value as PageSettings['orientation'] })} className={inputCls}>
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </Row>
        <Row label="Margins (mm)">
          <input type="number" min={0} max={40} value={page.marginMm} onChange={(e) => onChange({ marginMm: Number(e.target.value) || 0 })} className={inputCls} />
        </Row>
        <Toggle label="Border around the page" checked={page.borderAroundPage} onChange={(v) => onChange({ borderAroundPage: v })} />
      </Section>
      <Section title="Text">
        <Row label="Font">
          <select value={page.fontFamily} onChange={(e) => onChange({ fontFamily: e.target.value })} className={inputCls}>
            {FONT_FAMILIES.map((f) => <option key={f.label} value={f.value}>{f.label}</option>)}
          </select>
        </Row>
        <Row label="Font size">
          <input type="number" min={8} max={20} value={page.fontSize} onChange={(e) => onChange({ fontSize: Number(e.target.value) || 13 })} className={inputCls} />
        </Row>
        <Row label="Text colour"><ColorInput value={page.textColor} onChange={(v) => onChange({ textColor: v || '#1e293b' })} allowEmpty={false} /></Row>
        <Row label="Accent colour"><ColorInput value={page.accentColor} onChange={(v) => onChange({ accentColor: v || '#168eea' })} allowEmpty={false} /></Row>
      </Section>
      <Section title="Watermark">
        <input value={page.watermark} onChange={(e) => onChange({ watermark: e.target.value })} placeholder="e.g. DRAFT or {{status}}" className={inputCls} />
      </Section>
    </div>
  );
}

function FieldSelect({ value, fields, onChange }: { value: string; fields: MergeField[]; onChange: (key: string, label: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value, fields.find((f) => f.key === e.target.value)?.label || e.target.value)}
      className={inputCls}
    >
      {!fields.some((f) => f.key === value) && <option value={value}>{value}</option>}
      {fields.map((f) => (
        <option key={f.key} value={f.key}>{f.group ? `${f.group}: ` : ''}{f.label}</option>
      ))}
    </select>
  );
}

function FieldRows({ rows, fields, onChange }: { rows: { key: string; label: string }[]; fields: MergeField[]; onChange: (rows: { key: string; label: string }[]) => void }) {
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="rounded-lg border border-slate-200 p-2">
          <div className="flex items-center gap-1">
            <input value={r.label} onChange={(e) => onChange(rows.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} placeholder="Label" className={inputCls} />
            <button onClick={() => move(i, -1)} className="text-slate-300 hover:text-slate-600" title="Up"><ArrowUpIcon className="h-3.5 w-3.5" /></button>
            <button onClick={() => move(i, 1)} className="text-slate-300 hover:text-slate-600" title="Down"><ArrowDownIcon className="h-3.5 w-3.5" /></button>
            <button onClick={() => onChange(rows.filter((_, k) => k !== i))} className="text-slate-300 hover:text-red-600" title="Remove"><TrashIcon className="h-3.5 w-3.5" /></button>
          </div>
          <div className="mt-1.5">
            <FieldSelect value={r.key} fields={fields} onChange={(key, label) => onChange(rows.map((x, k) => (k === i ? { key, label: x.label || label } : x)))} />
          </div>
        </div>
      ))}
      <button
        onClick={() => {
          const f = fields[0];
          if (f) onChange([...rows, { key: f.key, label: f.label }]);
        }}
        className="inline-flex items-center gap-1 text-xs font-medium text-[var(--primary)] hover:underline"
      >
        <PlusIcon className="h-3.5 w-3.5" /> Add field
      </button>
    </div>
  );
}

const SHOW_LABELS: Record<string, Record<string, string>> = {
  company: { title: 'Title', name: 'Company name', address: 'Address', phone: 'Phone', email: 'Email', website: 'Website' },
  customer: { title: 'Title', name: 'Customer name', address: 'Address', email: 'Email', phone: 'Phone' },
  totals: { subtotal: 'Subtotal', discount: 'Discount', shipping: 'Shipping', taxes: 'Each tax', taxTotal: 'Total tax', grandTotal: 'Grand total', words: 'Amount in words', paid: 'Amount paid', due: 'Amount due' },
  terms: { payment: 'Payment terms', terms: 'Terms & conditions' },
  docMeta: { status: 'Status badge' },
};

function BlockProperties({
  block,
  docType,
  mergeFields,
  onChange,
  onStyle,
  onClose,
}: {
  block: Block;
  docType: string;
  mergeFields: MergeField[];
  onChange: (patch: Partial<Block>) => void;
  onStyle: (patch: Partial<BlockStyle>) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const s = block.style;
  const label = BLOCK_LIBRARY.find((b) => b.type === block.type)?.label || block.type;
  const textRef = useRef<HTMLTextAreaElement>(null);

  const insertField = (key: string) => {
    const el = textRef.current;
    const text = block.text || '';
    const pos = el?.selectionStart ?? text.length;
    onChange({ text: `${text.slice(0, pos)}{{${key}}}${text.slice(pos)}` });
  };

  const onUpload = (file?: File) => {
    if (!file) return;
    if (file.size > 600 * 1024) return toast.error('Please use an image under 600 KB so the print format stays fast.');
    const reader = new FileReader();
    reader.onload = () => onChange({ src: String(reader.result) });
    reader.readAsDataURL(file);
  };

  const showKeys = SHOW_LABELS[block.type];
  const visibleShowKeys = showKeys
    ? Object.entries(showKeys).filter(([k]) => !(block.type === 'totals' && (k === 'paid' || k === 'due') && docType !== 'invoice'))
    : [];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">{label}</h3>
        <button onClick={onClose} className="text-xs text-[var(--primary)] hover:underline">Page settings</button>
      </div>

      <Section title="Content">
        {(block.type === 'heading' || block.type === 'text' || block.type === 'html' || block.type === 'signature') && (
          <>
            <textarea
              ref={textRef}
              value={block.text || ''}
              onChange={(e) => onChange({ text: e.target.value })}
              rows={block.type === 'html' ? 8 : 3}
              className={cn(inputCls, block.type === 'html' && 'font-mono')}
            />
            <select value="" onChange={(e) => e.target.value && insertField(e.target.value)} className={inputCls}>
              <option value="">Insert field…</option>
              {mergeFields.map((f) => <option key={f.key} value={f.key}>{f.group ? `${f.group}: ` : ''}{f.label}</option>)}
            </select>
          </>
        )}
        {block.type === 'heading' && (
          <Row label="Level">
            <select value={block.level || 1} onChange={(e) => onChange({ level: Number(e.target.value) as 1 | 2 | 3 })} className={inputCls}>
              <option value={1}>Title</option>
              <option value={2}>Heading</option>
              <option value={3}>Sub-heading</option>
            </select>
          </Row>
        )}
        {block.type === 'signature' && (
          <Row label="Second line"><input value={block.label || ''} onChange={(e) => onChange({ label: e.target.value })} className={inputCls} /></Row>
        )}
        {block.type === 'field' && (
          <>
            <Row label="Label"><input value={block.label || ''} onChange={(e) => onChange({ label: e.target.value })} className={inputCls} /></Row>
            <Row label="Field"><FieldSelect value={block.fieldKey || ''} fields={mergeFields} onChange={(key, l) => onChange({ fieldKey: key, label: block.label || l })} /></Row>
          </>
        )}
        {(block.type === 'company' || block.type === 'customer' || block.type === 'details') && (
          <Row label="Title"><input value={block.label || ''} onChange={(e) => onChange({ label: e.target.value })} className={inputCls} /></Row>
        )}
        {block.type === 'image' && (
          <>
            <Row label="Image URL"><input value={block.src || ''} onChange={(e) => onChange({ src: e.target.value })} placeholder="https://…" className={inputCls} /></Row>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>Upload image</Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => onChange({ src: '{{company_logo}}' })}>Company logo</Button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onUpload(e.target.files?.[0])} />
            </div>
            {block.src === '{{company_logo}}' && <p className="text-[11px] text-slate-400">Uses the logo URL saved in company settings, and hides itself when there is none.</p>}
            <Row label="Height (px)"><input type="number" min={10} max={400} value={block.imageHeight || 60} onChange={(e) => onChange({ imageHeight: Number(e.target.value) || 60 })} className={inputCls} /></Row>
          </>
        )}
        {(block.type === 'docMeta' || block.type === 'details') && (
          <FieldRows rows={block.fields || []} fields={mergeFields} onChange={(fields) => onChange({ fields })} />
        )}
        {block.type === 'items' && (
          <ItemColumnsEditor block={block} onChange={onChange} />
        )}
        {visibleShowKeys.map(([k, l]) => (
          <Toggle key={k} label={l} checked={!!block.show?.[k]} onChange={(v) => onChange({ show: { ...block.show, [k]: v } })} />
        ))}
        {block.type === 'divider' && (
          <>
            <Row label="Line style">
              <select value={block.dividerStyle || 'solid'} onChange={(e) => onChange({ dividerStyle: e.target.value as Block['dividerStyle'] })} className={inputCls}>
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
              </select>
            </Row>
            <Row label="Thickness"><input type="number" min={1} max={10} value={block.height || 1} onChange={(e) => onChange({ height: Number(e.target.value) || 1 })} className={inputCls} /></Row>
          </>
        )}
        {block.type === 'spacer' && (
          <Row label="Height (px)"><input type="number" min={4} max={400} value={block.height || 24} onChange={(e) => onChange({ height: Number(e.target.value) || 24 })} className={inputCls} /></Row>
        )}
        {block.type === 'pageBreak' && <p className="text-[11px] text-slate-400">Everything after this starts on a new printed page.</p>}
      </Section>

      {block.type !== 'pageBreak' && (
        <>
          <Section title="Layout">
            <Row label="Width">
              <div className="flex flex-wrap gap-1">
                {([100, 75, 66, 50, 33, 25] as BlockStyle['width'][]).map((w) => (
                  <button
                    key={w}
                    onClick={() => onStyle({ width: w })}
                    className={cn('rounded border px-1.5 py-0.5 text-[11px]', s.width === w ? 'border-[var(--primary)] bg-sky-50 text-[var(--primary)]' : 'border-slate-200 text-slate-500')}
                  >
                    {w === 66 ? '2/3' : w === 33 ? '1/3' : `${w}%`}
                  </button>
                ))}
              </div>
            </Row>
            <Row label="Align">
              <div className="flex gap-1">
                {(['left', 'center', 'right'] as const).map((a) => (
                  <button key={a} onClick={() => onStyle({ align: a })} className={cn('rounded border px-2 py-0.5 text-[11px] capitalize', s.align === a ? 'border-[var(--primary)] bg-sky-50 text-[var(--primary)]' : 'border-slate-200 text-slate-500')}>
                    {a}
                  </button>
                ))}
              </div>
            </Row>
            <Row label="Space above"><input type="number" min={0} max={200} value={s.marginTop} onChange={(e) => onStyle({ marginTop: Number(e.target.value) || 0 })} className={inputCls} /></Row>
            <Row label="Padding Y / X">
              <div className="flex gap-1">
                <input type="number" min={0} max={80} value={s.paddingY} onChange={(e) => onStyle({ paddingY: Number(e.target.value) || 0 })} className={inputCls} />
                <input type="number" min={0} max={80} value={s.paddingX} onChange={(e) => onStyle({ paddingX: Number(e.target.value) || 0 })} className={inputCls} />
              </div>
            </Row>
          </Section>
          <Section title="Style">
            <Row label="Font size"><input type="number" min={0} max={72} value={s.fontSize || ''} onChange={(e) => onStyle({ fontSize: Number(e.target.value) || 0 })} placeholder="Page default" className={inputCls} /></Row>
            <Row label="Text colour"><ColorInput value={s.color} onChange={(v) => onStyle({ color: v })} /></Row>
            <Row label="Background"><ColorInput value={s.background} onChange={(v) => onStyle({ background: v })} /></Row>
            <div className="flex flex-wrap gap-3">
              <Toggle label="Bold" checked={s.bold} onChange={(v) => onStyle({ bold: v })} />
              <Toggle label="Italic" checked={s.italic} onChange={(v) => onStyle({ italic: v })} />
              <Toggle label="Uppercase" checked={s.uppercase} onChange={(v) => onStyle({ uppercase: v })} />
            </div>
            <Row label="Border (px)"><input type="number" min={0} max={10} value={s.borderWidth} onChange={(e) => onStyle({ borderWidth: Number(e.target.value) || 0 })} className={inputCls} /></Row>
            {s.borderWidth > 0 && <Row label="Border colour"><ColorInput value={s.borderColor} onChange={(v) => onStyle({ borderColor: v || '#e2e8f0' })} /></Row>}
            <Row label="Rounded (px)"><input type="number" min={0} max={40} value={s.borderRadius} onChange={(e) => onStyle({ borderRadius: Number(e.target.value) || 0 })} className={inputCls} /></Row>
          </Section>
        </>
      )}
    </div>
  );
}

function ItemColumnsEditor({ block, onChange }: { block: Block; onChange: (patch: Partial<Block>) => void }) {
  const cols = block.columns || [];
  const set = (i: number, patch: Partial<NonNullable<Block['columns']>[number]>) => onChange({ columns: cols.map((c, k) => (k === i ? { ...c, ...patch } : c)) });
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= cols.length) return;
    const next = [...cols];
    [next[i], next[j]] = [next[j], next[i]];
    onChange({ columns: next });
  };
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-400">One row prints per line item. Tick the columns to show; reorder with the arrows.</p>
      {cols.map((c, i) => (
        <div key={c.key} className="rounded-lg border border-slate-200 p-2">
          <div className="flex items-center gap-1.5">
            <input type="checkbox" checked={c.visible} onChange={(e) => set(i, { visible: e.target.checked })} className="rounded border-slate-300" title="Show column" />
            <input value={c.label} onChange={(e) => set(i, { label: e.target.value })} className={inputCls} />
            <button onClick={() => move(i, -1)} className="text-slate-300 hover:text-slate-600" title="Move left"><ArrowUpIcon className="h-3.5 w-3.5" /></button>
            <button onClick={() => move(i, 1)} className="text-slate-300 hover:text-slate-600" title="Move right"><ArrowDownIcon className="h-3.5 w-3.5" /></button>
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="font-mono">{`{{${c.key}}}`}</span>
            <select value={c.align} onChange={(e) => set(i, { align: e.target.value as 'left' | 'center' | 'right' })} className="ml-auto rounded border border-slate-200 px-1 py-0.5">
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
            <input type="number" min={0} max={80} value={c.width} onChange={(e) => set(i, { width: Number(e.target.value) || 0 })} className="w-12 rounded border border-slate-200 px-1 py-0.5" title="Width % (0 = auto)" />%
          </div>
        </div>
      ))}
      <Row label="Header colour"><ColorInput value={block.headerBackground || ''} onChange={(v) => onChange({ headerBackground: v || '{{accent}}' })} /></Row>
      <Row label="Header text"><ColorInput value={block.headerColor || '#ffffff'} onChange={(v) => onChange({ headerColor: v || '#ffffff' })} allowEmpty={false} /></Row>
      <Toggle label="Striped rows" checked={!!block.striped} onChange={(v) => onChange({ striped: v })} />
      <Toggle label="Grid lines" checked={!!block.gridLines} onChange={(v) => onChange({ gridLines: v })} />
    </div>
  );
}
