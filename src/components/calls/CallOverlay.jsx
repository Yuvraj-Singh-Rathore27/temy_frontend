import { memo, useEffect, useRef, useState } from 'react';
import { Cpu, Headphones, Mic, MicOff, Phone, PhoneOff, ScreenShare, ScreenShareOff, SwitchCamera, Video, VideoOff, Volume2, VolumeX, WifiOff } from 'lucide-react';
import { canShareScreen, useCallActions, useCallState } from '../../calls/CallContext.jsx';
import { formatDuration } from '../../utils/media.js';
import { cn } from '../../utils/misc.js';
import { Avatar } from '../ui/Avatar.jsx';

/** Incoming-call card and the full-screen call view, above everything else. */
export function CallOverlay() {
  const { call } = useCallState();
  if (!call) return null;
  return call.phase === 'incoming' ? <IncomingCall call={call} /> : <CallScreen />;
}

function IncomingCall({ call }) {
  const { acceptCall, declineCall } = useCallActions();
  const video = call.type === 'video';
  return (
    <div
      role="alertdialog"
      aria-label={`Incoming ${call.type} call from ${call.peer.name}`}
      className="fixed inset-0 z-50 flex animate-fade-in items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
    >
      <div className="w-full max-w-sm rounded-3xl bg-neutral-900 p-6 text-center text-white shadow-pop">
        <div className="relative mx-auto w-fit">
          <span className="absolute inset-0 animate-ping rounded-full bg-white/20" aria-hidden />
          <Avatar user={call.peer} size="xl" className="relative" />
        </div>
        <h2 className="mt-5 truncate text-xl font-semibold">{call.peer.name}</h2>
        <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-white/70">
          {video ? <Video className="size-4" aria-hidden /> : <Phone className="size-4" aria-hidden />}
          Incoming {video ? 'video' : 'voice'} call…
        </p>
        <div className="mt-8 flex justify-around">
          <RoundButton label="Decline" icon={PhoneOff} onClick={declineCall} className="bg-danger hover:bg-red-700" withLabel />
          <RoundButton
            label="Accept"
            icon={video ? Video : Phone}
            onClick={acceptCall}
            className="animate-bounce bg-success hover:bg-green-700 [animation-duration:1.4s]"
            withLabel
            autoFocus
          />
        </div>
      </div>
    </div>
  );
}

function CallScreen() {
  const { call, localStream, remoteStream, screenStream, canSwitchCamera, outputs, outputId } = useCallState();
  const { hangUp, toggleMute, toggleCamera, switchCamera, toggleSpeaker, startScreenShare, stopScreenShare, setOutputId } = useCallActions();
  const video = call.type === 'video';
  const active = call.phase === 'active';
  const remoteScreen = active && remoteStream && call.remote.screen;
  const showRemoteVideo = active && remoteStream && ((video && call.remote.video) || call.remote.screen);
  const sharing = call.sharing && screenStream && call.phase !== 'ended';
  const showLocalVideo = sharing || (video && localStream && call.phase !== 'ended');
  const ended = call.phase === 'ended';
  const firstName = call.peer.name.split(' ')[0];
  // Tap the video: fill the screen (cropped, like WhatsApp) or show the whole picture.
  const [fit, setFit] = useState(false);
  const whole = remoteScreen || fit;

  // Esc doesn't hang up by accident; the red button does.
  return (
    <div role="dialog" aria-label={`${video ? 'Video' : 'Voice'} call with ${call.peer.name}`} className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-neutral-950 text-white">
      <RemoteAudio stream={remoteStream} muted={call.speakerOff} sinkId={outputId} />

      {showRemoteVideo ? (
        // A shared screen is always shown whole (letterboxed) so its text stays readable.
        <button
          type="button"
          onClick={() => setFit((value) => !value)}
          disabled={Boolean(remoteScreen)}
          aria-label={whole ? 'Fill the screen with the video' : 'Show the whole video'}
          title={remoteScreen ? undefined : whole ? 'Tap to fill the screen' : 'Tap to see the whole picture'}
          className="absolute inset-0 cursor-pointer disabled:cursor-default"
        >
          <VideoView stream={remoteStream} className={cn('size-full', whole ? 'bg-black object-contain' : 'object-cover')} />
        </button>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="relative">
            {['starting', 'ringing'].includes(call.phase) && <span className="absolute inset-0 animate-ping rounded-full bg-white/15" aria-hidden />}
            <Avatar user={call.peer} size="xl" className="relative" />
          </div>
          <h2 className="max-w-full truncate text-2xl font-semibold">{call.peer.name}</h2>
          <StatusLine call={call} />
          {video && call.phase === 'active' && !call.remote.video && <p className="text-sm text-white/60">{firstName}'s camera is off</p>}
        </div>
      )}

      {showRemoteVideo && (
        <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent px-5 pt-5 pb-10">
          <h2 className="truncate text-lg font-semibold">{call.peer.name}</h2>
          <StatusLine call={call} />
        </div>
      )}

      {active && (remoteScreen || !call.remote.audio || call.network === 'poor' || call.network === 'busy') && (
        <div className="pointer-events-none absolute top-20 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 text-xs whitespace-nowrap" aria-live="polite">
          {remoteScreen && (
            <p className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1">
              <ScreenShare className="size-3.5" aria-hidden /> {firstName} is sharing their screen
            </p>
          )}
          {!call.remote.audio && (
            <p className="flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1">
              <MicOff className="size-3.5" aria-hidden /> {firstName} is muted
            </p>
          )}
          {call.network === 'poor' && (
            <p className="flex items-center gap-1.5 rounded-full bg-amber-500/90 px-3 py-1 font-medium text-neutral-950">
              <WifiOff className="size-3.5" aria-hidden /> Poor connection · video quality lowered
            </p>
          )}
          {call.network === 'busy' && (
            <p className="flex items-center gap-1.5 rounded-full bg-amber-500/90 px-3 py-1 font-medium text-neutral-950">
              <Cpu className="size-3.5" aria-hidden /> Your device is busy · video quality lowered
            </p>
          )}
        </div>
      )}

      {showLocalVideo && (
        <div className={cn('absolute top-4 right-4 overflow-hidden rounded-2xl bg-neutral-800 shadow-pop ring-1 ring-white/20', sharing ? 'aspect-video w-36 sm:w-56' : 'aspect-[3/4] w-24 sm:w-36')}>
          {sharing ? (
            // What the other person sees (not mirrored).
            <VideoView stream={screenStream} className="size-full bg-black object-contain" />
          ) : call.cameraOff ? (
            <div className="flex size-full items-center justify-center text-white/70">
              <VideoOff className="size-6" aria-label="Your camera is off" />
            </div>
          ) : (
            // Mirrored like a mirror; the other person sees it the right way round.
            <VideoView stream={localStream} muted className="size-full -scale-x-100 object-cover" />
          )}
        </div>
      )}

      {!ended && (
        <div className="relative mt-auto flex flex-wrap items-center justify-center gap-3 bg-gradient-to-t from-black/70 to-transparent px-4 pt-10 pb-[max(2rem,env(safe-area-inset-bottom))] sm:gap-5">
          {sharing && (
            <div className="flex basis-full justify-center">
              <p className="flex items-center gap-2 rounded-full bg-brand-600 py-1 pr-1 pl-3 text-sm shadow-pop" role="status">
                <ScreenShare className="size-4" aria-hidden /> You're sharing your screen
                <button type="button" onClick={stopScreenShare} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-neutral-900 hover:bg-white/90">
                  Stop
                </button>
              </p>
            </div>
          )}
          <RoundButton
            label={call.speakerOff ? 'Turn speaker on' : 'Turn speaker off'}
            icon={call.speakerOff ? VolumeX : Volume2}
            onClick={toggleSpeaker}
            active={call.speakerOff}
          />
          {outputs.length > 1 && <OutputButton outputs={outputs} outputId={outputId} onChange={setOutputId} />}
          {video && (
            <RoundButton
              label={call.cameraOff ? 'Turn camera on' : 'Turn camera off'}
              icon={call.cameraOff ? VideoOff : Video}
              onClick={toggleCamera}
              active={call.cameraOff}
            />
          )}
          {video && canSwitchCamera && !call.sharing && <RoundButton label="Switch camera" icon={SwitchCamera} onClick={switchCamera} />}
          {/* Phones' browsers can't capture the screen, so the button only appears where it works. */}
          {canShareScreen && active && (
            <RoundButton
              label={call.sharing ? 'Stop sharing screen' : 'Share screen'}
              icon={call.sharing ? ScreenShareOff : ScreenShare}
              onClick={call.sharing ? stopScreenShare : startScreenShare}
              active={call.sharing}
            />
          )}
          <RoundButton label={call.muted ? 'Unmute' : 'Mute'} icon={call.muted ? MicOff : Mic} onClick={toggleMute} active={call.muted} />
          <RoundButton label="End call" icon={PhoneOff} onClick={hangUp} className="bg-danger hover:bg-red-700" />
        </div>
      )}
    </div>
  );
}

/** Cycle through speakers / headphones (browsers that support choosing the audio output). */
function OutputButton({ outputs, outputId, onChange }) {
  const index = Math.max(0, outputs.findIndex((device) => device.deviceId === outputId));
  const current = outputs[index];
  const next = outputs[(index + 1) % outputs.length];
  return (
    <RoundButton
      label={`Audio output: ${current.label || 'Default'} (switch to ${next.label || 'next device'})`}
      icon={Headphones}
      onClick={() => onChange(next.deviceId)}
    />
  );
}

function StatusLine({ call }) {
  let text;
  if (call.phase === 'ended') text = call.endedText;
  else if (call.reconnecting) text = 'Reconnecting…';
  else if (call.phase === 'starting') text = 'Calling…';
  else if (call.phase === 'ringing') text = 'Ringing…';
  else if (call.phase === 'connecting') text = 'Connecting…';
  if (call.phase === 'active' && !call.reconnecting) return <CallTimer since={call.connectedAt} />;
  return (
    <p className={cn('text-sm', call.phase === 'ended' ? 'font-medium text-white' : 'text-white/70')} aria-live="polite">
      {text}
    </p>
  );
}

function CallTimer({ since }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <p className="text-sm text-white/80 tabular-nums">{formatDuration(Math.max(0, now - since))}</p>;
}

const RoundButton = memo(function RoundButton({ label, icon: Icon, onClick, active = false, className, withLabel = false, autoFocus }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        title={label}
        aria-pressed={active || undefined}
        autoFocus={autoFocus}
        className={cn(
          'flex size-14 items-center justify-center rounded-full transition-colors focus-visible:ring-4 focus-visible:ring-white/40 focus-visible:outline-none',
          className ?? (active ? 'bg-white text-neutral-900 hover:bg-white/90' : 'bg-white/15 text-white hover:bg-white/25'),
        )}
      >
        <Icon className="size-6" aria-hidden />
      </button>
      {withLabel && <span className="text-xs text-white/80">{label}</span>}
    </div>
  );
});

function VideoView({ stream, muted = true, className }) {
  const ref = useRef(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    if (element.srcObject !== stream) element.srcObject = stream;
    // A video track can arrive later (screen sharing in a voice call): reattach so it shows.
    const reattach = () => {
      element.srcObject = null;
      element.srcObject = stream;
    };
    stream?.addEventListener('addtrack', reattach);
    return () => stream?.removeEventListener('addtrack', reattach);
  }, [stream]);
  // Video elements stay muted: the other person's sound plays through <RemoteAudio>.
  return <video ref={ref} autoPlay playsInline muted={muted} className={className} />;
}

function RemoteAudio({ stream, muted, sinkId }) {
  const ref = useRef(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (element.srcObject !== stream) element.srcObject = stream;
    if (stream) element.play?.().catch(() => {});
  }, [stream]);
  useEffect(() => {
    if (sinkId && ref.current?.setSinkId) ref.current.setSinkId(sinkId).catch(() => {});
  }, [sinkId]);
  return <audio ref={ref} autoPlay muted={muted} />;
}
