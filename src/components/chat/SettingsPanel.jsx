import { useEffect, useState } from 'react';
import { BellRing, Volume2 } from 'lucide-react';
import { useChatActions, useChatState } from '../../chat/ChatContext.jsx';
import { currentSubscription, notificationPermission, playNotificationSound, pushSupported } from '../../utils/notify.js';
import { Panel, PanelSection } from '../layout/Panel.jsx';
import { Button } from '../ui/Button.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { Switch } from '../ui/Switch.jsx';
import { useToast } from '../ui/Toast.jsx';
import { AppearanceSettings } from './AppearanceSettings.jsx';
import { AiSettings } from './AiSettings.jsx';
import { PrivacySettings } from './PrivacySettings.jsx';

/** Appearance and notification preferences (saved on the server), and this device's notification permission. */
export function SettingsPanel({ onClose }) {
  const { settings } = useChatState();
  const { updateSettings, enableDeviceNotifications, disableDeviceNotifications } = useChatActions();
  const toast = useToast();
  const [device, setDevice] = useState({ status: 'checking', subscribed: false });
  const [busy, setBusy] = useState(false);

  const refreshDevice = async () => {
    const permission = notificationPermission();
    const subscribed = Boolean(await currentSubscription());
    setDevice({ status: permission, subscribed });
  };

  useEffect(() => {
    refreshDevice();
  }, []);

  const save = (fields) => updateSettings(fields).catch((error) => toast.error(error.message));

  const toggleDevice = async (on) => {
    setBusy(true);
    try {
      if (on) {
        await enableDeviceNotifications();
        toast.show('Notifications are on for this device');
      } else {
        await disableDeviceNotifications();
      }
    } catch (error) {
      toast.error(error.message);
    } finally {
      await refreshDevice();
      setBusy(false);
    }
  };

  if (!settings) {
    return (
      <Panel title="Settings" onClose={onClose}>
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      </Panel>
    );
  }

  const pushAvailable = settings.push.available && pushSupported();
  const deviceOn = device.status === 'granted' && (pushAvailable ? device.subscribed : true);
  const deviceHint =
    device.status === 'unsupported'
      ? 'This browser does not support notifications.'
      : device.status === 'denied'
        ? 'Blocked in your browser. Allow notifications for this site (🔒 in the address bar), then turn this on.'
        : pushAvailable
          ? 'Get notified even when TEMU is closed.'
          : 'Get notified while TEMU is open in another tab or minimised.';

  return (
    <Panel title="Settings" onClose={onClose}>
      <AppearanceSettings />

      <PanelSection title="Notifications">
        <Switch
          label="Message notifications"
          description="Alerts for new messages. Muted chats stay quiet unless someone @mentions you."
          checked={settings.notificationsEnabled}
          onChange={(value) => save({ notificationsEnabled: value })}
        />
        <Switch
          label="Show message preview"
          description="Show the message text in notifications. Turn off for privacy on shared screens."
          checked={settings.messagePreview}
          disabled={!settings.notificationsEnabled}
          onChange={(value) => save({ messagePreview: value })}
        />
        <Switch
          label="Notification sound"
          checked={settings.soundEnabled}
          disabled={!settings.notificationsEnabled}
          onChange={(value) => save({ soundEnabled: value })}
        />
        <Button size="sm" variant="ghost" icon={Volume2} onClick={playNotificationSound} className="-ml-3">
          Play sound
        </Button>
      </PanelSection>

      <PanelSection title="This device">
        <div className="flex items-start gap-3">
          <BellRing className="mt-2.5 size-5 shrink-0 text-brand-600" aria-hidden />
          <div className="flex-1">
            <Switch
              label="Notifications on this device"
              description={deviceHint}
              checked={deviceOn}
              disabled={busy || device.status === 'unsupported' || device.status === 'checking' || !settings.notificationsEnabled}
              onChange={toggleDevice}
            />
          </div>
        </div>
      </PanelSection>

      <AiSettings />

      <PrivacySettings />
    </Panel>
  );
}
