import { Mastra } from '@mastra/core';
import { assistant, storage } from './agent';

export const mastra = new Mastra({
  agents: { assistant },
  storage,
});

export { memory } from './agent';
export { draftProfile, makeAnalyst } from './analyst';
