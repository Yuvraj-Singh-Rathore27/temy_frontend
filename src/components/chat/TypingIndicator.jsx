import { Mic } from 'lucide-react';
import { cn } from '../../utils/misc.js';

/** Three bouncing dots. */
export function TypingDots({ className }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} aria-hidden>
      {[0, 150, 300].map((delay) => (
        <span key={delay} className="size-1.5 animate-typing rounded-full bg-current" style={{ animationDelay: `${delay}ms` }} />
      ))}
    </span>
  );
}

/** "typing…" or "recording audio…" (activity: 'typing' | 'recording'). */
export function ActivityLabel({ activity }) {
  return (
    <span className="flex items-center gap-1.5 text-brand-600">
      {activity === 'recording' ? (
        <>
          <Mic className="size-3.5 animate-pulse" aria-hidden /> recording audio…
        </>
      ) : (
        <>
          typing <TypingDots />
        </>
      )}
    </span>
  );
}

/** Bubble shown at the bottom of the message list while the peer types. */
export function TypingBubble({ name }) {
  return (
    <div className="flex animate-fade-in items-end gap-2 px-1 pt-1" role="status" aria-live="polite">
      <div className="rounded-bubble rounded-bl-md bg-bubble-in px-4 py-3 text-ink-muted shadow-bubble">
        <TypingDots />
      </div>
      <span className="sr-only">{name} is typing</span>
    </div>
  );
}
