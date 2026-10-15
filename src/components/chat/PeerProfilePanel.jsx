import { useState } from 'react';
import { Ban, Mail, ShieldCheck, UserMinus, UserPlus } from 'lucide-react';
import { useChatActions } from '../../chat/ChatContext.jsx';
import { formatLastSeen } from '../../utils/format.js';
import { cn } from '../../utils/misc.js';
import { statusInfo } from '../../utils/status.js';
import { Panel, PanelSection } from '../layout/Panel.jsx';
import { MediaGallery } from '../media/MediaGallery.jsx';
import { Avatar } from '../ui/Avatar.jsx';
import { ErrorState } from '../ui/States.jsx';
import { SecurityCodeSection } from './Encryption.jsx';

/** "Contact info" for the person on the other side of a chat. */
export function PeerProfilePanel({ peer, conversationId, onClose }) {
  const { me, addContact, removeContact, blockUser, unblockUser } = useChatActions();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const status = statusInfo(peer.status);

  const run = async (action) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleBlock = () => {
    if (peer.isBlocked) return run(() => unblockUser(peer.id));
    if (window.confirm(`Block ${peer.name}? They won't be able to message you or see when you're online.`)) {
      return run(() => blockUser(peer.id));
    }
    return undefined;
  };

  const toggleContact = () => {
    if (!peer.isContact) return run(() => addContact(peer.id));
    if (window.confirm(`Remove ${peer.name} from your contacts? Your conversation history is kept.`)) {
      return run(() => removeContact(peer.id));
    }
    return undefined;
  };

  return (
    <Panel title="Contact info" onClose={onClose} closeIcon="close">
      <PanelSection className="flex flex-col items-center gap-2 py-6 text-center">
        <Avatar user={peer} size="xl" />
        <h3 className="mt-2 text-xl font-semibold text-ink">{peer.name}</h3>
        <p className="text-sm text-ink-muted">
          {peer.isBlocked ? 'Blocked' : peer.isOnline ? <span className="text-success">Online</span> : formatLastSeen(peer.lastSeenAt)}
        </p>
        {!peer.isBlocked && peer.status && peer.status !== 'available' && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-sunken px-2.5 py-1 text-xs text-ink-soft">
            <span className={cn('size-2 rounded-full', status.dot)} aria-hidden />
            {status.label}
          </span>
        )}
      </PanelSection>

      {conversationId && (
        <PanelSection title="Media, files and audio">
          <MediaGallery conversationId={conversationId} me={me} peerName={peer.name} />
        </PanelSection>
      )}

      <PanelSection title="About">
        <p className={cn('text-sm break-words whitespace-pre-wrap', peer.about ? 'text-ink' : 'text-ink-faint italic')}>
          {peer.about || 'No about yet'}
        </p>
      </PanelSection>

      {/* Only shown when they saved me as a contact. */}
      {peer.email && (
        <PanelSection>
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <Mail className="size-4" aria-hidden /> {peer.email}
          </p>
        </PanelSection>
      )}

      <PanelSection>
        <SecurityCodeSection peer={peer} />
      </PanelSection>

      {error && <ErrorState message={error} onDismiss={() => setError('')} compact className="m-3" />}

      <div className="bg-surface">
        <PanelAction icon={peer.isContact ? UserMinus : UserPlus} onClick={toggleContact} disabled={busy}>
          {peer.isContact ? 'Remove from contacts' : 'Add to contacts'}
        </PanelAction>
        <PanelAction icon={peer.isBlocked ? ShieldCheck : Ban} onClick={toggleBlock} disabled={busy} danger={!peer.isBlocked}>
          {peer.isBlocked ? `Unblock ${peer.name}` : `Block ${peer.name}`}
        </PanelAction>
      </div>
    </Panel>
  );
}

function PanelAction({ icon: Icon, children, onClick, disabled, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-4 border-b border-line px-gutter py-3.5 text-left text-sm font-medium transition-colors disabled:opacity-60',
        danger ? 'text-danger hover:bg-danger-soft' : 'text-ink-soft hover:bg-surface-muted',
      )}
    >
      <Icon className="size-5" aria-hidden />
      {children}
    </button>
  );
}
