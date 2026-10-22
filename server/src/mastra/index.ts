import { Mastra } from '@mastra/core';
import { storage } from './agent';

export const mastra = new Mastra({ storage });

export { draftProfile, makeAnalyst, memory } from './agent';
