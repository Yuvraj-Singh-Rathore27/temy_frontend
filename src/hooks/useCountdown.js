import { useCallback, useEffect, useState } from 'react';

/** Seconds left until a deadline; `start(seconds)` restarts it. */
export function useCountdown(initialSeconds = 0) {
  const [deadline, setDeadline] = useState(() => (initialSeconds > 0 ? Date.now() + initialSeconds * 1000 : 0));
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (deadline <= now) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [deadline, now]);

  const start = useCallback((seconds) => {
    setNow(Date.now());
    setDeadline(Date.now() + Math.max(0, seconds) * 1000);
  }, []);

  return { secondsLeft: Math.max(0, Math.ceil((deadline - now) / 1000)), start };
}
