import { useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { profileApi } from '../../api/endpoints.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useChatActions, useChatState } from '../../chat/ChatContext.jsx';
import { PanelSection } from '../layout/Panel.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Segmented } from '../ui/Segmented.jsx';
import { useToast } from '../ui/Toast.jsx';
import { LinkedDevices } from './Encryption.jsx';

const LAST_SEEN = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'contacts', label: 'My contacts' },
  { value: 'nobody', label: 'Nobody' },
];

const LAST_SEEN_HINT = {
  everyone: 'People you chat with or who saved you can see when you are online and your last seen.',
  contacts: 'Only people you saved as contacts can see when you are online and your last seen.',
  nobody: 'Nobody can see when you are online or your last seen.',
};

/** Settings → Privacy (last seen & online) and Your data (download, delete account). */
export function PrivacySettings() {
  const { settings } = useChatState();
  const { updateSettings } = useChatActions();
  const toast = useToast();
  const [downloading, setDownloading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const lastSeen = settings?.privacy?.lastSeen ?? 'everyone';

  const download = async () => {
    setDownloading(true);
    try {
      const data = await profileApi.exportData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = Object.assign(document.createElement('a'), { href: url, download: `temu-my-data-${new Date().toISOString().slice(0, 10)}.json` });
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <PanelSection title="Privacy">
        <Segmented
          label="Last seen & online"
          options={LAST_SEEN}
          value={lastSeen}
          onChange={(value) => updateSettings({ privacy: { lastSeen: value } }).catch((error) => toast.error(error.message))}
        />
        <p className="-mt-1 text-xs text-ink-muted">{LAST_SEEN_HINT[lastSeen]}</p>
        <p className="mt-3 text-xs text-ink-muted">
          Your email is only shown to people who saved you as a contact. Others can find you by name, or by typing your full email address.
        </p>
      </PanelSection>

      <PanelSection title="Linked devices">
        <p className="mb-2 text-xs text-ink-muted">
          Each browser you use TEMU in has its own encryption keys. Remove the ones you no longer use; a new device can't read messages sent before it was set up.
        </p>
        <LinkedDevices />
      </PanelSection>

      <PanelSection title="Your data">
        <div className="flex flex-col items-start gap-1">
          <Button size="sm" variant="ghost" icon={Download} loading={downloading} onClick={download} className="-ml-3">
            Download my data
          </Button>
          <p className="mb-2 text-xs text-ink-muted">Your profile, settings, contacts, the messages you sent and your call history, as a JSON file.</p>
          <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={() => setDeleteOpen(true)} className="-ml-3">
            Delete my account
          </Button>
        </div>
      </PanelSection>

      {deleteOpen && <DeleteAccountDialog onClose={() => setDeleteOpen(false)} />}
    </>
  );
}

function DeleteAccountDialog({ onClose }) {
  const { endSession } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const confirm = async (event) => {
    event.preventDefault();
    setDeleting(true);
    setError('');
    try {
      await profileApi.deleteAccount(password);
      endSession(); // back to the sign-in page; every other device is signed out by the server
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  };

  return (
    <Modal
      title="Delete your account?"
      description="This can't be undone."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="danger" type="submit" form="delete-account" loading={deleting} disabled={!password}>
            Delete forever
          </Button>
        </>
      }
    >
      <form id="delete-account" onSubmit={confirm} className="space-y-3 text-sm text-ink-soft">
        <ul className="list-disc space-y-1 pl-5">
          <li>Your profile, contacts, settings and call history are erased.</li>
          <li>Your messages and files are deleted, also from other people's chats.</li>
          <li>One-to-one chats are removed for both sides. Groups continue without you.</li>
          <li>You are signed out everywhere.</li>
        </ul>
        <p>Tip: download your data first if you want a copy.</p>
        <Input
          label="Enter your password to confirm"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error}
          autoFocus
        />
      </form>
    </Modal>
  );
}
