import { useEffect, useState } from 'react';
import { LinkIcon, Users } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { groupsApi } from '../api/endpoints.js';
import { Avatar } from '../components/ui/Avatar.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Card } from '../components/ui/Card.jsx';
import { FullPageSpinner } from '../components/ui/Spinner.jsx';
import { EmptyState } from '../components/ui/States.jsx';
import { useToast } from '../components/ui/Toast.jsx';

/**
 * /join/:code — "Join this group?" from an invite link (must be signed in).
 * Standalone page: the chat layout loads the joined group when it opens.
 */
export default function JoinGroupPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [state, setState] = useState({ status: 'loading', invite: null, error: null });
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    groupsApi
      .previewInvite(code)
      .then(({ invite }) => setState({ status: 'ready', invite, error: null }))
      .catch((error) => setState({ status: 'error', invite: null, error: error.message }));
  }, [code]);

  const join = async () => {
    setJoining(true);
    try {
      const { conversation } = await groupsApi.join(code);
      navigate(`/c/${conversation.id}`, { replace: true });
    } catch (error) {
      toast.error(error.message);
      setJoining(false);
    }
  };

  if (state.status === 'loading') return <FullPageSpinner label="Opening invite…" />;

  return (
    <div className="app-height flex items-center justify-center bg-canvas px-4">
      <Card className="w-full max-w-sm p-6 text-center">
        {state.status === 'error' ? (
          <EmptyState
            icon={LinkIcon}
            title="Invite link not valid"
            description={state.error}
            action={
              <Link to="/">
                <Button variant="secondary">Go to chats</Button>
              </Link>
            }
          />
        ) : (
          <>
            <Avatar user={{ id: state.invite.conversationId, name: state.invite.name, avatarUrl: state.invite.avatarUrl }} size="xl" className="mx-auto" />
            <h1 className="mt-4 text-xl font-semibold text-ink">{state.invite.name}</h1>
            <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-ink-muted">
              <Users className="size-4" aria-hidden /> {state.invite.memberCount} members
            </p>
            {state.invite.description && <p className="mt-3 text-sm whitespace-pre-wrap text-ink-soft">{state.invite.description}</p>}
            <div className="mt-6 flex flex-col gap-2">
              {state.invite.alreadyMember ? (
                <Button fullWidth onClick={() => navigate(`/c/${state.invite.conversationId}`, { replace: true })}>
                  Open group
                </Button>
              ) : (
                <Button fullWidth loading={joining} onClick={join}>
                  Join group
                </Button>
              )}
              <Link to="/">
                <Button fullWidth variant="ghost">
                  Not now
                </Button>
              </Link>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
