import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ban, Lock, MessageSquareOff, Sparkles, Upload, UserPlus, X } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/client.js';
import { stickersApi } from '../../api/endpoints.js';
import { withPresence } from '../../chat/chatReducer.js';
import { useChatActions, useChatState, useThread } from '../../chat/ChatContext.jsx';
import { useWindowFocus } from '../../hooks/useWindowFocus.js';
import { wallpaperStyle } from '../../utils/appearance.js';
import { canSend, chatTitle, isGroup, typingText } from '../../utils/conversation.js';
import { canEdit, isActionable } from '../../utils/messages.js';
import { LocationDialog } from '../location/LocationDialog.jsx';
import { MediaViewer } from '../media/MediaViewer.jsx';
import { SendMediaDialog } from '../media/SendMediaDialog.jsx';
import { Button } from '../ui/Button.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { EmptyState, ErrorState } from '../ui/States.jsx';
import { useToast } from '../ui/Toast.jsx';
import { ChatHeader } from './ChatHeader.jsx';
import { ConnectionBanner } from './ConnectionStatus.jsx';
import { MessageComposer } from './MessageComposer.jsx';
import { DeleteMessageDialog, ForwardDialog } from './MessageDialogs.jsx';
import { MessageList } from './MessageList.jsx';
import { GroupHeader } from './GroupHeader.jsx';
import { GroupInfoPanel } from './GroupInfoPanel.jsx';
import { MuteDialog } from './MuteDialog.jsx';
import { WallpaperPicker } from './WallpaperPicker.jsx';
import { MessageMenu } from './MessageMenu.jsx';
import { ChatSearchPanel } from './MessageResults.jsx';
import { PeerProfilePanel } from './PeerProfilePanel.jsx';
import { PinnedBar } from './PinnedBar.jsx';
import { EncryptionUnavailable } from './Encryption.jsx';
import { CatchUpPanel } from './CatchUpPanel.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';

/** Loads the conversation (if not cached yet) and renders header, messages and composer. */
export function ChatWindow({ conversationId }) {
  const { conversations, conversationsStatus, presence } = useChatState();
  const { fetchConversation } = useChatActions();
  const cached = conversations[conversationId];
  const conversation = useMemo(() => withPresence(presence, cached), [presence, cached]);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (cached || conversationsStatus !== 'ready') return;
    setLoadError(null);
    fetchConversation(conversationId).catch(setLoadError);
  }, [cached, conversationId, conversationsStatus, fetchConversation]);

  if (!conversation) {
    if (loadError) {
      const notFound = loadError instanceof ApiError && [403, 404, 422].includes(loadError.status);
      return (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={MessageSquareOff}
            title={notFound ? 'Conversation not found' : 'Could not open this conversation'}
            description={notFound ? 'It does not exist or you do not have access to it.' : loadError.message}
            action={
              <Link to="/">
                <Button variant="secondary">Back to chats</Button>
              </Link>
            }
          />
        </div>
      );
    }
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner size="lg" label="Opening conversation" />
      </div>
    );
  }

  return <OpenConversation conversation={conversation} key={conversationId} />;
}

function OpenConversation({ conversation }) {
  const { typing, connection, pins, settings, wallpapers, groups } = useChatState();
  const {
    me,
    setActiveConversation,
    loadThread,
    loadPins,
    loadUntil,
    markRead,
    addContact,
    unblockUser,
    reactToMessage,
    toggleStar,
    togglePin,
    muteConversation,
    setChatWallpaper,
    loadGroupInfo,
  } = useChatActions();
  const thread = useThread(conversation.id);
  const { user } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [panel, setPanel] = useState(null); // 'profile' | 'search' | null
  const [composerMode, setComposerMode] = useState(null); // { type: 'reply' | 'edit', message }
  const [menu, setMenu] = useState(null); // { message, position }
  const [dialog, setDialog] = useState(null); // { type: 'delete' | 'forward', message }
  const [highlightId, setHighlightId] = useState(null);
  const [sendFiles, setSendFiles] = useState(null); // File[] waiting in the send dialog
  const [locationOpen, setLocationOpen] = useState(false);
  const [viewer, setViewer] = useState(null); // { items, index }
  const [dragging, setDragging] = useState(false);
  const [catchUpChip, setCatchUpChip] = useState(true);
  const highlightTimer = useRef(null);
  const { id, unreadCount } = conversation;
  // How much was unread when the chat was opened (it's marked read right away).
  const [initialUnread] = useState(unreadCount);
  const group = isGroup(conversation);
  const peer = conversation.peer; // null in groups
  const title = chatTitle(conversation);
  const typers = typing[id];
  const groupInfo = groups[id];
  // 'typing' | 'recording' | undefined
  const peerActivity = group ? (typers ? Object.values(typers)[0] : undefined) : typers?.[peer.id];
  const isPeerTyping = Boolean(peerActivity);
  const blocked = Boolean(peer?.isBlocked);
  const allowedToSend = canSend(conversation);
  const conversationPins = pins[id];

  const pickFiles = useCallback((files) => setSendFiles(files), []);
  const openLocation = useCallback(() => setLocationOpen(true), []);
  const closeLocation = useCallback(() => setLocationOpen(false), []);
  const closeSendDialog = useCallback(() => setSendFiles(null), []);
  const closeViewer = useCallback(() => setViewer(null), []);

  /** Open the viewer on one photo/video, with every photo/video of the loaded chat to browse. */
  const openMedia = useCallback(
    (message, attachment) => {
      const items = [];
      for (const m of thread.items) {
        if (!m.id || m.deletedAt) continue;
        for (const a of m.attachments ?? []) {
          if (a.kind !== 'image' && a.kind !== 'video') continue;
          items.push({ ...a, senderName: m.senderId === me ? 'You' : (m.senderName ?? title), createdAt: m.createdAt, caption: m.body });
        }
      }
      const index = items.findIndex((a) => a.id === attachment.id);
      if (index !== -1) setViewer({ items, index });
    },
    [thread.items, me, title],
  );

  // Drag & drop files anywhere on the chat.
  const dropHandlers = !allowedToSend
    ? {}
    : {
        onDragOver: (event) => {
          if (!event.dataTransfer?.types?.includes('Files')) return;
          event.preventDefault();
          setDragging(true);
        },
        onDragLeave: (event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
        },
        onDrop: (event) => {
          event.preventDefault();
          setDragging(false);
          const files = [...(event.dataTransfer?.files ?? [])];
          if (files.length) setSendFiles(files);
        },
      };

  const openProfile = useCallback(() => setPanel('profile'), []);
  const openSearch = useCallback(() => setPanel('search'), []);
  const openCatchUp = useCallback(() => {
    setCatchUpChip(false);
    setPanel('catchup');
  }, []);
  const openMute = useCallback(() => setDialog({ type: 'mute' }), []);
  const openWallpaper = useCallback(() => setDialog({ type: 'wallpaper' }), []);

  // This chat's wallpaper, else my default one.
  const wallpaperValue = conversation.wallpaper ?? settings?.appearance?.defaultWallpaper ?? 'preset:none';
  const wallpaper = useMemo(() => wallpaperStyle(wallpaperValue, wallpapers), [wallpaperValue, wallpapers]);
  const unmute = useCallback(() => muteConversation(conversation.id, null), [muteConversation, conversation.id]);
  const closePanel = useCallback(() => setPanel(null), []);
  const cancelComposerMode = useCallback(() => setComposerMode(null), []);
  const openMenu = useCallback((message, position) => setMenu({ message, position }), []);
  const closeMenu = useCallback(() => setMenu(null), []);
  const closeDialog = useCallback(() => setDialog(null), []);

  // Load history and pins once and tell the provider which conversation is on screen.
  useEffect(() => {
    setActiveConversation(id);
    if (thread.status === 'idle') loadThread(id);
    loadPins(id);
    return () => setActiveConversation(null);
    // Only when the conversation changes; thread.status is read once on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, setActiveConversation, loadThread, loadPins]);

  useEffect(() => () => clearTimeout(highlightTimer.current), []);

  // Groups: member list (names for typing, roles for permissions).
  useEffect(() => {
    if (group) loadGroupInfo(id);
  }, [group, id, loadGroupInfo]);

  /** Scroll to a message (loading older pages if needed) and flash it. */
  const jumpTo = useCallback(
    async (messageId) => {
      const found = await loadUntil(id, messageId);
      if (!found) {
        toast.show('That message is no longer available');
        return;
      }
      clearTimeout(highlightTimer.current);
      setHighlightId(messageId);
      highlightTimer.current = setTimeout(() => setHighlightId(null), 2000);
    },
    [loadUntil, id, toast],
  );

  // Arriving from a search result or starred message: jump once the history has loaded.
  const pendingJump = location.state?.jumpTo;
  useEffect(() => {
    if (!pendingJump || thread.status !== 'ready') return;
    navigate(location.pathname, { replace: true, state: null });
    jumpTo(pendingJump);
  }, [pendingJump, thread.status, jumpTo, navigate, location.pathname]);

  const selectResult = useCallback(
    (message) => {
      if (window.matchMedia('(max-width: 767px)').matches) setPanel(null);
      jumpTo(message.id);
    },
    [jumpTo],
  );

  const markReadIfVisible = useCallback(() => {
    if (document.visibilityState === 'visible' && document.hasFocus()) markRead(id);
  }, [markRead, id]);

  // Mark as read when opened, when new messages arrive while viewing, and when the tab regains focus.
  // (Groups track reading with the unread count alone: ticks there describe *my* messages.)
  const peerId = peer?.id;
  const unreadFromPeer = useMemo(
    () => !group && thread.items.some((m) => m.id && m.senderId === peerId && m.status !== 'read'),
    [group, thread.items, peerId],
  );
  useEffect(() => {
    if (thread.status === 'ready' && (unreadFromPeer || unreadCount > 0)) markReadIfVisible();
  }, [thread.status, unreadFromPeer, unreadCount, markReadIfVisible]);
  useWindowFocus(markReadIfVisible);

  const report = useCallback((e) => toast.error(e.message), [toast]);
  const react = useCallback((message, emoji) => reactToMessage(message, emoji).catch(report), [reactToMessage, report]);
  const unpin = useCallback((messageId) => togglePin({ id: messageId, conversationId: id }).catch(report), [togglePin, id, report]);

  /** Everything the message menu can do. */
  const onMenuAction = (name, message, payload) => {
    switch (name) {
      case 'reply':
        return setComposerMode({ type: 'reply', message });
      case 'edit':
        return setComposerMode({ type: 'edit', message });
      case 'react':
        return react(message, payload);
      case 'copy':
        return navigator.clipboard
          .writeText(message.body)
          .then(() => toast.show('Copied'))
          .catch(() => toast.error('Could not copy'));
      case 'star':
        return toggleStar(message)
          .then(() => toast.show(message.starred ? 'Unstarred' : 'Starred'))
          .catch(report);
      case 'pin':
        return togglePin(message).catch(report);
      case 'saveSticker':
        return stickersApi
          .save(message.attachments[0].id)
          .then(() => toast.show('Added to your stickers'))
          .catch(report);
      case 'forward':
      case 'delete':
        return setDialog({ type: name, message });
      default:
        return undefined;
    }
  };

  const addPeer = useCallback(async () => {
    try {
      await addContact(peerId);
    } catch (e) {
      setError(e.message);
    }
  }, [addContact, peerId]);

  const unblockPeer = useCallback(async () => {
    try {
      await unblockUser(peerId);
    } catch (e) {
      setError(e.message);
    }
  }, [unblockUser, peerId]);

  const menuMessage = menu?.message;
  const menuOptions = menuMessage && {
    canReply: isActionable(menuMessage) && !menuMessage.event && allowedToSend,
    canCopy: Boolean(menuMessage.body),
    canReact: isActionable(menuMessage) && !menuMessage.event && allowedToSend,
    canForward: isActionable(menuMessage) && !menuMessage.event,
    canPin: isActionable(menuMessage) && !menuMessage.event,
    canEdit: canEdit(menuMessage, me) && !menuMessage.event && allowedToSend,
    isPinned: Boolean(conversationPins?.some((p) => p.messageId === menuMessage.id)),
    // A custom sticker someone sent (built-in ones are always in the picker).
    canSaveSticker: !menuMessage.deletedAt && menuMessage.attachments?.length === 1 && menuMessage.attachments[0].kind === 'sticker' && Boolean(menuMessage.attachments[0].id),
    myReaction: menuMessage.reactions?.find((r) => r.userId === me)?.emoji,
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" {...dropHandlers}>
      {group ? (
        <GroupHeader
          conversation={conversation}
          members={groupInfo?.members}
          activityText={typingText(typers, groupInfo?.members)}
          onOpenInfo={openProfile}
          onOpenSearch={openSearch}
          onCatchUp={openCatchUp}
          onOpenMute={openMute}
          onUnmute={unmute}
          onOpenWallpaper={openWallpaper}
          onError={setError}
        />
      ) : (
        <ChatHeader
          conversationId={id}
          peer={peer}
          peerActivity={peerActivity}
          mutedUntil={conversation.mutedUntil}
          onError={setError}
          onOpenProfile={openProfile}
          onOpenSearch={openSearch}
          onCatchUp={openCatchUp}
          onOpenMute={openMute}
          onUnmute={unmute}
          onOpenWallpaper={openWallpaper}
        />
      )}
      <ConnectionBanner status={connection} />
      <PinnedBar pins={conversationPins} me={me} peerName={title} onJump={jumpTo} onUnpin={unpin} />
      {error && <ErrorState message={error} onDismiss={() => setError('')} compact className="m-3 mb-0" />}
      {!group && !peer.isContact && !blocked && (
        <div className="flex items-center justify-center gap-3 border-b border-line bg-brand-50 px-gutter py-2 text-sm text-brand-800">
          <span>{peer.name} is not in your contacts.</span>
          <Button size="sm" variant="secondary" icon={UserPlus} onClick={addPeer}>
            Add contact
          </Button>
        </div>
      )}
      {catchUpChip && initialUnread >= 5 && panel !== 'catchup' && (
        <div className="flex justify-center px-3 pt-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-surface pr-1 shadow-bubble">
            <button type="button" onClick={openCatchUp} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50">
              <Sparkles className="size-4" aria-hidden /> Catch me up · {initialUnread} unread
            </button>
            <button type="button" onClick={() => setCatchUpChip(false)} aria-label="Dismiss" className="rounded-full p-1 text-ink-faint hover:text-ink-muted">
              <X className="size-3.5" />
            </button>
          </span>
        </div>
      )}
      <MessageList
        conversationId={id}
        peerName={title}
        isGroupChat={group}
        isPeerTyping={isPeerTyping}
        highlightId={highlightId}
        onOpenMenu={openMenu}
        onJump={jumpTo}
        onReact={react}
        onOpenMedia={openMedia}
        wallpaper={wallpaper}
      />
      {group && !allowedToSend ? (
        <div className="safe-bottom flex items-center justify-center gap-2 border-t border-line bg-surface px-gutter pt-3 text-sm text-ink-muted">
          <Lock className="size-4" aria-hidden />
          Only admins can send messages
        </div>
      ) : blocked ? (
        <div className="safe-bottom flex items-center justify-center gap-3 border-t border-line bg-surface px-gutter pt-3 text-sm text-ink-muted">
          <Ban className="size-4" aria-hidden />
          <span>You blocked {peer.name}.</span>
          <Button size="sm" variant="secondary" onClick={unblockPeer}>
            Unblock
          </Button>
        </div>
      ) : (
        <>
        <EncryptionUnavailable />
        <MessageComposer
          conversationId={id}
          mode={composerMode}
          onCancelMode={cancelComposerMode}
          onPickFiles={pickFiles}
          onShareLocation={openLocation}
          peerName={title}
          me={me}
        />
        </>
      )}

      {panel === 'profile' &&
        (group ? (
          <GroupInfoPanel conversation={conversation} onClose={closePanel} />
        ) : (
          <PeerProfilePanel peer={peer} conversationId={id} onClose={closePanel} />
        ))}
      {panel === 'search' && <ChatSearchPanel conversationId={id} onClose={closePanel} onSelect={selectResult} />}
      {panel === 'catchup' && (
        <CatchUpPanel conversation={conversation} thread={thread} initialUnread={initialUnread} me={me} myName={user?.name} onClose={closePanel} onJump={selectResult} />
      )}
      {menu && (
        <MessageMenu message={menu.message} position={menu.position} options={menuOptions} onAction={onMenuAction} onClose={closeMenu} />
      )}
      {dialog?.type === 'delete' && <DeleteMessageDialog message={dialog.message} onClose={closeDialog} />}
      {dialog?.type === 'forward' && <ForwardDialog message={dialog.message} onClose={closeDialog} />}
      {sendFiles && (
        <SendMediaDialog
          conversationId={id}
          files={sendFiles}
          replyTo={composerMode?.type === 'reply' ? composerMode.message : null}
          onSent={cancelComposerMode}
          onClose={closeSendDialog}
        />
      )}
      {dialog?.type === 'mute' && <MuteDialog conversationId={id} peerName={title} onClose={closeDialog} />}
      {dialog?.type === 'wallpaper' && (
        <WallpaperPicker
          title={`Wallpaper for ${title}`}
          value={conversation.wallpaper}
          allowDefault
          onChoose={(value) => setChatWallpaper(id, value)}
          onClose={closeDialog}
        />
      )}
      {locationOpen && (
        <LocationDialog
          conversationId={id}
          replyTo={composerMode?.type === 'reply' ? composerMode.message : null}
          onSent={cancelComposerMode}
          onClose={closeLocation}
        />
      )}
      {viewer && <MediaViewer items={viewer.items} startIndex={viewer.index} onClose={closeViewer} />}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-brand-600/10 p-6">
          <div className="flex flex-col items-center gap-2 rounded-card border-2 border-dashed border-brand-400 bg-surface/95 px-10 py-8 text-brand-700 shadow-pop">
            <Upload className="size-8" aria-hidden />
            <p className="font-medium">Drop files to send to {title}</p>
          </div>
        </div>
      )}
    </div>
  );
}
