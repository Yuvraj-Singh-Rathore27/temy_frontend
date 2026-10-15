/**
 * On-device AI, in a background worker so the chat never freezes. The model is
 * downloaded once from Hugging Face (open weights) and cached by the browser;
 * the text it works on never leaves this device.
 */
import { env, pipeline } from '@huggingface/transformers';

env.allowLocalModels = false; // always the published model, never a path on our server
env.useBrowserCache = true;

const MODEL = 'onnx-community/Qwen3-0.6B-ONNX';
let generator = null; // Promise of the text-generation pipeline

function load(device, report) {
  generator ??= pipeline('text-generation', MODEL, {
    device,
    // Graphics card: 4-bit weights with 16-bit maths (~570 MB). CPU: 8-bit (~620 MB).
    dtype: device === 'webgpu' ? 'q4f16' : 'q8',
    progress_callback: report,
  }).catch((error) => {
    generator = null; // allow a retry
    throw error;
  });
  return generator;
}

/** Clean up the model's bullets: one fact per line, no duplicates, at most 6. */
function toBullets(text) {
  const seen = new Set();
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•]\s*)+|^\s*\d+[.)]\s*/g, '').trim())
    .filter((line) => line.length > 3 && !/^(summary|here is|here are)\b/i.test(line))
    .filter((line) => {
      const key = line.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

const SYSTEM_PROMPT = [
  'You summarise chat conversations for someone who missed them.',
  'Write at most 5 bullet points, each starting with "- ".',
  'Each bullet is one short sentence with the exact names, times, places and amounts from the chat.',
  '"You" and "@you" in the chat are the reader: call them "you".',
  'Put first what was asked of you, then decisions, times, costs and who does what.',
  'A question is not an answer: only say someone will do something if they said so.',
  'Only state facts that are in the chat. No introduction, no conclusion.',
].join(' ');

const TASKS = {
  async summarize(generate, data) {
    const output = await generate(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Chat:\n${data.text}\n\nSummary: /no_think` },
      ],
      { max_new_tokens: 220, do_sample: false, repetition_penalty: 1.15 },
    );
    return { bullets: toBullets(output[0].generated_text.at(-1).content) };
  },
};

async function run({ id, type, ...data }) {
  try {
    const task = TASKS[type];
    if (!task) throw new Error(`Unknown task: ${type}`);
    const generate = await load(data.device, (event) => self.postMessage({ id, type: 'progress', event }));
    self.postMessage({ id, type: 'status', status: 'thinking' });
    self.postMessage({ id, type: 'result', ...(await task(generate, data)) });
  } catch (error) {
    self.postMessage({ id, type: 'error', message: error?.message ?? String(error) });
  }
}

// One task at a time: the model can't run two generations at once.
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  queue = queue.then(() => run(data));
};
