'use client';

import { useEffect, useRef, useState } from 'react';
import { PrinterIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { StarIcon } from '@heroicons/react/24/solid';
import { documentTemplatesApi, openPrintWindow, DocumentTemplate, PrintDocType } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

/**
 * Prints a record with its print format (Document Templates > Print Format).
 * Clicking prints with the default format; the arrow lists every print
 * format for this document type so a different one can be picked.
 */
export default function PrintButton({
  docType,
  id,
  variant = 'button',
  className,
}: {
  docType: PrintDocType;
  id: string | number;
  variant?: 'button' | 'icon';
  className?: string;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [formats, setFormats] = useState<DocumentTemplate[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const toggleMenu = async () => {
    const next = !open;
    setOpen(next);
    if (next && formats === null) {
      try {
        const res = await documentTemplatesApi.getTemplates(docType, 'print');
        setFormats(res.templates || []);
      } catch {
        setFormats([]);
      }
    }
  };

  const print = (templateId?: number) => {
    setOpen(false);
    openPrintWindow(documentTemplatesApi.getPrintHtml(docType, id, templateId)).catch((err) =>
      toast.error(err.message || 'Could not open the print view')
    );
  };

  const hasDefault = formats?.some((f) => f.isDefault);

  return (
    <div ref={ref} className={cn('relative inline-flex', className)}>
      {variant === 'icon' ? (
        <>
          <button type="button" onClick={() => print()} className="text-slate-400 hover:text-[#168eea]" aria-label="Print" title="Print">
            <PrinterIcon className="h-4 w-4" />
          </button>
          <button type="button" onClick={toggleMenu} className="-ml-0.5 text-slate-300 hover:text-[#168eea]" aria-label="Choose print format" title="Choose print format">
            <ChevronDownIcon className="h-3 w-3" />
          </button>
        </>
      ) : (
        <div className="inline-flex overflow-hidden rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700">
          <button type="button" onClick={() => print()} className="inline-flex items-center gap-1.5 px-3 py-1.5 hover:bg-slate-50">
            <PrinterIcon className="h-4 w-4" /> Print
          </button>
          <button type="button" onClick={toggleMenu} className="border-l border-slate-200 px-1.5 hover:bg-slate-50" aria-label="Choose print format">
            <ChevronDownIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-60 rounded-md border border-slate-200 bg-white py-1 text-left text-sm shadow-lg">
          <p className="px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">Print format</p>
          {formats === null ? (
            <p className="px-3 py-2 text-xs text-slate-400">Loading…</p>
          ) : (
            <>
              <button type="button" onClick={() => print()} className="block w-full px-3 py-1.5 text-left hover:bg-slate-50">
                {hasDefault ? 'Default format' : 'Standard layout'}
              </button>
              {formats.map((f) => (
                <button key={f.id} type="button" onClick={() => print(f.id)} className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left hover:bg-slate-50">
                  <span className="truncate">{f.name}</span>
                  {f.isDefault && <StarIcon className="h-3 w-3 shrink-0 text-amber-400" />}
                </button>
              ))}
              {formats.length === 0 && <p className="px-3 py-1.5 text-xs text-slate-400">No custom formats yet. Add one under Document Templates.</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
