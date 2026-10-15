import { MessagesSquare } from 'lucide-react';
import { useMatch } from 'react-router-dom';
import { CallProvider } from '../calls/CallContext.jsx';
import { ChatProvider } from '../chat/ChatContext.jsx';
import { CallOverlay } from '../components/calls/CallOverlay.jsx';
import { ChatWindow } from '../components/chat/ChatWindow.jsx';
import { LiveShareBanner } from '../components/location/LiveShareBanner.jsx';
import { Sidebar } from '../components/chat/Sidebar.jsx';
import { EmptyState } from '../components/ui/States.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { cn } from '../utils/misc.js';

/**
 * Responsive two-pane layout. On phones only one pane is visible at a time:
 * the list at "/", the conversation at "/c/:id" (with a back button).
 */
export default function ChatPage() {
  const { user } = useAuth();
  return (
    // Re-mount everything (socket + cache) when a different user signs in.
    <ChatProvider key={user.id}>
      <CallProvider>
        <ChatLayout />
        <CallOverlay />
      </CallProvider>
    </ChatProvider>
  );
}

function ChatLayout() {
  const conversationId = useMatch('/c/:conversationId')?.params.conversationId;
  const id = Number(conversationId);
  const selected = Number.isInteger(id) && id > 0 ? id : null;

  return (
    <div className="app-height flex flex-col overflow-hidden bg-canvas">
      <LiveShareBanner />
      <div className="flex min-h-0 flex-1">
        <Sidebar className={cn('w-full md:w-sidebar lg:w-sidebar-lg md:shrink-0', selected ? 'hidden md:flex' : 'flex')} />
        <main className={cn('min-w-0 flex-1 flex-col bg-canvas', selected ? 'flex' : 'hidden md:flex')}>
          {selected ? (
            <ChatWindow conversationId={selected} key={selected} />
          ) : conversationId ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState icon={MessagesSquare} title="Conversation not found" description="Check the link and try again." />
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                icon={MessagesSquare}
                title="Pick a conversation"
                description="Choose a chat from the list, or open the Contacts tab to find people and start a new one."
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
