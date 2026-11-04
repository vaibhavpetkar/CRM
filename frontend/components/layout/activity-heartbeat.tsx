'use client';

import { useEffect } from 'react';
import { getAuthToken, salesApi } from '@/lib/api';

// Counts the time someone is actually using the CRM ("Active in CRM" on
// Sales Activity): once a minute, if the tab is visible and they clicked,
// typed, scrolled or touched in the last 5 minutes, the server adds a minute.

const BEAT_MS = 60 * 1000;
const IDLE_MS = 5 * 60 * 1000;

export default function ActivityHeartbeat() {
  useEffect(() => {
    let lastInput = Date.now();
    const mark = () => {
      lastInput = Date.now();
    };
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    const beat = () => {
      if (document.hidden || !getAuthToken() || Date.now() - lastInput > IDLE_MS) return;
      salesApi.heartbeat().catch(() => {});
    };
    const first = setTimeout(beat, 5000);
    const timer = setInterval(beat, BEAT_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, mark));
    };
  }, []);
  return null;
}
