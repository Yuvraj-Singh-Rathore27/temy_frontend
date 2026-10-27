import { useEffect, useRef } from 'react';
import { Circle, Loader2, Mic, MicOff, Phone, PhoneOff, ScreenShare, ScreenShareOff, Square, Users, Video, VideoOff, Volume2, VolumeX } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext.jsx';
import { canShareScreen } from '../../calls/CallContext.jsx';
import { canRecordCalls } from '../../calls/callRecorder.js';
import { useGroupCallActions, useGroupCallState } from '../../calls/GroupCallContext.jsx';
import { cn } from '../../utils/misc.js';
import { Avatar } from '../ui/Avatar.jsx';
import { RecordingTimer, RoundButton, VideoView } from './CallOverlay.jsx';

/** The group call: ringing card, then a grid with everyone in it. */
export function GroupCallOverlay() {
  const { call } = useGroupCallState();
  if (!call) return null;
  return call.phase === 'incoming' ? <IncomingGroupCall call={call} /> : <GroupCallScreen />;
}

function IncomingGroupCall({ call }) {
  const { joinGroupCall, declineGroupCall } = useGroupCallActions();
  const video = call.type === 'video';
  const inCall = Object.keys(call.people).length; // I'm not in it yet: everyone listed is
  return (
    <div
      role="alertdialog"
      aria-label={`Incoming group ${call.type} call in ${call.group.name}`}
      className="fixed inset-0 z-50 flex animate-fade-in items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
    >
      <div className="w-full max-w-sm rounded-3xl bg-neutral-900 p-6 text-center text-white shadow-pop">
        <div className="relative mx-auto w-fit">
          <span className="absolute inset-0 animate-ping rounded-full bg-white/20" aria-hidden />
          <Avatar user={{ ...call.group, id: call.group.id }} size="xl" className="relative" />
        </div>
        <h2 className="mt-5 truncate text-xl font-semibold">{call.group.name}</h2>
        <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-white/70">
          {video ? <Video className="size-4" aria-hidden /> : <Phone className="size-4" aria-hidden />}
          {call.startedBy.name.split(' ')[0]} is calling the group
        </p>
        <p className="mt-1 text-xs text-white/50">
          {inCall} of {call.maxParticipants} in the call
        </p>
        <div className="mt-8 flex justify-around">
          <RoundButton label="Decline" icon={PhoneOff} onClick={declineGroupCall} className="bg-danger hover:bg-red-700" withLabel />
          <RoundButton
            label="Join call"
            icon={video ? Video : Phone}
            onClick={() => joinGroupCall(call.id, call.type)}
            className="animate-bounce bg-success hover:bg-green-700 [animation-duration:1.4s]"
            withLabel
            autoFocus
          />
        </div>
      </div>
    </div>
  );
}

/** Tiles: 1 → full, 2 → side by side, 3–4 → 2×2, 5–6 → 3×2. */
const gridFor = (n) => (n <= 1 ? 'grid-cols-1' : n === 2 ? 'grid-cols-1 sm:grid-cols-2' : n <= 4 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3');

function GroupCallScreen() {
  const { user } = useAuth();
  const { call, streams, peerState, localStream, screenStream, isHost } = useGroupCallState();
  const { leaveGroupCall, toggleMute, toggleCamera, toggleSpeaker, startScreenShare, stopScreenShare, startRecording, stopRecording } = useGroupCallActions();
  const video = call.type === 'video';
  const ended = call.phase === 'ended';
  const people = Object.values(call.people);
  const recordingNow = Boolean(call.recording?.startedAt) && !ended;
  const recorder = call.recordingBy ? call.people[call.recordingBy] : null;
  const tiles = [{ id: user.id, name: 'You', avatarUrl: user.avatarUrl, me: true }, ...people];
  // Whose screen is shown big: mine, or the person sharing theirs (one at a time).
  const sharing = Boolean(call.sharing && screenStream) && !ended;
  const presenter = ended ? null : sharing ? tiles[0] : (people.find((p) => peerState[p.id]?.screen && streams[p.id]?.getVideoTracks().length) ?? null);
  const stateOf = (tile) => (tile.me ? { audio: !call.muted, video: video && !call.cameraOff, connection: 'connected' } : (peerState[tile.id] ?? {}));

  return (
    <div role="dialog" aria-label={`Group ${call.type} call in ${call.group.name}`} className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-neutral-950 text-white">
      {people.map((p) => (
        <RemoteAudio key={p.id} stream={streams[p.id]} muted={call.speakerOff} />
      ))}

      <header className="flex items-center gap-3 px-5 pt-5 pb-3">
        <Avatar user={{ ...call.group, id: call.group.id }} size="sm" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{call.group.name}</h2>
          <p className="flex items-center gap-1.5 text-sm text-white/70" aria-live="polite">
            <Users className="size-3.5" aria-hidden />
            <span data-testid="call-count">
              {tiles.length} of {call.maxParticipants}
            </span>
            {ended ? (
              <span className="font-medium text-white">· {call.endedText}</span>
            ) : people.length === 0 ? (
              <span>· Ringing the group…</span>
            ) : call.connectedAt ? (
              <span>
                · <RecordingTimer since={call.connectedAt} />
              </span>
            ) : (
              <span>· Connecting…</span>
            )}
            {isHost && !ended && <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs">Host</span>}
          </p>
        </div>
      </header>

      {recorder && !ended && (
        <p className="mx-auto mb-2 flex items-center gap-1.5 rounded-full bg-red-600/90 px-3 py-1 text-xs font-medium" aria-live="polite">
          <Circle className="size-3 animate-pulse fill-current" aria-hidden /> {recorder.name.split(' ')[0]} is recording this call
        </p>
      )}

      {presenter ? (
        // Someone shares their screen: it fills the stage, everyone else in a strip below.
        <div className="flex min-h-0 flex-1 flex-col gap-2 px-3">
          <div data-testid="screen-stage" data-person={presenter.id} className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-black">
            <VideoView stream={presenter.me ? screenStream : streams[presenter.id]} className="size-full object-contain" />
            <p className="absolute top-2 left-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs">
              <ScreenShare className="size-3.5" aria-hidden />
              {presenter.me ? "You're sharing your screen" : `${presenter.name.split(' ')[0]} is sharing their screen`}
            </p>
          </div>
          <div className="flex h-24 shrink-0 gap-2 overflow-x-auto sm:h-28">
            {tiles.map((tile) => (
              <div key={tile.id} className="aspect-video h-full shrink-0">
                <Tile person={tile} stream={tile.me ? localStream : streams[tile.id]} state={stateOf(tile)} video={video} presenting={!tile.me && tile.id === presenter.id} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className={cn('grid min-h-0 flex-1 auto-rows-fr gap-2 px-3', gridFor(tiles.length))}>
          {tiles.map((tile) => (
            <Tile key={tile.id} person={tile} stream={tile.me ? localStream : streams[tile.id]} state={stateOf(tile)} video={video} />
          ))}
        </div>
      )}

      {!ended && (
        <div className="flex flex-wrap items-center justify-center gap-3 px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:gap-5">
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
          {recordingNow && (
            <div className="flex basis-full justify-center">
              <p className="flex items-center gap-2 rounded-full bg-red-600 py-1 pr-1 pl-3 text-sm shadow-pop" role="status">
                <Circle className="size-3 animate-pulse fill-current" aria-hidden /> Recording
                <RecordingTimer since={call.recording.startedAt} />
                <span className="hidden text-white/80 sm:inline">· everyone can see this</span>
                <button type="button" onClick={stopRecording} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-neutral-900 hover:bg-white/90">
                  Stop
                </button>
              </p>
            </div>
          )}
          <RoundButton label={call.speakerOff ? 'Turn speaker on' : 'Turn speaker off'} icon={call.speakerOff ? VolumeX : Volume2} onClick={toggleSpeaker} active={call.speakerOff} />
          {video && <RoundButton label={call.cameraOff ? 'Turn camera on' : 'Turn camera off'} icon={call.cameraOff ? VideoOff : Video} onClick={toggleCamera} active={call.cameraOff} />}
          {canShareScreen && (
            <RoundButton
              label={call.sharing ? 'Stop sharing screen' : 'Share screen'}
              icon={call.sharing ? ScreenShareOff : ScreenShare}
              onClick={call.sharing ? stopScreenShare : startScreenShare}
              active={call.sharing}
            />
          )}
          {/* Only the host records; the button moves to the next person if the host leaves or drops. */}
          {canRecordCalls && people.length > 0 && (isHost || recordingNow) && (
            <RoundButton
              label={recordingNow ? 'Stop recording' : call.recording?.starting ? 'Starting recording…' : 'Record call'}
              icon={recordingNow ? Square : Circle}
              onClick={recordingNow ? stopRecording : startRecording}
              active={recordingNow}
              className={recordingNow ? 'bg-red-600 text-white hover:bg-red-700' : undefined}
            />
          )}
          <RoundButton label={call.muted ? 'Unmute' : 'Mute'} icon={call.muted ? MicOff : Mic} onClick={toggleMute} active={call.muted} />
          <RoundButton label="Leave call" icon={PhoneOff} onClick={leaveGroupCall} className="bg-danger hover:bg-red-700" />
        </div>
      )}
    </div>
  );
}

/**
 * One person: their video, or their photo when the camera is off; name and mic state on top.
 * `presenting`: their screen is on the stage, so their tile just shows who they are.
 */
function Tile({ person, stream, state, video, presenting = false }) {
  const showVideo = !presenting && stream && stream.getVideoTracks().length > 0 && ((video && state.video !== false) || state.screen);
  const connecting = !person.me && state.connection && state.connection !== 'connected';
  return (
    <div data-testid="call-tile" data-person={person.id} className="relative flex min-h-0 items-center justify-center overflow-hidden rounded-2xl bg-neutral-800">
      {showVideo ? (
        <VideoView stream={stream} className={cn('size-full', state.screen ? 'bg-black object-contain' : 'object-cover', person.me && '-scale-x-100')} />
      ) : (
        <Avatar user={person} size="lg" />
      )}
      <p className="absolute bottom-2 left-2 flex max-w-[85%] items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs">
        {state.audio === false && <MicOff className="size-3 shrink-0" aria-label="Muted" />}
        <span className="truncate">{person.name}</span>
      </p>
      {connecting && (
        <p className="absolute inset-x-0 top-2 mx-auto flex w-fit items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs">
          <Loader2 className="size-3 animate-spin" aria-hidden />
          {state.connection === 'failed' ? "Can't connect" : state.connection === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}
        </p>
      )}
    </div>
  );
}

function RemoteAudio({ stream, muted }) {
  const ref = useRef(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (element.srcObject !== (stream ?? null)) element.srcObject = stream ?? null;
    if (stream) element.play?.().catch(() => {});
  }, [stream]);
  return <audio ref={ref} autoPlay muted={muted} />;
}
