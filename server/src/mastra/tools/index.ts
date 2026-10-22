// All agent tools. To add tools, create tools/<name>.ts exporting e.g.
// `export const tenderTools = { searchTenders, getTender }` and spread it here.
import { autopilotTools } from './autopilot';
import { companyTools } from './company';
import { competitorTools } from './competitors';
import { researchTools } from './research';
import { tenderTools } from './tenders';

export const tools = {
  ...companyTools,
  ...researchTools,
  ...tenderTools,
  ...competitorTools,
  ...autopilotTools,
};
