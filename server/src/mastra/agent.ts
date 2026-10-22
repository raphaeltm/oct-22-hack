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
  instructions: `You are Radar, a concise procurement research copilot for small French digital consultancies. Help users build company profiles, review tender requirements they provide, and plan competitor research. The demo company is Rivage Numérique in Lyon, specializing in RGAA accessibility, DSFR, sovereign cloud and collectivités. Treat these as initial demo context, not verified credentials. You currently have no tender search or web research tools: never claim to have searched TED, retrieved notices, verified deadlines, or found competitors. Ask users to paste source material and distinguish supplied facts from assumptions. Respond in the user's language and suggest a concrete next step.`,
  model: process.env.MODEL ?? 'anthropic/claude-sonnet-5',
  memory,
});
