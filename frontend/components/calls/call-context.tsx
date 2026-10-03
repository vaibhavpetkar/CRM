'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { callsApi, type CallConfig, type CallRow } from '@/lib/api';
import CallPanel from './call-panel';

export interface CallTarget {
  number: string;
  name?: string;
  leadId?: number;
  contactId?: number;
}

interface CallContextValue {
  /** Opens the calling panel and places the call. */
  startCall: (target: CallTarget) => void;
  /** True while a call is being placed or is still going. */
  busy: boolean;
  /** Bumps when a call finishes, so call history lists can reload. */
  finishedCount: number;
}

const CallContext = createContext<CallContextValue | null>(null);

export function useCalls() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCalls must be used inside <CallProvider>');
  return ctx;
}

// While a call is going, ask for its status this often. After it ends we keep
// asking (less often) until the recording has been saved.
const POLL_ACTIVE_MS = 2500;
const POLL_RECORDING_MS = 5000;
const RECORDING_WAIT_MS = 3 * 60 * 1000;

export function CallProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<CallTarget | null>(null);
  const [call, setCall] = useState<CallRow | null>(null);
  const [config, setConfig] = useState<CallConfig | null>(null);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsMyNumber, setNeedsMyNumber] = useState(false);
  const [finishedCount, setFinishedCount] = useState(0);
  const endedAt = useRef<number | null>(null);

  const place = useCallback(async (t: CallTarget) => {
    setPlacing(true);
    setError(null);
    setNeedsMyNumber(false);
    setCall(null);
    endedAt.current = null;
    try {
      const cfg = await callsApi.getConfig();
      setConfig(cfg);
      if (!cfg.enabled) {
        setError(
          cfg.missingEnvVars.length
            ? `Calling is not set up yet. Add these server settings: ${cfg.missingEnvVars.join(', ')}.`
            : 'Calling is not set up yet. Ask your administrator to connect the calling provider.'
        );
        return;
      }
      if (!cfg.agentNumber) {
        setNeedsMyNumber(true);
        return;
      }
      setCall(await callsApi.start({ number: t.number, leadId: t.leadId, contactId: t.contactId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The call could not be placed.');
    } finally {
      setPlacing(false);
    }
  }, []);

  const startCall = useCallback(
    (t: CallTarget) => {
      if (placing || call?.isActive) return;
      setTarget(t);
      place(t);
    },
    [placing, call?.isActive, place]
  );

  const saveMyNumber = useCallback(
    async (phone: string) => {
      const cfg = await callsApi.setMyNumber(phone);
      setConfig(cfg);
      if (target) await place(target);
    },
    [target, place]
  );

  // Poll the call while it is going, then until its recording is saved.
  // Typing notes changes `call` too, so the timer keys off `tick` instead.
  const [tick, setTick] = useState(0);
  const callRef = useRef<CallRow | null>(null);
  useEffect(() => {
    callRef.current = call;
  }, [call]);
  const callId = call?.id;
  const active = !!call?.isActive;
  const waitingForRecording = !!call && !call.isActive && call.status === 'completed' && !call.hasRecording;
  useEffect(() => {
    if (!callId) return;
    if (!active && !(waitingForRecording && (endedAt.current === null || Date.now() - endedAt.current < RECORDING_WAIT_MS))) return;
    const timer = setTimeout(async () => {
      try {
        const next = await callsApi.get(callId);
        const prev = callRef.current;
        if (!prev || prev.id !== next.id) return;
        if (prev.isActive && !next.isActive) {
          endedAt.current = Date.now();
          setFinishedCount((n) => n + 1);
        }
        // Keep whatever the user typed meanwhile; the server copy may be older.
        // The timer counts from when the call connected; if the provider
        // doesn't say, from when we first saw it connected.
        const startedAt = next.startedAt || (next.status === 'in-progress' ? prev.startedAt || new Date().toISOString() : prev.startedAt);
        setCall({ ...next, notes: prev.notes, startedAt });
      } catch {
        // Try again on the next tick.
      }
      setTick((n) => n + 1);
    }, active ? POLL_ACTIVE_MS : POLL_RECORDING_MS);
    return () => clearTimeout(timer);
  }, [callId, active, waitingForRecording, tick]);

  const close = useCallback(() => {
    if (call?.isActive) return;
    setTarget(null);
    setCall(null);
    setError(null);
    setNeedsMyNumber(false);
  }, [call?.isActive]);

  const setNotes = useCallback((notes: string) => setCall((prev) => (prev ? { ...prev, notes } : prev)), []);

  return (
    <CallContext.Provider value={{ startCall, busy: placing || !!call?.isActive, finishedCount }}>
      {children}
      {target && (
        <CallPanel
          key={call?.id ?? 'new'}
          target={target}
          call={call}
          config={config}
          placing={placing}
          error={error}
          needsMyNumber={needsMyNumber}
          onSaveMyNumber={saveMyNumber}
          onNotesChange={setNotes}
          onNotesSaved={() => setFinishedCount((n) => n + 1)}
          onRetry={() => place(target)}
          onClose={close}
        />
      )}
    </CallContext.Provider>
  );
}
