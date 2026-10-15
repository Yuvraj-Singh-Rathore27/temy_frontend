import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Bell, LogOut, MessagesSquare, Phone, MoreVertical, MonitorOff, Search, Settings, Star, UserRound, UserRoundPlus, Users, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import { selectConversationList, selectTotalUnread } from '../../chat/chatReducer.js';
import { useChatState } from '../../chat/ChatContext.jsx';
import { cn } from '../../utils/misc.js';
import { Avatar } from '../ui/Avatar.jsx';
import { UnreadBadge } from '../ui/Badge.jsx';
import { IconButton } from '../ui/Button.jsx';
import { inputClass } from '../ui/Input.jsx';
import { Menu } from '../ui/Menu.jsx';
import { ConnectionPill } from './ConnectionStatus.jsx';
import { CallsPanel } from '../calls/CallsPanel.jsx';
import { ContactsPanel } from './ContactsPanel.jsx';
import { NewGroupDialog } from './GroupDialogs.jsx';
import { NotificationsPanel } from './NotificationsPanel.jsx';
import { ProfilePanel } from './ProfilePanel.jsx';
import { SettingsPanel } from './SettingsPanel.jsx';
import { ConversationList } from './ConversationList.jsx';
import { SearchResults, StarredPanel, useMessageSearch, useSenderLabel } from './MessageResults.jsx';
import { chatTitle } from '../../utils/conversation.js';

const TABS = [
  { id: 'chats', label: 'Chats', icon: MessagesSquare },
  { id: 'calls', label: 'Calls', icon: Phone },
  { id: 'contacts', label: 'Contacts', icon: Users },
];

const SEARCH_LABELS = { chats: 'Search chats and messages', calls: 'Search calls', contacts: 'Search contacts, or find people by name or full email' };

export const Sidebar = memo(function Sidebar({ className }) {
  const { conversations, presence, connection, notificationsUnread } = useChatState();
  const [tab, setTab] = useState('chats');
  const [query, setQuery] = useState('');
  const [panel, setPanel] = useState(null); // 'profile' | 'starred' | 'settings' | 'notifications' | 'newGroup' | null
  const searchRef = useRef(null);
  const navigate = useNavigate();
  const openProfile = useCallback(() => setPanel('profile'), []);
  const openStarred = useCallback(() => setPanel('starred'), []);
  const openSettings = useCallback(() => setPanel('settings'), []);
  const openNotifications = useCallback(() => setPanel('notifications'), []);
  const openNewGroup = useCallback(() => setPanel('newGroup'), []);
  const closePanel = useCallback(() => setPanel(null), []);

  /** Open the message's chat and scroll to it. */
  const goToMessage = useCallback(
    (message) => {
      setPanel(null);
      navigate(`/c/${message.conversationId}`, { state: { jumpTo: message.id } });
    },
    [navigate],
  );

  const totalUnread = useMemo(() => selectTotalUnread(conversations), [conversations]);
  const allConversations = useMemo(() => selectConversationList(conversations, presence), [conversations, presence]);
  const term = query.trim().toLowerCase();
  const visibleConversations = useMemo(
    () =>
      term
        ? allConversations.filter((c) => chatTitle(c).toLowerCase().includes(term) || c.peer?.email?.toLowerCase().includes(term))
        : allConversations,
    [allConversations, term],
  );

  const switchTab = useCallback((id) => {
    setTab(id);
    setQuery('');
  }, []);

  const findPeople = useCallback(() => {
    switchTab('contacts');
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [switchTab]);

  return (
    <aside className={cn('relative flex min-h-0 flex-col border-r border-line bg-surface', className)}>
      <SidebarHeader
        connection={connection}
        notificationsUnread={notificationsUnread}
        onOpenProfile={openProfile}
        onOpenStarred={openStarred}
        onOpenSettings={openSettings}
        onOpenNotifications={openNotifications}
        onOpenNewGroup={openNewGroup}
      />

      <div className="px-gutter pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" aria-hidden />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={SEARCH_LABELS[tab]}
            aria-label={SEARCH_LABELS[tab]}
            maxLength={100}
            className={cn(inputClass, 'h-10 border-transparent bg-surface-sunken pr-9 pl-9 focus:bg-surface')}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 text-ink-faint hover:text-ink-muted"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      <nav className="flex gap-1 border-b border-line px-gutter" role="tablist" aria-label="Sidebar">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => switchTab(id)}
            className={cn(
              '-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
              tab === id ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-muted hover:text-ink-soft',
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
            {id === 'chats' && totalUnread > 0 && <UnreadBadge count={totalUnread} />}
          </button>
        ))}
      </nav>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto" role="tabpanel">
        {tab === 'chats' ? (
          <>
            <ConversationList conversations={visibleConversations} filter={query.trim()} onFindPeople={findPeople} />
            {term.length >= 2 && <MessageSearchSection query={query} onSelect={goToMessage} />}
          </>
        ) : tab === 'calls' ? (
          <CallsPanel query={query} />
        ) : (
          <ContactsPanel query={query} />
        )}
      </div>
      {panel === 'profile' && <ProfilePanel onClose={closePanel} />}
      {panel === 'starred' && <StarredPanel onClose={closePanel} onSelect={goToMessage} />}
      {panel === 'settings' && <SettingsPanel onClose={closePanel} />}
      {panel === 'notifications' && <NotificationsPanel onClose={closePanel} />}
      {panel === 'newGroup' && <NewGroupDialog onClose={closePanel} />}
    </aside>
  );
});

/** Re-renders only when the user or connection status changes. */
/** Messages matching the sidebar search, across every chat. */
function MessageSearchSection({ query, onSelect }) {
  const result = useMessageSearch(query);
  const label = useSenderLabel();
  return (
    <section className="border-t border-line pt-2">
      <h3 className="px-gutter pb-1 text-2xs font-semibold tracking-wider text-ink-faint uppercase">Messages</h3>
      <SearchResults result={result} onSelect={onSelect} titleOf={(m) => label(m, { withChat: true })} idleHint="Searching…" />
    </section>
  );
}

const SidebarHeader = memo(function SidebarHeader({
  connection,
  notificationsUnread,
  onOpenProfile,
  onOpenStarred,
  onOpenSettings,
  onOpenNotifications,
  onOpenNewGroup,
}) {
  const { user, logout, logoutAll } = useAuth();
  const me = useMemo(() => ({ ...user, isOnline: connection === 'connected' }), [user, connection]);
  const menuItems = useMemo(
    () => [
      { label: 'New group', icon: Users, onClick: onOpenNewGroup },
      { label: 'Profile', icon: UserRound, onClick: onOpenProfile },
      { label: 'Starred messages', icon: Star, onClick: onOpenStarred },
      { label: 'Settings', icon: Settings, onClick: onOpenSettings },
      { label: 'Log out', icon: LogOut, onClick: logout },
      { label: 'Log out of all devices', icon: MonitorOff, onClick: logoutAll, danger: true },
    ],
    [onOpenNewGroup, onOpenProfile, onOpenStarred, onOpenSettings, logout, logoutAll],
  );

  return (
    <header className="flex items-center gap-3 px-gutter pt-4 pb-3">
      <button
        type="button"
        onClick={onOpenProfile}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-control text-left focus-visible:shadow-focus focus-visible:outline-none"
        aria-label="Open your profile"
      >
        <Avatar user={me} showStatus size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
          <ConnectionPill status={connection} />
        </div>
      </button>
      <IconButton icon={UserRoundPlus} label="New group" onClick={onOpenNewGroup} />
      <div className="relative">
        <IconButton icon={Bell} label={notificationsUnread ? `Notifications (${notificationsUnread} unread)` : 'Notifications'} onClick={onOpenNotifications} />
        {notificationsUnread > 0 && <UnreadBadge count={notificationsUnread} className="pointer-events-none absolute -top-0.5 -right-0.5" />}
      </div>
      <Menu icon={MoreVertical} label="Account menu" items={menuItems} />
    </header>
  );
});
