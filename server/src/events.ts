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
  | { type: 'run.error'; runId: string; error: string }
  | { type: 'tool.call'; runId: string; callId: string; tool: string; args: unknown }
  | { type: 'tool.result'; runId: string; callId: string; tool: string; summary: string };

// Company radar feed: what the watcher is doing, live.
export type FeedEvent =
  | { type: 'scan.started'; scanId: number }
  | { type: 'scan.progress'; scanId: number; message: string }
  | { type: 'tender.scored'; tenderId: string; score: number; verdict: string; title: string }
  | { type: 'scan.finished'; scanId: number; fetched: number; fresh: number }
  | { type: 'scan.error'; scanId: number; error: string }
  | { type: 'rules.updated'; rules: string };

export const redis = new Redis(REDIS_URL);

export const threadKey = (threadId: string) => `thread:${threadId}:events`;
export const feedKey = (companyId: number) => `company:${companyId}:feed`;

export async function publish(threadId: string, event: ThreadEvent) {
  await redis.xadd(threadKey(threadId), 'MAXLEN', '~', MAX_LEN, '*', 'data', JSON.stringify(event));
}

export async function publishFeed(companyId: number, event: FeedEvent) {
  await redis.xadd(feedKey(companyId), 'MAXLEN', '~', MAX_LEN, '*', 'data', JSON.stringify(event));
}

/**
 * Yields events on stream `key` after `lastId` ('$' = only new ones) until
 * `signal` aborts. Uses a dedicated connection because XREAD BLOCK ties up the client.
 */
export async function* subscribe(key: string, lastId: string, signal: AbortSignal) {
  const conn = redis.duplicate();
  signal.addEventListener('abort', () => conn.disconnect());
  try {
    // Pin '$' to a concrete id so events between XREAD calls aren't missed.
    if (lastId === '$') {
      const [last] = await conn.xrevrange(key, '+', '-', 'COUNT', 1);
      lastId = last?.[0] ?? '0-0';
    }
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
          yield { id, event: JSON.parse(fields[1]) as ThreadEvent | FeedEvent };
        }
      }
    }
  } finally {
    conn.disconnect();
  }
}
