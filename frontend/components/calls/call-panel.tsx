'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon, PhoneIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { callsApi, type CallConfig, type CallRow } from '@/lib/api';
import Button from '@/components/ui/button';
import RecordingPlayer from './recording-player';
import { CALL_STATUS_CLASS, CALL_STATUS_LABEL, formatDuration } from './call-format';
import type { CallTarget } from './call-context';

interface Props {
  target: CallTarget;
  call: CallRow | null;
  config: CallConfig | null;
  placing: boolean;
  error: string | null;
  needsMyNumber: boolean;
  onSaveMyNumber: (phone: string) => Promise<void>;
  onNotesChange: (notes: string) => void;
  onNotesSaved: () => void;
  onRetry: () => void;
  onClose: () => void;
}

const NOTES_SAVE_DELAY_MS = 800;

/**
 * The floating calling panel. It stays open while the user moves around the
 * CRM, shows the call's progress and a timer, saves notes as they're typed,
 * and plays the recording once the call ends.
 */
export default function CallPanel({ target, call, config, placing, error, needsMyNumber, onSaveMyNumber, onNotesChange, onNotesSaved, onRetry, onClose }: Props) {
  const [minimized, setMinimized] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [myNumber, setMyNumber] = useState('');
  const [myNumberError, setMyNumberError] = useState<string | null>(null);
  const [savingMyNumber, setSavingMyNumber] = useState(false);
  // The provider remounts this panel for each new call (key = call id), so
  // this starts from that call's saved notes.
  const savedNotes = useRef<string>(call?.notes || '');
  const callId = call?.id;

  // Tick the timer once a second while the call is going.
  const active = !!call?.isActive;
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  // Autosave notes shortly after the user stops typing.
  const notes = call?.notes ?? '';
  useEffect(() => {
    if (!callId || notes === savedNotes.current) return;
    const t = setTimeout(async () => {
      setSaveState('saving');
      try {
        await callsApi.saveNotes(callId, notes);
        savedNotes.current = notes;
        setSaveState('saved');
        onNotesSaved();
      } catch {
        setSaveState('error');
      }
    }, NOTES_SAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [callId, notes, onNotesSaved]);

  const handleClose = async () => {
    if (callId && notes !== savedNotes.current) {
      try {
        await callsApi.saveNotes(callId, notes);
        onNotesSaved();
      } catch {
        setSaveState('error');
        return;
      }
    }
    onClose();
  };

  const submitMyNumber = async () => {
    setSavingMyNumber(true);
    setMyNumberError(null);
    try {
      await onSaveMyNumber(myNumber);
    } catch (err) {
      setMyNumberError(err instanceof Error ? err.message : 'Could not save your number.');
    } finally {
      setSavingMyNumber(false);
    }
  };

  const status = call?.status;
  const talkSeconds =
    call && !call.isActive
      ? call.durationSeconds
      : status === 'in-progress' && call?.startedAt
        ? (now - new Date(call.startedAt).getTime()) / 1000
        : null;

  let headline = 'Starting the call...';
  if (error) headline = 'Call not placed';
  else if (needsMyNumber) headline = 'Add your phone number';
  else if (status === 'queued' || status === 'ringing')
    headline = `Ringing your phone${config?.agentNumber ? ` (${config.agentNumber})` : ''}. Pick up to connect.`;
  else if (status === 'in-progress') headline = 'Connected. You are talking now.';
  else if (status) headline = status === 'completed' ? 'Call ended' : CALL_STATUS_LABEL[status];

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[calc(100vw-2rem)] max-w-sm rounded-xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${active ? 'animate-pulse bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
          <PhoneIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{target.name || 'Call'}</p>
          <p className="truncate text-xs text-slate-500">{call?.customerNumber || target.number}</p>
        </div>
        {status && (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${CALL_STATUS_CLASS[status]}`}>{CALL_STATUS_LABEL[status]}</span>
        )}
        {talkSeconds != null && <span className="font-mono text-xs text-slate-600">{formatDuration(talkSeconds)}</span>}
        <button type="button" onClick={() => setMinimized(!minimized)} className="text-slate-400 hover:text-slate-600" aria-label={minimized ? 'Expand' : 'Minimize'}>
          {minimized ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={handleClose}
          disabled={active || placing}
          title={active ? 'Hang up on your phone to end the call' : 'Close'}
          className="text-slate-400 hover:text-slate-600 disabled:opacity-30"
          aria-label="Close"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>

      {!minimized && (
        <div className="space-y-3 px-4 py-3">
          <p className="text-xs text-slate-600">{headline}</p>
          {call?.callerId && <p className="text-[11px] text-slate-400">Customer sees {call.callerId}</p>}

          {error && (
            <div className="space-y-2">
              <p className="rounded-md bg-red-50 p-2 text-xs text-red-600">{error}</p>
              {config?.enabled !== false && (
                <Button type="button" size="sm" variant="secondary" onClick={onRetry} disabled={placing}>
                  Try again
                </Button>
              )}
            </div>
          )}

          {call?.error && !error && <p className="rounded-md bg-red-50 p-2 text-xs text-red-600">{call.error}</p>}

          {needsMyNumber && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">
                The call rings your phone first, then connects you to the customer. Enter the mobile number you will take calls on. You only do this once.
              </p>
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={myNumber}
                  onChange={(e) => setMyNumber(e.target.value)}
                  placeholder="98765 43210"
                  className="w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
                />
                <Button type="button" size="sm" onClick={submitMyNumber} disabled={savingMyNumber || !myNumber.trim()}>
                  {savingMyNumber ? 'Saving...' : 'Save & call'}
                </Button>
              </div>
              {myNumberError && <p className="text-xs text-red-500">{myNumberError}</p>}
            </div>
          )}

          {call && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-medium text-slate-700">Call notes</label>
                <span className="text-[11px] text-slate-400">
                  {saveState === 'saving' ? 'Saving...' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Not saved, retrying when you type' : ''}
                </span>
              </div>
              <textarea
                value={notes}
                onChange={(e) => onNotesChange(e.target.value)}
                rows={5}
                placeholder="What did they say? Next steps, requirements, follow-up date..."
                className="w-full rounded-md border border-slate-200 p-2 text-sm focus:border-[#168eea] focus:outline-none"
              />
            </div>
          )}

          {call && !call.isActive && call.status === 'completed' && (
            <div>
              <p className="mb-1 text-xs font-medium text-slate-700">Recording</p>
              {call.hasRecording ? (
                <RecordingPlayer callId={call.id} />
              ) : (
                <p className="text-xs text-slate-400">Saving the recording. It usually appears within a minute.</p>
              )}
            </div>
          )}

          {call && !call.isActive && (
            <div className="flex justify-end">
              <Button type="button" size="sm" onClick={handleClose}>
                Done
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
