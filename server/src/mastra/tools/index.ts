// All agent tools. To add tools, create tools/<name>.ts exporting e.g.
// `export const tenderTools = { searchTenders, getTender }` and spread it here.
import { companyTools } from './company';

export const tools = {
  ...companyTools,
};
