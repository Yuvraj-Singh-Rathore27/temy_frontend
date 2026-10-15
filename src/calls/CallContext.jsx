import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useChatActions } from '../chat/ChatContext.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { showSystemNotification } from '../utils/notify.js';
import { startTone } from './tones.js';

/**
 * One-to-one voice/video calls with WebRTC. The server only rings and relays
 * signalling (offer / answer / ICE candidates); audio and video go directly
 * between the two browsers, encrypted with DTLS-SRTP.
 *
 * `call` (null when idle):
 * { id, type: 'voice'|'video', conversationId, peer: { id, name, avatarUrl },
 *   direction: 'outgoing'|'incoming',
 *   phase: 'starting'|'ringing'|'incoming'|'connecting'|'active'|'ended',
 *   connectedAt, reconnecting, endedText,
 *   muted, cameraOff, speakerOff, sharing, network: 'good'|'poor'|'busy',
 *   remote: { audio, video, screen } }
 *
 * Screen sharing sends the screen as the video track: in a video call it replaces
 * the camera (no renegotiation); in a voice call a video track is added once and
 * the connection renegotiated. Phones' browsers can't capture the screen, but
 * they can watch someone else's.
 */
const CallStateContext = createContext(null);
const CallActionsContext = createContext(null);

const ENDED_SCREEN_MS = 1800;

function mediaErrorMessage(error, type) {
  const what = type === 'video' ? 'camera and microphone' : 'microphone';
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return `Allow access to your ${what} to make calls (click the camera icon in the address bar).`;
    case 'NotFoundError':
    case 'OverconstrainedError':
      return `No ${what} found on this device.`;
    case 'NotReadableError':
      return `Your ${what} is being used by another app.`;
    default:
      return error?.message || 'Could not start the call';
  }
}

/** Can this browser share its screen? (Desktop browsers yes; Android/iPhone browsers no.) */
export const canShareScreen = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getDisplayMedia);

function getMedia(type) {
  if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
    return Promise.reject(new Error('Calls need a modern browser and a secure connection (HTTPS or localhost).'));
  }
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: type === 'video' ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } } : false,
  });
}

// How video is sent. Without limits the browser starts low and guesses, and under
// pressure it drops resolution first (blurry). Camera: up to 2.5 Mbit/s, lowering
// resolution and frame rate together; screen: keep the resolution so text stays sharp.
const VIDEO_SETTINGS = {
  camera: { maxBitrate: 2_500_000, maxFramerate: 30, degradationPreference: 'balanced' },
  screen: { maxBitrate: 2_500_000, maxFramerate: 30, degradationPreference: 'maintain-resolution' },
};

/** Apply VIDEO_SETTINGS[kind] to a video sender (best effort: browsers differ in what they allow). */
async function tuneSender(sender, kind) {
  if (!sender?.getParameters || !sender.setParameters) return;
  const { maxBitrate, maxFramerate, degradationPreference } = VIDEO_SETTINGS[kind];
  const params = sender.getParameters();
  if (!params.encodings?.length) return; // not negotiated yet: tuned again once connected
  for (const encoding of params.encodings) Object.assign(encoding, { maxBitrate, maxFramerate });
  try {
    await sender.setParameters({ ...params, degradationPreference });
  } catch {
    await sender.setParameters(params).catch(() => {}); // degradationPreference not supported here
  }
}

/** Poor connection / busy device, from WebRTC statistics (sampled every 2 s). */
const POLL_MS = 2000;
async function sampleNetwork(pc, previous) {
  const stats = await pc.getStats();
  let lost = 0;
  let received = 0;
  let rtt = null;
  let limitation = 'none';
  stats.forEach((report) => {
    if (report.type === 'inbound-rtp') {
      lost += report.packetsLost ?? 0;
      received += report.packetsReceived ?? 0;
    } else if (report.type === 'candidate-pair' && report.nominated && report.state === 'succeeded') {
      rtt = report.currentRoundTripTime ?? rtt;
    } else if (report.type === 'outbound-rtp' && report.kind === 'video' && report.framesSent) {
      limitation = report.qualityLimitationReason ?? 'none';
    }
  });
  const newLost = Math.max(0, lost - (previous?.lost ?? lost));
  const newReceived = Math.max(0, received - (previous?.received ?? received));
  const lossRate = newLost + newReceived > 0 ? newLost / (newLost + newReceived) : 0;
  // Only real network trouble counts: lost packets or a long delay. (The encoder also says
  // "bandwidth" while its estimate is still ramping up, even on a perfect network.)
  let verdict = 'good';
  if (lossRate > 0.05 || (rtt != null && rtt > 0.5)) verdict = 'poor';
  else if (limitation === 'cpu') verdict = 'busy';
  return { lost, received, verdict };
}

async function listDevices(kind) {
  try {
    return (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === kind);
  } catch {
    return [];
  }
}

export function CallProvider({ children }) {
  const { subscribe, emitSocket } = useChatActions();
  const toast = useToast();
  const [call, setCallState] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null); // my shared screen, for the preview
  const [remoteStream, setRemoteStream] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [outputs, setOutputs] = useState([]);
  const [outputId, setOutputId] = useState('');

  const callRef = useRef(null); // the latest `call`, for socket handlers
  const pcRef = useRef(null);
  const localRef = useRef(null);
  const iceServersRef = useRef([]);
  const pendingCandidates = useRef([]);
  const signalQueue = useRef(Promise.resolve());
  const stopToneRef = useRef(null);
  const closeTimer = useRef(null);
  const restartedRef = useRef(false);
  const screenRef = useRef(null); // the screen track while sharing
  const screenSenderRef = useRef(null); // voice calls: the sender added for the screen

  /** Update `call` and its ref together (patch: object or call => object; null clears). */
  const setCall = useCallback((patch) => {
    setCallState((current) => {
      let next;
      if (patch === null) next = null;
      else if (typeof patch === 'function') next = current ? { ...current, ...patch(current) } : null;
      else next = current ? { ...current, ...patch } : patch;
      callRef.current = next;
      return next;
    });
  }, []);

  const playTone = useCallback((kind) => {
    stopToneRef.current?.();
    stopToneRef.current = kind ? startTone(kind) : null;
  }, []);

  /** Close the connection and release camera/microphone. */
  const teardown = useCallback(() => {
    playTone(null);
    if (pcRef.current) {
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    for (const track of localRef.current?.getTracks() ?? []) track.stop();
    localRef.current = null;
    if (screenRef.current) {
      screenRef.current.onended = null;
      screenRef.current.stop();
      screenRef.current = null;
    }
    screenSenderRef.current = null;
    setScreenStream(null);
    pendingCandidates.current = [];
    restartedRef.current = false;
    setLocalStream(null);
    setRemoteStream(null);
  }, [playTone]);

  /** End locally: briefly show `text` ("Call ended", "No answer"…) or close straight away. */
  const finish = useCallback(
    (text) => {
      teardown();
      clearTimeout(closeTimer.current);
      if (!text) {
        setCall(null);
        return;
      }
      setCall({ phase: 'ended', endedText: text, reconnecting: false });
      closeTimer.current = setTimeout(() => setCall(null), ENDED_SCREEN_MS);
    },
    [teardown, setCall],
  );

  const signal = useCallback(
    (data) => {
      const id = callRef.current?.id;
      if (id) emitSocket('call:signal', { callId: id, data }).catch(() => {});
    },
    [emitSocket],
  );

  /** Tell the other side whether my mic / camera are on. */
  const sendState = useCallback(() => {
    const current = callRef.current;
    if (!current || !['connecting', 'active'].includes(current.phase)) return;
    signal({ type: 'state', audio: !current.muted, video: current.type === 'video' && !current.cameraOff && !current.sharing, screen: Boolean(current.sharing) });
  }, [signal]);

  const makeOffer = useCallback(
    async (options) => {
      const pc = pcRef.current;
      if (!pc) return;
      const offer = await pc.createOffer(options);
      await pc.setLocalDescription(offer);
      signal({ type: 'offer', sdp: offer.sdp });
    },
    [signal],
  );

  const createPeer = useCallback(() => {
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
    pcRef.current = pc;
    const stream = localRef.current;
    for (const track of stream.getTracks()) pc.addTrack(track, stream);

    pc.ontrack = (event) => {
      const [remote] = event.streams;
      setRemoteStream(remote ?? new MediaStream([event.track]));
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) signal({ type: 'candidate', candidate: event.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (pcRef.current !== pc) return;
      const state = pc.connectionState;
      if (state === 'connected') {
        restartedRef.current = false;
        for (const sender of pc.getSenders()) {
          if (sender.track?.kind === 'video') tuneSender(sender, sender.track === screenRef.current ? 'screen' : 'camera');
        }
        setCall((current) => ({ phase: 'active', reconnecting: false, connectedAt: current.connectedAt ?? Date.now() }));
        sendState();
      } else if (state === 'disconnected') {
        setCall({ reconnecting: true });
      } else if (state === 'failed') {
        // Network changed: the caller tries one ICE restart before giving up.
        if (callRef.current?.direction === 'outgoing' && !restartedRef.current) {
          restartedRef.current = true;
          setCall({ reconnecting: true });
          makeOffer({ iceRestart: true }).catch(() => {});
        } else {
          const id = callRef.current?.id;
          if (id) emitSocket('call:end', { callId: id }).catch(() => {});
          finish('Connection lost');
        }
      }
    };
    return pc;
  }, [signal, sendState, makeOffer, setCall, emitSocket, finish]);

  const drainCandidates = useCallback(async () => {
    const pc = pcRef.current;
    const queued = pendingCandidates.current;
    pendingCandidates.current = [];
    for (const candidate of queued) await pc?.addIceCandidate(candidate).catch(() => {});
  }, []);

  const handleSignal = useCallback(
    async ({ callId, data }) => {
      if (callRef.current?.id !== callId) return;
      const pc = pcRef.current;
      if (!pc) return;
      if (data.type === 'offer') {
        await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
        await drainCandidates();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signal({ type: 'answer', sdp: answer.sdp });
      } else if (data.type === 'answer') {
        await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
        await drainCandidates();
      } else if (data.type === 'candidate') {
        if (pc.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {});
        else pendingCandidates.current.push(data.candidate);
      } else if (data.type === 'state') {
        setCall({ remote: { audio: data.audio, video: data.video, screen: Boolean(data.screen) } });
      }
    },
    [drainCandidates, signal, setCall],
  );

  const acquireMedia = useCallback(async (type) => {
    const stream = await getMedia(type);
    localRef.current = stream;
    setLocalStream(stream);
    if (type === 'video') setCameras(await listDevices('videoinput'));
    if ('setSinkId' in HTMLMediaElement.prototype) setOutputs(await listDevices('audiooutput'));
    return stream;
  }, []);

  // ---------- actions ----------

  /** Call the other person of a direct chat. */
  const startCall = useCallback(
    async ({ conversationId, peer, type }) => {
      if (callRef.current && callRef.current.phase !== 'ended') {
        toast.error('Finish your current call first');
        return;
      }
      clearTimeout(closeTimer.current);
      setCall(null);
      setCall({
        id: null,
        type,
        conversationId,
        peer: { id: peer.id, name: peer.name, avatarUrl: peer.avatarUrl },
        direction: 'outgoing',
        phase: 'starting',
        muted: false,
        cameraOff: false,
        speakerOff: false,
        sharing: false,
        remote: { audio: true, video: type === 'video', screen: false },
      });
      try {
        const stream = await acquireMedia(type);
        if (callRef.current?.phase !== 'starting') {
          for (const track of stream.getTracks()) track.stop(); // hung up meanwhile
          return;
        }
        const { call: started, iceServers } = await emitSocket('call:start', { conversationId, type });
        if (callRef.current?.phase !== 'starting') {
          emitSocket('call:end', { callId: started.id }).catch(() => {});
          return;
        }
        iceServersRef.current = iceServers;
        if (started.status === 'busy') {
          setCall({ id: started.id });
          finish(`${peer.name.split(' ')[0]} is on another call`);
          return;
        }
        setCall({ id: started.id, phase: 'ringing' });
        playTone('ringback');
      } catch (error) {
        finish(null);
        toast.error(mediaErrorMessage(error, type));
      }
    },
    [toast, setCall, acquireMedia, emitSocket, finish, playTone],
  );

  const acceptCall = useCallback(async () => {
    const current = callRef.current;
    if (current?.phase !== 'incoming') return;
    playTone(null);
    setCall({ phase: 'connecting' });
    try {
      await acquireMedia(current.type);
      // Ready before answering, so the caller's offer always finds a connection.
      createPeer();
      await emitSocket('call:accept', { callId: current.id });
    } catch (error) {
      emitSocket('call:reject', { callId: current.id }).catch(() => {});
      finish(null);
      toast.error(error.code ? error.message : mediaErrorMessage(error, current.type));
    }
  }, [playTone, setCall, acquireMedia, createPeer, emitSocket, finish, toast]);

  const declineCall = useCallback(() => {
    const current = callRef.current;
    if (current?.phase !== 'incoming') return;
    emitSocket('call:reject', { callId: current.id }).catch(() => {});
    finish(null);
  }, [emitSocket, finish]);

  const hangUp = useCallback(() => {
    const current = callRef.current;
    if (!current || current.phase === 'ended') return;
    if (current.id) emitSocket('call:end', { callId: current.id }).catch(() => {});
    finish(current.phase === 'active' ? 'Call ended' : null);
  }, [emitSocket, finish]);

  const toggleMute = useCallback(() => {
    const track = localRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCall({ muted: !track.enabled });
    callRef.current = { ...callRef.current, muted: !track.enabled };
    sendState();
  }, [setCall, sendState]);

  const toggleCamera = useCallback(() => {
    const track = localRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCall({ cameraOff: !track.enabled });
    callRef.current = { ...callRef.current, cameraOff: !track.enabled };
    sendState();
  }, [setCall, sendState]);

  /** Next camera (front ↔ back on phones). The new track replaces the old one without renegotiating. */
  const switchCamera = useCallback(async () => {
    const stream = localRef.current;
    const old = stream?.getVideoTracks()[0];
    if (!old || cameras.length < 2) return;
    const index = cameras.findIndex((camera) => camera.deviceId === old.getSettings().deviceId);
    const next = cameras[(index + 1) % cameras.length];
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: next.deviceId } } });
      const [track] = fresh.getVideoTracks();
      track.enabled = old.enabled;
      await pcRef.current?.getSenders().find((sender) => sender.track?.kind === 'video')?.replaceTrack(track);
      stream.removeTrack(old);
      old.stop();
      stream.addTrack(track);
      setLocalStream(new MediaStream(stream.getTracks()));
    } catch (error) {
      toast.error(mediaErrorMessage(error, 'video'));
    }
  }, [cameras, toast]);

  /** Stop sharing: the camera comes back (video call) or the screen track is removed (voice call). */
  const stopScreenShare = useCallback(async () => {
    const screen = screenRef.current;
    if (!screen) return;
    screenRef.current = null;
    screen.onended = null;
    screen.stop();
    setScreenStream(null);
    const pc = pcRef.current;
    if (screenSenderRef.current) {
      // Voice call: send nothing on the video track (kept for the next share, no renegotiation).
      await screenSenderRef.current.replaceTrack(null).catch(() => {});
    } else {
      const camera = localRef.current?.getVideoTracks()[0] ?? null;
      const sender = pc?.getSenders().find((item) => item.track === screen);
      await sender?.replaceTrack(camera).catch(() => {});
      await tuneSender(sender, 'camera');
    }
    callRef.current = { ...callRef.current, sharing: false };
    setCall({ sharing: false });
    sendState();
  }, [setCall, sendState]);

  /** Share a screen, window or tab (the browser asks which). */
  const startScreenShare = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || callRef.current?.phase !== 'active' || screenRef.current) return;
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
    if (!screen || pcRef.current !== pc || callRef.current?.phase !== 'active') {
      for (const track of stream.getTracks()) track.stop();
      return;
    }
    screen.contentHint = 'detail'; // keep text sharp rather than motion smooth
    screenRef.current = screen;
    screen.onended = () => stopScreenShare(); // the browser's own "Stop sharing" button
    try {
      const videoSender = pc.getSenders().find((sender) => sender.track?.kind === 'video' && sender !== screenSenderRef.current);
      if (videoSender) {
        await videoSender.replaceTrack(screen); // video call: the screen takes the camera's place
        await tuneSender(videoSender, 'screen');
      } else if (screenSenderRef.current) {
        await screenSenderRef.current.replaceTrack(screen); // voice call, shared before
        await tuneSender(screenSenderRef.current, 'screen');
      } else {
        screenSenderRef.current = pc.addTrack(screen, localRef.current); // voice call: add video once
        await makeOffer();
        tuneSender(screenSenderRef.current, 'screen'); // encodings exist once the offer is made
      }
    } catch {
      screenRef.current = null;
      screen.onended = null;
      screen.stop();
      toast.error('Could not share your screen');
      return;
    }
    setScreenStream(new MediaStream([screen]));
    callRef.current = { ...callRef.current, sharing: true };
    setCall({ sharing: true });
    sendState();
  }, [toast, makeOffer, setCall, sendState, stopScreenShare]);

  // Watch the connection while a call is active: "Poor connection" / "Your device is busy".
  const active = call?.phase === 'active';
  useEffect(() => {
    if (!active) return undefined;
    let previous = null;
    let streak = { verdict: 'good', count: 0 };
    let samples = 0;
    const timer = setInterval(async () => {
      const pc = pcRef.current;
      if (!pc) return;
      samples += 1;
      try {
        previous = await sampleNetwork(pc, previous);
      } catch {
        return;
      }
      if (samples <= 2) return; // the first seconds of a call are always rough
      streak = previous.verdict === streak.verdict ? { ...streak, count: streak.count + 1 } : { verdict: previous.verdict, count: 1 };
      // Two bad samples in a row to warn, three good ones to clear: no flicker.
      const needed = streak.verdict === 'good' ? 3 : 2;
      if (streak.count === needed && callRef.current && callRef.current.network !== streak.verdict) setCall({ network: streak.verdict });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [active, setCall]);

  /** Speaker off silences the other person on this device (my microphone stays on). */
  const toggleSpeaker = useCallback(() => setCall((current) => ({ speakerOff: !current.speakerOff })), [setCall]);

  // ---------- server events ----------

  useEffect(() => {
    const unsubscribers = [
      subscribe('call:incoming', ({ call: incoming, iceServers }) => {
        if (callRef.current && callRef.current.phase !== 'ended') return; // busy here (the server normally prevents this)
        clearTimeout(closeTimer.current);
        teardown();
        iceServersRef.current = iceServers;
        setCall(null);
        setCall({
          id: incoming.id,
          type: incoming.type,
          conversationId: incoming.conversationId,
          peer: incoming.caller,
          direction: 'incoming',
          phase: 'incoming',
          muted: false,
          cameraOff: false,
          speakerOff: false,
          sharing: false,
          remote: { audio: true, video: incoming.type === 'video', screen: false },
        });
        playTone('ring');
        if (document.hidden) {
          showSystemNotification({
            title: incoming.caller.name,
            body: `Incoming ${incoming.type} call`,
            tag: `call-${incoming.id}`,
            url: `/c/${incoming.conversationId}`,
          }).catch(() => {});
        }
      }),
      subscribe('call:accepted', ({ call: accepted }) => {
        if (callRef.current?.id !== accepted.id) return;
        playTone(null);
        setCall({ phase: 'connecting' });
        createPeer();
        makeOffer().catch(() => finish('Call failed'));
      }),
      // Answered or declined on another tab/device of mine.
      subscribe('call:handled', ({ callId }) => {
        if (callRef.current?.id === callId && callRef.current.phase === 'incoming') finish(null);
      }),
      subscribe('call:signal', (payload) => {
        signalQueue.current = signalQueue.current.then(() => handleSignal(payload)).catch(() => {});
      }),
      subscribe('call:ended', ({ callId, status }) => {
        const current = callRef.current;
        if (current?.id !== callId || current.phase === 'ended') return;
        const outgoing = current.direction === 'outgoing';
        const text = {
          ended: 'Call ended',
          missed: outgoing ? 'No answer' : 'Missed call',
          rejected: outgoing ? 'Call declined' : null,
          busy: 'On another call',
          failed: 'Call failed',
        }[status];
        finish(text ?? 'Call ended');
      }),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [subscribe, teardown, setCall, playTone, createPeer, makeOffer, finish, handleSignal]);

  // Closing or reloading the tab hangs up; leaving the chat page (logout) too.
  useEffect(() => {
    const leave = () => {
      const id = callRef.current?.id;
      if (id && callRef.current.phase !== 'ended') emitSocket('call:end', { callId: id }).catch(() => {});
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
    () => ({ call, localStream, remoteStream, screenStream, canSwitchCamera: cameras.length > 1, outputs, outputId }),
    [call, localStream, remoteStream, screenStream, cameras.length, outputs, outputId],
  );
  const actions = useMemo(
    () => ({ startCall, acceptCall, declineCall, hangUp, toggleMute, toggleCamera, switchCamera, toggleSpeaker, startScreenShare, stopScreenShare, setOutputId }),
    [startCall, acceptCall, declineCall, hangUp, toggleMute, toggleCamera, switchCamera, toggleSpeaker, startScreenShare, stopScreenShare],
  );

  return (
    <CallActionsContext.Provider value={actions}>
      <CallStateContext.Provider value={state}>{children}</CallStateContext.Provider>
    </CallActionsContext.Provider>
  );
}

/** The current call and media streams; re-renders on every call change. */
export function useCallState() {
  const state = useContext(CallStateContext);
  if (!state) throw new Error('useCallState must be used inside <CallProvider>');
  return state;
}

/** Stable call actions (startCall, hangUp…); never causes re-renders. */
export function useCallActions() {
  const actions = useContext(CallActionsContext);
  if (!actions) throw new Error('useCallActions must be used inside <CallProvider>');
  return actions;
}
