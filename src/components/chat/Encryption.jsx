import { useEffect, useState } from 'react';
import { Laptop, Lock, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react';
import { e2eeApi } from '../../api/endpoints.js';
import { securityCodeWith } from '../../e2ee/session.js';
import { useE2eeStatus } from '../../e2ee/useE2ee.js';
import { formatLastSeen } from '../../utils/format.js';
import { Button } from '../ui/Button.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { useToast } from '../ui/Toast.jsx';

/** "🔒 Messages are end-to-end encrypted" (top of every chat). */
export function EncryptionNotice({ className }) {
  return (
    <p className={className}>
      <span className="inline-flex max-w-md items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-left text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Messages and calls are end-to-end encrypted. No one outside this chat, not even Vestige Chat, can read or listen to them.
      </span>
    </p>
  );
}

/** Shown instead of the message box when this page can't do encryption (not HTTPS). */
export function EncryptionUnavailable() {
  const status = useE2eeStatus();
  if (status !== 'unavailable' && status !== 'error') return null;
  return (
    <div className="flex items-start gap-2 border-t border-line bg-amber-50 px-gutter py-2.5 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      {status === 'unavailable'
        ? 'Encrypted messaging needs a secure connection. Open Vestige Chat over HTTPS (or on localhost) to send and read messages.'
        : 'Setting up encryption on this device failed. It will retry when the connection is back.'}
    </div>
  );
}

/** Contact info → "Verify security code": compare the 60 digits on both phones. */
export function SecurityCodeSection({ peer }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-start gap-3 rounded-control px-1 py-1 text-left hover:bg-surface-muted"
      >
        <Lock className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
        <span>
          <span className="block text-sm font-medium text-ink">Encryption</span>
          <span className="block text-xs text-ink-muted">Messages and calls are end-to-end encrypted. Tap to verify the security code.</span>
        </span>
      </button>
      {open && <SecurityCodeDialog peer={peer} onClose={() => setOpen(false)} />}
    </>
  );
}

function SecurityCodeDialog({ peer, onClose }) {
  const [state, setState] = useState({ status: 'loading' });
  useEffect(() => {
    securityCodeWith(peer.id)
      .then((result) => setState({ status: 'ready', ...result }))
      .catch((error) => setState({ status: 'error', error: error.message }));
  }, [peer.id]);
  const groups = state.code?.match(/.{5}/g) ?? [];
  const first = peer.name.split(' ')[0];

  return (
    <Modal
      title="Verify security code"
      description={`You and ${first}`}
      onClose={onClose}
      footer={
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      {state.status === 'loading' && (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      )}
      {state.status === 'error' && <p className="text-sm text-danger">{state.error}</p>}
      {state.status === 'ready' && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-x-4 gap-y-2 rounded-card bg-surface-muted p-4 text-center font-mono text-lg tracking-wider text-ink" aria-label="Security code">
            {groups.map((group, i) => (
              <span key={i}>{group}</span>
            ))}
          </div>
          <p className="text-sm text-ink-soft">
            Compare these numbers with the ones on {first}'s screen (in person, or on a call). If they match, your messages really are only
            readable by the two of you.
          </p>
          <p className="flex items-start gap-2 text-xs text-ink-muted">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            The code changes when either of you uses Vestige Chat on a new device ({state.myDevices} of yours, {state.theirDevices} of {first}'s right now).
          </p>
        </div>
      )}
    </Modal>
  );
}

/** Settings → Linked devices: where my account can read messages; remove old ones. */
export function LinkedDevices() {
  const toast = useToast();
  const [state, setState] = useState({ status: 'loading', devices: [] });

  useEffect(() => {
    e2eeApi
      .devices()
      .then(({ devices }) => setState({ status: 'ready', devices }))
      .catch((error) => setState({ status: 'error', devices: [], error: error.message }));
  }, []);

  const remove = async (device) => {
    if (!window.confirm(`Remove "${device.name}"? It won't be able to read new messages. If you sign in there again it becomes a new device.`)) return;
    try {
      await e2eeApi.revoke(device.id);
      setState((s) => ({ ...s, devices: s.devices.filter((d) => d.id !== device.id) }));
      toast.show('Device removed');
    } catch (error) {
      toast.error(error.message);
    }
  };

  if (state.status === 'loading') return <Spinner size="sm" />;
  if (state.status === 'error') return <p className="text-sm text-danger">{state.error}</p>;
  return (
    <ul className="space-y-1">
      {state.devices.map((device) => (
        <li key={device.id} className="flex items-center gap-3 rounded-control px-1 py-1.5">
          <Laptop className="size-5 shrink-0 text-ink-muted" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">
              {device.name}
              {device.current && <span className="ml-1.5 rounded-full bg-brand-50 px-1.5 py-0.5 text-2xs font-semibold text-brand-700">This device</span>}
            </p>
            <p className="text-xs text-ink-muted">{device.lastSeenAt ? `Active ${formatLastSeen(device.lastSeenAt).replace(/^last seen /i, '')}` : 'Set up'}</p>
          </div>
          {!device.current && (
            <button type="button" onClick={() => remove(device)} aria-label={`Remove ${device.name}`} className="rounded-full p-2 text-ink-muted hover:bg-danger-soft hover:text-danger">
              <Trash2 className="size-4" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
