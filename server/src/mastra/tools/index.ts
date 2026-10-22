// All agent tools. To add tools, create tools/<name>.ts exporting e.g.
// `export const tenderTools = { searchTenders, getTender }` and spread it here.
import { companyTools } from './company';
import { radarTools } from './radar';
import { researchTools } from './research';

export const tools = {
  ...companyTools,
  ...researchTools,
  ...radarTools,
};
