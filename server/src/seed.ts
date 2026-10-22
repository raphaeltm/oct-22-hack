import { createCompany, listCompanies, pool } from './store';

// Demo firm so the radar has someone to watch on first boot. The firm and its
// past bids are fictional (buyers kept generic on purpose); the tenders it is
// matched against are real, live TED notices.

const DEMO = {
  name: 'Nuage & Code (demo)',
  pitch:
    'Paris IT consultancy, 28 people. Builds and runs cloud data platforms and web applications for public bodies and mid-size companies: cloud migration (AWS, OVHcloud, Scaleway), data engineering, open-source web apps, accessibility (RGAA) and hosting. Strong references with French local authorities and hospitals.',
  cpv: ['72000000', '48000000', '72300000', '72200000'],
  countries: ['FRA', 'BEL', 'LUX'],
  keywords: ['plateforme de données', 'migration cloud', 'développement application web', 'hébergement', 'data platform'],
  min_value: 60000,
  max_value: 1500000,
};

const BIDS = [
  { title: 'Data platform for regional health observatory', buyer: 'A regional health agency', year: 2025, value: 420000, outcome: 'won', summary: 'Built a PostgreSQL + dbt data platform with open dashboards; delivered in 7 months.' },
  { title: 'Citizen services portal redesign (RGAA AA)', buyer: 'A Paris-area city of 110k residents', year: 2025, value: 310000, outcome: 'won', summary: 'Accessible React portal, 40 online procedures, hosted on OVHcloud SecNumCloud.' },
  { title: 'Cloud migration of 60 legacy applications', buyer: 'A university hospital in western France', year: 2024, value: 890000, outcome: 'won', summary: 'Lift-and-shift then re-platforming to Kubernetes; 99.9% uptime SLA.' },
  { title: 'National ERP integration framework', buyer: 'A national central purchasing body', year: 2024, value: 4200000, outcome: 'lost', summary: 'Lost on capacity: buyer required 150+ FTE and SAP partnership.' },
  { title: 'Open data portal maintenance (TMA)', buyer: 'A metropolitan authority', year: 2023, value: 180000, outcome: 'won', summary: 'Third-party maintenance of a CKAN portal, 3-year contract renewed once.' },
  { title: 'Hospital supply-chain software licences', buyer: 'A Paris hospital group', year: 2023, value: 950000, outcome: 'lost', summary: 'Lost: buyer wanted an off-the-shelf product, we are a services firm.' },
];

export async function seed() {
  if ((await listCompanies()).length) return;
  const id = await createCompany({
    name: DEMO.name,
    pitch: DEMO.pitch,
    cpv: DEMO.cpv,
    countries: DEMO.countries,
    keywords: DEMO.keywords,
    minValue: DEMO.min_value,
    maxValue: DEMO.max_value,
  });
  for (const b of BIDS) {
    await pool.query(
      'insert into past_bids (company_id, title, buyer, year, value, outcome, summary) values ($1,$2,$3,$4,$5,$6,$7)',
      [id, b.title, b.buyer, b.year, b.value, b.outcome, b.summary],
    );
  }
  console.log('seeded demo company', id);
}
