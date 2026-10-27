/**
 * Records a call in this browser: every voice mixed into one track and, for video calls,
 * one picture with the other people in a grid and me small in the corner (like the call
 * screen, but not mirrored). MediaRecorder hands over a chunk every few seconds.
 */
const TYPES = {
  video: ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'],
  audio: ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'],
};
const CHUNK_MS = 5000;
const FPS = 24;
const WIDTH = 1280;
const HEIGHT = 720;

/** Can this browser record calls? (MediaRecorder, Web Audio and canvas capture.) */
export const canRecordCalls =
  typeof window !== 'undefined' &&
  typeof window.MediaRecorder === 'function' &&
  typeof window.AudioContext === 'function' &&
  typeof HTMLCanvasElement !== 'undefined' &&
  'captureStream' in HTMLCanvasElement.prototype;

/** The best format this browser can record `kind` ('audio' | 'video') in, or null. */
export function pickMimeType(kind) {
  if (!canRecordCalls) return null;
  return TYPES[kind].find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

function hiddenVideo(stream) {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  video.play().catch(() => {});
  return video;
}

const hasLiveVideo = (stream) => Boolean(stream?.getVideoTracks().some((track) => track.readyState === 'live' && track.enabled));

/** Draw `video` into the rectangle, cropped to fill it (like object-fit: cover). */
function drawCover(ctx, video, x, y, w, h) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return false;
  const scale = Math.max(w / vw, h / vh);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, x, y, w, h);
  return true;
}

/** Tile rectangles for `n` people on the recording (1: full, 2: side by side, 3–4: 2×2, 5–6: 3×2). */
function tiles(n) {
  const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3;
  const rows = n <= 2 ? 1 : 2;
  const w = WIDTH / cols;
  const h = HEIGHT / rows;
  return Array.from({ length: n }, (_, i) => ({ x: (i % cols) * w, y: Math.floor(i / cols) * h, w, h }));
}

/**
 * Start recording. `getLocal()` returns my stream; `getRemotes()` the other people as
 * [{ id, name, stream }] (both can change during the call: people join, leave, share
 * their screen). `onChunk(blob)` receives the recording piece by piece.
 * Returns { mimeType, refresh(), stop() → Promise }.
 */
export function startCallRecorder({ kind, mimeType, getLocal, getRemotes, onChunk }) {
  const audio = new AudioContext();
  audio.resume().catch(() => {});
  const mix = audio.createMediaStreamDestination();
  const sources = new Map(); // audio track id -> source node

  function wireAudio() {
    for (const stream of [getLocal(), ...getRemotes().map((r) => r.stream)]) {
      for (const track of stream?.getAudioTracks() ?? []) {
        if (sources.has(track.id)) continue;
        const source = audio.createMediaStreamSource(new MediaStream([track]));
        source.connect(mix);
        sources.set(track.id, source);
      }
    }
  }
  wireAudio();

  const tracks = [...mix.stream.getAudioTracks()];
  let drawTimer = null;
  const remoteVideos = new Map(); // person id -> hidden <video>
  let localVideo = null;
  let canvasTrack = null;

  if (kind === 'video') {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');
    localVideo = hiddenVideo(getLocal());
    const draw = () => {
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      const remotes = getRemotes();
      // People who left: forget their video.
      for (const [id, video] of remoteVideos) {
        if (!remotes.some((r) => r.id === id)) {
          video.srcObject = null;
          remoteVideos.delete(id);
        }
      }
      const rects = tiles(remotes.length);
      remotes.forEach((remote, i) => {
        const { x, y, w, h } = rects[i];
        let video = remoteVideos.get(remote.id);
        if (!video) remoteVideos.set(remote.id, (video = hiddenVideo(remote.stream)));
        if (video.srcObject !== remote.stream) video.srcObject = remote.stream;
        if (!(hasLiveVideo(remote.stream) && drawCover(ctx, video, x + 2, y + 2, w - 4, h - 4))) {
          // Camera off: their name, like the call screen.
          ctx.fillStyle = '#e5e5e5';
          ctx.font = `600 ${remotes.length > 2 ? 32 : 44}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(remote.name, x + w / 2, y + h / 2);
        }
      });
      const local = getLocal();
      if (localVideo.srcObject !== local) localVideo.srcObject = local;
      if (hasLiveVideo(local)) {
        const w = 320;
        const h = 180;
        const x = WIDTH - w - 24;
        const y = HEIGHT - h - 24;
        ctx.fillStyle = '#262626';
        ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
        drawCover(ctx, localVideo, x, y, w, h);
      }
    };
    draw();
    // A timer rather than requestAnimationFrame: it keeps drawing when the tab is in the background.
    drawTimer = setInterval(draw, 1000 / FPS);
    [canvasTrack] = canvas.captureStream(FPS).getVideoTracks();
    tracks.unshift(canvasTrack);
  }

  const recorder = new MediaRecorder(new MediaStream(tracks), {
    mimeType,
    audioBitsPerSecond: 64_000,
    ...(kind === 'video' && { videoBitsPerSecond: 1_200_000 }),
  });
  recorder.ondataavailable = (event) => {
    if (event.data?.size) onChunk(event.data);
  };
  recorder.start(CHUNK_MS);

  return {
    mimeType,
    /** New tracks appeared (e.g. the other person started sharing their screen). */
    refresh: wireAudio,
    /** Stop; resolves after the last chunk was handed to onChunk. */
    stop() {
      return new Promise((resolve) => {
        const cleanup = () => {
          clearInterval(drawTimer);
          canvasTrack?.stop();
          for (const video of [...remoteVideos.values(), localVideo]) if (video) video.srcObject = null;
          for (const source of sources.values()) source.disconnect();
          audio.close().catch(() => {});
          resolve();
        };
        if (recorder.state === 'inactive') return cleanup();
        recorder.addEventListener('stop', cleanup, { once: true });
        recorder.stop();
      });
    },
  };
}
