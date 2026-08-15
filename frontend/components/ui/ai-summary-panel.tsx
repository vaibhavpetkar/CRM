'use client';

import { useState } from 'react';
import { SparklesIcon } from '@heroicons/react/24/outline';
import Button from './button';

type AISummaryPanelProps = {
  onGenerate: () => Promise<{ summary: string; nextAction: string | null }>;
};

/**
 * Phase 20 — AI Assistant. Every render of this panel starts empty; nothing
 * is shown until the user clicks Generate and a real Anthropic API call
 * completes. If AI isn't configured on the server, the real error message
 * (e.g. "set ANTHROPIC_API_KEY") is shown as-is — never a fake result.
 */
export default function AISummaryPanel({ onGenerate }: AISummaryPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ summary: string; nextAction: string | null } | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await onGenerate();
      setResult(res);
    } catch (err: any) {
      setError(err.message || 'Failed to generate AI summary.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
          <SparklesIcon className="h-4 w-4 text-[#168eea]" />
          AI Assistant
        </div>
        <Button type="button" variant="secondary" size="sm" disabled={loading} onClick={handleGenerate}>
          {loading ? 'Thinking...' : result ? 'Regenerate' : 'Generate Summary'}
        </Button>
      </div>

      {error && <p className="mt-2 text-xs text-amber-700">{error}</p>}

      {result && !error && (
        <div className="mt-2 space-y-1.5">
          <p className="text-xs text-slate-600">{result.summary}</p>
          {result.nextAction && (
            <p className="text-xs">
              <span className="font-medium text-slate-700">Next action: </span>
              <span className="text-slate-600">{result.nextAction}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
