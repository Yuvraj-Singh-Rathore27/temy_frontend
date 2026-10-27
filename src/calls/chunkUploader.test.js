// Run with: node --test src/calls/chunkUploader.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChunkUploader } from './chunkUploader.js';

const blob = (size) => ({ size });
const noWait = { wait: async () => {}, baseDelayMs: 1 };

test('chunks are uploaded one at a time, in order', async () => {
  const sent = [];
  let inFlight = 0;
  const uploader = createChunkUploader(async (seq) => {
    inFlight += 1;
    assert.equal(inFlight, 1);
    await new Promise((r) => setTimeout(r, 5));
    sent.push(seq);
    inFlight -= 1;
  }, noWait);
  for (let i = 0; i < 5; i++) uploader.push(blob(10));
  await uploader.drain();
  assert.deepEqual(sent, [0, 1, 2, 3, 4]);
  assert.equal(uploader.state.sentBytes, 50);
  assert.equal(uploader.state.failed, null);
});

test('a failed chunk is retried, then the rest continue', async () => {
  const attempts = {};
  const uploader = createChunkUploader(async (seq) => {
    attempts[seq] = (attempts[seq] ?? 0) + 1;
    if (seq === 1 && attempts[seq] < 3) throw Object.assign(new Error('network'), { status: 0 });
  }, noWait);
  [1, 2, 3].forEach(() => uploader.push(blob(5)));
  await uploader.drain();
  assert.deepEqual(attempts, { 0: 1, 1: 3, 2: 1 });
  assert.equal(uploader.state.failed, null);
});

test('after giving up, later chunks are not sent (the server refuses gaps)', async () => {
  const sent = [];
  const uploader = createChunkUploader(async (seq) => {
    if (seq === 1) throw Object.assign(new Error('down'), { status: 503 });
    sent.push(seq);
  }, noWait);
  [1, 2, 3, 4].forEach(() => uploader.push(blob(5)));
  await uploader.drain();
  assert.deepEqual(sent, [0]);
  assert.equal(uploader.state.failed.status, 503);
});

test('"too large" is final: no retries', async () => {
  let calls = 0;
  const uploader = createChunkUploader(async () => {
    calls += 1;
    throw Object.assign(new Error('too large'), { status: 413 });
  }, noWait);
  uploader.push(blob(5));
  await uploader.drain();
  assert.equal(calls, 1);
  assert.equal(uploader.state.failed.status, 413);
});

test('empty chunks are skipped', async () => {
  const sent = [];
  const uploader = createChunkUploader(async (seq) => sent.push(seq), noWait);
  uploader.push(blob(0));
  uploader.push(blob(3));
  await uploader.drain();
  assert.deepEqual(sent, [0]);
});
