import { Redis } from 'ioredis';

// Event logs backed by Redis Streams. Writers XADD, SSE readers XREAD BLOCK
// from their last seen id, so clients can resume after reconnects.
// Thread events live in `thread:<id>:events`; job events in `jobs:events`.

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

/** Append an event to any stream key. */
export async function publishTo(key: string, event: { type: string; [k: string]: unknown }) {
  await redis.xadd(key, 'MAXLEN', '~', MAX_LEN, '*', 'data', JSON.stringify(event));
}

export async function publish(threadId: string, event: ThreadEvent) {
  await publishTo(streamKey(threadId), event);
}

/**
 * Yields events from stream `key` after `lastId` ('$' = only new ones) until
 * `signal` aborts; yields null as a heartbeat tick. Uses a dedicated
 * connection because XREAD BLOCK ties up the client.
 */
export async function* subscribeTo<T = unknown>(key: string, lastId: string, signal: AbortSignal) {
  const conn = redis.duplicate();
  signal.addEventListener('abort', () => conn.disconnect());
  try {
    // Pin '$' to a concrete id so events between XREAD calls aren't missed.
    if (lastId === '$') {
      const [last] = await conn.xrevrange(key, '+', '-', 'COUNT', 1);
      lastId = last?.[0] ?? '0-0';
    }
    // Flush an initial heartbeat only after the stream cursor is pinned.
    // The UI can now enable sending without racing subscription setup.
    yield null;
    while (!signal.aborted) {
      const res = await conn.xread('BLOCK', 15000, 'STREAMS', key, lastId).catch((err) => {
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
          yield { id, event: JSON.parse(fields[1]) as T };
        }
      }
    }
  } finally {
    conn.disconnect();
  }
}

export function subscribe(threadId: string, lastId: string, signal: AbortSignal) {
  return subscribeTo<ThreadEvent>(streamKey(threadId), lastId, signal);
}
