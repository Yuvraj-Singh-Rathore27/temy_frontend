import { useMemo, useState } from 'react';
import { Check, Search, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useChatActions, useChatState } from '../../chat/ChatContext.jsx';
import { cn } from '../../utils/misc.js';
import { Avatar } from '../ui/Avatar.jsx';
import { Button } from '../ui/Button.jsx';
import { Input, inputClass } from '../ui/Input.jsx';
import { Modal } from '../ui/Modal.jsx';
import { EmptyState } from '../ui/States.jsx';
import { useToast } from '../ui/Toast.jsx';

/** Pick contacts with checkboxes and a search box (shared by "New group" and "Add members"). */
function ContactPicker({ selected, onToggle, exclude = [] }) {
  const { contacts } = useChatState();
  const [query, setQuery] = useState('');
  const term = query.trim().toLowerCase();
  const options = useMemo(
    () => contacts.filter((c) => !c.isBlocked && !exclude.includes(c.id) && (!term || c.name.toLowerCase().includes(term))),
    [contacts, exclude, term],
  );

  return (
    <div>
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" aria-hidden />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search contacts" aria-label="Search contacts" className={cn(inputClass, 'h-10 pl-9')} />
      </div>
      {options.length === 0 ? (
        <EmptyState icon={Users} title="No contacts to add" description="Add people to your contacts first (Contacts tab)." />
      ) : (
        <ul className="max-h-72 space-y-0.5 overflow-y-auto">
          {options.map((contact) => {
            const checked = selected.includes(contact.id);
            return (
              <li key={contact.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => onToggle(contact.id)}
                  className="flex w-full items-center gap-3 rounded-control px-2 py-2 text-left hover:bg-surface-muted"
                >
                  <Avatar user={contact} size="sm" />
                  <span className="flex-1 truncate text-sm font-medium text-ink">{contact.name}</span>
                  <span
                    className={cn(
                      'flex size-5 items-center justify-center rounded-full border',
                      checked ? 'border-brand-600 bg-brand-600 text-white' : 'border-line-strong',
                    )}
                  >
                    {checked && <Check className="size-3.5" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const toggleIn = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

/** "New group": name it and choose members from your contacts. */
export function NewGroupDialog({ onClose }) {
  const { createGroup } = useChatActions();
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState('');
  const [members, setMembers] = useState([]);
  const [saving, setSaving] = useState(false);
  const nameError = name.trim().length > 80 ? 'Group name must be at most 80 characters' : '';

  const create = async () => {
    setSaving(true);
    try {
      const conversation = await createGroup({ name: name.trim(), memberIds: members });
      onClose();
      navigate(`/c/${conversation.id}`);
    } catch (error) {
      toast.error(error.message);
      setSaving(false);
    }
  };

  return (
    <Modal
      title="New group"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={create} loading={saving} disabled={!name.trim() || members.length === 0 || Boolean(nameError)}>
            Create{members.length > 0 && ` (${members.length + 1})`}
          </Button>
        </>
      }
    >
      <Input label="Group name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weekend trip" maxLength={80} autoFocus error={nameError} />
      <p className="mt-4 mb-2 text-sm font-medium text-ink-soft">Add members</p>
      <ContactPicker selected={members} onToggle={(id) => setMembers((list) => toggleIn(list, id))} />
    </Modal>
  );
}

/** Admins: add more of their contacts to a group. */
export function AddMembersDialog({ conversationId, members, onClose }) {
  const { addGroupMembers } = useChatActions();
  const toast = useToast();
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);
  const existing = useMemo(() => members.map((m) => m.id), [members]);

  const add = async () => {
    setSaving(true);
    try {
      await addGroupMembers(conversationId, selected);
      toast.show(selected.length === 1 ? 'Member added' : `${selected.length} members added`);
      onClose();
    } catch (error) {
      toast.error(error.message);
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Add members"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={add} loading={saving} disabled={selected.length === 0}>
            Add{selected.length > 0 && ` (${selected.length})`}
          </Button>
        </>
      }
    >
      <ContactPicker selected={selected} onToggle={(id) => setSelected((list) => toggleIn(list, id))} exclude={existing} />
    </Modal>
  );
}
