import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { PostgresStore } from '@mastra/pg';

export const storage = new PostgresStore({
  id: 'app-store',
  connectionString: process.env.DATABASE_URL ?? 'postgres://app:app@localhost:5432/app',
});

export const memory = new Memory({
  storage,
  options: { lastMessages: 20 },
});

export const assistant = new Agent({
  id: 'assistant',
  name: 'Assistant',
  instructions: 'You are a helpful, concise assistant.',
  model: process.env.MODEL ?? 'anthropic/claude-sonnet-5',
  memory,
});
