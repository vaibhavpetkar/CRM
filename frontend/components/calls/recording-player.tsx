'use client';

import { useEffect, useState } from 'react';
import { callsApi } from '@/lib/api';

/** Plays a call recording. The file needs the login token, so it's loaded as a blob. */
export default function RecordingPlayer({ callId, autoLoad = true }: { callId: number; autoLoad?: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(autoLoad);

  useEffect(() => {
    if (!requested) return;
    let url: string | null = null;
    let cancelled = false;
    callsApi
      .getRecordingUrl(callId)
      .then((u) => {
        url = u;
        if (cancelled) URL.revokeObjectURL(u);
        else setSrc(u);
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [callId, requested]);

  if (!requested) {
    return (
      <button type="button" onClick={() => setRequested(true)} className="text-xs font-medium text-[var(--primary)] hover:underline">
        ▶ Play recording
      </button>
    );
  }
  if (error) return <p className="text-xs text-red-500">{error}</p>;
  if (!src) return <p className="text-xs text-slate-400">Loading recording...</p>;
  return (
    <div className="flex items-center gap-2">
      <audio controls src={src} className="h-8 w-full max-w-xs" />
      <a href={src} download={`call-${callId}`} className="shrink-0 text-xs font-medium text-[var(--primary)] hover:underline">
        Download
      </a>
    </div>
  );
}
