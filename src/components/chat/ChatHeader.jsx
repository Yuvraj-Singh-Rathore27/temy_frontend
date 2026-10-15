import { memo, useMemo } from 'react';
import { ArrowLeft, Ban, Bell, BellOff, Image as ImageIcon, Info, MoreVertical, Phone, Search, ShieldCheck, Sparkles, UserMinus, UserPlus, Video } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCallActions } from '../../calls/CallContext.jsx';
import { useChatActions } from '../../chat/ChatContext.jsx';
import { formatLastSeen } from '../../utils/format.js';
import { statusInfo } from '../../utils/status.js';
import { Avatar } from '../ui/Avatar.jsx';
import { IconButton } from '../ui/Button.jsx';
import { Menu } from '../ui/Menu.jsx';
import { ActivityLabel } from './TypingIndicator.jsx';

/** Memoized: re-renders only when the peer (name, presence, contact/block flags) or typing changes. */
export const ChatHeader = memo(function ChatHeader({ conversationId, peer, peerActivity, mutedUntil, onError, onOpenProfile, onOpenSearch, onCatchUp, onOpenMute, onUnmute, onOpenWallpaper }) {
  const { addContact, removeContact, blockUser, unblockUser } = useChatActions();
  const { startCall } = useCallActions();

  const menuItems = useMemo(() => {
    const run = (fn) => fn().catch((error) => onError(error.message));
    return [
      { label: 'Contact info', icon: Info, onClick: onOpenProfile },
      // The search button is hidden on small screens to make room for the call buttons.
      { label: 'Search', icon: Search, onClick: onOpenSearch },
      { label: 'Catch me up (AI)', icon: Sparkles, onClick: onCatchUp },
      mutedUntil
        ? { label: 'Unmute notifications', icon: Bell, onClick: () => run(onUnmute) }
        : { label: 'Mute notifications', icon: BellOff, onClick: onOpenMute },
      { label: 'Wallpaper', icon: ImageIcon, onClick: onOpenWallpaper },
      {
        label: 'Add to contacts',
        icon: UserPlus,
        hidden: peer.isContact,
        onClick: () => run(() => addContact(peer.id)),
      },
      {
        label: 'Remove from contacts',
        icon: UserMinus,
        hidden: !peer.isContact,
        onClick: () => {
          if (window.confirm(`Remove ${peer.name} from your contacts? Your conversation history is kept.`)) {
            run(() => removeContact(peer.id));
          }
        },
      },
      {
        label: peer.isBlocked ? 'Unblock' : 'Block',
        icon: peer.isBlocked ? ShieldCheck : Ban,
        danger: !peer.isBlocked,
        onClick: () => {
          if (peer.isBlocked) run(() => unblockUser(peer.id));
          else if (window.confirm(`Block ${peer.name}? They won't be able to message you or see when you're online.`)) {
            run(() => blockUser(peer.id));
          }
        },
      },
    ];
  }, [peer.id, peer.name, peer.isContact, peer.isBlocked, mutedUntil, addContact, removeContact, blockUser, unblockUser, onError, onOpenProfile, onOpenSearch, onCatchUp, onOpenMute, onUnmute, onOpenWallpaper]);

  const status = statusInfo(peer.status);

  return (
    <header className="flex items-center gap-2 border-b border-line bg-surface px-2 py-2.5 sm:gap-3 sm:px-gutter">
      <Link to="/" className="rounded-full p-2 text-ink-soft hover:bg-surface-sunken md:hidden" aria-label="Back to conversations">
        <ArrowLeft className="size-5" />
      </Link>
      <button
        type="button"
        onClick={onOpenProfile}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-control text-left focus-visible:shadow-focus focus-visible:outline-none"
        aria-label={`View ${peer.name}'s profile`}
      >
        <Avatar user={peer} showStatus />
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-1.5 truncate text-message font-semibold text-ink">
            <span className="truncate">{peer.name}</span>
            {mutedUntil && <BellOff className="size-3.5 shrink-0 text-ink-faint" aria-label="Muted" />}
          </h2>
          <p className="truncate text-xs text-ink-muted" aria-live="polite">
            {peer.isBlocked ? (
              'Blocked'
            ) : peerActivity ? (
              <ActivityLabel activity={peerActivity} />
            ) : peer.isOnline ? (
              <span className="text-success">
                Online{peer.status && peer.status !== 'available' && <span className="text-ink-muted"> · {status.label}</span>}
              </span>
            ) : (
              formatLastSeen(peer.lastSeenAt)
            )}
          </p>
        </div>
      </button>
      {!peer.isBlocked && (
        <>
          <IconButton icon={Video} label="Video call" onClick={() => startCall({ conversationId, peer, type: 'video' })} />
          <IconButton icon={Phone} label="Voice call" onClick={() => startCall({ conversationId, peer, type: 'voice' })} />
        </>
      )}
      <IconButton icon={Search} label="Search messages" onClick={onOpenSearch} className="hidden sm:inline-flex" />
      <Menu icon={MoreVertical} label="Conversation options" items={menuItems} />
    </header>
  );
});
