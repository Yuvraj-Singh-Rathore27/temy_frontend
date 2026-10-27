import { memo, useMemo } from 'react';
import { ArrowLeft, Bell, BellOff, Image as ImageIcon, Info, LogOut, MoreVertical, Phone, Search, Sparkles, Video } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useGroupCallActions, useGroupCallState } from '../../calls/GroupCallContext.jsx';
import { useChatActions } from '../../chat/ChatContext.jsx';
import { chatAvatar } from '../../utils/conversation.js';
import { Avatar } from '../ui/Avatar.jsx';
import { IconButton } from '../ui/Button.jsx';
import { Menu } from '../ui/Menu.jsx';

/**
 * Group call buttons: call the group (voice / video), or join the call that is going on,
 * with how many people are in it ("Join · 3/6").
 */
function GroupCallButtons({ conversationId }) {
  const { activeCalls, call } = useGroupCallState();
  const { startGroupCall, joinGroupCall } = useGroupCallActions();
  const active = activeCalls[conversationId];
  if (call && call.conversationId === conversationId && call.phase !== 'ended' && call.phase !== 'incoming') return null; // I'm in it
  if (active) {
    const Icon = active.type === 'video' ? Video : Phone;
    const full = active.participants.length >= active.maxParticipants;
    return (
      <button
        type="button"
        onClick={() => joinGroupCall(active.id, active.type)}
        disabled={full}
        aria-label={full ? `Call is full (${active.maxParticipants} people)` : `Join call (${active.participants.length} of ${active.maxParticipants})`}
        className="flex shrink-0 items-center gap-1.5 rounded-full bg-success px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-success"
      >
        <Icon className="size-4" aria-hidden /> {full ? 'Full' : 'Join'} · {active.participants.length}/{active.maxParticipants}
      </button>
    );
  }
  return (
    <>
      <IconButton icon={Video} label="Group video call" onClick={() => startGroupCall({ conversationId, type: 'video' })} />
      <IconButton icon={Phone} label="Group voice call" onClick={() => startGroupCall({ conversationId, type: 'voice' })} />
    </>
  );
}

/** Header of a group chat: photo, name, who's in it (or who is typing), and the group menu. */
export const GroupHeader = memo(function GroupHeader({
  conversation,
  members,
  activityText,
  onOpenInfo,
  onOpenSearch,
  onCatchUp,
  onOpenMute,
  onUnmute,
  onOpenWallpaper,
  onError,
}) {
  const { me, leaveGroup } = useChatActions();
  const { group, mutedUntil } = conversation;

  // "You, Ann, Ben" — first names, me first.
  const memberLine = useMemo(() => {
    if (!members) return `${group.memberCount} members`;
    const names = members.map((m) => (m.id === me ? 'You' : m.name.split(' ')[0]));
    names.sort((a, b) => (a === 'You' ? -1 : b === 'You' ? 1 : 0));
    return names.join(', ');
  }, [members, me, group.memberCount]);

  const menuItems = useMemo(
    () => [
      { label: 'Group info', icon: Info, onClick: onOpenInfo },
      // Catch me up (AI) is turned off for now.
      // { label: 'Catch me up (AI)', icon: Sparkles, onClick: onCatchUp },
      mutedUntil
        ? { label: 'Unmute notifications', icon: Bell, onClick: () => onUnmute().catch((e) => onError(e.message)) }
        : { label: 'Mute notifications', icon: BellOff, onClick: onOpenMute },
      { label: 'Wallpaper', icon: ImageIcon, onClick: onOpenWallpaper },
      {
        label: 'Leave group',
        icon: LogOut,
        danger: true,
        onClick: () => {
          if (window.confirm(`Leave "${group.name}"? You won't be able to see its messages anymore.`)) {
            leaveGroup(conversation.id).catch((e) => onError(e.message));
          }
        },
      },
    ],
    [mutedUntil, group.name, conversation.id, leaveGroup, onOpenInfo, onCatchUp, onOpenMute, onUnmute, onOpenWallpaper, onError],
  );

  return (
    <header className="flex items-center gap-2 border-b border-line bg-surface px-2 py-2.5 sm:gap-3 sm:px-gutter">
      <Link to="/" className="rounded-full p-2 text-ink-soft hover:bg-surface-sunken md:hidden" aria-label="Back to conversations">
        <ArrowLeft className="size-5" />
      </Link>
      <button
        type="button"
        onClick={onOpenInfo}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-control text-left focus-visible:shadow-focus focus-visible:outline-none"
        aria-label={`Group info for ${group.name}`}
      >
        <Avatar user={chatAvatar(conversation)} />
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-1.5 truncate text-message font-semibold text-ink">
            <span className="truncate">{group.name}</span>
            {mutedUntil && <BellOff className="size-3.5 shrink-0 text-ink-faint" aria-label="Muted" />}
          </h2>
          <p className="truncate text-xs text-ink-muted" aria-live="polite">
            {activityText ? <span className="text-brand-600">{activityText}</span> : memberLine}
          </p>
        </div>
      </button>
      <GroupCallButtons conversationId={conversation.id} />
      <IconButton icon={Search} label="Search messages" onClick={onOpenSearch} className="hidden sm:inline-flex" />
      <Menu icon={MoreVertical} label="Group options" items={menuItems} />
    </header>
  );
});
