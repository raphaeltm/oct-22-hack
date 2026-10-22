// One place for model config. MODEL is a Mastra model id ("provider/model").

export const MODEL = process.env.MODEL ?? 'anthropic/claude-sonnet-5';
// Cheaper model for bulk tender scoring; defaults to MODEL.
export const SCORING_MODEL = process.env.SCORING_MODEL ?? MODEL;

const KEY_ENV: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
};

export const hasModelKey = Boolean(process.env[KEY_ENV[MODEL.split('/')[0]] ?? 'ANTHROPIC_API_KEY']);
