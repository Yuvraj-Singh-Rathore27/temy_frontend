/**
 * Uploads a recording's chunks one after another, in order, retrying a failed chunk a few
 * times with growing pauses (a weak network during a call is normal). If a chunk can't be
 * delivered, later chunks are not sent (the server refuses gaps) and `failed` is set; what
 * arrived before is still saved when the recording is finished.
 *
 * upload(seq, blob) → Promise   sends one chunk
 */
const RETRIES = 4;

export function createChunkUploader(upload, { wait = (ms) => new Promise((r) => setTimeout(r, ms)), baseDelayMs = 1000 } = {}) {
  let seq = 0;
  let chain = Promise.resolve();
  const state = { failed: null, sentBytes: 0 };

  async function send(n, blob) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await upload(n, blob);
        state.sentBytes += blob.size;
        return;
      } catch (error) {
        // Too large, or the recording is already closed: retrying can't help.
        const final = error?.status === 413 || error?.code === 'RECORDING_FINISHED' || error?.status === 404;
        if (final || attempt >= RETRIES) throw error;
        await wait(baseDelayMs * 2 ** attempt);
      }
    }
  }

  return {
    state,
    /** Queue the next chunk. */
    push(blob) {
      if (!blob?.size) return;
      const n = seq++;
      chain = chain.then(() => {
        if (state.failed) return;
        return send(n, blob).catch((error) => {
          state.failed = error;
        });
      });
    },
    /** Resolves when every queued chunk was sent (or the upload gave up). */
    drain: () => chain,
  };
}
