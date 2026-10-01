// src/hooks/useHeartbeat.js
//
// Reports "this tester is alive on build X" to Project Scarlett via the
// tester_beat RPC. Throttled to once per hour. Skipped in __DEV__ so your
// dev phone does not pollute the numbers. Never throws.

import { useEffect } from 'react';
import { AppState } from 'react-native';

const LAST_BEAT_KEY = 'll_last_beat';
const EVERY_MS = 60 * 60 * 1000;

export function useHeartbeat({ scarlett, storage, testerId, buildCode }) {
  useEffect(() => {
    if (__DEV__ || !scarlett || !storage || !testerId) return;

    const beat = async () => {
      try {
        const last = Number(await storage.getItem(LAST_BEAT_KEY)) || 0;
        if (Date.now() - last < EVERY_MS) return;

        const { error } = await scarlett.rpc('tester_beat', {
          p_tester: String(testerId),
          p_build: buildCode ?? null,
        });
        if (!error) await storage.setItem(LAST_BEAT_KEY, String(Date.now()));
      } catch {
        // heartbeat must never affect the app
      }
    };

    beat();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') beat();
    });
    return () => sub.remove();
  }, [scarlett, storage, testerId, buildCode]);
}
