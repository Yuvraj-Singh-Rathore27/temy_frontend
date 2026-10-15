import { useEffect, useMemo, useState } from 'react';
import { Download, ListChecks, ShieldCheck, Sparkles, X } from 'lucide-react';
import { aiEnabled, aiEngine, cancelAi, MODEL_INFO, modelDownloaded, summarizeChat } from '../../ai/aiClient.js';
import { lineOf, messageText, realMessages } from '../../ai/chatText.js';
import { quickHighlights } from '../../ai/highlights.js';
import { formatTime } from '../../utils/format.js';
import { Panel, PanelSection } from '../layout/Panel.jsx';
import { Button } from '../ui/Button.jsx';
import { Spinner } from '../ui/Spinner.jsx';

const MAX_CHARS = 5000; // keep the AI fast: the most recent messages up to this much text

/**
 * "Catch me up": what happened while you were away. Quick highlights are instant
 * (simple rules); the AI summary runs entirely on this device.
 */
export function CatchUpPanel({ conversation, thread, initialUnread, me, myName, onClose, onJump }) {
  const unread = initialUnread > 0;
  const nameOf = useMemo(() => (m) => (m.senderId === me ? 'You' : (m.senderName ?? conversation.peer?.name ?? 'Someone')), [me, conversation.peer?.name]);

  // The messages to catch up on: the unread ones, or the latest 40.
  const messages = useMemo(() => {
    const real = realMessages(thread.items);
    return real.slice(-(unread ? Math.min(initialUnread, 150) : 40));
  }, [thread.items, unread, initialUnread]);

  const highlights = useMemo(() => quickHighlights(messages, { myFirstName: myName?.split(' ')[0] }), [messages, myName]);

  const lines = useMemo(() => {
    const first = myName?.split(' ')[0]?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const mention = first ? new RegExp(`@${first}\\b`, 'gi') : null;
    const all = messages.map((m) => lineOf(m, nameOf, mention)).filter(Boolean);
    const picked = [];
    let size = 0;
    for (let i = all.length - 1; i >= 0 && size + all[i].length < MAX_CHARS; i -= 1) {
      picked.unshift(all[i]);
      size += all[i].length + 1;
    }
    return picked;
  }, [messages, nameOf, myName]);

  return (
    <Panel title="Catch me up" onClose={onClose} closeIcon="close">
      <PanelSection>
        <p className="text-sm text-ink-soft">
          {unread ? `${initialUnread} new ${initialUnread === 1 ? 'message' : 'messages'}` : `The last ${messages.length} messages`}
          {unread && messages.length < Math.min(initialUnread, 150) ? ` (the ${messages.length} loaded so far)` : ''}
        </p>
      </PanelSection>

      <PanelSection title="AI summary">
        <AiSummary lines={lines} />
      </PanelSection>

      <PanelSection title="Quick highlights">
        {highlights.length === 0 ? (
          <p className="text-sm text-ink-muted">Nothing stands out: no plans, times, amounts or questions.</p>
        ) : (
          <ul className="space-y-1">
            {highlights.map((message) => (
              <li key={message.id}>
                <button type="button" onClick={() => onJump(message.id)} className="w-full rounded-control px-2 py-1.5 text-left hover:bg-surface-muted">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-xs font-semibold text-brand-700">{nameOf(message)}</span>
                    <time className="shrink-0 text-2xs text-ink-faint">{formatTime(message.createdAt)}</time>
                  </span>
                  <span className="line-clamp-2 text-sm text-ink">{messageText(message)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 flex items-center gap-1.5 text-2xs text-ink-faint">
          <ListChecks className="size-3.5" aria-hidden /> Messages with plans, times, amounts and questions. Tap one to see it in the chat.
        </p>
      </PanelSection>
    </Panel>
  );
}

function AiSummary({ lines }) {
  const [engine, setEngine] = useState(null);
  const [downloaded, setDownloaded] = useState(null);
  const [state, setState] = useState({ status: 'idle' }); // idle | consent | running | done | error
  const enabled = aiEnabled();

  useEffect(() => {
    aiEngine().then(setEngine);
    modelDownloaded().then(setDownloaded);
    return () => cancelAi(); // closing the panel stops the AI
  }, []);

  const run = async () => {
    setState({ status: 'running', stage: 'starting' });
    try {
      const bullets = await summarizeChat(lines, { onProgress: (progress) => setState({ status: 'running', ...progress }) });
      setState(bullets.length ? { status: 'done', bullets } : { status: 'error', message: "The AI couldn't summarise these messages. Try again." });
      setDownloaded(true);
    } catch (error) {
      if (error.name !== 'AbortError') setState({ status: 'error', message: error.message || 'The AI stopped. Try again.' });
    }
  };

  const start = () => (engine !== 'builtin' && !downloaded ? setState({ status: 'consent' }) : run());

  if (!enabled) return <p className="text-sm text-ink-muted">AI features are turned off on this device (⋮ → Settings → AI).</p>;
  if (lines.length < 3) return <p className="text-sm text-ink-muted">Not enough messages to summarise yet.</p>;
  if (!engine || downloaded === null) return <Spinner size="sm" />;

  if (state.status === 'consent') {
    return (
      <div className="space-y-3 rounded-card border border-line bg-surface-muted p-3 text-sm">
        <p className="font-medium text-ink">Download the AI model once?</p>
        <p className="text-ink-soft">
          {MODEL_INFO.name}, {MODEL_INFO.size[engine]}. It's saved in this browser and runs on this device.{' '}
          {engine === 'wasm' && 'On this device it runs on the processor, so it may take a minute.'}
        </p>
        <p className="flex items-start gap-1.5 text-xs text-ink-muted">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
          Your messages never leave this device: nothing is sent to any AI company.
        </p>
        <div className="flex gap-2">
          <Button size="sm" icon={Download} onClick={run}>
            Download and summarise
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setState({ status: 'idle' })}>
            Not now
          </Button>
        </div>
      </div>
    );
  }

  if (state.status === 'running') {
    const percent = state.stage === 'downloading' && state.total ? Math.round((state.loaded / state.total) * 100) : null;
    return (
      <div className="space-y-2" aria-live="polite">
        <p className="flex items-center gap-2 text-sm text-ink-soft">
          <Spinner size="sm" />
          {state.stage === 'downloading'
            ? `Downloading the AI model… ${percent}% (${Math.round(state.loaded / 1e6)} of ${Math.round(state.total / 1e6)} MB)`
            : state.stage === 'thinking'
              ? `Reading ${lines.length} messages…`
              : 'Starting the AI on this device…'}
        </p>
        {percent != null && (
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
            <div className="h-full bg-brand-600 transition-[width]" style={{ width: `${percent}%` }} />
          </div>
        )}
        <Button size="sm" variant="ghost" icon={X} onClick={() => (cancelAi(), setState({ status: 'idle' }))}>
          Cancel
        </Button>
      </div>
    );
  }

  if (state.status === 'done') {
    return (
      <div className="space-y-2">
        <ul className="space-y-1.5" aria-label="AI summary">
          {state.bullets.map((bullet, i) => (
            <li key={i} className="flex gap-2 text-sm text-ink">
              <Sparkles className="mt-0.5 size-3.5 shrink-0 text-brand-500" aria-hidden />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
        <p className="text-2xs text-ink-faint">Made by AI on this device. It can make mistakes: check important details.</p>
        <Button size="sm" variant="ghost" onClick={run}>
          Summarise again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {state.status === 'error' && <p className="text-sm text-danger">{state.message}</p>}
      <Button size="sm" icon={Sparkles} onClick={start}>
        {state.status === 'error' ? 'Try again' : 'Summarise with AI'}
      </Button>
      <p className="text-2xs text-ink-faint">
        {engine === 'builtin' ? "Uses your browser's built-in AI." : downloaded ? 'The AI model is already on this device.' : `First use downloads the AI model (${MODEL_INFO.size[engine]}).`} Runs
        on this device, so your messages stay private.
      </p>
    </div>
  );
}
