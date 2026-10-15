/**
 * Vestige Chat's on-device AI. Everything runs in this browser:
 * 1. Chrome's built-in AI (Gemini Nano) when the browser already has it — nothing to download;
 * 2. otherwise an open model (Qwen3-0.6B) downloaded once and cached, run in a worker
 *    on the graphics card (WebGPU) or the CPU (WebAssembly).
 * No message is ever sent to an AI service.
 */
const CACHE_NAME = 'transformers-cache';
const SETTINGS_KEY = 'temu:ai';
const REPLIES_KEY = 'temu:smart-replies';

export const MODEL_INFO = {
  name: 'Qwen3-0.6B (open source)',
  size: { webgpu: '≈ 570 MB', wasm: '≈ 620 MB' },
};

// ---- per-device preference (the model lives on this device, so the choice does too) ----

export function aiEnabled() {
  try {
    return localStorage.getItem(SETTINGS_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setAiEnabled(on) {
  try {
    localStorage.setItem(SETTINGS_KEY, on ? 'on' : 'off');
  } catch {
    // private mode: the switch just won't be remembered
  }
}

/** Reply suggestions above the message box (on by default). */
export function smartRepliesEnabled() {
  try {
    return localStorage.getItem(REPLIES_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSmartRepliesEnabled(on) {
  try {
    localStorage.setItem(REPLIES_KEY, on ? 'on' : 'off');
  } catch {
    // private mode: the switch just won't be remembered
  }
  window.dispatchEvent(new Event('temu:smart-replies'));
}

// ---- which engine this browser can use ----

let enginePromise = null;

/** 'builtin' | 'webgpu' | 'wasm' */
export function aiEngine() {
  enginePromise ??= (async () => {
    try {
      if ('Summarizer' in self && (await self.Summarizer.availability()) === 'available') return 'builtin';
    } catch {
      // not supported here
    }
    return workerDevice();
  })();
  return enginePromise;
}

let devicePromise = null;

/** Where the downloaded model runs: 'webgpu' (graphics card) or 'wasm' (processor). */
function workerDevice() {
  devicePromise ??= (async () => {
    try {
      if (navigator.gpu && (await navigator.gpu.requestAdapter())) return 'webgpu';
    } catch {
      // no usable graphics card
    }
    return 'wasm';
  })();
  return devicePromise;
}

/** Is the downloaded model already on this device? */
export async function modelDownloaded() {
  try {
    if (!('caches' in self)) return false;
    const cache = await caches.open(CACHE_NAME);
    return (await cache.keys()).some((request) => /Qwen3-0\.6B-ONNX\/.*\.onnx/.test(request.url));
  } catch {
    return false;
  }
}

/** Remove the downloaded model (frees ~600 MB). */
export async function deleteModel() {
  worker?.terminate();
  worker = null;
  if ('caches' in self) await caches.delete(CACHE_NAME);
}

// ---- the worker ----

let worker = null;
let nextId = 1;
const jobs = new Map(); // id -> { resolve, reject, onProgress, files }

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./ai.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const job = jobs.get(data.id);
      if (!job) return;
      if (data.type === 'progress') {
        const { event } = data;
        if (event.status === 'progress' && event.total) {
          job.files.set(event.file, { loaded: event.loaded, total: event.total });
          let loaded = 0;
          let total = 0;
          for (const file of job.files.values()) {
            loaded += file.loaded;
            total += file.total;
          }
          job.onProgress?.({ stage: 'downloading', loaded, total });
        } else if (event.status === 'ready') {
          job.onProgress?.({ stage: 'loading' });
        }
      } else if (data.type === 'status') {
        job.onProgress?.({ stage: data.status });
      } else {
        jobs.delete(data.id);
        if (data.type === 'result') job.resolve(data);
        else job.reject(new Error(data.message));
      }
    };
    worker.onerror = (event) => {
      for (const job of jobs.values()) job.reject(new Error(event.message || 'The AI stopped unexpectedly'));
      jobs.clear();
      worker = null;
    };
  }
  return worker;
}

/** Stop whatever the AI is doing (the model stays cached; it reloads next time). */
export function cancelAi() {
  for (const job of jobs.values()) job.reject(Object.assign(new Error('Cancelled'), { name: 'AbortError' }));
  jobs.clear();
  worker?.terminate();
  worker = null;
}

// ---- tasks ----

async function summarizeBuiltin(text) {
  const summarizer = await self.Summarizer.create({
    type: 'key-points',
    format: 'plain-text',
    length: 'short',
    sharedContext: 'A chat conversation. "You" is the reader.',
  });
  try {
    const result = await summarizer.summarize(text);
    return result
      .split('\n')
      .map((line) => line.replace(/^\s*[-*•]\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 6);
  } finally {
    summarizer.destroy?.();
  }
}

/**
 * Summarise chat lines ("Name: text") into a few bullet points.
 * onProgress({ stage: 'downloading' | 'loading' | 'thinking', loaded?, total? }).
 */
export async function summarizeChat(lines, { onProgress } = {}) {
  const text = lines.join('\n');
  const engine = await aiEngine();
  if (engine === 'builtin') {
    onProgress?.({ stage: 'thinking' });
    return summarizeBuiltin(text);
  }
  const result = await runTask('summarize', { text, device: engine }, onProgress);
  return result.bullets;
}

function runTask(type, payload, onProgress) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    jobs.set(id, { resolve, reject, onProgress, files: new Map() });
    getWorker().postMessage({ id, type, ...payload });
  });
}
