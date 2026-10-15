import { useEffect, useRef, useState } from 'react';
import { SendHorizontal, Trash2 } from 'lucide-react';
import { formatDuration } from '../../utils/media.js';
import { IconButton } from '../ui/Button.jsx';

const MAX_RECORDING_MS = 15 * 60 * 1000;
const ACTIVITY_PING_MS = 4000; // keep the "recording…" indicator alive on the other side

/** Best format this browser can record (Chrome/Firefox: WebM/Opus, Safari: MP4/AAC). */
function pickMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return candidates.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) ?? '';
}

export const canRecordVoice = () => Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

/** Turn a getUserMedia error into a helpful message. */
function permissionMessage(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
    return 'Microphone access is blocked. Allow it in your browser settings to record voice messages.';
  }
  if (error?.name === 'NotFoundError') return 'No microphone was found on this device.';
  return 'Could not start recording.';
}

/**
 * Recording bar shown in place of the message box. Starts immediately; the
 * trash button discards, send stops and returns { blob, durationMs, mimeType }.
 */
export function VoiceRecorder({ onSend, onCancel, onError, onActivity }) {
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const sendOnStopRef = useRef(false);
  const startedAtRef = useRef(0);
  // Recorder events fire later, so they read the latest callbacks through refs.
  const callbacks = useRef({ onSend, onError, onActivity });
  useEffect(() => {
    callbacks.current = { onSend, onError, onActivity };
  });

  useEffect(() => {
    let stream;
    let audioContext;
    let frame;
    let tick;
    let ping;
    let cancelled = false;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch (error) {
        if (!cancelled) callbacks.current.onError(permissionMessage(error));
        return;
      }
      if (cancelled) return stream.getTracks().forEach((t) => t.stop());

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 48_000 } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => event.data.size && chunksRef.current.push(event.data);
      recorder.onstop = () => {
        const durationMs = Date.now() - startedAtRef.current;
        if (sendOnStopRef.current && chunksRef.current.length) {
          const type = recorder.mimeType || mimeType || 'audio/webm';
          callbacks.current.onSend({ blob: new Blob(chunksRef.current, { type }), durationMs, mimeType: type });
        }
      };
      recorder.start(250);
      startedAtRef.current = Date.now();
      callbacks.current.onActivity(true);
      ping = setInterval(() => callbacks.current.onActivity(true), ACTIVITY_PING_MS);

      // Input level meter.
      audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const draw = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
        setLevel(peak / 128);
        frame = requestAnimationFrame(draw);
      };
      draw();

      tick = setInterval(() => {
        const ms = Date.now() - startedAtRef.current;
        setElapsed(ms);
        if (ms >= MAX_RECORDING_MS) {
          sendOnStopRef.current = true;
          recorder.stop();
        }
      }, 200);
    })();

    return () => {
      cancelled = true;
      clearInterval(tick);
      clearInterval(ping);
      cancelAnimationFrame(frame);
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      stream?.getTracks().forEach((track) => track.stop());
      audioContext?.close();
      callbacks.current.onActivity(false);
    };
    // Runs once per recording session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopAndSend = () => {
    sendOnStopRef.current = true;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  const bars = 18;
  return (
    <div className="flex flex-1 items-center gap-3 rounded-pill border border-line bg-surface-muted px-3 py-1.5" role="status" aria-live="polite">
      <IconButton icon={Trash2} label="Discard recording" variant="danger-ghost" size="sm" onClick={onCancel} />
      <span className="size-2.5 animate-pulse rounded-full bg-danger" aria-hidden />
      <span className="w-12 font-mono text-sm text-ink tabular-nums">{formatDuration(elapsed)}</span>
      <div className="flex h-6 flex-1 items-center gap-0.5 overflow-hidden" aria-hidden>
        {Array.from({ length: bars }, (_, i) => {
          const wave = 0.35 + 0.65 * Math.abs(Math.sin((elapsed / 180 + i) * 0.9));
          return <span key={i} className="w-1 rounded-full bg-brand-400" style={{ height: `${Math.max(12, Math.min(100, level * 220 * wave))}%` }} />;
        })}
      </div>
      <span className="sr-only">Recording voice message</span>
      <IconButton icon={SendHorizontal} label="Send voice message" variant="primary" size="sm" onClick={stopAndSend} />
    </div>
  );
}
