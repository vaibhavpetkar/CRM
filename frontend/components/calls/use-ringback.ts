'use client';

import { useCallback, useEffect, useState } from 'react';

const MUTE_KEY = 'crm_call_ring_muted';
// Indian ringback cadence: 0.4 s tone, 0.2 s pause, 0.4 s tone, 2 s pause.
const CYCLE_S = 3;
const BURSTS: Array<[number, number]> = [
  [0, 0.4],
  [0.6, 1.0],
];
const VOLUME = 0.08;

type AudioCtor = typeof AudioContext;

/** Plays a phone ringback tone while `ringing` is true, unless the user muted it. */
export function useRingback(ringing: boolean) {
  const [muted, setMuted] = useState(() => {
    try {
      return typeof window !== 'undefined' && window.localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const toggleMuted = useCallback(() => {
    setMuted((m) => {
      try {
        window.localStorage.setItem(MUTE_KEY, m ? '0' : '1');
      } catch {
        // Private mode: the choice lasts until the page reloads.
      }
      return !m;
    });
  }, []);

  useEffect(() => {
    if (!ringing || muted || typeof window === 'undefined') return;
    const Ctor: AudioCtor | undefined = window.AudioContext || (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
    if (!Ctor) return;

    let ctx: AudioContext;
    try {
      ctx = new Ctor();
    } catch {
      return;
    }
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    // Two close tones give the familiar "brrr" of a ringing phone.
    const oscillators = [400, 450].map((freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start();
      return osc;
    });

    let next = ctx.currentTime + 0.05;
    const schedule = () => {
      // Keep about two cycles queued ahead of the clock.
      while (next < ctx.currentTime + CYCLE_S * 2) {
        for (const [on, off] of BURSTS) {
          gain.gain.setValueAtTime(0, next + on);
          gain.gain.linearRampToValueAtTime(VOLUME, next + on + 0.02);
          gain.gain.setValueAtTime(VOLUME, next + off - 0.02);
          gain.gain.linearRampToValueAtTime(0, next + off);
        }
        next += CYCLE_S;
      }
    };
    void ctx.resume().catch(() => undefined);
    schedule();
    const timer = window.setInterval(schedule, 1000);

    return () => {
      window.clearInterval(timer);
      try {
        gain.gain.cancelScheduledValues(ctx.currentTime);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        oscillators.forEach((o) => o.stop());
      } catch {
        // Already stopped.
      }
      void ctx.close().catch(() => undefined);
    };
  }, [ringing, muted]);

  return { muted, toggleMuted };
}
