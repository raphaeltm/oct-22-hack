import { Redis } from 'ioredis';

// Per-thread event log backed by Redis Streams. Writers XADD, SSE readers
// XREAD BLOCK from their last seen id, so clients can resume after reconnects.

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const MAX_LEN = 1000;

export type ThreadEvent =
  | { type: 'user.message'; messageId: string; content: string }
  | { type: 'run.started'; runId: string }
  | { type: 'text.delta'; runId: string; delta: string }
  | { type: 'run.finished'; runId: string }
  | { type: 'run.error'; runId: string; error: string };

export const redis = new Redis(REDIS_URL);

const streamKey = (threadId: string) => `thread:${threadId}:events`;

export async function publish(threadId: string, event: ThreadEvent) {
  await redis.xadd(streamKey(threadId), 'MAXLEN', '~', MAX_LEN, '*', 'data', JSON.stringify(event));
}

/**
 * Yields events after `lastId` ('$' = only new ones) until `signal` aborts.
 * Uses a dedicated connection because XREAD BLOCK ties up the client.
 */
export async function* subscribe(threadId: string, lastId: string, signal: AbortSignal) {
  const conn = redis.duplicate();
  signal.addEventListener('abort', () => conn.disconnect());
  try {
    // Pin '$' to a concrete id so events between XREAD calls aren't missed.
    if (lastId === '$') {
      const [last] = await conn.xrevrange(streamKey(threadId), '+', '-', 'COUNT', 1);
      lastId = last?.[0] ?? '0-0';
    }
    // Flush an initial heartbeat only after the stream cursor is pinned.
    // The UI can now enable sending without racing subscription setup.
    yield null;
    while (!signal.aborted) {
      const res = await conn.xread('BLOCK', 15000, 'STREAMS', streamKey(threadId), lastId).catch((err) => {
        if (signal.aborted) return null;
        throw err;
      });
      if (!res) {
        yield null; // heartbeat tick
        continue;
      }
      for (const [, entries] of res) {
        for (const [id, fields] of entries) {
          lastId = id;
          yield { id, event: JSON.parse(fields[1]) as ThreadEvent };
        }
      }
    }
  } finally {
    conn.disconnect();
  }
}
