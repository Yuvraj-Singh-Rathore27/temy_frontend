import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { callsApi, recordingsApi } from '../api/endpoints.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useChatActions } from '../chat/ChatContext.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { showSystemNotification } from '../utils/notify.js';
import { canShareScreen, mediaErrorMessage } from './CallContext.jsx';
import { pickMimeType, startCallRecorder } from './callRecorder.js';
import { createChunkUploader } from './chunkUploader.js';
import { startTone } from './tones.js';

/**
 * Group voice/video calls in group chats (up to 6 people). Mesh: this browser keeps one
 * WebRTC connection to every other person in the call; the server only rings the group
 * and relays signalling. Whoever joins sends an offer to everyone already there.
 *
 * `call` (null when not in or being rung for a group call):
 * { id, conversationId, type, group: { id, name, avatarUrl }, startedBy, hostId, maxParticipants,
 *   phase: 'incoming'|'joining'|'active'|'ended', endedText, connectedAt,
 *   people: { [userId]: { id, name, avatarUrl } }  (everyone else in the call),
 *   muted, cameraOff, speakerOff, sharing (my screen),
 *   recording: null | { starting } | { id, startedAt }  (I record; only the host can),
 *   recordingBy: userId | null  (someone else records) }
 * `streams`: { [userId]: MediaStream }, `peerState`: { [userId]: { audio, video, screen, connection } }
 * `activeCalls`: { [conversationId]: call payload } for every group call going on in my groups.
 *
 * Screen sharing (one person at a time; starting it stops anyone else's): the screen is sent to
 * everyone as the video track. In a video call it takes the camera's place (no renegotiation);
 * in a voice call a video track is added to each connection once and renegotiated. Someone who
 * joins while I share gets the screen too. While sharing, `video` stays true in the state I send,
 * so apps that don't know `screen` yet still show it.
 */
const StateContext = createContext(null);
const ActionsContext = createContext(null);

const ENDED_SCREEN_MS = 1800;

/** Smaller video than one-to-one calls: everyone sends to everyone. */
function getMedia(type) {
  if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
    return Promise.reject(new Error('Calls need a modern browser and a secure connection (HTTPS or localhost).'));
  }
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: type === 'video' ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 30 } } : false,
  });
}

/** Video bitrate per connection: the upload is shared by everyone I send to. */
const bitrateFor = (others) => Math.max(250_000, Math.min(1_200_000, Math.round(2_000_000 / Math.max(1, others))));

async function tuneVideo(pc, others) {
  for (const sender of pc.getSenders()) {
    if (sender.track?.kind !== 'video' || !sender.getParameters) continue;
    const params = sender.getParameters();
    if (!params.encodings?.length) continue;
    for (const encoding of params.encodings) Object.assign(encoding, { maxBitrate: bitrateFor(others), maxFramerate: 24 });
    await sender.setParameters(params).catch(() => {});
  }
}

const toPeople = (participants, me) => Object.fromEntries(participants.filter((p) => p.id !== me).map((p) => [p.id, { id: p.id, name: p.name, avatarUrl: p.avatarUrl }]));

export function GroupCallProvider({ children }) {
  const { subscribe, emitSocket } = useChatActions();
  const { user } = useAuth();
  const toast = useToast();
  const [call, setCallState] = useState(null);
  const [streams, setStreams] = useState({});
  const [peerState, setPeerState] = useState({});
  const [localStream, setLocalStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null); // my shared screen, for my own tile
  const [activeCalls, setActiveCalls] = useState({});

  const meRef = useRef(user?.id);
  meRef.current = user?.id;
  const activeCallsRef = useRef(activeCalls);
  activeCallsRef.current = activeCalls;
  const callRef = useRef(null);
  const localRef = useRef(null);
  const peersRef = useRef(new Map()); // userId -> { pc, pending: [], queue, initiator, restarted, screenSender, screenSent, offerAgain }
  const screenRef = useRef(null); // the screen track while I share
  const stopShareRef = useRef(null);
  // The call I'm in for real: my join or start went through and my camera/mic are on.
  const enteredRef = useRef(null);
  // Signalling that reached me before that (kept in order, handled once I'm in).
  const earlySignalsRef = useRef([]);
  const streamsRef = useRef({});
  const iceServersRef = useRef([]);
  const stopToneRef = useRef(null);
  const closeTimer = useRef(null);
  const recordingRef = useRef(null);
  const stopRecordingRef = useRef(null);

  /**
   * Update `call` (patch: object or call => object; null clears). The ref is updated right away,
   * so socket events arriving in the same moment see the new state: once a call has ended
   * (or was cleared), late updates about it can't bring the call screen back.
   */
  const setCall = useCallback((patch) => {
    const current = callRef.current;
    let next;
    if (patch === null) next = null;
    else if (typeof patch === 'function') next = current ? { ...current, ...patch(current) } : null;
    else next = current ? { ...current, ...patch } : patch;
    callRef.current = next;
    setCallState(next);
  }, []);

  const playTone = useCallback((kind) => {
    stopToneRef.current?.();
    stopToneRef.current = kind ? startTone(kind) : null;
  }, []);

  const setStream = useCallback((userId, stream) => {
    streamsRef.current = { ...streamsRef.current };
    if (stream) streamsRef.current[userId] = stream;
    else delete streamsRef.current[userId];
    setStreams(streamsRef.current);
  }, []);

  const patchPeer = useCallback((userId, patch) => {
    setPeerState((current) => (patch === null ? Object.fromEntries(Object.entries(current).filter(([id]) => Number(id) !== userId)) : { ...current, [userId]: { ...current[userId], ...patch } }));
  }, []);

  const signal = useCallback(
    (to, data) => {
      const id = callRef.current?.id;
      if (id) emitSocket('groupcall:signal', { callId: id, to, data }).catch(() => {});
    },
    [emitSocket],
  );

  const sendStateTo = useCallback(
    (to) => {
      const current = callRef.current;
      if (!current) return;
      const sharing = Boolean(screenRef.current);
      signal(to, { type: 'state', audio: !current.muted, video: (current.type === 'video' && !current.cameraOff) || sharing, screen: sharing });
    },
    [signal],
  );

  /** Send a new offer to `userId` (later, if one is already under way). */
  const renegotiate = useCallback(
    async (userId, peer) => {
      if (peer.pc.signalingState !== 'stable') {
        peer.offerAgain = true;
        return;
      }
      peer.offerAgain = false;
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      signal(userId, { type: 'offer', sdp: offer.sdp });
    },
    [signal],
  );

  /** Start sending my screen to one person (once their connection is up). */
  const sendScreenTo = useCallback(
    async (userId, peer) => {
      const screen = screenRef.current;
      if (!screen || peer.screenSent) return;
      peer.screenSent = true;
      const { pc } = peer;
      const camera = pc.getSenders().find((sender) => sender.track?.kind === 'video' && sender !== peer.screenSender);
      if (camera) {
        await camera.replaceTrack(screen); // video call: the screen takes the camera's place
      } else if (peer.screenSender) {
        await peer.screenSender.replaceTrack(screen); // voice call, shared before
      } else {
        peer.screenSender = pc.addTrack(screen, localRef.current); // voice call: add video once
        await renegotiate(userId, peer);
      }
      tuneVideo(pc, peersRef.current.size);
    },
    [renegotiate],
  );

  const retune = useCallback(() => {
    const others = peersRef.current.size;
    for (const { pc } of peersRef.current.values()) tuneVideo(pc, others);
  }, []);

  const closePeer = useCallback(
    (userId) => {
      const peer = peersRef.current.get(userId);
      if (!peer) return;
      peer.pc.onconnectionstatechange = null;
      peer.pc.close();
      peersRef.current.delete(userId);
      setStream(userId, null);
      patchPeer(userId, null);
      retune();
    },
    [setStream, patchPeer, retune],
  );

  /** One connection to `userId`. The newcomer (initiator) sends the offer. */
  const createPeer = useCallback(
    (userId, initiator) => {
      const existing = peersRef.current.get(userId);
      if (existing) return existing;
      const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
      const peer = { pc, pending: [], queue: Promise.resolve(), initiator, restarted: false, screenSender: null, screenSent: false, offerAgain: false };
      peersRef.current.set(userId, peer);
      const stream = localRef.current;
      for (const track of stream?.getTracks() ?? []) pc.addTrack(track, stream);
      patchPeer(userId, { connection: 'connecting', audio: true, video: callRef.current?.type === 'video' });

      pc.ontrack = (event) => {
        setStream(userId, event.streams[0] ?? new MediaStream([event.track]));
        recordingRef.current?.recorder.refresh();
      };
      pc.onicecandidate = (event) => {
        if (event.candidate) signal(userId, { type: 'candidate', candidate: event.candidate.toJSON() });
      };
      pc.onconnectionstatechange = () => {
        if (peersRef.current.get(userId)?.pc !== pc) return;
        const state = pc.connectionState;
        if (state === 'connected') {
          peer.restarted = false;
          patchPeer(userId, { connection: 'connected' });
          setCall((current) => (current.connectedAt ? {} : { connectedAt: Date.now(), phase: 'active' }));
          tuneVideo(pc, peersRef.current.size);
          sendStateTo(userId);
          // I'm sharing my screen: they joined meanwhile, so they get it now.
          sendScreenTo(userId, peer).catch(() => {});
        } else if (state === 'disconnected') {
          patchPeer(userId, { connection: 'reconnecting' });
        } else if (state === 'failed') {
          if (peer.initiator && !peer.restarted) {
            peer.restarted = true;
            patchPeer(userId, { connection: 'reconnecting' });
            pc.createOffer({ iceRestart: true })
              .then((offer) => pc.setLocalDescription(offer).then(() => signal(userId, { type: 'offer', sdp: offer.sdp })))
              .catch(() => {});
          } else {
            patchPeer(userId, { connection: 'failed' });
          }
        }
      };
      if (initiator) {
        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer).then(() => signal(userId, { type: 'offer', sdp: offer.sdp })))
          .catch(() => patchPeer(userId, { connection: 'failed' }));
      }
      retune();
      return peer;
    },
    [patchPeer, setStream, signal, setCall, sendStateTo, sendScreenTo, retune],
  );

  const handleSignal = useCallback(
    async ({ from, data }) => {
      const peer = peersRef.current.get(from) ?? createPeer(from, false);
      const { pc } = peer;
      if (data.type === 'offer') {
        // Both sides sent an offer at once (e.g. both started sharing): the one with the lower
        // id gives way and sends its own again afterwards; the other ignores the incoming one.
        if (pc.signalingState === 'have-local-offer') {
          if (meRef.current > from) return;
          await pc.setLocalDescription({ type: 'rollback' });
          peer.offerAgain = true;
        }
        await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
        for (const candidate of peer.pending.splice(0)) await pc.addIceCandidate(candidate).catch(() => {});
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signal(from, { type: 'answer', sdp: answer.sdp });
        if (peer.offerAgain) await renegotiate(from, peer);
      } else if (data.type === 'answer') {
        if (pc.signalingState !== 'have-local-offer') return; // an answer to an offer that was given up
        await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
        for (const candidate of peer.pending.splice(0)) await pc.addIceCandidate(candidate).catch(() => {});
        if (peer.offerAgain) await renegotiate(from, peer);
      } else if (data.type === 'candidate') {
        if (pc.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {});
        else peer.pending.push(data.candidate);
      } else if (data.type === 'state') {
        patchPeer(from, { audio: data.audio, video: data.video, screen: Boolean(data.screen) });
        // Someone else started sharing: one screen at a time, so mine stops.
        if (data.screen && screenRef.current) {
          stopShareRef.current?.();
          toast.show(`${callRef.current?.people?.[from]?.name?.split(' ')[0] ?? 'Someone'} is sharing their screen now, so yours stopped`);
        }
      }
    },
    [createPeer, signal, patchPeer, renegotiate, toast],
  );

  /** Close every connection and release camera/microphone. */
  const teardown = useCallback(() => {
    playTone(null);
    enteredRef.current = null;
    earlySignalsRef.current = [];
    stopRecordingRef.current?.();
    for (const userId of [...peersRef.current.keys()]) {
      const { pc } = peersRef.current.get(userId);
      pc.onconnectionstatechange = null;
      pc.close();
    }
    peersRef.current.clear();
    for (const track of localRef.current?.getTracks() ?? []) track.stop();
    localRef.current = null;
    setLocalStream(null);
    if (screenRef.current) {
      screenRef.current.onended = null;
      screenRef.current.stop();
      screenRef.current = null;
    }
    setScreenStream(null);
    streamsRef.current = {};
    setStreams({});
    setPeerState({});
  }, [playTone]);

  const finish = useCallback(
    (text) => {
      teardown();
      clearTimeout(closeTimer.current);
      if (!text) {
        setCall(null);
        return;
      }
      setCall({ phase: 'ended', endedText: text });
      closeTimer.current = setTimeout(() => setCall(null), ENDED_SCREEN_MS);
    },
    [teardown, setCall],
  );

  const acquireMedia = useCallback(async (type) => {
    const stream = await getMedia(type);
    localRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  /** Hand a signal to its connection (made now when they reach out first). */
  const routeSignal = useCallback(
    (payload) => {
      const peer = peersRef.current.get(payload.from) ?? createPeer(payload.from, false);
      peer.queue = peer.queue.then(() => handleSignal(payload)).catch(() => {});
    },
    [createPeer, handleSignal],
  );

  /** Take over the call the server sent (after start or join) and connect to everyone in it. */
  const enter = useCallback(
    (payload, iceServers, { offerToEveryone }) => {
      iceServersRef.current = iceServers;
      enteredRef.current = payload.id;
      const me = meRef.current;
      setCall({
        id: payload.id,
        conversationId: payload.conversationId,
        type: payload.type,
        group: payload.group,
        startedBy: payload.startedBy,
        hostId: payload.hostId,
        maxParticipants: payload.maxParticipants,
        phase: payload.participants.length > 1 ? 'joining' : 'active',
        people: toPeople(payload.participants, me),
        connectedAt: null,
        muted: false,
        cameraOff: false,
        speakerOff: false,
        sharing: false,
        recording: null,
        recordingBy: null,
      });
      if (offerToEveryone) {
        // I send the offer to everyone who was there before me; anyone who joined after me
        // (they can be in this list already) sends theirs to me.
        const myJoin = payload.participants.find((p) => p.id === me)?.joinedAt;
        for (const p of payload.participants) {
          if (p.id !== me && !(myJoin && p.joinedAt > myJoin)) createPeer(p.id, true);
        }
      }
      // Now the signalling that arrived while my join was still going through.
      for (const early of earlySignalsRef.current.splice(0)) if (early.callId === payload.id) routeSignal(early);
    },
    [setCall, createPeer, routeSignal],
  );

  // ---------- actions ----------

  const inCall = () => callRef.current && callRef.current.phase !== 'ended' && callRef.current.phase !== 'incoming';

  /** Join a call going on in a group (from the ringing card or the "Join" button). */
  const joinGroupCall = useCallback(
    async (callId, type) => {
      if (inCall()) {
        toast.error('Leave your current call first');
        return;
      }
      clearTimeout(closeTimer.current);
      playTone(null);
      const ringing = callRef.current;
      setCall(ringing?.id === callId ? { phase: 'joining' } : null);
      // Already full as far as we know: say so before turning the camera on (the server still has the final say).
      const known = Object.values(activeCallsRef.current).find((c) => c.id === callId);
      if (known && known.participants.length >= known.maxParticipants) {
        finish(null);
        toast.error(`This call is full (${known.maxParticipants} people)`);
        return;
      }
      try {
        await acquireMedia(type);
        const { call: payload, iceServers } = await emitSocket('groupcall:join', { callId });
        enter(payload, iceServers, { offerToEveryone: true });
      } catch (error) {
        finish(null);
        toast.error(error.code ? error.message : mediaErrorMessage(error, type));
      }
    },
    [toast, playTone, setCall, acquireMedia, emitSocket, enter, finish],
  );

  /** Call the whole group. If a call is already going on there, join it instead. */
  const startGroupCall = useCallback(
    async ({ conversationId, type }) => {
      if (inCall()) {
        toast.error('Finish your current call first');
        return;
      }
      clearTimeout(closeTimer.current);
      setCall(null);
      try {
        await acquireMedia(type);
        const { call: payload, iceServers } = await emitSocket('groupcall:start', { conversationId, type });
        enter(payload, iceServers, { offerToEveryone: false });
      } catch (error) {
        if (error.code === 'CALL_IN_PROGRESS' && error.details?.callId) {
          for (const track of localRef.current?.getTracks() ?? []) track.stop();
          localRef.current = null;
          return joinGroupCall(error.details.callId, type);
        }
        finish(null);
        toast.error(error.code ? error.message : mediaErrorMessage(error, type));
      }
    },
    [toast, setCall, acquireMedia, emitSocket, enter, finish, joinGroupCall],
  );

  const declineGroupCall = useCallback(() => {
    const current = callRef.current;
    if (current?.phase !== 'incoming') return;
    emitSocket('groupcall:decline', { callId: current.id }).catch(() => {});
    finish(null);
  }, [emitSocket, finish]);

  const leaveGroupCall = useCallback(() => {
    const current = callRef.current;
    if (!current || current.phase === 'ended' || current.phase === 'incoming') return;
    emitSocket('groupcall:leave', { callId: current.id }).catch(() => {});
    finish('You left the call');
  }, [emitSocket, finish]);

  const toggleMute = useCallback(() => {
    const track = localRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    callRef.current = { ...callRef.current, muted: !track.enabled };
    setCall({ muted: !track.enabled });
    for (const userId of peersRef.current.keys()) sendStateTo(userId);
  }, [setCall, sendStateTo]);

  const toggleCamera = useCallback(() => {
    const track = localRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    callRef.current = { ...callRef.current, cameraOff: !track.enabled };
    setCall({ cameraOff: !track.enabled });
    for (const userId of peersRef.current.keys()) sendStateTo(userId);
  }, [setCall, sendStateTo]);

  const toggleSpeaker = useCallback(() => setCall((current) => ({ speakerOff: !current.speakerOff })), [setCall]);

  // ---------- screen sharing ----------

  /** Stop sharing: the camera comes back (video call) or nothing is sent on the screen's track (voice call). */
  const stopScreenShare = useCallback(async () => {
    const screen = screenRef.current;
    if (!screen) return;
    screenRef.current = null;
    screen.onended = null;
    screen.stop();
    setScreenStream(null);
    setCall((current) => (current.sharing ? { sharing: false } : {}));
    const camera = localRef.current?.getVideoTracks()[0] ?? null;
    await Promise.all(
      [...peersRef.current.values()].map(async (peer) => {
        peer.screenSent = false;
        // Voice call: the screen's track stays, empty, ready for the next share (no renegotiation).
        if (peer.screenSender) await peer.screenSender.replaceTrack(null).catch(() => {});
        else await peer.pc.getSenders().find((sender) => sender.track === screen)?.replaceTrack(camera).catch(() => {});
      }),
    );
    for (const userId of peersRef.current.keys()) sendStateTo(userId);
  }, [setCall, sendStateTo]);
  stopShareRef.current = stopScreenShare;

  /** Share a screen, window or tab with everyone in the call (the browser asks which). */
  const startScreenShare = useCallback(async () => {
    const current = callRef.current;
    if (!current || current.phase === 'ended' || current.phase === 'incoming' || screenRef.current) return;
    if (!canShareScreen) {
      toast.error("This browser can't share the screen. Use Vestige Chat on a computer (Chrome, Edge, Firefox or Safari).");
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: false });
    } catch (error) {
      if (error?.name !== 'NotAllowedError' && error?.name !== 'AbortError') toast.error('Could not share your screen');
      return; // NotAllowedError: the person closed the picker
    }
    const [screen] = stream.getVideoTracks();
    const still = callRef.current;
    if (!screen || still?.id !== current.id || still.phase === 'ended' || screenRef.current) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }
    screen.contentHint = 'detail'; // keep text sharp rather than motion smooth
    screenRef.current = screen;
    screen.onended = () => stopShareRef.current?.(); // the browser's own "Stop sharing" button
    setScreenStream(new MediaStream([screen]));
    setCall({ sharing: true });
    await Promise.all(
      [...peersRef.current]
        .filter(([, peer]) => peer.pc.connectionState === 'connected')
        .map(([userId, peer]) => sendScreenTo(userId, peer).catch(() => {})),
    );
    for (const userId of peersRef.current.keys()) sendStateTo(userId);
  }, [toast, setCall, sendScreenTo, sendStateTo]);

  // ---------- recording (host only) ----------

  const stopRecording = useCallback(async () => {
    const active = recordingRef.current;
    if (!active) return;
    recordingRef.current = null;
    setCall((current) => (current.recording ? { recording: null } : {}));
    try {
      await active.recorder.stop();
      await active.uploader.drain();
      await recordingsApi.finish(active.id, Date.now() - active.startedAt);
      toast.show(active.uploader.state.failed ? 'Part of the recording could not be uploaded. What arrived is saved in the chat.' : 'Call recording saved in the chat');
    } catch {
      toast.error('The recording could not be saved');
    }
  }, [setCall, toast]);
  stopRecordingRef.current = stopRecording;

  const startRecording = useCallback(async () => {
    const current = callRef.current;
    if (!current || current.phase === 'ended' || current.phase === 'incoming' || recordingRef.current || current.recording) return;
    if (current.hostId !== meRef.current) {
      toast.error('Only the host of the call can record it');
      return;
    }
    const kind = current.type === 'video' ? 'video' : 'audio';
    const mimeType = pickMimeType(kind);
    if (!mimeType) {
      toast.error("This browser can't record calls. Try Chrome, Edge or Firefox.");
      return;
    }
    setCall({ recording: { starting: true } });
    try {
      const { recording } = await recordingsApi.start(current.id, { kind, mimeType });
      const uploader = createChunkUploader((seq, blob) => recordingsApi.uploadChunk(recording.id, seq, blob));
      const recorder = startCallRecorder({
        kind,
        mimeType,
        getLocal: () => localRef.current,
        getRemotes: () =>
          Object.values(callRef.current?.people ?? {}).map((p) => ({ id: p.id, name: p.name, stream: streamsRef.current[p.id] ?? null })),
        onChunk: (blob) => {
          uploader.push(blob);
          if (uploader.state.failed && recordingRef.current?.id === recording.id) stopRecording();
        },
      });
      const startedAt = Date.now();
      recordingRef.current = { id: recording.id, recorder, uploader, startedAt };
      setCall({ recording: { id: recording.id, startedAt } });
    } catch (error) {
      setCall({ recording: null });
      toast.error(error.message || 'Could not start recording');
    }
  }, [setCall, toast, stopRecording]);

  // ---------- server events ----------

  // Calls going on in my groups: loaded on every (re)connection, so ones that ended while I was offline disappear.
  useEffect(() => {
    const load = () =>
      callsApi
        .active()
        .then(({ calls }) => setActiveCalls(Object.fromEntries(calls.map((c) => [c.conversationId, c]))))
        .catch(() => {});
    load();
    return subscribe('session:ready', load);
  }, [subscribe]);

  useEffect(() => {
    // The call I'm in or being rung for; after it ended on my side, its updates are ignored.
    const mine = (callId) => callRef.current?.id === callId && callRef.current.phase !== 'ended';
    const unsubscribers = [
      subscribe('groupcall:updated', ({ call: payload }) => {
        setActiveCalls((current) => ({ ...current, [payload.conversationId]: payload }));
        if (mine(payload.id) && callRef.current.phase !== 'incoming') {
          setCall({ hostId: payload.hostId, people: toPeople(payload.participants, meRef.current) });
        }
      }),
      subscribe('groupcall:incoming', ({ call: payload, iceServers }) => {
        setActiveCalls((current) => ({ ...current, [payload.conversationId]: payload }));
        if (callRef.current && callRef.current.phase !== 'ended') return; // busy here
        clearTimeout(closeTimer.current);
        iceServersRef.current = iceServers;
        setCall(null);
        setCall({
          id: payload.id,
          conversationId: payload.conversationId,
          type: payload.type,
          group: payload.group,
          startedBy: payload.startedBy,
          hostId: payload.hostId,
          maxParticipants: payload.maxParticipants,
          phase: 'incoming',
          people: toPeople(payload.participants, meRef.current),
        });
        playTone('ring');
        if (document.hidden) {
          showSystemNotification({
            title: payload.group.name,
            body: `${payload.startedBy.name} is calling the group (${payload.type})`,
            tag: `groupcall-${payload.id}`,
            url: `/c/${payload.conversationId}`,
          }).catch(() => {});
        }
      }),
      subscribe('groupcall:handled', ({ callId }) => {
        if (mine(callId) && callRef.current.phase === 'incoming') finish(null);
      }),
      subscribe('groupcall:joined', ({ callId, participant }) => {
        if (!mine(callId) || participant.id === meRef.current) return;
        setCall((current) => ({ people: { ...current.people, [participant.id]: { id: participant.id, name: participant.name, avatarUrl: participant.avatarUrl } } }));
        // They will send the offer. Only once I'm in the call myself: while my own join is still
        // under way (camera starting), a connection made now would have no camera/mic and would
        // wait for an offer that never comes; my join's answer lists them and I connect then.
        if (enteredRef.current === callId) createPeer(participant.id, false);
      }),
      subscribe('groupcall:left', ({ callId, userId }) => {
        if (!mine(callId)) return;
        if (userId === meRef.current) {
          if (callRef.current.phase !== 'ended') finish('You left the call'); // e.g. on another tab
          return;
        }
        closePeer(userId);
        setCall((current) => {
          const people = { ...current.people };
          delete people[userId];
          return { people, recordingBy: current.recordingBy === userId ? null : current.recordingBy };
        });
      }),
      subscribe('groupcall:host', ({ callId, hostId, previousHostId }) => {
        if (!mine(callId)) return;
        setCall((current) => ({ hostId, recordingBy: current.recordingBy === previousHostId ? null : current.recordingBy }));
        if (previousHostId === meRef.current && recordingRef.current) stopRecordingRef.current?.();
        if (hostId === meRef.current) toast.show('You are now the host of this call and can record it');
      }),
      subscribe('groupcall:resumed', ({ callId, hostId, call: payload }) => {
        if (!mine(callId)) return;
        setCall({ hostId, people: toPeople(payload.participants, meRef.current) });
        if (hostId !== meRef.current && recordingRef.current) {
          stopRecordingRef.current?.();
          toast.show('Your connection dropped, so the host role moved on. Your recording so far is saved.');
        }
      }),
      subscribe('groupcall:signal', (payload) => {
        if (!mine(payload.callId)) return;
        // Before my own join went through (e.g. "I'm sharing my screen" from someone the server
        // already told about me), a connection made now would wait for an offer from them while
        // they wait for mine: keep it until I'm in.
        if (enteredRef.current !== payload.callId) {
          earlySignalsRef.current.push(payload);
          return;
        }
        routeSignal(payload);
      }),
      subscribe('groupcall:ended', ({ callId, conversationId }) => {
        setActiveCalls((current) => {
          if (current[conversationId]?.id !== callId) return current;
          const next = { ...current };
          delete next[conversationId];
          return next;
        });
        if (mine(callId) && callRef.current.phase !== 'ended') finish(callRef.current.phase === 'incoming' ? null : 'Call ended');
      }),
      subscribe('call:recording', ({ callId, userId, recording }) => {
        if (!mine(callId)) return;
        setCall({ recordingBy: recording ? userId : null });
        if (recording) toast.show(`${callRef.current.people?.[userId]?.name?.split(' ')[0] ?? 'Someone'} started recording this call`);
      }),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [subscribe, setCall, playTone, finish, createPeer, closePeer, routeSignal, toast]);

  // Closing or reloading the tab leaves the call.
  useEffect(() => {
    const leave = () => {
      const current = callRef.current;
      if (current?.id && current.phase !== 'ended' && current.phase !== 'incoming') emitSocket('groupcall:leave', { callId: current.id }).catch(() => {});
    };
    window.addEventListener('pagehide', leave);
    return () => {
      window.removeEventListener('pagehide', leave);
      leave();
      teardown();
      clearTimeout(closeTimer.current);
    };
  }, [emitSocket, teardown]);

  const state = useMemo(
    () => ({ call, streams, peerState, localStream, screenStream, activeCalls, isHost: Boolean(call && call.hostId === user?.id) }),
    [call, streams, peerState, localStream, screenStream, activeCalls, user?.id],
  );
  const actions = useMemo(
    () => ({
      startGroupCall,
      joinGroupCall,
      declineGroupCall,
      leaveGroupCall,
      toggleMute,
      toggleCamera,
      toggleSpeaker,
      startScreenShare,
      stopScreenShare,
      startRecording,
      stopRecording: () => stopRecording(),
    }),
    [startGroupCall, joinGroupCall, declineGroupCall, leaveGroupCall, toggleMute, toggleCamera, toggleSpeaker, startScreenShare, stopScreenShare, startRecording, stopRecording],
  );

  return (
    <ActionsContext.Provider value={actions}>
      <StateContext.Provider value={state}>{children}</StateContext.Provider>
    </ActionsContext.Provider>
  );
}

export function useGroupCallState() {
  const state = useContext(StateContext);
  if (!state) throw new Error('useGroupCallState must be used inside <GroupCallProvider>');
  return state;
}

export function useGroupCallActions() {
  const actions = useContext(ActionsContext);
  if (!actions) throw new Error('useGroupCallActions must be used inside <GroupCallProvider>');
  return actions;
}
