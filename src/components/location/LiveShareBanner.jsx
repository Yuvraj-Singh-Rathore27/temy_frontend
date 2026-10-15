import { useEffect, useMemo, useState } from 'react';
import { Radio } from 'lucide-react';
import { useChatActions, useChatState } from '../../chat/ChatContext.jsx';

/** "You're sharing live location in N chats · Stop all" — shown while any live share is running. */
export function LiveShareBanner() {
  const { myLiveShares } = useChatState();
  const { stopLiveLocation, resumeLiveSharing } = useChatActions();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const running = useMemo(
    () => Object.entries(myLiveShares).filter(([, share]) => new Date(share.liveUntil).getTime() > now),
    [myLiveShares, now],
  );
  if (running.length === 0) return null;

  const paused = running.some(([, share]) => !share.tracking);
  return (
    <div className="flex items-center gap-2 bg-danger px-gutter py-1.5 text-xs font-medium text-white" role="status">
      <Radio className="size-3.5 shrink-0 animate-pulse" aria-hidden />
      <span className="flex-1">
        Sharing live location in {running.length} chat{running.length > 1 ? 's' : ''}
        {paused && ' — paused after reload'}
      </span>
      {paused && (
        <button type="button" onClick={resumeLiveSharing} className="rounded-full bg-white px-2.5 py-0.5 font-semibold text-danger hover:bg-white/90">
          Resume
        </button>
      )}
      <button
        type="button"
        onClick={() => running.forEach(([messageId]) => stopLiveLocation(Number(messageId)))}
        className="rounded-full bg-white/20 px-2.5 py-0.5 font-semibold hover:bg-white/30"
      >
        Stop all
      </button>
    </div>
  );
}
