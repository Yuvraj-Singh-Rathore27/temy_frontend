import { useSyncExternalStore } from 'react';
import { e2eeSession, onSessionChange } from './session.js';

/** This device's encryption status ('starting' | 'ready' | 'unavailable' | 'error' | 'idle'), live. */
export function useE2eeStatus() {
  return useSyncExternalStore(onSessionChange, () => e2eeSession().status);
}
