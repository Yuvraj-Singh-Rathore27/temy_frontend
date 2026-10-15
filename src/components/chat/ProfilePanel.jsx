import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Mail, ShieldBan, Trash2 } from 'lucide-react';
import { blocksApi, profileApi } from '../../api/endpoints.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useChatActions } from '../../chat/ChatContext.jsx';
import { prepareAvatar } from '../../utils/image.js';
import { cn } from '../../utils/misc.js';
import { STATUSES } from '../../utils/status.js';
import { validateName } from '../../utils/validation.js';
import { Panel, PanelSection } from '../layout/Panel.jsx';
import { Avatar } from '../ui/Avatar.jsx';
import { Button } from '../ui/Button.jsx';
import { EditableField } from '../ui/EditableField.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { ErrorState } from '../ui/States.jsx';

/** "My profile": photo, name, about, status and the blocked-users list. */
export function ProfilePanel({ onClose }) {
  const { user, updateUser } = useAuth();
  const [error, setError] = useState('');

  const save = useCallback(
    async (fields) => {
      const { user: updated } = await profileApi.update(fields);
      updateUser(updated);
    },
    [updateUser],
  );

  return (
    <Panel title="Profile" onClose={onClose}>
      <PanelSection className="flex flex-col items-center gap-3 py-6">
        <AvatarEditor user={user} onChange={updateUser} onError={setError} />
        <ErrorState message={error} onDismiss={() => setError('')} compact className="w-full" />
      </PanelSection>

      <PanelSection>
        <EditableField label="Your name" value={user.name} maxLength={80} validate={validateName} onSave={(name) => save({ name })} />
      </PanelSection>

      <PanelSection>
        <EditableField
          label="About"
          value={user.about}
          placeholder="Add a few words about yourself"
          maxLength={140}
          multiline
          onSave={(about) => save({ about })}
        />
      </PanelSection>

      <PanelSection title="Status">
        <StatusPicker value={user.status} onChange={(status) => save({ status }).catch((e) => setError(e.message))} />
      </PanelSection>

      <PanelSection>
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Mail className="size-4" aria-hidden /> {user.email}
        </p>
      </PanelSection>

      <BlockedUsers />
    </Panel>
  );
}

function AvatarEditor({ user, onChange, onError }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    onError('');
    try {
      const blob = await prepareAvatar(file);
      const { user: updated } = await profileApi.setAvatar(blob);
      onChange(updated);
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async () => {
    if (!window.confirm('Remove your profile photo?')) return;
    setBusy(true);
    try {
      const { user: updated } = await profileApi.removeAvatar();
      onChange(updated);
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="group relative rounded-full focus-visible:shadow-focus focus-visible:outline-none"
        aria-label={user.avatarUrl ? 'Change profile photo' : 'Add profile photo'}
      >
        <Avatar user={user} size="xl" />
        <span
          className={cn(
            'absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-full bg-black/45 text-xs font-medium text-white transition-opacity',
            busy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
          )}
        >
          {busy ? <Spinner className="text-white" /> : <Camera className="size-6" aria-hidden />}
          {!busy && (user.avatarUrl ? 'Change photo' : 'Add photo')}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        className="hidden"
        onChange={(e) => upload(e.target.files?.[0])}
      />
      {user.avatarUrl && (
        <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={remove} disabled={busy}>
          Remove photo
        </Button>
      )}
    </>
  );
}

function StatusPicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Status">
      {STATUSES.map((status) => (
        <button
          key={status.value}
          type="button"
          role="radio"
          aria-checked={value === status.value}
          onClick={() => value !== status.value && onChange(status.value)}
          className={cn(
            'flex items-center gap-2 rounded-control border px-3 py-2 text-left text-sm transition-colors',
            value === status.value ? 'border-brand-400 bg-brand-50 text-brand-800' : 'border-line text-ink-soft hover:bg-surface-muted',
          )}
        >
          <span className={cn('size-2.5 rounded-full', status.dot)} aria-hidden />
          {status.label}
        </button>
      ))}
    </div>
  );
}

function BlockedUsers() {
  const { unblockUser } = useChatActions();
  const [state, setState] = useState({ status: 'loading', users: [], error: null });
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading', error: null }));
    try {
      const { blocked } = await blocksApi.list();
      setState({ status: 'ready', users: blocked, error: null });
    } catch (e) {
      setState({ status: 'error', users: [], error: e.message });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const unblock = async (person) => {
    setBusyId(person.id);
    try {
      await unblockUser(person.id);
      setState((s) => ({ ...s, users: s.users.filter((u) => u.id !== person.id) }));
    } catch (e) {
      setState((s) => ({ ...s, error: e.message }));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <PanelSection title={`Blocked users${state.status === 'ready' ? ` · ${state.users.length}` : ''}`}>
      {state.status === 'loading' ? (
        <Spinner size="sm" />
      ) : state.status === 'error' ? (
        <ErrorState message={state.error} onRetry={load} compact />
      ) : state.users.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <ShieldBan className="size-4" aria-hidden /> You haven&apos;t blocked anyone.
        </p>
      ) : (
        <ul className="space-y-1">
          {state.users.map((person) => (
            <li key={person.id} className="flex items-center gap-3 py-1.5">
              <Avatar user={person} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{person.name}</p>
                {person.email && <p className="truncate text-xs text-ink-muted">{person.email}</p>}
              </div>
              <Button size="sm" variant="secondary" loading={busyId === person.id} onClick={() => unblock(person)}>
                Unblock
              </Button>
            </li>
          ))}
        </ul>
      )}
    </PanelSection>
  );
}
