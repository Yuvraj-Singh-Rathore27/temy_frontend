import { useEffect } from 'react';

/** Calls `callback` whenever the tab becomes visible and focused again. */
export function useWindowFocus(callback) {
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible' && document.hasFocus()) callback();
    };
    window.addEventListener('focus', handler);
    document.addEventListener('visibilitychange', handler);
    return () => {
      window.removeEventListener('focus', handler);
      document.removeEventListener('visibilitychange', handler);
    };
  }, [callback]);
}
