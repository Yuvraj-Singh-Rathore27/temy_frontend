import { useEffect, useState } from 'react';
import { Cpu, Trash2 } from 'lucide-react';
import { aiEnabled, aiEngine, deleteModel, MODEL_INFO, modelDownloaded, setAiEnabled, setSmartRepliesEnabled, smartRepliesEnabled } from '../../ai/aiClient.js';
import { PanelSection } from '../layout/Panel.jsx';
import { Button } from '../ui/Button.jsx';
import { Switch } from '../ui/Switch.jsx';
import { useToast } from '../ui/Toast.jsx';

const ENGINE_LABEL = {
  builtin: "Your browser's built-in AI (nothing to download)",
  webgpu: `${MODEL_INFO.name} on your graphics card`,
  wasm: `${MODEL_INFO.name} on your processor (slower)`,
};

/** Settings → AI: on-device only, so the switch and the downloaded model belong to this browser. */
export function AiSettings() {
  const toast = useToast();
  const [enabled, setEnabled] = useState(aiEnabled);
  const [replies, setReplies] = useState(smartRepliesEnabled);
  const [engine, setEngine] = useState(null);
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    aiEngine().then(setEngine);
    modelDownloaded().then(setDownloaded);
  }, []);

  const toggle = (value) => {
    setAiEnabled(value);
    setEnabled(value);
  };

  const remove = async () => {
    await deleteModel();
    setDownloaded(false);
    toast.show('AI model removed from this device');
  };

  return (
    <PanelSection title="AI (on this device)">
      <Switch
        label="AI features"
        description="Catch me up summaries. The AI runs in this browser: your messages are never sent to an AI company."
        checked={enabled}
        onChange={toggle}
      />
      <Switch
        label="Smart replies"
        description="Tap-to-send suggestions above the message box for messages like “hi”, “thanks” or “where are you?” (English and Hinglish). Instant, with nothing to download."
        checked={replies}
        onChange={(value) => {
          setSmartRepliesEnabled(value);
          setReplies(value);
        }}
      />
      {engine && (
        <p className="mt-1 flex items-start gap-2 text-xs text-ink-muted">
          <Cpu className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {ENGINE_LABEL[engine]}
        </p>
      )}
      {downloaded && (
        <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={remove} className="-ml-3 mt-2">
          Remove downloaded AI model ({engine === 'webgpu' ? MODEL_INFO.size.webgpu : MODEL_INFO.size.wasm})
        </Button>
      )}
    </PanelSection>
  );
}
