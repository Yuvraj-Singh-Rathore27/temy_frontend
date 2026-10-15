import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../utils/misc.js';

const ToastContext = createContext(null);

/** Short, non-blocking notices ("Copied", "Message forwarded"). */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [notices, setNotices] = useState([]);
  const nextId = useRef(1);

  const show = useCallback((message, { tone = 'neutral', duration = 2500 } = {}) => {
    const id = nextId.current++;
    setToasts((list) => [...list.slice(-2), { id, message, tone }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), duration);
  }, []);

  const dismissNotice = useCallback((id) => setNotices((list) => list.filter((n) => n.id !== id)), []);

  /** Clickable card in the top corner, e.g. a message from another chat. */
  const notice = useCallback(
    ({ title, body, avatar, onClick, duration = 5000 }) => {
      const id = nextId.current++;
      setNotices((list) => [...list.slice(-2), { id, title, body, avatar, onClick }]);
      setTimeout(() => dismissNotice(id), duration);
    },
    [dismissNotice],
  );

  const api = useMemo(
    () => ({ show, notice, error: (message) => show(message, { tone: 'danger', duration: 4000 }) }),
    [show, notice],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed top-3 right-3 left-3 z-[60] flex flex-col items-end gap-2 sm:left-auto sm:w-80" aria-live="polite">
          {notices.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => {
                dismissNotice(n.id);
                n.onClick?.();
              }}
              className="pointer-events-auto flex w-full animate-fade-in items-start gap-3 rounded-card border border-line bg-surface p-3 text-left shadow-pop hover:bg-surface-muted"
            >
              {n.avatar}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{n.title}</span>
                <span className="line-clamp-2 text-sm break-words text-ink-muted">{n.body}</span>
              </span>
            </button>
          ))}
        </div>,
        document.body,
      )}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role="status"
              className={cn(
                'animate-fade-in rounded-full px-4 py-2 text-sm font-medium shadow-pop',
                toast.tone === 'danger' ? 'bg-danger text-white' : 'bg-ink text-white',
              )}
            >
              {toast.message}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
