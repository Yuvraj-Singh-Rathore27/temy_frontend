import { useCallback, useMemo, useRef, useState } from 'react';
import { Camera, Copy, Link2, LogOut, MessageCircle, MoreVertical, RefreshCw, Share2, ShieldCheck, ShieldOff, Trash2, UserMinus, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useChatActions, useChatState } from '../../chat/ChatContext.jsx';
import { chatAvatar, isGroupAdmin } from '../../utils/conversation.js';
import { prepareAvatar } from '../../utils/image.js';
import { cn } from '../../utils/misc.js';
import { Panel, PanelSection } from '../layout/Panel.jsx';
import { MediaGallery } from '../media/MediaGallery.jsx';
import { Avatar } from '../ui/Avatar.jsx';
import { Button } from '../ui/Button.jsx';
import { EditableField } from '../ui/EditableField.jsx';
import { Menu } from '../ui/Menu.jsx';
import { Segmented } from '../ui/Segmented.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { useToast } from '../ui/Toast.jsx';
import { AddMembersDialog } from './GroupDialogs.jsx';

const ROLE_LABEL = { owner: 'Owner', admin: 'Admin' };
const WHO = [
  { value: 'all', label: 'Everyone' },
  { value: 'admins', label: 'Only admins' },
];

/** "Group info": details, members and (for admins) settings and the invite link. */
export function GroupInfoPanel({ conversation, onClose }) {
  const { groups } = useChatState();
  const { me, updateGroup, setGroupAvatar, removeGroupAvatar, leaveGroup } = useChatActions();
  const toast = useToast();
  const info = groups[conversation.id];
  const id = conversation.id;
  const admin = isGroupAdmin(conversation);
  const canEditInfo = admin || info?.editPermission === 'all';
  const [addOpen, setAddOpen] = useState(false);

  const run = useCallback((promise) => promise.catch((error) => toast.error(error.message)), [toast]);

  if (!info) {
    return (
      <Panel title="Group info" onClose={onClose} closeIcon="close">
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Group info" onClose={onClose} closeIcon="close">
      <PanelSection className="flex flex-col items-center gap-2 py-6 text-center">
        <GroupPhoto
          conversation={conversation}
          editable={canEditInfo}
          onUpload={(blob) => run(setGroupAvatar(id, blob))}
          onRemove={() => run(removeGroupAvatar(id))}
        />
        <p className="text-sm text-ink-muted">Group · {info.members.length} members</p>
      </PanelSection>

      <PanelSection>
        {canEditInfo ? (
          <>
            <EditableField label="Group name" value={info.name} maxLength={80} onSave={(name) => updateGroup(id, { name })} />
            <div className="mt-3">
              <EditableField
                label="Description"
                value={info.description}
                placeholder="Add a group description"
                maxLength={500}
                multiline
                onSave={(description) => updateGroup(id, { description })}
              />
            </div>
          </>
        ) : (
          <>
            <h3 className="text-lg font-semibold text-ink">{info.name}</h3>
            <p className={cn('mt-1 text-sm whitespace-pre-wrap', info.description ? 'text-ink-soft' : 'text-ink-faint italic')}>
              {info.description || 'No description'}
            </p>
          </>
        )}
      </PanelSection>

      <PanelSection title="Media, files and audio">
        <MediaGallery conversationId={id} me={me} peerName={info.name} />
      </PanelSection>

      <PanelSection title={`${info.members.length} members`}>
        {admin && (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="mb-1 flex w-full items-center gap-3 rounded-control px-2 py-2 text-left text-sm font-medium text-brand-700 hover:bg-surface-muted"
          >
            <span className="flex size-9 items-center justify-center rounded-full bg-brand-600 text-white">
              <UserPlus className="size-4" />
            </span>
            Add members
          </button>
        )}
        <ul>
          {info.members.map((member) => (
            <li key={member.id}>
              <MemberRow conversationId={id} member={member} me={me} myRole={info.myRole} onError={(m) => toast.error(m)} />
            </li>
          ))}
        </ul>
      </PanelSection>

      {admin && <InviteLink conversationId={id} code={info.inviteCode} />}

      {admin && (
        <PanelSection title="Group settings">
          <Segmented
            label="Send messages"
            options={WHO}
            value={info.sendPermission}
            onChange={(sendPermission) => run(updateGroup(id, { sendPermission }))}
          />
          <Segmented
            label="Edit group info"
            options={WHO}
            value={info.editPermission}
            onChange={(editPermission) => run(updateGroup(id, { editPermission }))}
          />
        </PanelSection>
      )}

      <div className="bg-surface">
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Leave "${info.name}"? You won't be able to see its messages anymore.`)) run(leaveGroup(id));
          }}
          className="flex w-full items-center gap-4 border-b border-line px-gutter py-3.5 text-left text-sm font-medium text-danger hover:bg-danger-soft"
        >
          <LogOut className="size-5" aria-hidden /> Leave group
        </button>
      </div>

      {addOpen && <AddMembersDialog conversationId={id} members={info.members} onClose={() => setAddOpen(false)} />}
    </Panel>
  );
}

function GroupPhoto({ conversation, editable, onUpload, onRemove }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const avatar = chatAvatar(conversation);

  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      await onUpload(await prepareAvatar(file));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  if (!editable) return <Avatar user={avatar} size="xl" />;
  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="group relative rounded-full focus-visible:shadow-focus focus-visible:outline-none"
        aria-label="Change group photo"
      >
        <Avatar user={avatar} size="xl" />
        <span
          className={cn(
            'absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-full bg-black/45 text-xs font-medium text-white transition-opacity',
            busy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
          )}
        >
          {busy ? <Spinner className="text-white" /> : <Camera className="size-6" aria-hidden />}
        </span>
      </button>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => upload(e.target.files?.[0])} />
      {avatar.avatarUrl && (
        <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={onRemove}>
          Remove photo
        </Button>
      )}
    </>
  );
}

function MemberRow({ conversationId, member, me, myRole, onError }) {
  const { removeGroupMember, setGroupRole, openConversation } = useChatActions();
  const { contacts } = useChatState();
  const navigate = useNavigate();
  const isMe = member.id === me;
  const iAmAdmin = myRole === 'owner' || myRole === 'admin';
  const isContact = contacts.some((c) => c.id === member.id);

  const items = useMemo(() => {
    const run = (promise) => promise.catch((e) => onError(e.message));
    return [
      {
        label: `Message ${member.name.split(' ')[0]}`,
        icon: MessageCircle,
        hidden: !isContact,
        onClick: () => run(openConversation(member.id).then((c) => navigate(`/c/${c.id}`))),
      },
      {
        label: 'Make group admin',
        icon: ShieldCheck,
        hidden: !iAmAdmin || member.role !== 'member',
        onClick: () => run(setGroupRole(conversationId, member.id, 'admin')),
      },
      {
        label: 'Dismiss as admin',
        icon: ShieldOff,
        hidden: !iAmAdmin || member.role !== 'admin',
        onClick: () => run(setGroupRole(conversationId, member.id, 'member')),
      },
      {
        label: 'Remove from group',
        icon: UserMinus,
        danger: true,
        // Admins remove members; only the owner removes admins; nobody removes the owner.
        hidden: !iAmAdmin || member.role === 'owner' || (member.role === 'admin' && myRole !== 'owner'),
        onClick: () => {
          if (window.confirm(`Remove ${member.name} from the group?`)) run(removeGroupMember(conversationId, member.id));
        },
      },
    ];
  }, [member, isContact, iAmAdmin, myRole, conversationId, openConversation, navigate, setGroupRole, removeGroupMember, onError]);

  const hasActions = !isMe && items.some((item) => !item.hidden);

  return (
    <div className="flex items-center gap-3 rounded-control px-2 py-2 hover:bg-surface-muted">
      <Avatar user={member} showStatus />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{isMe ? 'You' : member.name}</p>
        {(member.about || member.email) && <p className="truncate text-xs text-ink-muted">{member.about || member.email}</p>}
      </div>
      {ROLE_LABEL[member.role] && (
        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-2xs font-semibold text-brand-700">{ROLE_LABEL[member.role]}</span>
      )}
      {hasActions && <Menu icon={MoreVertical} label={`Options for ${member.name}`} items={items} />}
    </div>
  );
}

function InviteLink({ conversationId, code }) {
  const { setGroupInvite } = useChatActions();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const link = code ? `${window.location.origin}/join/${code}` : null;

  const change = async (enabled, message) => {
    setBusy(true);
    try {
      await setGroupInvite(conversationId, enabled);
      if (message) toast.show(message);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const copy = () =>
    navigator.clipboard
      .writeText(link)
      .then(() => toast.show('Invite link copied'))
      .catch(() => toast.error('Could not copy'));

  return (
    <PanelSection title="Invite link">
      {link ? (
        <>
          <p className="rounded-control bg-surface-sunken px-3 py-2 font-mono text-xs break-all text-ink-soft">{link}</p>
          <p className="mt-1.5 text-xs text-ink-muted">Anyone with this link can join. Reset it to stop the old link working.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={Copy} onClick={copy}>
              Copy
            </Button>
            {navigator.share && (
              <Button size="sm" variant="secondary" icon={Share2} onClick={() => navigator.share({ title: 'Join my TEMU group', url: link }).catch(() => {})}>
                Share
              </Button>
            )}
            <Button size="sm" variant="ghost" icon={RefreshCw} loading={busy} onClick={() => change(true, 'Link reset')}>
              Reset
            </Button>
            <Button size="sm" variant="danger-ghost" onClick={() => change(false, 'Invite link turned off')} disabled={busy}>
              Turn off
            </Button>
          </div>
        </>
      ) : (
        <Button size="sm" variant="secondary" icon={Link2} loading={busy} onClick={() => change(true)}>
          Create invite link
        </Button>
      )}
    </PanelSection>
  );
}
